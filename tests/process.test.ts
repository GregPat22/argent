import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEMO_TOKEN,
  request,
  startService,
  stopService,
  waitForStatus,
} from "../scripts/harness.js";

async function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "platform-process-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const api = await startService("api", root);
  t.after(() => stopService(api.child));
  const workspace = await request(api.url, "/workspaces", {
    repository: "https://github.com/example/project",
  });
  assert.equal(workspace.status, 201);
  const run = await request(
    api.url,
    "/runs",
    { workspaceId: workspace.body.id, task: "Task" },
    "key",
  );
  assert.equal(run.status, 202);
  return {
    root,
    api,
    workspaceId: workspace.body.id as string,
    runId: run.body.id as string,
  };
}

async function claimer(t: TestContext, root: string, once = false) {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./claim-fixture.js", import.meta.url)),
      ...(once ? ["--once"] : []),
    ],
    {
      env: { ...process.env, PLATFORM_DATA_DIR: root },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  t.after(() => stopService(child));
  return await new Promise<{ child: typeof child; claimed: string | null }>(
    (resolve, reject) => {
      let output = "";
      let errors = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Claimer timeout: ${errors}`));
      }, 5000);
      child.stderr?.on("data", (chunk: Buffer) => {
        errors += chunk.toString();
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timer);
        if (!output.includes("\n")) reject(new Error(errors));
      });
      child.stdout?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes("\n")) {
          clearTimeout(timer);
          resolve({
            child,
            claimed: (
              JSON.parse(output.split("\n")[0]!) as { claimed: string | null }
            ).claimed,
          });
        }
      });
    },
  );
}

test("separate worker completes across API death; new client replays durable events", async (t) => {
  const { root, api, runId } = await fixture(t);
  const initial = await request(api.url, `/runs/${runId}/events?limit=1`);
  const cursor = initial.body.nextCursor as number;
  const worker = await startService("worker", root);
  t.after(() => stopService(worker.child));
  await waitForStatus(api.url, runId, "running");
  await stopService(api.child, "SIGKILL");
  const restarted = await startService("api", root);
  t.after(() => stopService(restarted.child));
  const run = await waitForStatus(restarted.url, runId, "completed");
  assert.equal(run.simulation, true);
  assert.equal("leaseToken" in run, false);
  const replay = await request(
    restarted.url,
    `/runs/${runId}/events?after=${cursor}`,
  );
  const events = replay.body.events as { cursor: number; type: string }[];
  assert.ok(events.every((event) => event.cursor > cursor));
  assert.equal(events.at(-2)?.type, "verification.recorded");
  assert.equal(events.at(-1)?.type, "run.completed");
  assert.deepEqual(
    (
      await request(
        restarted.url,
        `/runs/${runId}/events?after=${replay.body.nextCursor}`,
      )
    ).body.events,
    [],
  );
});

test("two independent processes compete for one durable claim", async (t) => {
  const { root, runId } = await fixture(t);
  const results = await Promise.all([
    claimer(t, root, true),
    claimer(t, root, true),
  ]);
  assert.deepEqual(results.map((item) => item.claimed).filter(Boolean), [
    runId,
  ]);
});

test("killed worker is reconciled without replay and blocks new work", async (t) => {
  const { root, api, runId, workspaceId } = await fixture(t);
  const claimed = await claimer(t, root);
  assert.equal(claimed.claimed, runId);
  await stopService(claimed.child, "SIGKILL");
  const worker = await startService("worker", root);
  t.after(() => stopService(worker.child));
  await waitForStatus(api.url, runId, "needs_attention");
  const events = await request(api.url, `/runs/${runId}/events`);
  assert.equal(
    (events.body.events as { type: string }[]).filter(
      (event) => event.type === "run.started",
    ).length,
    1,
  );
  const other = await request(
    api.url,
    "/runs",
    { workspaceId, task: "Another task" },
    "other",
  );
  assert.equal(other.status, 409);
});

test("HTTP boundary enforces authentication, validation, cancellation and finite input", async (t) => {
  const { api, runId } = await fixture(t);
  assert.equal((await fetch(api.url + "/health")).status, 401);
  const headers = { Authorization: `Bearer ${DEMO_TOKEN}` };
  assert.equal(
    (
      await fetch(api.url + "/health", {
        headers: { ...headers, Origin: "https://example.com" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(api.url + "/runs", { method: "POST", headers, body: "{" }))
      .status,
    400,
  );
  assert.equal(
    (
      await fetch(api.url + "/runs", {
        method: "POST",
        headers,
        body: "x".repeat(17000),
      })
    ).status,
    413,
  );
  assert.equal(
    (await request(api.url, `/runs/${runId}/events?after=nope`)).status,
    400,
  );
  assert.equal(
    (await request(api.url, `/runs/${runId}/events?limit=101`)).status,
    400,
  );
  assert.equal((await request(api.url, "/runs/missing")).status, 404);
  assert.equal(
    (await request(api.url, `/runs/${runId}/cancel`, {})).body.status,
    "cancelled",
  );
});
