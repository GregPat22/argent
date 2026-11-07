import { cleanupRepository } from "../src/repository-cleanup.js";
import { RepositoryCredentialVault } from "../src/repository-credentials.js";
import { Store } from "../src/store.js";

const [path, mode, id] = process.argv.slice(2);
if (!path || !mode || !id) throw new Error("Missing simulation arguments");
const store = new Store(path);
process.send!("ready");
process.once("message", async () => {
  if (mode === "reserve") {
    process.send!(
      store.repositories.beginRecoveryCleanup(id, "operator", "cleanup", 100),
    );
    store.close();
    process.disconnect!();
    return;
  }
  await cleanupRepository(
    store.repositories,
    {
      simulation: true,
      async inspectRecovery(op, _signal, cleanup) {
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
        process.send!({ dispatched: "revoke" });
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
});
