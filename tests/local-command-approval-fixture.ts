import { Store } from "../src/store.js";

const [database, root, workspaceId, candidate, key, operator = "operator"] =
  process.argv.slice(2);
if (!database || !root || !workspaceId || !candidate || !key)
  throw new Error("Missing approval fixture arguments");
const store = new Store(database);
process.send!("ready");
process.once("message", () => {
  void (async () => {
    try {
      const receipt = await store.localCommandApprovals.approve(
        root,
        workspaceId,
        operator,
        candidate,
        key,
      );
      process.send!({ receipt });
    } catch {
      process.send!({ conflict: true });
    } finally {
      store.close();
      process.disconnect!();
    }
  })();
});
