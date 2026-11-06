import { writeFileSync } from "node:fs";
import { Store } from "../src/store.js";

const [path, workspaceId, mode] = process.argv.slice(2);
if (!path || !workspaceId || !mode)
  throw new Error("Fixture arguments missing");
const store = new Store(path);
process.send?.("ready");
process.once("message", () => {
  try {
    if (mode === "enroll") {
      const op = store.lifecycle.request(workspaceId, "create", "race-create");
      process.send?.({ id: op.id });
    } else if (mode === "submit-run") {
      const run = store.createRun(workspaceId, "Simulated race", "race-run");
      process.send?.({ id: run.id });
    } else {
      const op = store.lifecycle.claim(500);
      if (op && mode !== "claim" && mode !== "crash-before-dispatch") {
        store.lifecycle.dispatch(op.id, op.leaseToken!);
        if (mode === "crash-after-ack") {
          // Fixed simulation artifact represents provider state outside the
          // control-plane transaction; no repository code or service is run.
          writeFileSync(
            `${path}.provider.json`,
            JSON.stringify({
              state: "ready",
              providerId: "sim-retained",
              creationMarker: op.id,
            }),
          );
        }
      }
      process.send?.({ id: op?.id ?? null });
    }
  } catch (error) {
    process.send?.({
      error: error instanceof Error ? error.message : "Fixture failure",
    });
  }
  if (mode.startsWith("crash-")) setInterval(() => {}, 1000);
  else {
    store.close();
    process.disconnect();
  }
});
