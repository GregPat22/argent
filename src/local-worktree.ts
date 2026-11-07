import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import type { WorkspaceAdapter } from "./adapters.js";
import {
  DomainError,
  requireString,
  type Run,
  type Workspace,
  type WorktreeEvidence,
} from "./domain.js";
import type { Store } from "./store.js";

// Spec 0013 security model: Argent's own Git commands never run repository code
// (hooks, fsmonitor), never use a shell and never prompt for credentials.
const SAFE_GIT = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.untrackedCache=false",
];
const SHA = /^[a-f0-9]{40,64}$/;
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function gitEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    LANG: "C",
  };
  // Git reads the user's identity and global config from HOME.
  if (process.env.HOME) env.HOME = process.env.HOME;
  return env;
}

export function git(cwd: string, args: string[], maxBuffer = 1 << 20): Buffer {
  try {
    return execFileSync("git", [...SAFE_GIT, ...args], {
      cwd,
      env: gitEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
      maxBuffer,
    });
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? "";
    const line = stderr.split("\n").find((part) => part.trim()) ?? "";
    throw new DomainError(
      409,
      `Git ${args[0]} failed${line ? `: ${line.trim().slice(0, 300)}` : ""}`,
    );
  }
}

function text(cwd: string, args: string[]): string {
  return git(cwd, args).toString("utf8").trim();
}

/** Validates a local repository and returns its real top-level path and HEAD. */
export function inspectRepository(path: unknown): {
  path: string;
  head: string;
} {
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
    top = realpathSync(text(real, ["rev-parse", "--show-toplevel"]));
  } catch {
    throw new DomainError(400, "Path is not inside a Git working tree");
  }
  if (top !== real)
    throw new DomainError(
      400,
      "Choose the repository's top-level folder, not a subfolder",
    );
  if (text(real, ["rev-parse", "--is-bare-repository"]) !== "false")
    throw new DomainError(400, "Bare repositories are not supported");
  let head: string;
  try {
    head = text(real, ["rev-parse", "--verify", "HEAD^{commit}"]);
  } catch {
    throw new DomainError(400, "Repository has no commits yet");
  }
  if (!SHA.test(head)) throw new DomainError(409, "Unexpected HEAD format");
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
export function createLocalWorkspace(
  store: Store,
  worktreeRoot: string,
  path: unknown,
): Workspace {
  const repository = inspectRepository(path);
  mkdirSync(worktreeRoot, { recursive: true, mode: 0o700 });
  const root = realpathSync(worktreeRoot);
  if (inside(repository.path, root) || inside(root, repository.path))
    throw new DomainError(
      400,
      "Repository and Argent's data directory must not contain each other",
    );
  const id = randomUUID();
  const branch = `argent/${id.slice(0, 8)}`;
  const worktreePath = join(root, id);
  git(repository.path, [
    "worktree",
    "add",
    "--quiet",
    "-b",
    branch,
    worktreePath,
    repository.head,
  ]);
  try {
    return store.createLocalWorkspace(
      id,
      {
        repositoryPath: repository.path,
        branch,
        baseSha: repository.head,
        worktreePath,
      },
      randomUUID(),
    );
  } catch (error) {
    // Only remove what this call created: the new worktree and its new branch.
    try {
      git(repository.path, ["worktree", "remove", "--force", worktreePath]);
      git(repository.path, ["branch", "-D", branch]);
    } catch {
      // Leave any remainder for the developer; never widen the deletion.
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

  prepare(workspace: Workspace): string {
    const local = workspace.local;
    if (
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
    const branch = text(local.worktreePath, [
      "symbolic-ref",
      "--short",
      "HEAD",
    ]);
    if (branch !== local.branch)
      throw new DomainError(
        409,
        `Worktree is on ${branch}, expected ${local.branch}`,
      );
    return local.worktreePath;
  }

  /**
   * Argent's own record of what changed, read from Git after the agent exits.
   * It does not trust anything the agent said, and it is not a test result.
   */
  verify(directory: string, run: Run): WorktreeEvidence {
    const local = this.store.getWorkspace(run.workspaceId).local;
    if (!local || local.worktreePath !== directory)
      throw new DomainError(409, "Run does not belong to this worktree");
    const headSha = text(directory, ["rev-parse", "--verify", "HEAD^{commit}"]);
    if (!SHA.test(headSha))
      throw new DomainError(409, "Unexpected HEAD format");
    const branch = text(directory, ["symbolic-ref", "--short", "HEAD"]);
    // Tracked changes against the base (committed or not), plus untracked files.
    const diff = git(
      directory,
      ["diff", "--binary", "--no-ext-diff", "--no-textconv", local.baseSha],
      64 << 20,
    );
    const untracked = git(
      directory,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      8 << 20,
    );
    const changed = new Set(
      git(
        directory,
        ["diff", "--name-only", "-z", "--no-ext-diff", local.baseSha],
        8 << 20,
      )
        .toString("utf8")
        .split("\0")
        .filter(Boolean),
    );
    for (const file of untracked.toString("utf8").split("\0"))
      if (file) changed.add(file);
    return {
      kind: "worktree-record",
      passed: true,
      simulation: false,
      tested: false,
      branch,
      baseSha: local.baseSha,
      headSha,
      changedFiles: changed.size,
      diffSha256: createHash("sha256")
        .update(diff)
        .update("\0")
        .update(untracked)
        .digest("hex"),
    };
  }
}
