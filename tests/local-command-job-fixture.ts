import type { CommandJobRequest } from "../src/local-command-jobs.js";
import { Store } from "../src/store.js";

const [database, root, mode, encoded] = process.argv.slice(2);
if (!database || !root || !mode || !encoded)
  throw new Error("Missing fixture arguments");
const request = JSON.parse(encoded) as CommandJobRequest;
const store = new Store(database);
process.send!("ready");
process.once("message", () => {
  void (async () => {
    try {
      const run =
        mode === "claim"
          ? store.claimCommandJob(5000)?.run
          : mode === "agent"
            ? store.createRun(
                request.workspaceId,
                "competing agent",
                request.requestKey,
                1000,
              )
            : (await store.createCommandJob(root, request)).run;
      process.send!({ id: run?.id ?? null, token: run?.leaseToken ?? null });
    } catch {
      process.send!({ conflict: true });
    } finally {
      store.close();
      process.disconnect!();
    }
  })();
});
