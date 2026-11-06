import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  request,
  startService,
  stopService,
  waitForStatus,
} from "./harness.js";

const directory = resolve(".data", `demo-${randomUUID()}`);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const api = await startService("api", directory);
let worker: Awaited<ReturnType<typeof startService>> | undefined;
try {
  worker = await startService("worker", directory);
  const workspace = await request(api.url, "/workspaces", {
    repository: "https://github.com/example/project",
  });
  const submitted = await request(
    api.url,
    "/runs",
    {
      workspaceId: workspace.body.id,
      task: "Demonstrate durable execution and reconnection",
    },
    randomUUID(),
  );
  const runId = submitted.body.id as string;
  if (!runId) throw new Error(JSON.stringify(submitted));
  await waitForStatus(api.url, runId, "running");
  // Destroy the API process: the worker and its durable state remain independent.
  await stopService(api.child);
  const reconnected = await startService("api", directory);
  try {
    const completed = await waitForStatus(reconnected.url, runId, "completed");
    const history = await request(reconnected.url, `/runs/${runId}/events`);
    console.log(
      JSON.stringify(
        {
          milestone: "M0",
          simulation: true,
          apiRestarted: true,
          run: completed,
          history: history.body,
          persistedData: directory,
          limitations:
            "No real repository, AI agent, cloud compute or pull request.",
        },
        null,
        2,
      ),
    );
  } finally {
    await stopService(reconnected.child);
  }
} finally {
  await stopService(api.child);
  if (worker) await stopService(worker.child);
}
