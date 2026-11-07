import { DomainError, requireInteger } from "./domain.js";
import { record } from "./repository-access.js";
import { RepositoryCredentialVault } from "./repository-credentials.js";
import {
  recoveryObservation,
  type SimulatedRepositoryRecovery,
} from "./repository-recovery.js";
import type {
  RepositoryOperation,
  RepositoryStore,
} from "./repository-store.js";

export type CleanupAction = "revoke" | "clear" | "discard";
export type CleanupFailure =
  | "unconfirmed"
  | "credential_unavailable"
  | "inspection_failed"
  | "cleanup_failed"
  | "timeout";

export interface RepositoryCleanup {
  id: string;
  operationId: string;
  operatorId: string;
  status: "running" | "acknowledged" | "needs_attention";
  phase:
    | "inspecting"
    | "revoke_intent"
    | "revoke_acknowledged"
    | "clear_intent"
    | "clear_acknowledged"
    | "discard_intent"
    | "discard_acknowledged";
  reason: CleanupFailure | null;
  observedAt: number | null;
  createdAt: number;
  deadlineAt: number;
  eventCursor: number;
  simulation: true;
}

// Trusted simulation adapter. Implementations must target the exact operation,
// never a workspace-wide path that could later belong to a replacement attempt.
export interface SimulatedRepositoryCleanup {
  readonly simulation: true;
  revoke(credential: string, signal: AbortSignal): Promise<void>;
  clearChannel(
    op: Readonly<RepositoryOperation>,
    signal: AbortSignal,
  ): Promise<void>;
  discardCheckout(
    op: Readonly<RepositoryOperation>,
    signal: AbortSignal,
  ): Promise<void>;
}

export function cleanupObservation(
  value: unknown,
  op: RepositoryOperation,
  attempt: RepositoryCleanup,
  now: number,
): {
  credential: string;
  channel: string;
  checkout: string;
  observedAt: number;
} | null {
  try {
    const data = record(value);
    if (
      !["active", "revoked", "absent"].includes(data.credential as string) ||
      !["present", "cleared", "absent"].includes(data.channel as string) ||
      !["present", "absent"].includes(data.checkout as string) ||
      data.cleanupId !== attempt.id ||
      data.cleanupEventCursor !== attempt.eventCursor ||
      data.cleanupEffectsSettled !== true ||
      recoveryObservation(
        {
          ...data,
          credential: "revoked",
          channel: "cleared",
          checkout: "absent",
        },
        op,
        attempt.createdAt,
        now,
      ) === null
    )
      return null;
    return {
      credential: data.credential as string,
      channel: data.channel as string,
      checkout: data.checkout as string,
      observedAt: data.observedAt as number,
    };
  } catch {
    return null;
  }
}

// An explicit internal command, never a reconnect/automatic retry. A persisted
// reservation wins once; even interrupted reservations cannot dispatch again.
export async function cleanupRepository(
  store: RepositoryStore,
  inspector: SimulatedRepositoryRecovery,
  adapter: SimulatedRepositoryCleanup,
  custody: RepositoryCredentialVault,
  operationId: string,
  operatorId: string,
  key: unknown,
  timeoutMs = 1000,
): Promise<RepositoryCleanup> {
  if ([inspector, adapter, custody].some((item) => item.simulation !== true))
    throw new DomainError(
      400,
      "Only simulated repository cleanup is supported",
    );
  if (!custody.isFor(store))
    throw new DomainError(400, "Repository custody does not match the store");
  requireInteger(timeoutMs, "timeoutMs", 100, 5000);
  const { attempt, created } = store.beginRecoveryCleanup(
    operationId,
    operatorId,
    key,
    timeoutMs,
  );
  if (!created) return attempt;
  const op = Object.freeze(store.operation(operationId));
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(0, attempt.deadlineAt - Date.now()),
  );
  async function bounded<T>(work: () => Promise<T>): Promise<T> {
    if (Date.now() >= attempt.deadlineAt) controller.abort();
    controller.signal.throwIfAborted();
    let abort = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new Error("Cleanup deadline reached"));
      controller.signal.addEventListener("abort", abort, { once: true });
    });
    try {
      return await Promise.race([work(), cancelled]);
    } finally {
      controller.signal.removeEventListener("abort", abort);
    }
  }
  let failure: CleanupFailure = "inspection_failed";
  try {
    const evidence = await bounded(() =>
      inspector.inspectRecovery(op, controller.signal, Object.freeze(attempt)),
    );
    failure = "unconfirmed";
    const observed = store.confirmRecoveryCleanup(
      operationId,
      attempt.id,
      evidence,
    );
    // Resolve custody before any dispatch; missing/unknown mint credentials
    // cannot be replaced with a newly minted token or inferred from expiry.
    failure = "credential_unavailable";
    const credential =
      observed.credential === "active"
        ? custody.recover(operationId, operatorId)
        : null;
    failure = "cleanup_failed";
    for (const action of ["revoke", "clear", "discard"] as const) {
      if (action === "revoke" && credential === null) continue;
      if (action === "clear" && observed.channel !== "present") continue;
      if (action === "discard" && observed.checkout !== "present") continue;
      store.recoveryCleanupIntent(operationId, attempt.id, action);
      await bounded(() =>
        action === "revoke"
          ? adapter.revoke(credential!, controller.signal)
          : action === "clear"
            ? adapter.clearChannel(op, controller.signal)
            : adapter.discardCheckout(op, controller.signal),
      );
      store.acknowledgeRecoveryCleanup(operationId, attempt.id, action);
    }
    store.finishRecoveryCleanup(operationId, attempt.id, null);
  } catch {
    // Fixed reasons only. A late acknowledgment cannot settle or erase custody.
    store.finishRecoveryCleanup(
      operationId,
      attempt.id,
      controller.signal.aborted || Date.now() >= attempt.deadlineAt
        ? "timeout"
        : failure,
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return store.recoveryCleanup(operationId, operatorId)!;
}
