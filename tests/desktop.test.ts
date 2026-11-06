import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inspectArtifact } from "../src/artifacts.js";
import { LocalWorkspace, ScriptedAgent } from "../src/adapters.js";
import { Store } from "../src/store.js";
import { Worker } from "../src/worker.js";
import {
  APP_URL,
  DesktopClient,
  trustedSender,
} from "../src/desktop/bridge.js";
import {
  ensureService,
  isServiceAlive,
  readConnection,
  serviceRequest,
} from "../src/desktop/service-client.js";

test("workspace and task history paginate without losing equal-timestamp records", () => {
  const store = new Store(":memory:");
  try {
    const expected = Array.from({ length: 5 }, () =>
      store.createWorkspace("https://github.com/test/repo", 1000),
    );
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = store.listWorkspaces(2, cursor);
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.equal(new Set(ids).size, 5);
    assert.deepEqual([...ids].sort(), expected.map((item) => item.id).sort());
    const workspace = expected[0]!;
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const run = store.createRun(workspace.id, "Task", `key${i}`, 1000, 1000);
      runs.push(run);
      store.cancel(run.id);
    }
    const first = store.listRuns(workspace.id, 2);
    const second = store.listRuns(workspace.id, 2, first.nextCursor!);
    const third = store.listRuns(workspace.id, 2, second.nextCursor!);
    const listed = [...first.items, ...second.items, ...third.items];
    assert.deepEqual(
      listed.map((item) => item.id).sort(),
      runs.map((item) => item.id).sort(),
    );
    assert.equal(third.nextCursor, null);
    const foreign = store.createRun(expected[1]!.id, "Other", "foreign");
    assert.throws(
      () => store.listRuns(workspace.id, 2, foreign.id),
      /another workspace/,
    );
    assert.throws(() => store.listWorkspaces(101));
  } finally {
    store.close();
  }
});

test("reviewing an uncertain simulation records abandonment and allows new work without replay", () => {
  const store = new Store(":memory:");
  try {
    const workspace = store.createWorkspace("https://github.com/test/repo");
    const run = store.createRun(workspace.id, "Task", "key", 1000, 1000);
    store.claim(100, 1000);
    assert.throws(
      () => store.resolveSimulation(run.id, "Reviewed"),
      /uncertain/,
    );
    store.reconcile(1100);
    assert.throws(() => store.resolveSimulation(run.id, ""));
    assert.equal(
      store.resolveSimulation(
        run.id,
        "Inspected the simulation; abandon this attempt.",
      ).status,
      "failed",
    );
    assert.equal(store.events(run.id).at(-2)?.data.replayed, false);
    assert.equal(store.claim(100), null);
    assert.ok(store.createRun(workspace.id, "New attempt", "other"));
  } finally {
    store.close();
  }
});

test("artifact inspection checks retained bytes against committed evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "argent-artifact-"));
  const store = new Store(":memory:");
  try {
    const workspace = store.createWorkspace("https://github.com/test/repo");
    const run = store.createRun(workspace.id, "Task", "key");
    const worker = new Worker(
      store,
      new LocalWorkspace(root),
      new ScriptedAgent(1),
    );
    await worker.tick();
    const inspected = inspectArtifact(store, root, run.id);
    assert.equal((inspected.content as { task: string }).task, "Task");
    writeFileSync(
      join(root, workspace.id, `${run.id}.json`),
      '{"tampered":true}',
    );
    assert.throws(
      () => inspectArtifact(store, root, run.id),
      /changed after verification/,
    );
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("only the exact packaged main frame is trusted by the desktop bridge", () => {
  assert.equal(trustedSender(APP_URL, true), true);
  for (const url of [
    "file:///tmp/index.html",
    "https://app/index.html",
    `${APP_URL}?x=1`,
    `${APP_URL}#x`,
    "argent://evil/index.html",
  ]) {
    assert.equal(trustedSender(url, true), false);
  }
  assert.equal(trustedSender(APP_URL, false), false);
});

test("detached service persists across clients, deduplicates startup, and exposes no credential through bridge", async () => {
  const root = mkdtempSync(join(tmpdir(), "argent-service-"));
  let connection;
  try {
    const connections = await Promise.all([
      ensureService(root),
      ensureService(root),
    ]);
    connection = connections[0]!;
    assert.equal(connections[1]!.instanceId, connection.instanceId);
    assert.equal(await isServiceAlive(connection), true);
    assert.equal(statSync(join(root, "service.json")).mode & 0o777, 0o600);
    const client = new DesktopClient(root);
    const status = await client.call("status", []);
    assert.deepEqual(status, {
      ok: true,
      value: { connected: true, simulation: true, engine: "local" },
    });
    assert.equal(JSON.stringify(status).includes(connection.token), false);
    assert.equal(
      (await client.call("fetch", ["https://example.com"])).ok,
      false,
    );
    assert.equal(
      (await client.call("createRun", ["x", "Task", Infinity, "key"])).ok,
      false,
    );
    const created = await client.call("createWorkspace", [
      "https://github.com/test/repo",
    ]);
    assert.equal(created.ok, true);
    const workspace = created.ok ? (created.value as { id: string }) : null;
    const recreatedClient = new DesktopClient(root);
    const page = await recreatedClient.call("listWorkspaces", []);
    assert.equal(
      page.ok && (page.value as { items: { id: string }[] }).items[0]?.id,
      workspace!.id,
    );
    assert.equal(readConnection(root)?.instanceId, connection.instanceId);
    assert.equal(
      readFileSync(join(root, "service.json"), "utf8").includes(
        connection.token,
      ),
      true,
    );
    const previousInstance = connection.instanceId;
    process.kill(connection.pid, "SIGKILL");
    const deadline = Date.now() + 3000;
    while (await isServiceAlive(connection)) {
      if (Date.now() > deadline)
        throw new Error("Owned test service did not exit");
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    connection = await ensureService(root);
    assert.notEqual(connection.instanceId, previousInstance);
    const restored = await new DesktopClient(root).call("listWorkspaces", []);
    assert.equal(
      restored.ok &&
        (restored.value as { items: { id: string }[] }).items[0]?.id,
      workspace!.id,
    );
  } finally {
    if (connection) {
      await serviceRequest(connection, "/service/stop", "POST", {});
      const until = Date.now() + 5000;
      while (Date.now() < until && (await isServiceAlive(connection)))
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("stopping an active desktop service closes polling connections and preserves uncertainty", async () => {
  const root = mkdtempSync(join(tmpdir(), "argent-active-stop-"));
  let connection;
  const pause = () => new Promise((resolve) => setTimeout(resolve, 30));
  try {
    connection = await ensureService(root);
    const workspace = (await serviceRequest(connection, "/workspaces", "POST", {
      repository: "https://github.com/test/shutdown",
    })) as { id: string };
    const run = (await serviceRequest(
      connection,
      "/runs",
      "POST",
      {
        workspaceId: workspace.id,
        task: "Observe interrupted simulation",
        maxRuntimeMs: 30000,
      },
      "active-stop",
    )) as { id: string };
    const runningDeadline = Date.now() + 3000;
    while (
      (
        (await serviceRequest(connection, `/runs/${run.id}`)) as {
          status: string;
        }
      ).status !== "running"
    ) {
      assert.ok(Date.now() < runningDeadline, "fixture run must start");
      await pause();
    }
    await serviceRequest(connection, "/service/stop", "POST", {});
    const deadline = Date.now() + 2500;
    while (readConnection(root)) {
      assert.ok(
        Date.now() < deadline,
        "active service must release ownership despite client polling",
      );
      await isServiceAlive(connection);
      await pause();
    }
    assert.equal(await isServiceAlive(connection), false);
    const store = new Store(join(root, "platform.sqlite"));
    try {
      assert.equal(store.getRun(run.id).status, "needs_attention");
      assert.equal(store.claim(5000), null, "an uncertain run cannot replay");
    } finally {
      store.close();
    }
  } finally {
    // This fixture owns its private profile and process, including on pre-fix failure.
    if (
      connection &&
      readConnection(root)?.instanceId === connection.instanceId
    ) {
      try {
        process.kill(connection.pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
      await pause();
    }
    rmSync(root, { recursive: true, force: true });
  }
});
