import { mock } from "node:test";
import { Store } from "../src/store.js";
import { RepositoryCredentialVault } from "../src/repository-credentials.js";

const [path, mode, workspaceId] = process.argv.slice(2);
if (!path || !mode || !workspaceId)
  throw new Error("Missing simulation fixture arguments");
const store = new Store(path);
process.send!("ready");
interface FixtureMessage {
  id?: string;
  fence?: string;
  stallMs?: number;
}
process.once("message", (message: FixtureMessage) => {
  try {
    if (mode === "capture") {
      if (!message.id || !message.fence) throw new Error("Missing claim");
      new RepositoryCredentialVault(
        store.repositories,
        "simulation-key",
        Buffer.alloc(32, 7),
      ).capture(
        message.id,
        message.fence,
        "simulated_canary_bootstrap_secret_12345678",
      );
      process.send!({ id: message.id });
    } else if (mode === "pause") {
      const op = store.lifecycle.request(workspaceId, "pause", "process-pause");
      process.send!({ id: op.id });
    } else if (mode === "request") {
      const op = store.repositories.request(
        workspaceId,
        "operator",
        "refs/heads/main",
        "process-repository",
      );
      process.send!({ id: op.id });
    } else {
      const crashing = mode === "crash" || mode === "custody-crash";
      // These modes test death after a precise durable stage, not how quickly
      // synchronous SQLite and encryption can finish inside a short lease.
      const claimedAt = Date.now();
      const clock = crashing
        ? mock.method(Date, "now", () => claimedAt)
        : undefined;
      try {
        const op = store.repositories.claim(crashing ? 100 : 5000);
        if (crashing && op) {
          const stallMs = message.stallMs ?? 0;
          if (!Number.isInteger(stallMs) || stallMs < 0 || stallMs > 1000)
            throw new Error("Invalid fixture stall");
          // Reproduce a synchronous delay longer than the lease without using
          // the controlled clock or scheduling a heartbeat.
          if (stallMs)
            Atomics.wait(
              new Int32Array(new SharedArrayBuffer(4)),
              0,
              0,
              stallMs,
            );
          store.repositories.authorize(op.id, op.leaseToken!, 101, 202);
          if (mode === "custody-crash")
            new RepositoryCredentialVault(
              store.repositories,
              "simulation-key",
              Buffer.alloc(32, 7),
            ).capture(
              op.id,
              op.leaseToken!,
              "simulated_canary_bootstrap_secret_12345678",
            );
        }
        process.send!({ id: op?.id ?? null });
      } finally {
        clock?.mock.restore();
      }
    }
  } catch {
    process.send!({ conflict: true });
  }
  if (mode !== "crash" && mode !== "custody-crash") {
    store.close();
    process.disconnect!();
  }
});
