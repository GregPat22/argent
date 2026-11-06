import { setTimeout as delay } from "node:timers/promises";
import { LocalWorkspace, ScriptedAgent } from "./adapters.js";
import { dataPaths } from "./config.js";
import { Store } from "./store.js";
import { Worker } from "./worker.js";

const paths = dataPaths();
const store = new Store(paths.database);
const shutdown = new AbortController();
const worker = new Worker(
  store,
  new LocalWorkspace(paths.workspaces),
  new ScriptedAgent(),
);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => shutdown.abort());
}
console.log(JSON.stringify({ service: "worker", simulation: true }));
try {
  while (!shutdown.signal.aborted) {
    const worked = await worker.tick(shutdown.signal);
    if (!worked && !shutdown.signal.aborted) await delay(100);
  }
} finally {
  store.close();
}
