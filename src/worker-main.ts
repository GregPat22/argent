import { LocalWorkspace, ScriptedAgent } from "./adapters.js";
import { dataPaths } from "./config.js";
import { Store } from "./store.js";
import { Worker } from "./worker.js";
import { runWorkers } from "./worker-pool.js";

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
  await runWorkers(worker, shutdown.signal, 1);
} finally {
  store.close();
}
