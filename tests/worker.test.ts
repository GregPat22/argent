import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  LocalWorkspace,
  ScriptedAgent,
  type AgentAdapter,
} from "../src/adapters.js";
import { Store } from "../src/store.js";
import { Worker } from "../src/worker.js";
import { UncertainExecutionError } from "../src/domain.js";
import { runWorkers } from "../src/worker-pool.js";
import { setTimeout as delay } from "node:timers/promises";

function fixture(t: TestContext, agent: AgentAdapter = new ScriptedAgent(5)) {
  const root = mkdtempSync(join(tmpdir(), "platform-worker-"));
  const store = new Store(join(root, "db.sqlite"));
  t.after(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const workspace = store.createWorkspace("https://github.com/example/project");
  const worker = new Worker(store, new LocalWorkspace(root), agent, 200);
  return { root, store, workspace, worker };
}

test("worker writes a persistent artifact and records verification before completion", async (t) => {
  const { root, store, workspace, worker } = fixture(t);
  const run = store.createRun(workspace.id, "Simulated task", "key");
  assert.equal(await worker.tick(), true);
  assert.equal(store.getRun(run.id).status, "completed");
  const events = store.events(run.id);
  assert.equal(events.at(-2)?.type, "verification.recorded");
  assert.equal(events.at(-1)?.data.outcome, "simulation_passed");
  const path = join(root, workspace.id, `${run.id}.json`);
  const artifact = readFileSync(path, "utf8");
  store.setWorkspaceState(workspace.id, "stopped");
  store.setWorkspaceState(workspace.id, "running");
  assert.equal(readFileSync(path, "utf8"), artifact);
  assert.equal(await worker.tick(), false);
});

test("agent success claims cannot substitute for verification", async (t) => {
  const agent: AgentAdapter = {
    async *execute() {
      yield "All tests passed, trust me.";
    },
  };
  const { store, workspace, worker } = fixture(t, agent);
  const run = store.createRun(workspace.id, "Task", "key");
  await worker.tick();
  assert.equal(store.getRun(run.id).status, "failed");
  assert.equal(
    store
      .events(run.id)
      .some((event) => event.type === "verification.recorded"),
    false,
  );
});

test("heartbeats keep a longer task alive beyond its original lease", async (t) => {
  const { store, workspace, worker } = fixture(t, new ScriptedAgent(150));
  const run = store.createRun(workspace.id, "Task", "key");
  await worker.tick();
  assert.equal(store.getRun(run.id).status, "completed");
});

test("runtime limits abort the scripted task before it writes an artifact", async (t) => {
  const { root, store, workspace, worker } = fixture(t, new ScriptedAgent(150));
  const run = store.createRun(workspace.id, "Task", "key", 100);
  await worker.tick();
  assert.equal(store.getRun(run.id).status, "failed");
  assert.equal(store.events(run.id).at(-1)?.data.reason, "runtime_exceeded");
  assert.equal(existsSync(join(root, workspace.id, `${run.id}.json`)), false);
});

test("active cancellation stops work and is acknowledged durably", async (t) => {
  const { root, store, workspace, worker } = fixture(t, new ScriptedAgent(150));
  const run = store.createRun(workspace.id, "Task", "key");
  const running = worker.tick();
  store.cancel(run.id);
  await running;
  assert.equal(store.getRun(run.id).status, "cancelled");
  assert.equal(existsSync(join(root, workspace.id, `${run.id}.json`)), false);
});

test("worker shutdown marks uncertain work and never silently replays it", async (t) => {
  const { store, workspace, worker } = fixture(t, new ScriptedAgent(150));
  const run = store.createRun(workspace.id, "Task", "key");
  const shutdown = new AbortController();
  const running = worker.tick(shutdown.signal);
  shutdown.abort();
  await running;
  assert.equal(store.getRun(run.id).status, "needs_attention");
  assert.equal(await worker.tick(), false);
});

test("event budget bounds noisy adapters", async (t) => {
  // This tests the event budget, not disk throughput within a short lease.
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const noisy: AgentAdapter = {
    async *execute() {
      for (let i = 0; i < 200; i++) yield "log";
    },
  };
  const { store, workspace, worker } = fixture(t, noisy);
  const run = store.createRun(workspace.id, "Task", "key");
  await worker.tick();
  assert.equal(store.getRun(run.id).status, "failed");
  let cursor = 0;
  let count = 0;
  let reason: unknown;
  for (;;) {
    const events = store.events(run.id, cursor);
    if (!events.length) break;
    count += events.filter((event) => event.type === "agent.log").length;
    reason = events.at(-1)?.data.reason;
    cursor = events.at(-1)!.cursor;
  }
  assert.equal(count, 100);
  assert.equal(reason, "Run log limit exceeded");
});

test("dispatch is bounded and shutdown drains every active slot", async (t) => {
  let live = 0;
  let peak = 0;
  const agent: AgentAdapter = {
    async *execute(_run, _directory, signal) {
      live++;
      peak = Math.max(peak, live);
      try {
        yield "started";
        await delay(10000, undefined, { signal });
      } finally {
        await delay(50);
        live--;
      }
    },
  };
  const f = fixture(t, agent);
  const spaces = [
    f.workspace,
    f.store.createWorkspace("https://github.com/example/two"),
    f.store.createWorkspace("https://github.com/example/three"),
  ];
  const runs = spaces.map((space, i) =>
    f.store.createRun(space.id, "wait", String(i), 30000),
  );
  const shutdown = new AbortController();
  const running = runWorkers(f.worker, shutdown.signal, 2);
  try {
    const end = Date.now() + 2000;
    while (live < 2) {
      assert.ok(Date.now() < end);
      await delay(10);
    }
    assert.equal(
      runs.filter((run) => f.store.getRun(run.id).status === "queued").length,
      1,
    );
    assert.equal(peak, 2);
  } finally {
    shutdown.abort();
    await running;
  }
  assert.equal(live, 0);
  assert.equal(
    runs.filter((run) => f.store.getRun(run.id).status === "needs_attention")
      .length,
    2,
  );
});

test("uncertain process cleanup takes precedence over requested cancellation", async (t) => {
  const agent: AgentAdapter = {
    async *execute(_run, _directory, signal) {
      yield "started";
      try {
        await delay(10000, undefined, { signal });
      } finally {
        throw new UncertainExecutionError();
      }
    },
  };
  const f = fixture(t, agent);
  const run = f.store.createRun(f.workspace.id, "wait", "uncertain");
  const running = f.worker.tick();
  await delay(10);
  f.store.cancel(run.id);
  await running;
  assert.equal(f.store.getRun(run.id).status, "needs_attention");
  assert.match(
    String(f.store.events(run.id).at(-1)!.data.reason),
    /termination is unconfirmed/,
  );
});

test("a rejected log cannot hide uncertainty from iterator cleanup", async (t) => {
  const agent: AgentAdapter = {
    async *execute(run) {
      try {
        f.store.cancel(run.id);
        yield "late log";
      } finally {
        throw new UncertainExecutionError();
      }
    },
  };
  const f = fixture(t, agent);
  const run = f.store.createRun(f.workspace.id, "wait", "late-log");
  await f.worker.tick();
  assert.equal(f.store.getRun(run.id).status, "needs_attention");
  assert.match(
    String(f.store.events(run.id).at(-1)!.data.reason),
    /termination is unconfirmed/,
  );
  assert.throws(() => f.store.createRun(f.workspace.id, "again", "retry"));
});
