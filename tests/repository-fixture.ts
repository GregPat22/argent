import { Store } from "../src/store.js";

const [path, mode, workspaceId] = process.argv.slice(2);
if (!path || !mode || !workspaceId)
  throw new Error("Missing simulation fixture arguments");
const store = new Store(path);
process.send!("ready");
process.once("message", () => {
  try {
    if (mode === "pause") {
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
      const op = store.repositories.claim(mode === "crash" ? 100 : 5000);
      if (mode === "crash" && op)
        store.repositories.authorize(op.id, op.leaseToken!, 101, 202);
      process.send!({ id: op?.id ?? null });
    }
  } catch {
    process.send!({ conflict: true });
  }
  if (mode !== "crash") {
    store.close();
    process.disconnect!();
  }
});
