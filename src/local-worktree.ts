import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { mkdir, rmdir } from "node:fs/promises";
import {
  directoryIdentity,
  worktreeIdentity,
} from "./local-worktree-identity.js";
import { isAbsolute, join, relative } from "node:path";
import { git } from "./git.js";
import { untrackedManifest } from "./worktree-evidence.js";
import type { WorkspaceAdapter } from "./adapters.js";
import {
  DomainError,
  UncertainExecutionError,
  requireString,
  type Run,
  type Workspace,
  type WorktreeEvidence,
} from "./domain.js";
import type { Store } from "./store.js";

const SHA = /^[a-f0-9]{40,64}$/;
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

async function text(
  cwd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<string> {
  return (await git(cwd, args, undefined, signal)).toString("utf8").trim();
}

/** Inspect only tree/index entries: never recurse into a submodule worktree. */
async function rejectSubmodules(
  directory: string,
  revisions: string[],
  signal?: AbortSignal,
): Promise<void> {
  const commands = [
    ["ls-files", "--stage", "-z"],
    ...[...new Set(revisions)].map((revision) => [
      "ls-tree",
      "-r",
      "-z",
      "--full-tree",
      revision,
    ]),
  ];
  for (const args of commands) {
    const entries = await git(directory, args, 32 << 20, signal);
    if (
      entries
        .toString("utf8")
        .split("\0")
        .some((entry) => entry.startsWith("160000 "))
    )
      throw new DomainError(
        409,
        "Submodules are not supported in local workspaces; no checkout or worktree evidence is produced",
      );
  }
}

/** Validates a local repository and returns its real top-level path and HEAD. */
export async function inspectRepository(path: unknown): Promise<{
  path: string;
  head: string;
}> {
  const requested = requireString(path, "path", 1024);
  if (!isAbsolute(requested))
    throw new DomainError(400, "Repository path must be absolute");
  let real: string;
  try {
    real = realpathSync(requested);
    if (!statSync(real).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new DomainError(400, "Repository path is not an existing directory");
  }
  let top: string;
  try {
    top = realpathSync(await text(real, ["rev-parse", "--show-toplevel"]));
  } catch {
    throw new DomainError(400, "Path is not inside a Git working tree");
  }
  if (top !== real)
    throw new DomainError(
      400,
      "Choose the repository's top-level folder, not a subfolder",
    );
  if ((await text(real, ["rev-parse", "--is-bare-repository"])) !== "false")
    throw new DomainError(400, "Bare repositories are not supported");
  let head: string;
  try {
    head = await text(real, ["rev-parse", "--verify", "HEAD^{commit}"]);
  } catch {
    throw new DomainError(400, "Repository has no commits yet");
  }
  if (!SHA.test(head)) throw new DomainError(409, "Unexpected HEAD format");
  await rejectSubmodules(real, [head]);
  return { path: real, head };
}

function inside(root: string, path: string): boolean {
  const child = relative(root, path);
  return child !== "" && !child.startsWith("..") && !isAbsolute(child);
}

/**
 * Creates branch `argent/<id prefix>` at the repository's current commit in a
 * private worktree, then records it. A failure removes what it created.
 */
export async function createLocalWorkspace(
  store: Store,
  worktreeRoot: string,
  path: unknown,
): Promise<Workspace> {
  const repository = await inspectRepository(path);
  mkdirSync(worktreeRoot, { recursive: true, mode: 0o700 });
  const root = realpathSync(worktreeRoot);
  if (
    root === repository.path ||
    inside(repository.path, root) ||
    inside(root, repository.path)
  )
    throw new DomainError(
      400,
      "Repository and Argent's data directory must not contain each other",
    );
  const id = randomUUID();
  const branch = `argent/${id.slice(0, 8)}`;
  const worktreePath = join(root, id);
  const local = {
    repositoryPath: repository.path,
    branch,
    baseSha: repository.head,
    worktreePath,
  };
  // Git also accepts an existing empty directory. Reserve it ourselves first.
  await mkdir(worktreePath, { mode: 0o700 });
  const created = await directoryIdentity(worktreePath);
  let branchCreated = false;
  let registration: string | undefined;
  try {
    await git(repository.path, ["branch", branch, repository.head]);
    branchCreated = true;
    await git(repository.path, [
      "worktree",
      "add",
      "--quiet",
      "--no-checkout",
      worktreePath,
      branch,
    ]);
    registration = await worktreeIdentity(root, id, local);
    if ((await directoryIdentity(worktreePath)) !== created)
      throw new DomainError(409, "Worktree directory changed during creation");
    await git(worktreePath, ["reset", "--hard", repository.head]);
    if ((await worktreeIdentity(root, id, local)) !== registration)
      throw new DomainError(
        409,
        "Worktree registration changed during creation",
      );
    return store.createLocalWorkspace(
      id,
      local,
      randomUUID(),
      Date.now(),
      registration,
    );
  } catch (error) {
    if (error instanceof UncertainExecutionError) throw error;
    // On failed registration remove at most the empty directory we reserved.
    // A replaced or unconfirmed registration is left for manual inspection.
    try {
      const remaining = await directoryIdentity(worktreePath).catch(
        (inspectionError: unknown) => {
          if ((inspectionError as NodeJS.ErrnoException).code === "ENOENT")
            return null;
          throw inspectionError;
        },
      );
      if (remaining !== null && remaining !== created) throw error;
      if (remaining !== null && registration) {
        if ((await worktreeIdentity(root, id, local)) !== registration)
          throw error;
        await git(worktreePath, [
          "worktree",
          "remove",
          "--force",
          "--",
          worktreePath,
        ]);
      } else if (remaining !== null) {
        await rmdir(worktreePath);
      }
      if (branchCreated) {
        // Compare and delete only the original tip, after its worktree is gone.
        if (
          (await text(repository.path, [
            "rev-parse",
            "--verify",
            `refs/heads/${branch}`,
          ])) === repository.head
        )
          await git(repository.path, ["branch", "-d", "--", branch]);
      }
    } catch (cleanupError) {
      if (cleanupError instanceof UncertainExecutionError) throw cleanupError;
    }
    throw error;
  }
}

/** Prepares and inspects real local worktrees for the worker. */
export class LocalWorktreeWorkspace implements WorkspaceAdapter {
  constructor(
    private readonly store: Store,
    private readonly worktreeRoot: string,
  ) {}

  async prepare(workspace: Workspace, signal?: AbortSignal): Promise<string> {
    const local = workspace.local;
    if (
      workspace.archiveStatus ||
      workspace.provider !== "local-worktree" ||
      !local ||
      !ID.test(workspace.id)
    )
      throw new DomainError(409, "Workspace is not a local worktree");
    // Never operate on a recorded path outside Argent's own worktree folder.
    if (
      local.worktreePath !== join(realpathSync(this.worktreeRoot), workspace.id)
    )
      throw new DomainError(409, "Worktree is outside Argent's data directory");
    if (!existsSync(local.worktreePath))
      throw new DomainError(409, "Worktree folder is missing");
    const branch = await text(
      local.worktreePath,
      ["symbolic-ref", "--short", "HEAD"],
      signal,
    );
    if (branch !== local.branch)
      throw new DomainError(
        409,
        `Worktree is on ${branch}, expected ${local.branch}`,
      );
    await rejectSubmodules(local.worktreePath, ["HEAD", local.baseSha], signal);
    return local.worktreePath;
  }

  /**
   * Argent's own record of what changed, read from Git after the agent exits.
   * It does not trust anything the agent said, and it is not a test result.
   */
  async verify(
    directory: string,
    run: Run,
    signal?: AbortSignal,
  ): Promise<WorktreeEvidence> {
    const local = this.store.getWorkspace(run.workspaceId).local;
    if (!local || local.worktreePath !== directory)
      throw new DomainError(409, "Run does not belong to this worktree");
    const headSha = await text(
      directory,
      ["rev-parse", "--verify", "HEAD^{commit}"],
      signal,
    );
    if (!SHA.test(headSha))
      throw new DomainError(409, "Unexpected HEAD format");
    const branch = await text(
      directory,
      ["symbolic-ref", "--short", "HEAD"],
      signal,
    );
    if (branch !== local.branch)
      throw new DomainError(409, "Worktree branch changed during execution");
    await rejectSubmodules(directory, [headSha, local.baseSha], signal);
    // Tracked changes against the base (committed or not), plus untracked files.
    const diff = await git(
      directory,
      ["diff", "--binary", "--no-ext-diff", "--no-textconv", local.baseSha],
      64 << 20,
      signal,
    );
    const untracked = await git(
      directory,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      8 << 20,
      signal,
    );
    const changed = new Set(
      (
        await git(
          directory,
          [
            "diff",
            "--name-only",
            "-z",
            "--no-ext-diff",
            "--no-textconv",
            local.baseSha,
          ],
          8 << 20,
          signal,
        )
      )
        .toString("utf8")
        .split("\0")
        .filter(Boolean),
    );
    for (const file of untracked.toString("utf8").split("\0"))
      if (file) changed.add(file);
    const manifest = await untrackedManifest(directory, untracked, signal);
    await rejectSubmodules(directory, ["HEAD", local.baseSha], signal);
    signal?.throwIfAborted();
    return {
      kind: "worktree-record",
      contentHashVersion: 2,
      passed: true,
      simulation: false,
      tested: false,
      branch,
      baseSha: local.baseSha,
      headSha,
      changedFiles: changed.size,
      diffSha256: createHash("sha256")
        .update(`argent-worktree-v2:${diff.length}:`)
        .update(diff)
        .update(JSON.stringify(manifest))
        .digest("hex"),
    };
  }
}
