import { mock } from "node:test";
import { cleanupRepository } from "../src/repository-cleanup.js";
import { RepositoryCredentialVault } from "../src/repository-credentials.js";
import { Store } from "../src/store.js";

const [path, mode, id] = process.argv.slice(2);
if (!path || !mode || !id) throw new Error("Missing simulation arguments");
const store = new Store(path);
process.send!("ready");
process.once("message", async (message: { stallMs?: number }) => {
  if (mode === "reserve") {
    process.send!(
      store.repositories.beginRecoveryCleanup(id, "operator", "cleanup", 100),
    );
    store.close();
    process.disconnect!();
    return;
  }
  const stallMs = message.stallMs ?? 0;
  if (!Number.isInteger(stallMs) || stallMs < 0 || stallMs > 1000)
    throw new Error("Invalid fixture stall");
  // Crash coverage starts after a durable dispatch checkpoint. The separate
  // timeout mode retains real time and deliberately exits before dispatch.
  if (mode === "crash")
    mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await cleanupRepository(
      store.repositories,
      {
        simulation: true,
        async inspectRecovery(op, _signal, cleanup) {
          if (stallMs)
            Atomics.wait(
              new Int32Array(new SharedArrayBuffer(4)),
              0,
              0,
              stallMs,
            );
          return {
            operationId: op.id,
            workspaceId: op.workspaceId,
            providerId: op.providerId,
            repositoryId: op.repositoryId,
            installationId: op.installationId,
            cleanupId: cleanup!.id,
            cleanupEventCursor: cleanup!.eventCursor,
            effectsSettled: true,
            cleanupEffectsSettled: true,
            credential: "active",
            channel: "present",
            checkout: "present",
            simulation: true,
            observedAt: Date.now(),
          };
        },
      },
      {
        simulation: true,
        async revoke() {
          process.send!({
            dispatched: "revoke",
            cleanupId: store.repositories.recoveryCleanup(id, "operator")!.id,
          });
          await new Promise(() => {});
        },
        async clearChannel() {
          throw new Error("Unexpected clear");
        },
        async discardCheckout() {
          throw new Error("Unexpected discard");
        },
      },
      new RepositoryCredentialVault(
        store.repositories,
        "simulation-key",
        Buffer.alloc(32, 7),
      ),
      id,
      "operator",
      "cleanup",
      100,
    );
  } finally {
    clearInterval(keepAlive);
    mock.timers.reset();
    store.close();
    process.disconnect!();
  }
});
