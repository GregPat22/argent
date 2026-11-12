import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readlink, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  DomainError,
  UncertainExecutionError,
  requireString,
  type WorkspaceChanges,
  type WorkspaceChange,
} from "./domain.js";
import { git } from "./git.js";
import { LocalWorktreeWorkspace } from "./local-worktree.js";
import type { Store } from "./store.js";

export const CHANGES_LIMITS = {
  files: 1000,
  fileBytes: 4 << 20,
  totalBytes: 32 << 20,
  diffBytes: 1 << 20,
  timeoutMs: 10000,
} as const;
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const unsafe = () =>
  new DomainError(
    409,
    "Workspace changes are unsafe or changed during inspection",
  );
const limit = () =>
  new DomainError(413, "Workspace changes exceed inspection limits");
const decode = (bytes: Buffer) =>
  new TextDecoder("utf8", { fatal: true, ignoreBOM: true }).decode(bytes);

export interface Entry {
  mode: string;
  oid: string;
  bytes?: Buffer;
}

type FileIdentity = Pick<
  Awaited<ReturnType<typeof lstat>>,
  "dev" | "ino" | "mode" | "size" | "nlink" | "mtimeMs" | "ctimeMs"
>;
function fileIdentity(stat: FileIdentity): FileIdentity {
  return {
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    size: stat.size,
    nlink: stat.nlink,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  };
}

export function pathName(name: string): string {
  if (
    isAbsolute(name) ||
    name.includes("\0") ||
    name
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.toLowerCase() === ".git",
      )
  )
    throw unsafe();
  return name;
}

interface Sink<T> {
  add(chunk: Buffer): void;
  done(): T;
}

/**
 * Reject observed parent links; do not follow final links or read special
 * files. Content goes to a sink in order, so a caller can hash without holding
 * it. The sink's result is used only after every identity check has passed.
 */
async function scanFile<T>(
  directory: string,
  name: string,
  signal: AbortSignal,
  maxBytes: number,
  begin: (size: number) => Sink<T>,
): Promise<
  { mode: string; value: T; size: number; identity: FileIdentity } | undefined
> {
  signal.throwIfAborted();
  const path = join(directory, pathName(name));
  // Inspect every parent before opening the leaf. A removed directory is a deletion;
  // a symlink in its place is unsafe, even if the leaf no longer exists.
  let parent = directory;
  for (const part of name.split("/").slice(0, -1)) {
    parent = join(parent, part);
    try {
      const stat = await lstat(parent);
      if (stat.isSymbolicLink()) throw unsafe();
      if (!stat.isDirectory()) return undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  if ((await realpath(dirname(path))) !== dirname(path)) throw unsafe();
  let before;
  try {
    before = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  // A tracked file replaced by a directory is deleted; its new children are
  // enumerated separately by Git's untracked listing.
  if (before.isDirectory()) return undefined;
  let sink: Sink<T>;
  let size: number;
  let mode: string;
  if (before.isSymbolicLink()) {
    const target = await readlink(path, { encoding: "buffer" });
    size = target.length;
    if (size > maxBytes) throw limit();
    sink = begin(size);
    sink.add(target);
    mode = "120000";
  } else {
    if (!before.isFile() || before.nlink !== 1) throw unsafe();
    if (before.size > maxBytes) throw limit();
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const opened = await file.stat();
      if (
        !opened.isFile() ||
        opened.nlink !== 1 ||
        opened.ino !== before.ino ||
        opened.dev !== before.dev
      )
        throw unsafe();
      size = before.size;
      sink = begin(size);
      // One byte more than expected is requested, so growth is noticed.
      const chunk = Buffer.allocUnsafe(Math.min(1 << 16, size + 1));
      let count = 0;
      for (;;) {
        signal.throwIfAborted();
        const read = await file.read(chunk, 0, chunk.length, count);
        if (!read.bytesRead) break;
        count += read.bytesRead;
        if (count > size) throw unsafe();
        sink.add(chunk.subarray(0, read.bytesRead));
      }
      const after = await file.stat();
      if (
        count !== size ||
        after.size !== size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs
      )
        throw unsafe();
      // Git's executable mode follows the owner's execute bit, not any x bit.
      mode = before.mode & 0o100 ? "100755" : "100644";
    } finally {
      await file.close();
    }
  }
  const after = await lstat(path);
  if (
    after.ino !== before.ino ||
    after.dev !== before.dev ||
    after.mtimeMs !== before.mtimeMs ||
    after.ctimeMs !== before.ctimeMs
  )
    throw unsafe();
  return { mode, value: sink.done(), size, identity: fileIdentity(after) };
}

/** A whole file in memory, for display. Bounded by the changes limits. */
async function readFile(
  directory: string,
  name: string,
  signal: AbortSignal,
): Promise<
  { mode: string; bytes: Buffer; identity: FileIdentity } | undefined
> {
  const file = await scanFile(
    directory,
    name,
    signal,
    CHANGES_LIMITS.fileBytes,
    (size) => {
      const bytes = Buffer.alloc(size);
      let offset = 0;
      return {
        add(chunk) {
          offset += chunk.copy(bytes, offset);
        },
        done: () => bytes,
      };
    },
  );
  return (
    file && { mode: file.mode, bytes: file.value, identity: file.identity }
  );
}

/**
 * Bounds for proving that a folder equals a commit. Content is hashed as it is
 * read and never held, so these protect time, not memory.
 */
export const CLEAN_COMMIT_LIMITS = Object.freeze({
  files: 50000,
  totalBytes: 2 * 1024 ** 3,
  listingBytes: 32 << 20,
  timeoutMs: 120000,
});
export interface CleanCommitLimits {
  files: number;
  totalBytes: number;
  listingBytes: number;
}

export interface CleanCommit {
  headSha: string;
  treeId: string;
  files: number;
  /** Repeats the Git reads and every file's identity after later work. */
  recheck(): Promise<void>;
}

/**
 * Requires the raw index and every Git-visible byte and mode in a directory to
 * equal its HEAD commit, with no nonignored untracked file. Point-in-time.
 */
export async function readCleanCommit(
  directory: string,
  signal: AbortSignal,
  changed: () => DomainError,
  limits: CleanCommitLimits = CLEAN_COMMIT_LIMITS,
): Promise<CleanCommit> {
  const text = async (args: string[]) => {
    const value = decode(await git(directory, args, 1 << 20, signal));
    if (!value.endsWith("\n")) throw changed();
    return value.slice(0, -1);
  };
  const revision = async (value: string) => {
    const sha = await text(["rev-parse", "--verify", value]);
    if (SHA.exec(sha)?.[0] !== sha) throw changed();
    return sha;
  };
  const headSha = await revision("HEAD^{commit}");
  const treeId = await revision(`${headSha}^{tree}`);
  const tree = new Map<string, Entry>();
  const treeBytes = decode(
    await git(
      directory,
      ["ls-tree", "-r", "-z", "--full-tree", headSha],
      limits.listingBytes,
      signal,
    ),
  );
  if (treeBytes && !treeBytes.endsWith("\0")) throw changed();
  for (const record of treeBytes.split("\0").filter(Boolean)) {
    const match =
      /^(100644|100755|120000) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/.exec(
        record,
      );
    if (!match) throw changed();
    const name = pathName(match[3]!);
    if (tree.has(name)) throw changed();
    tree.set(name, { mode: match[1]!, oid: match[2]! });
    if (tree.size > limits.files) throw limit();
  }
  const index = () =>
    git(directory, ["ls-files", "--stage", "-z"], limits.listingBytes, signal);
  const beforeIndex = await index();
  const indexText = decode(beforeIndex);
  if (indexText && !indexText.endsWith("\0")) throw changed();
  const indexed = new Set<string>();
  for (const record of indexText.split("\0").filter(Boolean)) {
    const match =
      /^(100644|100755|120000) ([a-f0-9]{40}|[a-f0-9]{64}) 0\t([\s\S]+)$/.exec(
        record,
      );
    if (!match) throw changed();
    const name = pathName(match[3]!);
    const entry = tree.get(name);
    if (
      indexed.has(name) ||
      !entry ||
      entry.mode !== match[1] ||
      entry.oid !== match[2]
    )
      throw changed();
    indexed.add(name);
  }
  if (indexed.size !== tree.size) throw changed();
  const untracked = () =>
    git(
      directory,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      1 << 20,
      signal,
    );
  if ((await untracked()).length) throw changed();
  const identities = new Map<string, FileIdentity>();
  const algorithm = headSha.length === 64 ? "sha256" : "sha1";
  let total = 0;
  for (const [name, entry] of tree) {
    signal.throwIfAborted();
    // Git's blob identity, computed while reading: nothing is kept in memory.
    const file = await scanFile(
      directory,
      name,
      signal,
      limits.totalBytes - total,
      (size) => {
        const hash = createHash(algorithm).update(`blob ${size}\0`);
        return {
          add(chunk) {
            hash.update(chunk);
          },
          done: () => hash.digest("hex"),
        };
      },
    );
    if (!file || file.mode !== entry.mode || file.value !== entry.oid)
      throw changed();
    total += file.size;
    identities.set(name, file.identity);
  }
  return {
    headSha,
    treeId,
    files: tree.size,
    async recheck() {
      if (
        (await revision("HEAD^{commit}")) !== headSha ||
        !(await index()).equals(beforeIndex) ||
        (await untracked()).length
      )
        throw changed();
      // Recheck every previously read file after the complete traversal and
      // Git reads. A change to an early file must not disappear behind a
      // later read.
      for (const [name, before] of identities) {
        signal.throwIfAborted();
        const path = join(directory, name);
        if (
          (await realpath(dirname(path))) !== dirname(path) ||
          JSON.stringify(fileIdentity(await lstat(path))) !==
            JSON.stringify(before)
        )
          throw changed();
      }
    },
  };
}

export type LocalCommandCandidateObservation = Readonly<{
  kind: "local-command-candidate-observation";
  version: 1;
  identity: string;
  policyVersion: "argent-local-command-candidate-v1";
  workspaceId: string;
  operatorId: string;
  approvalId: string;
  configurationIdentity: string;
  configurationPolicyVersion: string;
  baseSha: string;
  headSha: string;
  treeId: string;
  files: number;
  cleanliness: "index-and-git-visible-bytes-match";
  ignoredContent: "excluded";
  review: "not-collected";
  execution: "forbidden";
  consistency: "point-in-time";
  simulation: false;
  tested: false;
}>;

/** Internal observation only: neither human consent nor a reviewed execution plan. */
export async function inspectLocalCommandCandidate(
  store: Store,
  worktreeRoot: string,
  workspaceId: string,
  operatorId: string,
  requestedSignal?: AbortSignal,
): Promise<LocalCommandCandidateObservation> {
  const controller = new AbortController();
  const signal = requestedSignal
    ? AbortSignal.any([requestedSignal, controller.signal])
    : controller.signal;
  const timer = setTimeout(
    () =>
      controller.abort(new DomainError(408, "Candidate inspection timed out")),
    CLEAN_COMMIT_LIMITS.timeoutMs,
  );
  const changed = () =>
    new DomainError(409, "Workspace does not match an approved clean commit");
  try {
    signal.throwIfAborted();
    if (
      typeof workspaceId !== "string" ||
      ID.exec(workspaceId)?.[0] !== workspaceId
    )
      throw changed();
    requireString(operatorId, "operatorId", 128);
    const workspace = store.getWorkspace(workspaceId);
    const local = workspace.local;
    if (workspace.provider !== "local-worktree" || !local) throw changed();
    const root = await realpath(worktreeRoot);
    const directory = join(root, workspaceId);
    if (local.worktreePath !== directory) throw changed();
    const directories = async () => {
      if ((await realpath(worktreeRoot)) !== root) throw changed();
      return Promise.all(
        [root, directory].map(async (path) => {
          if ((await realpath(path)) !== path) throw changed();
          const stat = await lstat(path, { bigint: true });
          if (!stat.isDirectory()) throw changed();
          return { path, dev: String(stat.dev), ino: String(stat.ino) };
        }),
      );
    };
    const beforeDirectories = await directories();
    const approved = await store.localCommandApprovals.lookup(
      root,
      workspaceId,
      operatorId,
      signal,
    );
    if (!approved) throw changed();
    const adapter = new LocalWorktreeWorkspace(store, root);
    await adapter.prepare(workspace, signal);
    const clean = await readCleanCommit(directory, signal, changed);
    const { headSha, treeId } = clean;
    const currentApproval = await store.localCommandApprovals.lookup(
      root,
      workspaceId,
      operatorId,
      signal,
    );
    if (JSON.stringify(currentApproval) !== JSON.stringify(approved))
      throw changed();
    await adapter.prepare(workspace, signal);
    await clean.recheck();
    if (
      JSON.stringify(store.getWorkspace(workspaceId).local) !==
        JSON.stringify(local) ||
      JSON.stringify(await directories()) !== JSON.stringify(beforeDirectories)
    )
      throw changed();
    signal.throwIfAborted();
    const policyVersion = "argent-local-command-candidate-v1";
    const configuration = approved.candidate.approvalCandidate;
    const identity = createHash("sha256")
      .update(
        JSON.stringify([
          policyVersion,
          workspaceId,
          operatorId,
          approved.approval.id,
          configuration.identity,
          configuration.policyVersion,
          local.baseSha,
          headSha,
          treeId,
        ]),
      )
      .digest("hex");
    return Object.freeze({
      kind: "local-command-candidate-observation",
      version: 1,
      identity,
      policyVersion,
      workspaceId,
      operatorId,
      approvalId: approved.approval.id,
      configurationIdentity: configuration.identity,
      configurationPolicyVersion: configuration.policyVersion,
      baseSha: local.baseSha,
      headSha,
      treeId,
      files: clean.files,
      cleanliness: "index-and-git-visible-bytes-match",
      ignoredContent: "excluded",
      review: "not-collected",
      execution: "forbidden",
      consistency: "point-in-time",
      simulation: false,
      tested: false,
    });
  } catch (error) {
    if (error instanceof UncertainExecutionError) throw error;
    if (signal.aborted) signal.throwIfAborted();
    if (error instanceof DomainError && [400, 408, 413].includes(error.status))
      throw error;
    throw changed();
  } finally {
    clearTimeout(timer);
  }
}

/** Git-style C quoting preserves every UTF-8 filename byte in display patches. */
function quotePath(name: string): string {
  let quoted = '"';
  for (const byte of Buffer.from(name)) {
    if (byte === 34 || byte === 92) quoted += "\\" + String.fromCharCode(byte);
    else if (byte >= 32 && byte < 127) quoted += String.fromCharCode(byte);
    else quoted += "\\" + byte.toString(8).padStart(3, "0");
  }
  return quoted + '"';
}

/** Whole-file replacement hunks keep computation linear and bounded. */
function patch(
  path: string,
  previousPath: string | null,
  old: Entry | undefined,
  next: Entry | undefined,
  remainingBytes: number,
): { diff: string; binary: boolean } {
  const a = old?.bytes ?? Buffer.alloc(0);
  const b = next?.bytes ?? Buffer.alloc(0);
  let oldText: string, newText: string;
  try {
    if (a.includes(0) || b.includes(0)) return { diff: "", binary: true };
    oldText = decode(a);
    newText = decode(b);
  } catch {
    return { diff: "", binary: true };
  }
  const oldName = previousPath ?? path;
  let diff = `diff --git ${quotePath(`a/${oldName}`)} ${quotePath(`b/${path}`)}\n`;
  if (!old) diff += `new file mode ${next!.mode}\n`;
  else if (!next) diff += `deleted file mode ${old.mode}\n`;
  else if (old.mode !== next.mode)
    diff += `old mode ${old.mode}\nnew mode ${next.mode}\n`;
  if (previousPath)
    diff += `similarity index 100%\nrename from ${quotePath(previousPath)}\nrename to ${quotePath(path)}\n`;
  if (!a.equals(b)) {
    // Refuse before allocating line arrays or a rendered body. Each source byte
    // appears in the output, and every line needs another prefix byte.
    if (a.length + b.length > remainingBytes) throw limit();
    const countLines = (bytes: Buffer) => {
      let count = bytes.length && bytes.at(-1) !== 10 ? 1 : 0;
      for (const byte of bytes) if (byte === 10) count++;
      return count;
    };
    const oldLines = countLines(a),
      newLines = countLines(b);
    diff += `--- ${old ? quotePath(`a/${oldName}`) : "/dev/null"}\n+++ ${next ? quotePath(`b/${path}`) : "/dev/null"}\n@@ -${oldLines ? 1 : 0},${oldLines} +${newLines ? 1 : 0},${newLines} @@\n`;
    const noNewline = "\n\\ No newline at end of file\n";
    const suffixBytes =
      (a.length && a.at(-1) !== 10 ? Buffer.byteLength(noNewline) : 0) +
      (b.length && b.at(-1) !== 10 ? Buffer.byteLength(noNewline) : 0);
    if (
      Buffer.byteLength(diff) +
        a.length +
        b.length +
        oldLines +
        newLines +
        suffixBytes >
      remainingBytes
    )
      throw limit();
    const body = (text: string, prefix: string) => {
      if (!text) return "";
      return text.endsWith("\n")
        ? prefix + text.slice(0, -1).replaceAll("\n", `\n${prefix}`) + "\n"
        : prefix + text.replaceAll("\n", `\n${prefix}`) + noNewline;
    };
    diff += body(oldText, "-") + body(newText, "+");
  }
  if (Buffer.byteLength(diff) > remainingBytes) throw limit();
  return { diff, binary: false };
}

export interface ComparedChange<E extends Entry> {
  change: WorkspaceChange;
  old: E | undefined;
  next: E | undefined;
}

/**
 * Pairs exact-content renames and renders bounded whole-file patches. An entry
 * without bytes is loaded on demand; the caller owns input-size accounting.
 */
export async function compareEntries<E extends Entry>(
  names: readonly string[],
  base: ReadonlyMap<string, E>,
  current: ReadonlyMap<string, E>,
  load: (entry: E) => Promise<Buffer>,
  signal: AbortSignal,
): Promise<ComparedChange<E>[]> {
  const compared: ComparedChange<E>[] = [];
  const deleted = names.filter((name) => base.has(name) && !current.has(name));
  const renamed = new Set<string>();
  let diffBytes = 0;
  const append = async (
    name: string,
    previousPath: string | null,
    old: E | undefined,
    next: E | undefined,
  ) => {
    if (old && old.bytes === undefined) old.bytes = await load(old);
    if (next && next.bytes === undefined)
      // An exact rename or a mode-only change has one blob: read it once.
      next.bytes = old?.oid === next.oid ? old.bytes! : await load(next);
    const rendered = patch(
      name,
      previousPath,
      old,
      next,
      CHANGES_LIMITS.diffBytes - diffBytes,
    );
    diffBytes += Buffer.byteLength(rendered.diff);
    if (diffBytes > CHANGES_LIMITS.diffBytes) throw limit();
    compared.push({
      change: {
        path: name,
        previousPath,
        status: previousPath
          ? "renamed"
          : !old
            ? "added"
            : !next
              ? "deleted"
              : (old.mode === "120000") !== (next.mode === "120000")
                ? "typechanged"
                : "modified",
        oldMode: old?.mode ?? null,
        newMode: next?.mode ?? null,
        ...rendered,
      },
      old,
      next,
    });
  };
  for (const name of names) {
    signal.throwIfAborted();
    let old = base.get(name);
    const next = current.get(name);
    if (!next || (old?.oid === next.oid && old.mode === next.mode)) continue;
    const previousPath = !old
      ? (deleted.find(
          (candidate) =>
            !renamed.has(candidate) &&
            base.get(candidate)!.oid === next.oid &&
            base.get(candidate)!.mode === next.mode,
        ) ?? null)
      : null;
    if (previousPath) {
      old = base.get(previousPath);
      renamed.add(previousPath);
    }
    await append(name, previousPath, old, next);
  }
  for (const name of deleted)
    if (!renamed.has(name)) await append(name, null, base.get(name), undefined);
  return compared;
}

/** Live read-only observation, never a verification record or an immutable snapshot. */
export async function inspectWorkspaceChanges(
  store: Store,
  worktreeRoot: string,
  workspaceId: string,
  requestedSignal?: AbortSignal,
): Promise<WorkspaceChanges> {
  const controller = new AbortController();
  const signal = requestedSignal
    ? AbortSignal.any([requestedSignal, controller.signal])
    : controller.signal;
  const timer = setTimeout(
    () =>
      controller.abort(
        new DomainError(408, "Workspace changes inspection timed out"),
      ),
    CHANGES_LIMITS.timeoutMs,
  );
  try {
    signal.throwIfAborted();
    const workspace = store.getWorkspace(workspaceId);
    const local = workspace.local;
    if (
      workspace.provider !== "local-worktree" ||
      !local ||
      !ID.test(workspace.id) ||
      !SHA.test(local.baseSha)
    )
      throw new DomainError(409, "Workspace is not a valid local worktree");
    const root = await realpath(worktreeRoot);
    const directory = join(root, workspace.id);
    if (
      local.worktreePath !== directory ||
      (await realpath(directory)) !== directory
    )
      throw unsafe();
    const adapter = new LocalWorktreeWorkspace(store, root);
    await adapter.prepare(workspace, signal);
    const text = async (cwd: string, args: string[]) =>
      decode(await git(cwd, args, 1 << 20, signal)).trim();
    if ((await text(directory, ["rev-parse", "--show-toplevel"])) !== directory)
      throw unsafe();
    const common = async (cwd: string) =>
      realpath(
        resolve(cwd, await text(cwd, ["rev-parse", "--git-common-dir"])),
      );
    if ((await common(directory)) !== (await common(local.repositoryPath)))
      throw unsafe();
    const headSha = await text(directory, [
      "rev-parse",
      "--verify",
      "HEAD^{commit}",
    ]);
    if (!SHA.test(headSha)) throw unsafe();
    const base = new Map<string, Entry>();
    const tree = decode(
      await git(
        directory,
        ["ls-tree", "-r", "-z", "--full-tree", local.baseSha],
        1 << 20,
        signal,
      ),
    );
    for (const record of tree.split("\0").filter(Boolean)) {
      const match =
        /^(100644|100755|120000) blob ([a-f0-9]{40,64})\t([\s\S]+)$/.exec(
          record,
        );
      if (!match || !SHA.test(match[2]!)) throw unsafe();
      base.set(pathName(match[3]!), { mode: match[1]!, oid: match[2]! });
    }
    const listing = async () =>
      decode(
        await git(
          directory,
          ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
          1 << 20,
          signal,
        ),
      );
    const beforeListing = await listing();
    const names = [
      ...new Set([
        ...base.keys(),
        ...beforeListing.split("\0").filter(Boolean).map(pathName),
      ]),
    ].sort();
    if (names.length > CHANGES_LIMITS.files) throw limit();
    const current = new Map<string, Entry>();
    let total = 0;
    for (const name of names) {
      const file = await readFile(directory, name, signal);
      if (!file) continue;
      total += file.bytes.length;
      if (total > CHANGES_LIMITS.totalBytes) throw limit();
      const oid = createHash(local.baseSha.length === 64 ? "sha256" : "sha1")
        .update(`blob ${file.bytes.length}\0`)
        .update(file.bytes)
        .digest("hex");
      current.set(name, { ...file, oid });
    }
    const changes = (
      await compareEntries(
        names,
        base,
        current,
        async (entry) => {
          // Object IDs come only from the recorded base tree, never from callers.
          const size = Number(
            await text(directory, ["cat-file", "-s", entry.oid]),
          );
          if (
            !Number.isSafeInteger(size) ||
            size < 0 ||
            size > CHANGES_LIMITS.fileBytes ||
            total + size > CHANGES_LIMITS.totalBytes
          )
            throw limit();
          const bytes = await git(
            directory,
            ["cat-file", "blob", entry.oid],
            CHANGES_LIMITS.fileBytes,
            signal,
          );
          total += bytes.length;
          return bytes;
        },
        signal,
      )
    ).map((compared) => compared.change);
    if ((await realpath(directory)) !== directory) throw unsafe();
    await adapter.prepare(workspace, signal);
    if (
      (await realpath(directory)) !== directory ||
      (await text(directory, ["rev-parse", "--verify", "HEAD^{commit}"])) !==
        headSha ||
      (await listing()) !== beforeListing
    )
      throw unsafe();
    signal.throwIfAborted();
    return {
      kind: "workspace-changes",
      workspaceId,
      baseSha: local.baseSha,
      headSha,
      simulation: false,
      tested: false,
      consistency: "live",
      files: changes.sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
      ),
    };
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted();
    if (error instanceof DomainError) throw error;
    throw unsafe();
  } finally {
    clearTimeout(timer);
  }
}
