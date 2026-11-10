import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readlink, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  DomainError,
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

interface Entry {
  mode: string;
  oid: string;
  bytes?: Buffer;
}

function pathName(name: string): string {
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

/** Reject observed parent links; do not follow final links or read special files. */
async function readFile(
  directory: string,
  name: string,
  signal: AbortSignal,
): Promise<{ mode: string; bytes: Buffer } | undefined> {
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
  let bytes: Buffer;
  let mode: string;
  if (before.isSymbolicLink()) {
    bytes = await readlink(path, { encoding: "buffer" });
    mode = "120000";
  } else {
    if (!before.isFile() || before.nlink !== 1) throw unsafe();
    if (before.size > CHANGES_LIMITS.fileBytes) throw limit();
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
      bytes = Buffer.alloc(before.size + 1);
      let count = 0;
      while (count < bytes.length) {
        signal.throwIfAborted();
        const read = await file.read(
          bytes,
          count,
          Math.min(65536, bytes.length - count),
          count,
        );
        if (!read.bytesRead) break;
        count += read.bytesRead;
      }
      const after = await file.stat();
      if (
        count !== before.size ||
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs
      )
        throw unsafe();
      bytes = bytes.subarray(0, count);
      mode = before.mode & 0o111 ? "100755" : "100644";
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
  return { mode, bytes };
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
    const changes: WorkspaceChange[] = [];
    const deleted = names.filter(
      (name) => base.has(name) && !current.has(name),
    );
    const renamed = new Set<string>();
    let diffBytes = 0;
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
      if (!renamed.has(name))
        await append(name, null, base.get(name), undefined);
    async function append(
      name: string,
      previousPath: string | null,
      old: Entry | undefined,
      next: Entry | undefined,
    ) {
      if (old) {
        // Object IDs come only from the recorded base tree, never from callers.
        const size = Number(await text(directory, ["cat-file", "-s", old.oid]));
        if (
          !Number.isSafeInteger(size) ||
          size < 0 ||
          size > CHANGES_LIMITS.fileBytes ||
          total + size > CHANGES_LIMITS.totalBytes
        )
          throw limit();
        old.bytes = await git(
          directory,
          ["cat-file", "blob", old.oid],
          CHANGES_LIMITS.fileBytes,
          signal,
        );
        total += old.bytes.length;
      }
      const rendered = patch(
        name,
        previousPath,
        old,
        next,
        CHANGES_LIMITS.diffBytes - diffBytes,
      );
      diffBytes += Buffer.byteLength(rendered.diff);
      if (diffBytes > CHANGES_LIMITS.diffBytes) throw limit();
      changes.push({
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
      });
    }
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
