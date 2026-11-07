import { DomainError, requireInteger } from "./domain.js";
import { record } from "./repository-access.js";
import type { RepositoryCleanup } from "./repository-cleanup.js";
import type {
  RepositoryOperation,
  RepositoryStore,
} from "./repository-store.js";

export type ResolutionReason = "unconfirmed" | "inspection_failed" | "timeout";

export interface RepositoryResolution {
  id: string;
  operationId: string;
  operatorId: string;
  status: "resolved" | "rejected";
  reason: ResolutionReason | null;
  observedAt: number | null;
  createdAt: number;
  eventCursor: number;
  simulation: true;
}

// A trusted control-plane inspector, separate from agent/checkout output. This
// contract cannot enable live access or perform cleanup. Live implementations
// must prove no outstanding request can finish after the observation.
export interface SimulatedRepositoryRecovery {
  readonly simulation: true;
  inspectRecovery(
    operation: Readonly<RepositoryOperation>,
    signal: AbortSignal,
    cleanup?: Readonly<RepositoryCleanup> | null,
  ): Promise<unknown>;
}

export function recoveryObservation(
  value: unknown,
  op: RepositoryOperation,
  startedAt: number,
  now: number,
): number | null {
  try {
    const data = record(value);
    if (
      data.simulation !== true ||
      data.operationId !== op.id ||
      data.workspaceId !== op.workspaceId ||
      data.providerId !== op.providerId ||
      data.repositoryId !== op.repositoryId ||
      data.installationId !== op.installationId ||
      data.effectsSettled !== true ||
      !["revoked", "absent"].includes(data.credential as string) ||
      !["cleared", "absent"].includes(data.channel as string) ||
      data.checkout !== "absent" ||
      !Number.isSafeInteger(data.observedAt) ||
      (data.observedAt as number) < startedAt ||
      (data.observedAt as number) > now
    )
      return null;
    return data.observedAt as number;
  } catch {
    return null;
  }
}

// operatorId is supplied by a trusted authenticated caller, never request JSON.
// This function intentionally has no access to mutating adapters.
export async function resolveRepository(
  store: RepositoryStore,
  inspector: SimulatedRepositoryRecovery,
  operationId: string,
  operatorId: string,
  key: unknown,
  timeoutMs = 1000,
): Promise<RepositoryResolution> {
  if (inspector.simulation !== true)
    throw new DomainError(
      400,
      "Only simulated repository recovery is supported",
    );
  requireInteger(timeoutMs, "timeoutMs", 100, 5000);
  const previous = store.resolution(operationId, operatorId, key);
  if (previous) return previous;
  const op = Object.freeze(store.operation(operationId));
  if (op.status !== "needs_attention")
    throw new DomainError(409, "Repository operation does not need resolution");
  const cleanup = store.recoveryCleanup(operationId, operatorId);
  const startedAt = Date.now();
  const deadlineAt = startedAt + timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let abort: () => void = () => {};
  let evidence: unknown;
  let failure: ResolutionReason | null = null;
  try {
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new Error("Repository recovery timed out"));
      controller.signal.addEventListener("abort", abort, { once: true });
    });
    evidence = await Promise.race([
      inspector.inspectRecovery(
        op,
        controller.signal,
        cleanup && Object.freeze(cleanup),
      ),
      cancelled,
    ]);
  } catch {
    failure = controller.signal.aborted ? "timeout" : "inspection_failed";
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", abort);
    controller.abort();
  }
  return store.recordResolution(
    operationId,
    operatorId,
    key,
    startedAt,
    deadlineAt,
    evidence,
    failure,
  );
}
