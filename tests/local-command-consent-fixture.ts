import { Store } from "../src/store.js";

const [database, root, workspaceId, review, key] = process.argv.slice(2);
if (!database || !root || !workspaceId || !review || !key)
  throw new Error("Missing consent fixture arguments");
const store = new Store(database);
process.send!("ready");
process.once("message", () => {
  void (async () => {
    try {
      const receipt = await store.localCommandConsents.consent(
        root,
        workspaceId,
        "operator",
        review,
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
