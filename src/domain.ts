export type RunStatus =
  | "queued"
  | "running"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled"
  | "needs_attention";

export interface Workspace {
  id: string;
  repository: string;
  provider: "local-simulation";
  state: "running" | "stopped";
  createdAt: number;
}

export interface Run {
  id: string;
  workspaceId: string;
  task: string;
  status: RunStatus;
  simulation: true;
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

export interface Evidence {
  kind: "simulation-artifact-check";
  passed: true;
  artifact: string;
  sha256: string;
  simulation: true;
}

export class DomainError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
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
    value.length > max
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
