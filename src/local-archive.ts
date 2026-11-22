import { lstat, opendir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { DomainError, type Workspace } from "./domain.js";
import { git } from "./git.js";
import { checkId } from "./local-checks.js";
import { LocalWorktreeWorkspace } from "./local-worktree.js";
import { worktreeIdentity } from "./local-worktree-identity.js";
import type { Store } from "./store.js";
import { CLEAN_COMMIT_LIMITS, readCleanCommit } from "./workspace-changes.js";

const dirty = () =>
  new DomainError(
    409,
    "This worktree contains uncommitted or ignored files. Keep them, or explicitly discard them to archive.",
  );
const unsafe = () =>
  new DomainError(
    409,
    "Worktree ownership or contents could not be confirmed. Archive refused.",
  );

/** Git ignores some entries, including ignored files and empty directories.
 * Inspect the removal boundary itself, without following directory symlinks. */
async function inspectContents(
  directory: string,
  discard: boolean,
  signal: AbortSignal,
) {
  const tracked = new Set<string>();
  if (!discard) {
    const listing = await git(
      directory,
      ["ls-files", "--cached", "-z"],
      CLEAN_COMMIT_LIMITS.listingBytes,
      signal,
    );
    for (const name of new TextDecoder("utf8", { fatal: true })
      .decode(listing)
      .split("\0")
      .filter(Boolean)) {
      let prefix = "";
      for (const part of name.split("/")) {
        prefix = prefix ? prefix + "/" + part : part;
        tracked.add(prefix);
      }
    }
  }
  const device = (await lstat(directory, { bigint: true })).dev;
  const pending = [""];
  let entries = 0;
  while (pending.length) {
    const relative = pending.pop()!;
    const path = join(directory, relative);
    if (
      (await realpath(path)) !== path ||
      (await lstat(path, { bigint: true })).dev !== device
    )
      throw unsafe();
    let hasHead = false,
      hasObjects = false,
      hasRefs = false;
    for await (const entry of await opendir(path)) {
      hasHead ||= entry.name === "HEAD";
      hasObjects ||= entry.name === "objects";
      hasRefs ||= entry.name === "refs" || entry.name === "packed-refs";
      signal.throwIfAborted();
      if (++entries > 200000)
        throw new DomainError(
          413,
          "Worktree exceeds archive inspection limits",
        );
      if (entry.name.toLowerCase() === ".git") {
        if (!relative && entry.name === ".git" && entry.isFile()) continue;
        throw unsafe();
      }
      const child = relative ? relative + "/" + entry.name : entry.name;
      if (!discard && !tracked.has(child)) throw dirty();
      if (entry.isDirectory()) pending.push(child);
      else if (!entry.isFile() && !entry.isSymbolicLink()) throw unsafe();
    }
    if (hasHead && hasObjects && hasRefs) throw unsafe();
    signal.throwIfAborted();
  }
}

export async function archiveLocalWorkspace(
  store: Store,
  rootPath: string,
  id: string,
  discardChanges: boolean,
  disconnected?: AbortSignal,
): Promise<Workspace> {
  checkId(id);
  const workspace = store.getWorkspace(id);
  if (workspace.archiveStatus === "archived") return workspace;
  const generation = store.archiveWriterGeneration(id);
  store.requireIdleWorkspace(id);
  const local = workspace.local;
  if (workspace.provider !== "local-worktree" || !local)
    throw new DomainError(409, "Only a local worktree can be archived");
  const original = store.archiveIdentity(id);
  const deadline = AbortSignal.timeout(CLEAN_COMMIT_LIMITS.timeoutMs);
  const signal = disconnected
    ? AbortSignal.any([disconnected, deadline])
    : deadline;
  let head: Buffer;
  try {
    const root = await realpath(rootPath);
    if ((await worktreeIdentity(root, id, local, signal)) !== original)
      throw unsafe();
    await new LocalWorktreeWorkspace(store, root).prepare(workspace, signal);
    const clean = discardChanges
      ? undefined
      : await readCleanCommit(local.worktreePath, signal, dirty);
    await inspectContents(local.worktreePath, discardChanges, signal);
    if (clean) await clean.recheck();
    head = await git(
      local.worktreePath,
      ["rev-parse", "--verify", "HEAD^{commit}"],
      128,
      signal,
    );
    if (clean && head.toString() !== clean.headSha + "\n") throw dirty();
    if ((await worktreeIdentity(root, id, local, signal)) !== original)
      throw unsafe();
    // Compare raw bytes so ignored or undecodable names cannot disappear in display decoding.
    if (
      !discardChanges &&
      (
        await git(
          local.worktreePath,
          ["ls-files", "--others", "-z"],
          1 << 20,
          signal,
        )
      ).length
    )
      throw dirty();
    signal.throwIfAborted();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (signal.aborted)
      throw new DomainError(408, "Archive inspection interrupted");
    throw unsafe();
  }
  // From this point the response socket is not the owner. A disconnected
  // client may read the receipt; it can never redispatch an uncertain removal.
  store.beginArchive(id, original, generation, discardChanges);
  try {
    // Run in the validated linked worktree's Git config context.
    await git(
      local.worktreePath,
      [
        "worktree",
        "remove",
        ...(discardChanges ? ["--force"] : []),
        "--",
        local.worktreePath,
      ],
      1 << 20,
      deadline,
    );
    try {
      await lstat(local.worktreePath);
      throw unsafe();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const tip = await git(
      local.repositoryPath,
      ["rev-parse", "--verify", `refs/heads/${local.branch}^{commit}`],
      128,
      deadline,
    );
    const remaining = await git(
      local.repositoryPath,
      ["worktree", "list", "--porcelain", "-z"],
      1 << 20,
      deadline,
    );
    if (
      !head.equals(tip) ||
      remaining
        .toString("utf8")
        .split("\0\0")
        .some(
          (record) =>
            record.split("\0")[0] === `worktree ${local.worktreePath}`,
        )
    )
      throw unsafe();
    return store.finishArchive(id);
  } catch {
    throw new DomainError(
      409,
      "Archive outcome needs attention. Inspect the branch and worktree before taking further action.",
    );
  }
}
