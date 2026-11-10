export type RunStatus =
  | "queued"
  | "running"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled"
  | "needs_attention";

export type WorkspaceProvider = "local-simulation" | "local-worktree";

/** Real local execution details; present only for `local-worktree` workspaces. */
export interface LocalWorktree {
  repositoryPath: string;
  branch: string;
  baseSha: string;
  worktreePath: string;
}

export interface Workspace {
  id: string;
  repository: string;
  provider: WorkspaceProvider;
  state: "running" | "stopped";
  createdAt: number;
  local?: LocalWorktree;
}

/** `edits`: file edits only, prompts denied. `full`: commands without approval. */
export type PermissionMode = "edits" | "full";

export interface Run {
  id: string;
  workspaceId: string;
  task: string;
  status: RunStatus;
  simulation: boolean;
  permissionMode: PermissionMode;
  maxRuntimeMs: number;
  createdAt: number;
  deadlineAt: number | null;
  leaseToken: string | null;
  leaseExpiresAt: number | null;
}

export interface RunEvent {
  cursor: number;
  runId: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: number;
}

export type RunView = Omit<Run, "leaseToken">;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SimulationEvidence {
  kind: "simulation-artifact-check";
  passed: true;
  artifact: string;
  sha256: string;
  simulation: true;
}

/**
 * Argent's own inspection of a worktree after a real agent run. It records what
 * changed; it is not a test result and says so with `tested: false`.
 */
export interface WorktreeEvidence {
  kind: "worktree-record";
  passed: true;
  simulation: false;
  tested: false;
  branch: string;
  baseSha: string;
  headSha: string;
  changedFiles: number;
  diffSha256: string;
  /** Version 2 also binds untracked file contents and types. */
  contentHashVersion?: 2;
}

export type Evidence = SimulationEvidence | WorktreeEvidence;

export class DomainError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Cleanup could not establish that external execution has stopped. */
export class UncertainExecutionError extends DomainError {
  constructor() {
    super(
      409,
      "Local process termination is unconfirmed; workspace remains blocked",
    );
  }
}

export function requireString(
  value: unknown,
  name: string,
  max = 4000,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > max ||
    value.includes("\0")
  ) {
    throw new DomainError(
      400,
      `${name} must be a non-empty string of at most ${max} characters`,
    );
  }
  return value;
}

export function requireInteger(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new DomainError(
      400,
      `${name} must be an integer from ${min} to ${max}`,
    );
  }
  return value;
}

/** Untrusted live display data; not persisted execution or test evidence. */
export interface WorkspaceChange {
  path: string;
  previousPath: string | null;
  status: "added" | "modified" | "deleted" | "renamed" | "typechanged";
  oldMode: string | null;
  newMode: string | null;
  binary: boolean;
  diff: string;
}

export interface WorkspaceChanges {
  kind: "workspace-changes";
  workspaceId: string;
  baseSha: string;
  headSha: string;
  simulation: false;
  tested: false;
  consistency: "live";
  files: WorkspaceChange[];
}
