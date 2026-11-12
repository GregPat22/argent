import { lstat, mkdir, realpath, rmdir } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { DomainError, UncertainExecutionError } from "./domain.js";
import { git } from "./git.js";
import type { Store } from "./store.js";
import { CLEAN_COMMIT_LIMITS, readCleanCommit } from "./workspace-changes.js";

/** One deadline for creation and verification, or for removal. */
export const CHECKOUT_LIMITS = Object.freeze({
  timeoutMs: CLEAN_COMMIT_LIMITS.timeoutMs + 180000,
});

export interface VerificationRoots {
  /** Where the service keeps workspace worktrees. */
  worktreeRoot: string;
  /** A separate private folder for verification checkouts only. */
  verificationRoot: string;
}

export interface VerificationCheckoutRequest {
  /** The caller's owning record, for example a command job. Names the folder. */
  id: string;
  workspaceId: string;
  headSha: string;
  treeId: string;
}

/**
 * A detached linked worktree at one exact commit, created by Argent and
 * checked byte for byte when it was created. Not isolation: a command run
 * here acts as the developer and shares the repository's Git directory.
 */
export type VerificationCheckout = Readonly<{
  kind: "verification-checkout";
  version: 1;
  id: string;
  workspaceId: string;
  directory: string;
  headSha: string;
  treeId: string;
  files: number;
  contents: "git-visible-bytes-match-commit";
  otherContent: "none-at-creation";
  head: "detached";
  consistency: "point-in-time";
  isolation: "none";
  simulation: false;
  tested: false;
}>;

interface Owned {
  root: string;
  repository: string;
  device: bigint;
  inode: bigint;
}
// Only a checkout created by this live process can be removed. A stored path
// or a description of a checkout is never enough to delete anything.
const owned = new WeakMap<VerificationCheckout, Owned>();

const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const invalid = () => new DomainError(400, "Invalid verification checkout");
const refused = () =>
  new DomainError(409, "Verification checkout cannot be created safely");
const mismatch = () =>
  new DomainError(409, "Verification checkout does not match the commit");
const kept = () =>
  new DomainError(
    409,
    "Verification checkout could not be removed safely and was left in place",
  );

function inside(parent: string, path: string): boolean {
  const child = relative(parent, path);
  return child !== "" && !child.startsWith("..") && !isAbsolute(child);
}
function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === "string" && pattern.exec(value)?.[0] === value;
}
async function realDirectory(path: string) {
  if ((await realpath(path)) !== path) throw refused();
  const stat = await lstat(path, { bigint: true });
  if (!stat.isDirectory()) throw refused();
  return stat;
}
function deadline(requested: AbortSignal | undefined, message: string) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DomainError(408, message)),
    CHECKOUT_LIMITS.timeoutMs,
  );
  return {
    signal: requested
      ? AbortSignal.any([requested, controller.signal])
      : controller.signal,
    clear: () => clearTimeout(timer),
  };
}

/**
 * Internal only: no job, worker, route or desktop control calls this, and it
 * runs no configured command. The repository and branch come from the store;
 * the caller names only a stored workspace and the commit it expects.
 */
export async function createVerificationCheckout(
  store: Store,
  roots: VerificationRoots,
  request: VerificationCheckoutRequest,
  requestedSignal?: AbortSignal,
): Promise<VerificationCheckout> {
  if (
    !request ||
    !matches(request.id, ID) ||
    !matches(request.workspaceId, ID) ||
    !matches(request.headSha, SHA) ||
    !matches(request.treeId, SHA)
  )
    throw invalid();
  const { id, workspaceId, headSha, treeId } = request;
  const { signal, clear } = deadline(
    requestedSignal,
    "Verification checkout timed out",
  );
  let directory: string | undefined;
  let created: { dev: bigint; ino: bigint } | undefined;
  let repository: string | undefined;
  try {
    signal.throwIfAborted();
    const workspace = store.getWorkspace(workspaceId);
    const local = workspace.local;
    if (
      workspace.provider !== "local-worktree" ||
      !local ||
      local.branch !== `argent/${workspaceId.slice(0, 8)}`
    )
      throw refused();
    const worktrees = await realpath(roots.worktreeRoot);
    if (local.worktreePath !== join(worktrees, workspaceId)) throw refused();
    await realDirectory(local.repositoryPath);

    const text = async (cwd: string, args: string[]) => {
      const value = (await git(cwd, args, 1 << 20, signal)).toString("utf8");
      if (!value.endsWith("\n")) throw refused();
      return value.slice(0, -1);
    };
    const common = async (cwd: string) =>
      realpath(
        resolve(cwd, await text(cwd, ["rev-parse", "--git-common-dir"])),
      );
    if (
      (await text(local.repositoryPath, ["rev-parse", "--show-toplevel"])) !==
        local.repositoryPath ||
      (await text(local.repositoryPath, [
        "rev-parse",
        "--is-bare-repository",
      ])) !== "false"
    )
      throw refused();
    const commonDirectory = await common(local.repositoryPath);
    // The commit must be the named one, carry the named tree and belong to
    // this workspace's own branch. Nothing else can be checked out.
    if (
      (await text(local.repositoryPath, [
        "rev-parse",
        "--verify",
        `${headSha}^{commit}`,
      ])) !== headSha ||
      (await text(local.repositoryPath, [
        "rev-parse",
        "--verify",
        `${headSha}^{tree}`,
      ])) !== treeId
    )
      throw refused();
    await git(
      local.repositoryPath,
      ["merge-base", "--is-ancestor", headSha, `refs/heads/${local.branch}`],
      1 << 20,
      signal,
    );

    // Decide where the folder may be before creating anything: its parent
    // must already exist, and it must stay apart from the repository and the
    // workspaces.
    if (!isAbsolute(roots.verificationRoot)) throw refused();
    const root = join(
      await realpath(dirname(roots.verificationRoot)),
      basename(roots.verificationRoot),
    );
    for (const other of [local.repositoryPath, worktrees])
      if (root === other || inside(other, root) || inside(root, other))
        throw refused();
    await mkdir(root, { mode: 0o700 }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    });
    await realDirectory(root);
    directory = join(root, id);
    repository = local.repositoryPath;
    // Exclusive creation is the ownership claim: an existing path is not ours.
    await mkdir(directory, { mode: 0o700 });
    const made = await realDirectory(directory);
    created = { dev: made.dev, ino: made.ino };
    signal.throwIfAborted();
    await git(
      repository,
      [
        "worktree",
        "add",
        "--quiet",
        "--detach",
        "--no-checkout",
        directory,
        headSha,
      ],
      1 << 20,
      signal,
      CHECKOUT_LIMITS.timeoutMs,
    );

    const after = await realDirectory(directory);
    if (after.dev !== created.dev || after.ino !== created.ino)
      throw mismatch();
    if (
      (await text(directory, ["rev-parse", "--show-toplevel"])) !== directory ||
      (await common(directory)) !== commonDirectory ||
      (await text(directory, ["rev-parse", "--abbrev-ref", "HEAD"])) !== "HEAD"
    )
      throw mismatch();
    // Register first, then populate in this worktree's config context. This
    // neutralizes conditional filters and leaves interrupted population
    // registered so Git can remove precisely the checkout we created.
    await git(
      directory,
      ["reset", "--hard", headSha],
      1 << 20,
      signal,
      CHECKOUT_LIMITS.timeoutMs,
    );
    const clean = await readCleanCommit(directory, signal, mismatch);
    if (clean.headSha !== headSha || clean.treeId !== treeId) throw mismatch();
    // Fresh means nothing but the commit: not even an ignored file.
    const everything = () =>
      git(directory!, ["ls-files", "--others", "-z"], 1 << 20, signal);
    if ((await everything()).length) throw mismatch();
    await clean.recheck();
    const last = await realDirectory(directory);
    if (
      last.dev !== created.dev ||
      last.ino !== created.ino ||
      (await everything()).length ||
      JSON.stringify(store.getWorkspace(workspaceId).local) !==
        JSON.stringify(local)
    )
      throw mismatch();
    signal.throwIfAborted();

    const checkout: VerificationCheckout = Object.freeze({
      kind: "verification-checkout",
      version: 1,
      id,
      workspaceId,
      directory,
      headSha,
      treeId,
      files: clean.files,
      contents: "git-visible-bytes-match-commit",
      otherContent: "none-at-creation",
      head: "detached",
      consistency: "point-in-time",
      isolation: "none",
      simulation: false,
      tested: false,
    });
    owned.set(checkout, {
      root,
      repository,
      device: created.dev,
      inode: created.ino,
    });
    return checkout;
  } catch (error) {
    // Never touch the folder while a Git process may still be writing to it.
    if (error instanceof UncertainExecutionError) throw error;
    if (directory && created && repository)
      await discard(repository, directory, created);
    if (signal.aborted) signal.throwIfAborted();
    if (error instanceof DomainError) throw error;
    throw refused();
  } finally {
    clear();
  }
}

/** Removes only the folder this process created, and only through Git. */
async function discard(
  repository: string,
  directory: string,
  created: { dev: bigint; ino: bigint },
  signal?: AbortSignal,
): Promise<void> {
  let stat;
  try {
    if ((await realpath(directory)) !== directory) throw kept();
    stat = await lstat(directory, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw kept();
    throw error;
  }
  if (
    !stat.isDirectory() ||
    stat.dev !== created.dev ||
    stat.ino !== created.ino
  )
    throw kept();
  try {
    await git(
      repository,
      ["worktree", "remove", "--force", directory],
      1 << 20,
      signal,
      CHECKOUT_LIMITS.timeoutMs,
    );
  } catch (error) {
    if (error instanceof UncertainExecutionError) throw error;
    if (signal?.aborted) signal.throwIfAborted();
    // Not a registered worktree yet: remove the folder only while it is empty.
    try {
      await rmdir(directory);
    } catch {
      throw kept();
    }
  }
  try {
    await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw kept();
}

/**
 * Removes a checkout created by this live process, whatever a command left in
 * it. A replaced, moved or unknown folder is left alone and reported.
 */
export async function removeVerificationCheckout(
  checkout: VerificationCheckout,
  requestedSignal?: AbortSignal,
): Promise<void> {
  const record = owned.get(checkout);
  if (!record) throw kept();
  const { signal, clear } = deadline(
    requestedSignal,
    "Verification checkout removal timed out",
  );
  try {
    signal.throwIfAborted();
    if (
      (await realpath(record.root)) !== record.root ||
      checkout.directory !== join(record.root, checkout.id)
    )
      throw kept();
    await discard(
      record.repository,
      checkout.directory,
      { dev: record.device, ino: record.inode },
      signal,
    );
    owned.delete(checkout);
  } catch (error) {
    if (error instanceof UncertainExecutionError) throw error;
    if (signal.aborted) signal.throwIfAborted();
    if (error instanceof DomainError) throw error;
    throw kept();
  } finally {
    clear();
  }
}
