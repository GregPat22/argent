import { DomainError, requireInteger } from "./domain.js";
import type { LifecycleStore } from "./lifecycle-store.js";
import type {
  LifecycleObservation,
  SimulatedLifecycleProvider,
} from "./lifecycle.js";

function requireSimulation(provider: SimulatedLifecycleProvider): void {
  if (provider.simulation !== true)
    throw new DomainError(
      400,
      "Only simulated lifecycle providers are supported",
    );
}

async function bounded<T>(
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([work(), cancelled]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export async function workLifecycle(
  store: LifecycleStore,
  provider: SimulatedLifecycleProvider,
  leaseMs = 1000,
): Promise<boolean> {
  requireSimulation(provider);
  store.reconcileExpired();
  const op = store.claim(leaseMs);
  if (!op) return false;
  const token = op.leaseToken!;
  const controller = new AbortController();
  const deadline = setTimeout(
    () => controller.abort(new Error("Lifecycle deadline exceeded")),
    Math.max(0, op.deadlineAt! - Date.now()),
  );
  const heartbeat = setInterval(
    () => {
      try {
        store.heartbeat(op.id, token, leaseMs);
      } catch {
        controller.abort(new Error("Lifecycle ownership lost"));
      }
    },
    Math.max(25, Math.floor(leaseMs / 3)),
  );
  try {
    const workspace = store.workspace(op.workspaceId);
    if (op.kind === "pause") {
      const quiesced = await bounded(controller.signal, () =>
        provider.quiesce(workspace.providerId!, controller.signal),
      );
      if (quiesced !== true)
        throw new Error("Runner did not acknowledge quiescence");
      store.acknowledgeQuiescence(op.id, token);
    }
    store.dispatch(op.id, token);
    const observation = await bounded(
      controller.signal,
      async (): Promise<LifecycleObservation> => {
        switch (op.kind) {
          case "create":
            return provider.create(op.id, controller.signal);
          case "pause":
            return provider.pause(workspace.providerId!, controller.signal);
          case "resume":
            return provider.resume(workspace.providerId!, controller.signal);
          case "delete":
            await provider.delete(workspace.providerId!, controller.signal);
            controller.signal.throwIfAborted();
            return provider.inspect(
              op.id,
              workspace.providerId,
              controller.signal,
            );
        }
      },
    );
    store.complete(op.id, token, observation);
  } catch {
    // Persist only a fixed reason: adapter errors can contain credentials or
    // untrusted text. A thrown/aborted call does not prove no external effect.
    store.reconcileExpired();
    const current = store.operation(op.id);
    if (current.status === "running" && current.leaseToken === token)
      store.markUncertain(op.id, token);
  } finally {
    clearTimeout(deadline);
    clearInterval(heartbeat);
    controller.abort(new Error("Lifecycle attempt ended"));
  }
  return true;
}

export async function inspectLifecycle(
  store: LifecycleStore,
  provider: SimulatedLifecycleProvider,
  id: string,
  timeoutMs = 5000,
): Promise<boolean> {
  requireSimulation(provider);
  requireInteger(timeoutMs, "timeoutMs", 100, 60000);
  store.reconcileExpired();
  const op = store.operation(id);
  if (op.status !== "needs_attention")
    throw new DomainError(
      409,
      "Only uncertain lifecycle operations can be inspected",
    );
  const workspace = store.workspace(op.workspaceId);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("Provider inspection timed out")),
    timeoutMs,
  );
  try {
    let observation: LifecycleObservation;
    try {
      observation = await bounded(controller.signal, () =>
        provider.inspect(op.id, workspace.providerId, controller.signal),
      );
    } catch {
      // A failed read supplies no reconciliation evidence. Leave the existing
      // uncertainty intact; never turn a provider exception into stored text.
      return false;
    }
    try {
      store.acceptObservation(id, observation);
      return true;
    } catch (error) {
      if (error instanceof DomainError && error.status === 409) return false;
      throw error;
    }
  } finally {
    clearTimeout(timer);
    controller.abort(new Error("Provider inspection ended"));
  }
}
