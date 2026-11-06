import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { inspectLifecycle, workLifecycle } from "../src/lifecycle-worker.js";
import type {
  LifecycleKind,
  LifecycleObservation,
  SimulatedLifecycleProvider,
} from "../src/lifecycle.js";
import { Store } from "../src/store.js";
import { stopService } from "../scripts/harness.js";

class SimulationProvider implements SimulatedLifecycleProvider {
  readonly simulation = true;
  readonly resources = new Map<
    string,
    { state: "ready" | "paused"; creationMarker: string }
  >();
  readonly calls: string[] = [];
  lostAck: LifecycleKind | null = null;
  quiescent = true;
  observation: LifecycleObservation | null = null;

  private acknowledge(kind: LifecycleKind): void {
    if (this.lostAck === kind) {
      this.lostAck = null;
      throw new Error("fixture-secret-must-not-be-persisted");
    }
  }

  async create(marker: string): Promise<LifecycleObservation> {
    this.calls.push("create");
    const id = `sim-${this.resources.size + 1}`;
    this.resources.set(id, { state: "ready", creationMarker: marker });
    this.acknowledge("create");
    return { state: "ready", providerId: id, creationMarker: marker };
  }

  async quiesce(): Promise<boolean> {
    this.calls.push("quiesce");
    return this.quiescent;
  }

  async pause(id: string): Promise<LifecycleObservation> {
    this.calls.push("pause");
    const resource = this.resources.get(id)!;
    resource.state = "paused";
    this.acknowledge("pause");
    return { ...resource, providerId: id };
  }

  async resume(id: string): Promise<LifecycleObservation> {
    this.calls.push("resume");
    const resource = this.resources.get(id)!;
    resource.state = "ready";
    this.acknowledge("resume");
    return { ...resource, providerId: id };
  }

  async delete(id: string): Promise<void> {
    this.calls.push("delete");
    this.resources.delete(id);
    this.acknowledge("delete");
  }

  async inspect(
    marker: string,
    id: string | null,
  ): Promise<LifecycleObservation> {
    this.calls.push("inspect");
    if (this.observation) return this.observation;
    const entry = id
      ? this.resources.get(id)
      : [...this.resources.values()].find(
          (resource) => resource.creationMarker === marker,
        );
    if (!entry)
      return id ? { state: "missing", providerId: id } : { state: "unknown" };
    const providerId =
      id ?? [...this.resources].find(([, resource]) => resource === entry)![0];
    return { ...entry, providerId };
  }
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "argent-lifecycle-"));
  const path = join(root, "platform.sqlite");
  const f = {
    root,
    path,
    store: new Store(path),
    provider: new SimulationProvider(),
    reopen() {
      f.store.close();
      f.store = new Store(path);
    },
  };
  t.after(() => {
    f.store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const workspace = f.store.createWorkspace(
    "https://github.com/example/project",
  );
  return Object.assign(f, { workspace });
}

async function prepare(t: TestContext, kind: LifecycleKind) {
  const f = fixture(t);
  if (kind !== "create") {
    f.store.lifecycle.request(f.workspace.id, "create", "prepare-create");
    await workLifecycle(f.store.lifecycle, f.provider);
  }
  if (kind === "resume") {
    f.store.lifecycle.request(f.workspace.id, "pause", "prepare-pause");
    await workLifecycle(f.store.lifecycle, f.provider);
  }
  return f;
}

async function childFixture(
  t: TestContext,
  path: string,
  workspaceId: string,
  mode: string,
) {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./lifecycle-fixture.js", import.meta.url)),
      path,
      workspaceId,
      mode,
    ],
    {
      env: {},
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  let stderr = "";
  child.stderr!.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exit = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0 || signal === "SIGKILL") resolve();
      else reject(new Error(`Lifecycle fixture exited (${code}): ${stderr}`));
    });
  });
  t.after(() => stopService(child));
  const [ready] = await Promise.race([
    once(child, "message"),
    exit.then(() => {
      throw new Error("Fixture exited before ready");
    }),
  ]);
  assert.equal(ready, "ready");
  return {
    child,
    exit,
    go(): Promise<{ id?: string | null; error?: string }> {
      const result = Promise.race([
        once(child, "message"),
        exit.then(() => {
          throw new Error("Fixture exited before result");
        }),
      ]);
      child.send("go");
      return result.then(
        ([message]) => message as { id?: string | null; error?: string },
      );
    },
  };
}

test("simulated lifecycle persists create/pause/resume/delete and keeps local execution disabled", async (t) => {
  const f = fixture(t);
  for (const [kind, target] of [
    ["create", "ready"],
    ["pause", "paused"],
    ["resume", "ready"],
    ["delete", "deleted"],
  ] as const) {
    const op = f.store.lifecycle.request(f.workspace.id, kind, kind);
    assert.equal(await workLifecycle(f.store.lifecycle, f.provider), true);
    assert.equal(f.store.lifecycle.operation(op.id).status, "succeeded");
    assert.equal(f.store.lifecycle.workspace(f.workspace.id).state, target);
    assert.equal(
      f.store.lifecycle.workspace(f.workspace.id).providerId,
      "sim-1",
    );
    assert.throws(
      () => f.store.createRun(f.workspace.id, "Do not run locally", kind),
      /lifecycle simulation/,
    );
    assert.throws(
      () => f.store.setWorkspaceState(f.workspace.id, "stopped"),
      /lifecycle simulation/,
    );
    assert.throws(
      () =>
        f.store.resolveSimulation(op.id, "Cannot resolve lifecycle as a run"),
      /Run not found/,
    );
    const events = f.store.lifecycle.events(op.id);
    assert.ok(events.every((event) => event.simulation));
    assert.equal(events.at(-1)!.state, target);
    if (kind === "pause") {
      assert.deepEqual(
        events.map((event) => event.type),
        [
          "lifecycle.requested",
          "lifecycle.claimed",
          "lifecycle.quiesced",
          "lifecycle.dispatched",
          "lifecycle.succeeded",
        ],
      );
    }
    const cursor = events[1]!.cursor;
    assert.deepEqual(f.store.lifecycle.events(op.id, cursor), events.slice(2));
    const before = f.provider.calls.length;
    f.reopen();
    assert.deepEqual(f.store.lifecycle.events(op.id), events);
    assert.equal(
      f.provider.calls.length,
      before,
      "reconnect reads never invoke the provider",
    );
  }
  assert.deepEqual(f.provider.calls, [
    "create",
    "quiesce",
    "pause",
    "resume",
    "delete",
    "inspect",
  ]);
  assert.equal(await workLifecycle(f.store.lifecycle, f.provider), false);
  assert.equal(f.store.claim(1000), null);
});

test("lifecycle submission validates transitions and deduplicates the original request across restart", async (t) => {
  const f = fixture(t);
  assert.throws(
    () => f.store.lifecycle.request(f.workspace.id, "pause", "missing"),
    /not found/,
  );
  assert.throws(
    () =>
      f.store.lifecycle.request(
        f.workspace.id,
        "other" as LifecycleKind,
        "key",
      ),
    /Invalid/,
  );
  assert.throws(
    () => f.store.lifecycle.request(f.workspace.id, "create", ""),
    /non-empty/,
  );
  assert.throws(
    () => f.store.lifecycle.request(f.workspace.id, "create", "key", Infinity),
    /integer/,
  );
  const op = f.store.lifecycle.request(f.workspace.id, "create", "key");
  assert.equal(
    f.store.lifecycle.request(f.workspace.id, "create", "key").id,
    op.id,
  );
  assert.throws(
    () => f.store.lifecycle.request(f.workspace.id, "create", "key", 1000),
    /different payload/,
  );
  assert.throws(
    () => f.store.lifecycle.request(f.workspace.id, "pause", "key"),
    /different payload/,
  );
  assert.throws(
    () => f.store.lifecycle.request(f.workspace.id, "delete", "other"),
    /active or uncertain/,
  );
  await workLifecycle(f.store.lifecycle, f.provider);
  f.reopen();
  assert.equal(
    f.store.lifecycle.request(f.workspace.id, "create", "key").id,
    op.id,
  );
  assert.throws(
    () => f.store.lifecycle.request(f.workspace.id, "create", "new"),
    /already enrolled/,
  );
  assert.throws(
    () => f.store.lifecycle.request(f.workspace.id, "resume", "resume"),
    /Invalid lifecycle transition/,
  );
  assert.throws(() => f.store.lifecycle.events(op.id, -1), /integer/);
  assert.throws(() => f.store.lifecycle.events(op.id, 0, 101), /integer/);
});

test("independent processes claim one lifecycle operation atomically", async (t) => {
  const f = fixture(t);
  const op = f.store.lifecycle.request(f.workspace.id, "create", "create");
  const children = await Promise.all([
    childFixture(t, f.path, f.workspace.id, "claim"),
    childFixture(t, f.path, f.workspace.id, "claim"),
  ]);
  const results = await Promise.all(children.map((child) => child.go()));
  await Promise.all(children.map((child) => child.exit));
  assert.deepEqual(
    results.map((result) => result.id).sort(),
    [op.id, null].sort(),
  );
  assert.equal(
    f.store.lifecycle
      .events(op.id)
      .filter((event) => event.type === "lifecycle.claimed").length,
    1,
  );
});

test("lifecycle enrollment races M0 submission under the same database lock", async (t) => {
  const f = fixture(t);
  const children = await Promise.all([
    childFixture(t, f.path, f.workspace.id, "enroll"),
    childFixture(t, f.path, f.workspace.id, "submit-run"),
  ]);
  const results = await Promise.all(children.map((child) => child.go()));
  await Promise.all(children.map((child) => child.exit));
  assert.equal(results.filter((result) => result.id).length, 1);
  assert.equal(results.filter((result) => result.error).length, 1);
  if (results[0]!.id) {
    assert.equal(f.store.claim(1000), null);
    assert.throws(
      () => f.store.createRun(f.workspace.id, "Task", "another"),
      /lifecycle simulation/,
    );
  } else {
    assert.equal(f.store.lifecycle.claim(1000), null);
    assert.ok(f.store.claim(1000));
  }
});

for (const kind of ["create", "pause", "resume", "delete"] as const) {
  test(`lost simulated ${kind} acknowledgment reconciles by inspection without repeating the effect`, async (t) => {
    const f = await prepare(t, kind);
    const op = f.store.lifecycle.request(f.workspace.id, kind, "lost-ack");
    f.provider.lostAck = kind;
    await workLifecycle(f.store.lifecycle, f.provider);
    assert.equal(f.store.lifecycle.operation(op.id).status, "needs_attention");
    assert.equal(
      f.store.lifecycle.workspace(f.workspace.id).state,
      kind === "delete" ? "deleting" : "needs_attention",
    );
    assert.equal(
      JSON.stringify(f.store.lifecycle.events(op.id)).includes(
        "fixture-secret",
      ),
      false,
    );
    const mutations = f.provider.calls.filter((call) => call !== "inspect");
    f.reopen();
    assert.equal(await workLifecycle(f.store.lifecycle, f.provider), false);
    assert.throws(
      () => f.store.lifecycle.request(f.workspace.id, "delete", "retry"),
      /active or uncertain/,
    );
    assert.equal(
      await inspectLifecycle(f.store.lifecycle, f.provider, op.id),
      true,
    );
    assert.deepEqual(
      f.provider.calls.filter((call) => call !== "inspect"),
      mutations,
    );
    assert.equal(f.store.lifecycle.operation(op.id).status, "succeeded");
    assert.equal(
      f.store.lifecycle.events(op.id).at(-1)!.type,
      "lifecycle.reconciled",
    );
  });
}

for (const stage of [
  "crash-before-dispatch",
  "crash-after-dispatch",
  "crash-after-ack",
]) {
  test(`${stage} survives real worker death with simulated provider state and no replay`, async (t) => {
    const f = fixture(t);
    const requested = f.store.lifecycle.request(
      f.workspace.id,
      "create",
      "crash",
    );
    const child = await childFixture(t, f.path, f.workspace.id, stage);
    assert.equal((await child.go()).id, requested.id);
    const owned = f.store.lifecycle.operation(requested.id);
    child.child.kill("SIGKILL");
    await child.exit;
    f.reopen();
    assert.equal(
      f.store.lifecycle.reconcileExpired(owned.leaseExpiresAt! + 1),
      1,
    );
    assert.throws(
      () =>
        f.store.lifecycle.complete(owned.id, owned.leaseToken!, {
          state: "ready",
          providerId: "sim-stale",
          creationMarker: owned.id,
        }),
      /lease lost/,
    );
    if (stage === "crash-after-ack") {
      const resource = JSON.parse(
        readFileSync(`${f.path}.provider.json`, "utf8"),
      ) as { providerId: string; state: "ready"; creationMarker: string };
      f.provider.resources.set(resource.providerId, {
        state: resource.state,
        creationMarker: resource.creationMarker,
      });
    }
    assert.equal(await workLifecycle(f.store.lifecycle, f.provider), false);
    assert.equal(
      await inspectLifecycle(f.store.lifecycle, f.provider, requested.id),
      stage === "crash-after-ack",
    );
    assert.deepEqual(f.provider.calls, ["inspect"]);
  });
}

test("inconclusive or mismatched create observations never clear uncertainty", async (t) => {
  const f = fixture(t);
  const op = f.store.lifecycle.request(f.workspace.id, "create", "create");
  f.provider.lostAck = "create";
  await workLifecycle(f.store.lifecycle, f.provider);
  for (const observation of [
    { state: "unknown" },
    { state: "missing", providerId: "sim-absent" },
    {
      state: "ready",
      providerId: "sim-wrong",
      creationMarker: "other-operation",
    },
    { state: "ready", providerId: "../../invalid", creationMarker: op.id },
  ] as const) {
    f.provider.observation = observation;
    assert.equal(
      await inspectLifecycle(f.store.lifecycle, f.provider, op.id),
      false,
    );
    assert.equal(f.store.lifecycle.operation(op.id).status, "needs_attention");
    assert.equal(f.store.lifecycle.workspace(f.workspace.id).providerId, null);
  }
});

test("pause requires quiescence and cannot settle from a wrong provider identity", async (t) => {
  const f = await prepare(t, "pause");
  const op = f.store.lifecycle.request(f.workspace.id, "pause", "pause");
  const owned = f.store.lifecycle.claim(1000)!;
  assert.throws(
    () => f.store.lifecycle.dispatch(op.id, owned.leaseToken!),
    /quiescence is missing/,
  );
  f.store.lifecycle.acknowledgeQuiescence(op.id, owned.leaseToken!);
  f.store.lifecycle.dispatch(op.id, owned.leaseToken!);
  assert.throws(
    () => f.store.lifecycle.dispatch(op.id, owned.leaseToken!),
    /already recorded/,
  );
  assert.throws(
    () =>
      f.store.lifecycle.complete(op.id, owned.leaseToken!, {
        state: "paused",
        providerId: "sim-unrelated",
      }),
    /does not establish/,
  );
  f.store.lifecycle.markUncertain(op.id, owned.leaseToken!);
  f.provider.observation = { state: "paused", providerId: "sim-unrelated" };
  assert.equal(
    await inspectLifecycle(f.store.lifecycle, f.provider, op.id),
    false,
  );
  assert.equal(f.store.lifecycle.workspace(f.workspace.id).providerId, "sim-1");
});

test("refused quiescence never sends pause and cannot be reconciled as paused", async (t) => {
  const f = await prepare(t, "pause");
  const op = f.store.lifecycle.request(f.workspace.id, "pause", "pause");
  f.provider.quiescent = false;
  await workLifecycle(f.store.lifecycle, f.provider);
  assert.equal(f.provider.calls.includes("pause"), false);
  assert.equal(f.store.lifecycle.operation(op.id).dispatchedAt, null);
  assert.equal(f.store.lifecycle.operation(op.id).quiescedAt, null);
  f.provider.observation = { state: "paused", providerId: "sim-1" };
  assert.equal(
    await inspectLifecycle(f.store.lifecycle, f.provider, op.id),
    false,
  );
});

test("delete requires observed absence rather than a successful request alone", async (t) => {
  const f = await prepare(t, "delete");
  const op = f.store.lifecycle.request(f.workspace.id, "delete", "delete");
  f.provider.observation = { state: "ready", providerId: "sim-1" };
  await workLifecycle(f.store.lifecycle, f.provider);
  assert.equal(f.store.lifecycle.workspace(f.workspace.id).state, "deleting");
  assert.equal(f.store.lifecycle.operation(op.id).status, "needs_attention");
  f.provider.observation = null;
  assert.equal(
    await inspectLifecycle(f.store.lifecycle, f.provider, op.id),
    true,
  );
  assert.equal(f.provider.calls.filter((call) => call === "delete").length, 1);
});

test(
  "an uncooperative simulated provider is bounded and its late success cannot settle",
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    const op = f.store.lifecycle.request(f.workspace.id, "create", "hung", 100);
    let release!: (observation: LifecycleObservation) => void;
    const response = new Promise<LifecycleObservation>((resolve) => {
      release = resolve;
    });
    f.provider.create = async () => {
      f.provider.calls.push("create");
      return response;
    };
    await workLifecycle(f.store.lifecycle, f.provider);
    assert.equal(f.store.lifecycle.operation(op.id).status, "needs_attention");
    release({ state: "ready", providerId: "sim-late", creationMarker: op.id });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(f.store.lifecycle.operation(op.id).status, "needs_attention");
    assert.equal(await workLifecycle(f.store.lifecycle, f.provider), false);
    assert.deepEqual(f.provider.calls, ["create"]);
  },
);

test("lifecycle transitions and evidence roll back together on event failure", (t) => {
  const f = fixture(t);
  const db = new DatabaseSync(f.path);
  t.after(() => db.close());
  db.exec(`CREATE TRIGGER fail_lifecycle_event BEFORE INSERT ON lifecycle_events
    BEGIN SELECT RAISE(ABORT, 'injected event failure'); END;`);
  assert.throws(
    () => f.store.lifecycle.request(f.workspace.id, "create", "create"),
    /injected event failure/,
  );
  assert.throws(() => f.store.lifecycle.workspace(f.workspace.id), /not found/);
  db.exec("DROP TRIGGER fail_lifecycle_event");
  const op = f.store.lifecycle.request(f.workspace.id, "create", "create");
  const owned = f.store.lifecycle.claim(1000)!;
  f.store.lifecycle.dispatch(op.id, owned.leaseToken!);
  db.exec(`CREATE TRIGGER fail_lifecycle_event BEFORE INSERT ON lifecycle_events
    WHEN NEW.type = 'lifecycle.succeeded' BEGIN SELECT RAISE(ABORT, 'injected event failure'); END;`);
  assert.throws(
    () =>
      f.store.lifecycle.complete(op.id, owned.leaseToken!, {
        state: "ready",
        providerId: "sim-atomic",
        creationMarker: op.id,
      }),
    /injected event failure/,
  );
  assert.equal(f.store.lifecycle.operation(op.id).status, "running");
  assert.equal(f.store.lifecycle.workspace(f.workspace.id).providerId, null);
  assert.equal(
    f.store.lifecycle.workspace(f.workspace.id).state,
    "provisioning",
  );
  db.exec("DROP TRIGGER fail_lifecycle_event");
  f.store.lifecycle.complete(op.id, owned.leaseToken!, {
    state: "ready",
    providerId: "sim-atomic",
    creationMarker: op.id,
  });
  assert.equal(f.store.lifecycle.workspace(f.workspace.id).state, "ready");
});

test("provider observations are validated without coercion before state changes", (t) => {
  const f = fixture(t);
  const op = f.store.lifecycle.request(f.workspace.id, "create", "create");
  const owned = f.store.lifecycle.claim(1000)!;
  f.store.lifecycle.dispatch(op.id, owned.leaseToken!);
  for (const observation of [
    null,
    [],
    {},
    { state: "ready", providerId: 123, creationMarker: op.id },
  ]) {
    assert.throws(
      () => f.store.lifecycle.complete(op.id, owned.leaseToken!, observation),
      /does not establish/,
    );
    assert.equal(f.store.lifecycle.operation(op.id).status, "running");
    assert.equal(f.store.lifecycle.workspace(f.workspace.id).providerId, null);
  }
});

test("adding lifecycle tables preserves existing P1 workspace, run and event data", (t) => {
  const f = fixture(t);
  const run = f.store.createRun(
    f.workspace.id,
    "Existing simulation",
    "old-run",
  );
  f.store.cancel(run.id);
  const events = f.store.events(run.id);
  const db = new DatabaseSync(f.path);
  db.exec(
    "DROP TABLE lifecycle_events; DROP TABLE lifecycle_operations; DROP TABLE lifecycle_workspaces;",
  );
  db.close();
  f.reopen();
  assert.equal(
    f.store.getWorkspace(f.workspace.id).repository,
    f.workspace.repository,
  );
  assert.equal(f.store.getRun(run.id).status, "cancelled");
  assert.deepEqual(f.store.events(run.id), events);
  const op = f.store.lifecycle.request(
    f.workspace.id,
    "create",
    "new-lifecycle",
  );
  assert.equal(f.store.lifecycle.operation(op.id).status, "queued");
});

test("live provider objects are rejected before any operation is claimed", async (t) => {
  const f = fixture(t);
  const op = f.store.lifecycle.request(f.workspace.id, "create", "create");
  const unsupported = {
    ...f.provider,
    simulation: false,
  } as unknown as SimulatedLifecycleProvider;
  await assert.rejects(
    workLifecycle(f.store.lifecycle, unsupported),
    /Only simulated/,
  );
  assert.equal(f.store.lifecycle.operation(op.id).status, "queued");
});

test("a new worker marks an expired claim uncertain without dispatching it again", async (t) => {
  const f = fixture(t);
  const op = f.store.lifecycle.request(f.workspace.id, "create", "expired");
  f.store.lifecycle.claim(100, 1000);
  assert.equal(await workLifecycle(f.store.lifecycle, f.provider), false);
  assert.equal(f.store.lifecycle.operation(op.id).status, "needs_attention");
  assert.deepEqual(f.provider.calls, []);
});

test("lifecycle heartbeats cannot extend the absolute operation deadline", (t) => {
  const f = fixture(t);
  const op = f.store.lifecycle.request(
    f.workspace.id,
    "create",
    "deadline",
    500,
    1000,
  );
  const owned = f.store.lifecycle.claim(1000, 1000)!;
  assert.equal(owned.deadlineAt, 1500);
  f.store.lifecycle.heartbeat(op.id, owned.leaseToken!, 1000, 1100);
  assert.equal(f.store.lifecycle.operation(op.id).leaseExpiresAt, 1500);
  assert.throws(
    () => f.store.lifecycle.heartbeat(op.id, owned.leaseToken!, 1000, 1500),
    /lease lost/,
  );
  f.store.lifecycle.reconcileExpired(1500);
  assert.equal(
    f.store.lifecycle.events(op.id).at(-1)!.reason,
    "deadline_exceeded",
  );
});

test("provider inspection failures stay uncertain and persistence errors are surfaced", async (t) => {
  const f = fixture(t);
  const op = f.store.lifecycle.request(f.workspace.id, "create", "lost");
  f.provider.lostAck = "create";
  await workLifecycle(f.store.lifecycle, f.provider);
  const inspect = f.provider.inspect.bind(f.provider);
  f.provider.inspect = async () => {
    throw new Error("fixture-secret-must-not-be-persisted");
  };
  assert.equal(
    await inspectLifecycle(f.store.lifecycle, f.provider, op.id),
    false,
  );
  assert.equal(f.store.lifecycle.operation(op.id).status, "needs_attention");
  assert.equal(
    JSON.stringify(f.store.lifecycle.events(op.id)).includes("fixture-secret"),
    false,
  );
  f.provider.inspect = inspect;
  const db = new DatabaseSync(f.path);
  t.after(() => db.close());
  db.exec(`CREATE TRIGGER fail_reconciliation BEFORE INSERT ON lifecycle_events
    WHEN NEW.type = 'lifecycle.reconciled' BEGIN SELECT RAISE(ABORT, 'injected reconciliation failure'); END;`);
  await assert.rejects(
    inspectLifecycle(f.store.lifecycle, f.provider, op.id),
    /injected reconciliation failure/,
  );
  assert.equal(f.store.lifecycle.operation(op.id).status, "needs_attention");
  assert.equal(f.store.lifecycle.workspace(f.workspace.id).providerId, null);
  assert.equal(
    f.store.lifecycle
      .events(op.id)
      .some((event) => event.type === "lifecycle.reconciled"),
    false,
  );
});

for (const operation of [
  "heartbeat",
  "dispatch",
  "completion",
  "quiescence",
] as const) {
  test(`lifecycle ${operation} checks expiry after acquiring a contended process lock`, async (t) => {
    const f = await prepare(t, operation === "quiescence" ? "pause" : "create");
    const op = f.store.lifecycle.request(
      f.workspace.id,
      operation === "quiescence" ? "pause" : "create",
      "contention",
    );
    const owned = f.store.lifecycle.claim(500)!;
    if (operation === "completion")
      f.store.lifecycle.dispatch(op.id, owned.leaseToken!);
    const child: ChildProcess = spawn(
      process.execPath,
      [fileURLToPath(new URL("./lock-fixture.js", import.meta.url))],
      {
        env: { PLATFORM_DATA_DIR: f.root },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    t.after(() => stopService(child));
    await once(child.stdout!, "data");
    assert.ok(Date.now() < owned.leaseExpiresAt!);
    assert.throws(() => {
      if (operation === "heartbeat")
        f.store.lifecycle.heartbeat(op.id, owned.leaseToken!, 1000);
      else if (operation === "dispatch")
        f.store.lifecycle.dispatch(op.id, owned.leaseToken!);
      else if (operation === "quiescence")
        f.store.lifecycle.acknowledgeQuiescence(op.id, owned.leaseToken!);
      else
        f.store.lifecycle.complete(op.id, owned.leaseToken!, {
          state: "ready",
          providerId: "sim-stale",
          creationMarker: op.id,
        });
    }, /lease lost/);
    assert.equal(f.store.lifecycle.reconcileExpired(), 1);
    assert.equal(f.store.lifecycle.operation(op.id).status, "needs_attention");
    assert.equal(
      f.store.lifecycle
        .events(op.id)
        .some((event) => event.type === "lifecycle.succeeded"),
      false,
    );
  });
}
