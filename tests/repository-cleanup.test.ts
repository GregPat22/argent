import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  cleanupRepository,
  type CleanupAction,
  type SimulatedRepositoryCleanup,
} from "../src/repository-cleanup.js";
import { RepositoryCredentialVault } from "../src/repository-credentials.js";
import {
  resolveRepository,
  type SimulatedRepositoryRecovery,
} from "../src/repository-recovery.js";
import { Store } from "../src/store.js";
import { stopService } from "../scripts/harness.js";

const secret = "simulation_cleanup_canary_1234567890";
const key = Buffer.alloc(32, 7);

function fixture(t: TestContext, captured = true) {
  const root = mkdtempSync(join(tmpdir(), "argent-cleanup-"));
  const path = join(root, "platform.sqlite");
  let store = new Store(path);
  const workspace = store.createWorkspace("https://github.com/example/fixture");
  const create = store.lifecycle.request(workspace.id, "create", "create");
  const claim = store.lifecycle.claim(5000)!;
  store.lifecycle.dispatch(claim.id, claim.leaseToken!);
  store.lifecycle.complete(claim.id, claim.leaseToken!, {
    state: "ready",
    providerId: "simulation-provider",
    creationMarker: create.id,
  });
  const requested = store.repositories.request(
    workspace.id,
    "operator",
    "refs/heads/main",
    "bootstrap",
  );
  const op = store.repositories.claim(5000)!;
  store.repositories.authorize(op.id, op.leaseToken!, 101, 202);
  const vault = () =>
    new RepositoryCredentialVault(store.repositories, "simulation-key", key);
  if (captured) {
    vault().capture(op.id, op.leaseToken!, secret);
    store.repositories.minted(op.id, op.leaseToken!, Date.now() + 3600000);
    store.repositories.checkout(op.id, op.leaseToken!, "a".repeat(40));
  }
  store.repositories.settle(op.id, op.leaseToken!);
  const calls: string[] = [];
  const state = {
    credential: "active",
    channel: "present",
    checkout: "present",
    effectsSettled: true,
    cleanupEffectsSettled: true,
  };
  let evidence: Record<string, unknown> = {};
  let onCall: (action: string) => Promise<void> = async () => {};
  const inspector: SimulatedRepositoryRecovery = {
    simulation: true,
    async inspectRecovery(current, _signal, cleanup) {
      calls.push("inspect");
      await onCall("inspect");
      assert.ok(Object.isFrozen(current));
      assert.ok(!cleanup || Object.isFrozen(cleanup));
      return {
        operationId: current.id,
        workspaceId: current.workspaceId,
        providerId: current.providerId,
        repositoryId: current.repositoryId,
        installationId: current.installationId,
        simulation: true,
        cleanupId: cleanup?.id,
        cleanupEventCursor: cleanup?.eventCursor,
        observedAt: Date.now(),
        ...state,
        ...evidence,
      };
    },
  };
  async function action(name: CleanupAction) {
    calls.push(name);
    const attempt = store.repositories.recoveryCleanup(op.id, "operator")!;
    assert.equal(attempt.phase, `${name}_intent`);
    await onCall(name);
  }
  const adapter: SimulatedRepositoryCleanup = {
    simulation: true,
    async revoke(credential) {
      assert.equal(credential, secret);
      assert.equal(vault().recover(op.id, "operator"), secret);
      await action("revoke");
      state.credential = "revoked";
    },
    async clearChannel(current) {
      assert.equal(current.id, op.id);
      assert.ok(Object.isFrozen(current));
      await action("clear");
      state.channel = "cleared";
    },
    async discardCheckout(current) {
      assert.equal(current.id, op.id);
      await action("discard");
      state.checkout = "absent";
    },
  };
  t.after(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    path,
    root,
    workspace,
    op: requested,
    state,
    calls,
    inspector,
    adapter,
    vault,
    get store() {
      return store;
    },
    set evidence(value: Record<string, unknown>) {
      evidence = value;
    },
    set onCall(value: (action: string) => Promise<void>) {
      onCall = value;
    },
    reopen() {
      store.close();
      store = new Store(path);
    },
    cleanup(requestKey = "cleanup", timeoutMs = 1000) {
      return cleanupRepository(
        store.repositories,
        inspector,
        adapter,
        vault(),
        op.id,
        "operator",
        requestKey,
        timeoutMs,
      );
    },
    resolve(requestKey = "resolve", timeoutMs = 1000) {
      return resolveRepository(
        store.repositories,
        inspector,
        op.id,
        "operator",
        requestKey,
        timeoutMs,
      );
    },
  };
}

test("simulated cleanup audits intents, erases revoked custody and requires separate independent resolution", async (t) => {
  const f = fixture(t);
  const before = f.store.repositories.operation(f.op.id);
  const attempt = await f.cleanup();
  assert.equal(attempt.status, "acknowledged");
  assert.equal(attempt.reason, null);
  assert.ok(attempt.observedAt);
  assert.equal(attempt.simulation, true);
  assert.deepEqual(f.calls, ["inspect", "revoke", "clear", "discard"]);
  assert.deepEqual(f.store.repositories.operation(f.op.id), before);
  assert.throws(() => f.vault().recover(f.op.id, "operator"), /unavailable/);
  assert.throws(
    () => f.store.lifecycle.request(f.workspace.id, "pause", "pause"),
    /repository/,
  );
  const events = f.store.repositories.events(f.op.id).map((e) => e.type);
  for (const action of ["revoke", "clear", "discard"]) {
    assert.ok(
      events.indexOf(`repository.cleanup_${action}_intent`) <
        events.indexOf(`repository.cleanup_${action}_acknowledged`),
    );
  }
  assert.equal(events.at(-1), "repository.cleanup_acknowledged");
  assert.equal((await f.resolve()).status, "resolved");
  assert.equal(f.store.repositories.operation(f.op.id).status, "failed");
  assert.ok(f.store.lifecycle.request(f.workspace.id, "pause", "pause").id);
});

test("simulated cleanup duplicates and restart only read receipts; new keys and changed deadlines conflict", async (t) => {
  const f = fixture(t);
  const attempt = await f.cleanup();
  const calls = [...f.calls];
  f.reopen();
  assert.deepEqual(await f.cleanup(), attempt);
  await assert.rejects(f.cleanup("other"), /different inputs/);
  await assert.rejects(f.cleanup("cleanup", 2000), /different inputs/);
  assert.deepEqual(f.calls, calls);
  await f.resolve();
  assert.deepEqual(await f.cleanup(), attempt);
});

for (const [field, value] of Object.entries({
  operationId: "other",
  workspaceId: "other",
  providerId: "other",
  repositoryId: 999,
  installationId: 999,
  simulation: false,
  effectsSettled: false,
  cleanupId: "other",
  cleanupEventCursor: -1,
  cleanupEffectsSettled: false,
  credential: "unknown",
  channel: "unknown",
  checkout: "unknown",
  observedAt: 1,
})) {
  test(`simulated cleanup rejects unconfirmed ${field} before any mutation`, async (t) => {
    const f = fixture(t);
    f.evidence = { [field]: value };
    const attempt = await f.cleanup();
    assert.equal(attempt.status, "needs_attention");
    assert.equal(attempt.reason, "unconfirmed");
    assert.deepEqual(f.calls, ["inspect"]);
    assert.equal(f.vault().recover(f.op.id, "operator"), secret);
  });
}

test("simulated cleanup checks trusted actor, adapter, vault, state and inputs before inspection", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    cleanupRepository(
      f.store.repositories,
      f.inspector,
      f.adapter,
      f.vault(),
      f.op.id,
      "other",
      "cleanup",
    ),
    /not authorized/,
  );
  await assert.rejects(
    cleanupRepository(
      f.store.repositories,
      {
        ...f.inspector,
        simulation: false,
      } as unknown as SimulatedRepositoryRecovery,
      f.adapter,
      f.vault(),
      f.op.id,
      "operator",
      "cleanup",
    ),
    /Only simulated/,
  );
  await assert.rejects(f.cleanup("", 1000), /Idempotency/);
  await assert.rejects(f.cleanup("cleanup", 1), /timeoutMs/);
  const other = new Store(join(f.root, "other.sqlite"));
  try {
    await assert.rejects(
      cleanupRepository(
        f.store.repositories,
        f.inspector,
        f.adapter,
        new RepositoryCredentialVault(
          other.repositories,
          "simulation-key",
          key,
        ),
        f.op.id,
        "operator",
        "cleanup",
      ),
      /does not match/,
    );
  } finally {
    other.close();
  }
  assert.deepEqual(f.calls, []);
  f.state.credential = "absent";
  f.state.channel = "absent";
  f.state.checkout = "absent";
  await f.resolve();
  await assert.rejects(f.cleanup(), /does not need cleanup/);
  assert.deepEqual(f.calls, ["inspect"]);
});

test("simulated unknown mint and wrong custody key cannot trigger cleanup mutations", async (t) => {
  const f = fixture(t, false);
  assert.equal((await f.cleanup()).reason, "credential_unavailable");
  assert.deepEqual(f.calls, ["inspect"]);
  const g = fixture(t);
  const receipt = await cleanupRepository(
    g.store.repositories,
    g.inspector,
    g.adapter,
    new RepositoryCredentialVault(
      g.store.repositories,
      "simulation-key",
      Buffer.alloc(32, 8),
    ),
    g.op.id,
    "operator",
    "cleanup",
  );
  assert.equal(receipt.reason, "credential_unavailable");
  assert.deepEqual(g.calls, ["inspect"]);
});

test("simulated independently absent resources require no custody or mutation", async (t) => {
  const f = fixture(t, false);
  Object.assign(f.state, {
    credential: "absent",
    channel: "absent",
    checkout: "absent",
  });
  assert.equal((await f.cleanup()).status, "acknowledged");
  assert.deepEqual(f.calls, ["inspect"]);
  assert.equal((await f.resolve()).status, "resolved");
});

for (const action of ["inspect", "revoke", "clear", "discard"]) {
  test(`simulated cleanup ${action} failure stays blocked and never repeats`, async (t) => {
    const f = fixture(t);
    f.onCall = async (name) => {
      if (name === action) throw new Error(secret);
    };
    const result = await f.cleanup();
    assert.equal(result.status, "needs_attention");
    assert.equal(
      result.reason,
      action === "inspect" ? "inspection_failed" : "cleanup_failed",
    );
    assert.equal(f.calls.at(-1), action);
    const calls = [...f.calls];
    f.reopen();
    assert.deepEqual(await f.cleanup(), result);
    assert.deepEqual(f.calls, calls);
    assert.equal(
      f.store.repositories.operation(f.op.id).status,
      "needs_attention",
    );
    for (const path of [f.path, `${f.path}-wal`]) {
      const bytes = readFileSync(path);
      assert.equal(bytes.includes(Buffer.from(secret)), false);
      assert.equal(bytes.includes(key), false);
    }
  });
}

test("simulated hung cleanup times out; late mutation acknowledgment cannot erase custody or unlock", async (t) => {
  const f = fixture(t);
  let release!: () => void;
  f.onCall = async (name) => {
    if (name === "revoke")
      await new Promise<void>((r) => {
        release = r;
      });
  };
  const result = await f.cleanup("cleanup", 100);
  assert.equal(result.reason, "timeout");
  assert.equal(result.phase, "revoke_intent");
  assert.equal(f.vault().recover(f.op.id, "operator"), secret);
  release();
  await delay(0);
  assert.deepEqual(f.calls, ["inspect", "revoke"]);
  assert.deepEqual(
    f.store.repositories.recoveryCleanup(f.op.id, "operator"),
    result,
  );
  assert.equal(
    f.store.repositories.operation(f.op.id).status,
    "needs_attention",
  );
  f.state.cleanupEffectsSettled = false;
  assert.equal((await f.resolve()).status, "rejected");
});

test("simulated resolution racing cleanup requires a fresh receipt cursor and settled cleanup effects", async (t) => {
  const f = fixture(t);
  let entered!: () => void;
  const reached = new Promise<void>((r) => {
    entered = r;
  });
  let release!: () => void;
  f.onCall = async (name) => {
    if (name === "revoke") {
      entered();
      await new Promise<void>((r) => {
        release = r;
      });
    }
  };
  const pending = f.cleanup();
  await reached;
  // Even a clean-looking observation cannot resolve an active coordinator.
  f.evidence = {
    credential: "revoked",
    channel: "cleared",
    checkout: "absent",
  };
  assert.equal((await f.resolve("active")).status, "rejected");
  const stale = f.store.repositories.recoveryCleanup(f.op.id, "operator")!;
  release();
  await pending;
  f.evidence = { cleanupEventCursor: stale.eventCursor };
  assert.equal((await f.resolve("old-cursor")).status, "rejected");
  f.evidence = { cleanupEffectsSettled: false };
  assert.equal((await f.resolve("unsettled")).status, "rejected");
  f.evidence = { cleanupId: "other" };
  assert.equal((await f.resolve("wrong-attempt")).status, "rejected");
  f.evidence = {};
  assert.equal((await f.resolve("fresh")).status, "resolved");
});

test("simulated resolution begun before cleanup cannot unlock after cleanup reservation", async (t) => {
  const f = fixture(t);
  const original = f.inspector.inspectRecovery;
  let release!: () => void;
  let entered!: () => void;
  const reached = new Promise<void>((r) => {
    entered = r;
  });
  f.inspector.inspectRecovery = async (op, signal, cleanup) => {
    const evidence = await original(op, signal, cleanup);
    if (!cleanup) {
      entered();
      await new Promise<void>((r) => {
        release = r;
      });
    }
    return evidence;
  };
  Object.assign(f.state, {
    credential: "absent",
    channel: "absent",
    checkout: "absent",
  });
  const resolution = f.resolve();
  await reached;
  await f.cleanup();
  release();
  assert.equal((await resolution).status, "rejected");
  assert.equal((await f.resolve("fresh")).status, "resolved");
});

test("simulated concurrent cleanup calls reserve one dispatcher across connections", async (t) => {
  const f = fixture(t);
  const second = new Store(f.path);
  try {
    const results = await Promise.all([
      f.cleanup(),
      cleanupRepository(
        second.repositories,
        f.inspector,
        f.adapter,
        new RepositoryCredentialVault(
          second.repositories,
          "simulation-key",
          key,
        ),
        f.op.id,
        "operator",
        "cleanup",
      ),
    ]);
    assert.equal(results[0].id, results[1].id);
    assert.deepEqual(f.calls, ["inspect", "revoke", "clear", "discard"]);
  } finally {
    second.close();
  }
});

for (const failureEvent of [
  "repository.cleanup_requested",
  "repository.cleanup_revoke_intent",
  "repository.cleanup_revoke_acknowledged",
  "repository.cleanup_acknowledged",
]) {
  test(`simulated ${failureEvent} event failure rolls back its state and custody write`, async (t) => {
    const f = fixture(t);
    const db = new DatabaseSync(f.path);
    try {
      db.exec(`CREATE TRIGGER fail_cleanup BEFORE INSERT ON repository_events
        WHEN NEW.type = '${failureEvent}' BEGIN SELECT RAISE(ABORT, 'unavailable'); END`);
      if (failureEvent === "repository.cleanup_requested") {
        await assert.rejects(f.cleanup(), /unavailable/);
        assert.equal(
          f.store.repositories.recoveryCleanup(f.op.id, "operator"),
          null,
        );
        assert.deepEqual(f.calls, []);
      } else {
        const result = await f.cleanup();
        assert.equal(result.status, "needs_attention");
        assert.equal(result.reason, "cleanup_failed");
        if (failureEvent !== "repository.cleanup_acknowledged")
          assert.equal(f.vault().recover(f.op.id, "operator"), secret);
        assert.equal(
          f.store.repositories
            .events(f.op.id)
            .some((e) => e.type === failureEvent),
          false,
        );
        if (failureEvent === "repository.cleanup_revoke_intent")
          assert.deepEqual(f.calls, ["inspect"]);
      }
    } finally {
      db.close();
    }
  });
}

test("simulated schema 4 upgrade preserves operations, events and encrypted custody", async (t) => {
  const f = fixture(t);
  const op = f.store.repositories.operation(f.op.id);
  const events = f.store.repositories.events(f.op.id);
  const db = new DatabaseSync(f.path);
  db.exec(
    "DROP TABLE repository_cleanups; UPDATE schema_versions SET version = 4 WHERE component = 'repository'",
  );
  db.close();
  f.reopen();
  assert.deepEqual(f.store.repositories.operation(f.op.id), op);
  assert.deepEqual(f.store.repositories.events(f.op.id), events);
  assert.equal(f.vault().recover(f.op.id, "operator"), secret);
  assert.equal(f.store.repositories.recoveryCleanup(f.op.id, "operator"), null);
  assert.equal((await f.cleanup()).status, "acknowledged");
});

async function child(t: TestContext, path: string, mode: string, op: string) {
  const process = spawn(
    globalThis.process.execPath,
    [
      fileURLToPath(
        new URL("./repository-cleanup-fixture.js", import.meta.url),
      ),
      path,
      mode,
      op,
    ],
    {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      env: { PATH: globalThis.process.env.PATH },
    },
  );
  const stop = () => stopService(process, "SIGKILL");
  t.after(stop);
  const exited = once(process, "exit");
  // Observe startup errors even before the first message wait is installed.
  void exited.catch(() => {});
  async function message(stage: string) {
    if (process.exitCode !== null || process.signalCode !== null)
      throw new Error(`Simulation cleanup child exited before ${stage}`);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        once(process, "message", { signal: controller.signal }),
        exited.then(() => {
          throw new Error(`Simulation cleanup child exited before ${stage}`);
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(`Simulation cleanup child timed out before ${stage}`),
              ),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  try {
    assert.equal((await message("ready"))[0], "ready");
  } catch (error) {
    await stop();
    throw error;
  }
  async function waitForExit() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        exited,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("Simulation cleanup child did not exit")),
            5000,
          );
        }),
      ]);
    } catch (error) {
      await stop();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    process,
    waitForExit,
    stop,
    async go(input: { stallMs?: number } = {}) {
      const next = message("response");
      // Sending can fail synchronously before the response is awaited.
      void next.catch(() => {});
      try {
        process.send(input);
        return await next;
      } catch (error) {
        await stop();
        throw error;
      }
    },
  };
}

test("simulated independent processes reserve cleanup exactly once", async (t) => {
  const f = fixture(t);
  const children: Awaited<ReturnType<typeof child>>[] = [];
  try {
    children.push(await child(t, f.path, "reserve", f.op.id));
    children.push(await child(t, f.path, "reserve", f.op.id));
    const results = await Promise.all(children.map((c) => c.go()));
    assert.equal(results.filter(([r]) => r.created).length, 1);
    await Promise.all(children.map((c) => c.waitForExit()));
    assert.equal(
      f.store.repositories
        .events(f.op.id)
        .filter((e) => e.type === "repository.cleanup_requested").length,
      1,
    );
  } finally {
    await Promise.all(children.map((c) => c.stop()));
  }
});

for (const stallMs of [0, 150]) {
  test(`simulated process death after cleanup dispatch never repeats the effect on restart (${stallMs} ms stall)`, async (t) => {
    const f = fixture(t);
    const worker = await child(t, f.path, "crash", f.op.id);
    try {
      const [message] = await worker.go({ stallMs });
      assert.equal(message.dispatched, "revoke");
      const checkpoint = f.store.repositories.recoveryCleanup(
        f.op.id,
        "operator",
      )!;
      assert.equal(checkpoint.id, message.cleanupId);
      assert.equal(checkpoint.status, "running");
      assert.equal(checkpoint.phase, "revoke_intent");
      assert.equal(checkpoint.deadlineAt, checkpoint.createdAt + 100);
      assert.equal(
        f.store.repositories.events(f.op.id).at(-1)!.type,
        "repository.cleanup_revoke_intent",
      );
      worker.process.kill("SIGKILL");
      await worker.waitForExit();
      t.mock.timers.enable({ apis: ["Date"], now: checkpoint.deadlineAt - 1 });
      f.reopen();
      const before = f.store.repositories.recoveryCleanup(f.op.id, "operator")!;
      assert.deepEqual(before, checkpoint);
      assert.deepEqual(await f.cleanup("cleanup", 100), before);
      assert.deepEqual(f.calls, []);
      assert.equal(f.vault().recover(f.op.id, "operator"), secret);
      Object.assign(f.state, {
        credential: "revoked",
        channel: "cleared",
        checkout: "absent",
        cleanupEffectsSettled: true,
      });
      assert.equal((await f.resolve("active")).status, "rejected");
      t.mock.timers.tick(1);
      const calls = [...f.calls];
      assert.deepEqual(await f.cleanup("cleanup", 100), before);
      assert.deepEqual(f.calls, calls);
      assert.throws(
        () =>
          f.store.repositories.acknowledgeRecoveryCleanup(
            f.op.id,
            before.id,
            "revoke",
          ),
        /ownership lost/,
      );
      assert.equal(f.vault().recover(f.op.id, "operator"), secret);
      f.state.cleanupEffectsSettled = false;
      assert.equal((await f.resolve("unsettled")).status, "rejected");
      f.state.cleanupEffectsSettled = true;
      assert.equal((await f.resolve("settled")).status, "resolved");
      assert.throws(
        () => f.vault().recover(f.op.id, "operator"),
        /unavailable/,
      );
    } finally {
      await worker.stop();
    }
  });
}

test("simulated cleanup child timeout before dispatch rejects its message wait instead of hanging", async (t) => {
  const f = fixture(t);
  const worker = await child(t, f.path, "timeout", f.op.id);
  try {
    await assert.rejects(worker.go({ stallMs: 150 }), /exited before response/);
    await worker.waitForExit();
    const attempt = f.store.repositories.recoveryCleanup(f.op.id, "operator")!;
    assert.equal(attempt.status, "needs_attention");
    assert.equal(attempt.phase, "inspecting");
    assert.equal(attempt.reason, "timeout");
    assert.equal(f.vault().recover(f.op.id, "operator"), secret);
  } finally {
    await worker.stop();
  }
});

test("simulated cleanup rechecks its deadline after acquiring a contended database lock", async (t) => {
  const f = fixture(t);
  f.onCall = async (name) => {
    if (name !== "inspect") return;
    const lock = spawn(
      process.execPath,
      [fileURLToPath(new URL("./lock-fixture.js", import.meta.url))],
      {
        env: { PLATFORM_DATA_DIR: f.root },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    t.after(() => {
      if (lock.exitCode === null) lock.kill("SIGKILL");
    });
    await once(lock.stdout!, "data");
  };
  const result = await f.cleanup("cleanup", 500);
  assert.equal(result.reason, "timeout");
  assert.equal(result.observedAt, null);
  assert.deepEqual(f.calls, ["inspect"]);
  assert.equal(f.vault().recover(f.op.id, "operator"), secret);
});

test("simulated expired cleanup cannot accept a late acknowledgment even after independent resolution", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
  const f = fixture(t);
  let release!: () => void;
  let enteredClear!: () => void;
  const clearing = new Promise<void>((resolve) => {
    enteredClear = resolve;
  });
  f.onCall = async (name) => {
    if (name === "clear")
      await new Promise<void>((r) => {
        release = r;
        enteredClear();
      });
  };
  const running = f.cleanup("cleanup", 100);
  await clearing;
  assert.equal(
    f.store.repositories.recoveryCleanup(f.op.id, "operator")!.phase,
    "clear_intent",
  );
  // Expire only after dispatch, independent of database/runner speed.
  t.mock.timers.tick(100);
  const attempt = await running;
  assert.equal(attempt.reason, "timeout");
  assert.equal(attempt.phase, "clear_intent");
  assert.throws(
    () =>
      f.store.repositories.acknowledgeRecoveryCleanup(
        f.op.id,
        attempt.id,
        "clear",
      ),
    /ownership lost/,
  );
  Object.assign(f.state, {
    credential: "revoked",
    channel: "cleared",
    checkout: "absent",
  });
  assert.equal((await f.resolve()).status, "resolved");
  const events = f.store.repositories.events(f.op.id);
  release();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(f.store.repositories.events(f.op.id), events);
  assert.throws(
    () =>
      f.store.repositories.recoveryCleanupIntent(
        f.op.id,
        attempt.id,
        "discard",
      ),
    /ownership lost/,
  );
});

test("simulated cleanup malformed and future inspection cannot dispatch or persist secrets", async (t) => {
  const f = fixture(t);
  f.inspector.inspectRecovery = async () => ({
    observedAt: Number.MAX_SAFE_INTEGER,
    secret,
  });
  assert.equal((await f.cleanup()).reason, "unconfirmed");
  assert.deepEqual(f.calls, []);
  for (const path of [f.path, `${f.path}-wal`])
    assert.equal(readFileSync(path).includes(Buffer.from(secret)), false);
});

test("simulated cleanup receipt insertion failure rolls back its requested event", async (t) => {
  const f = fixture(t);
  const db = new DatabaseSync(f.path);
  try {
    db.exec(
      "CREATE TRIGGER fail_receipt BEFORE INSERT ON repository_cleanups BEGIN SELECT RAISE(ABORT, 'unavailable'); END",
    );
    const before = f.store.repositories.events(f.op.id);
    await assert.rejects(f.cleanup(), /unavailable/);
    assert.equal(
      f.store.repositories.recoveryCleanup(f.op.id, "operator"),
      null,
    );
    assert.deepEqual(f.store.repositories.events(f.op.id), before);
    assert.deepEqual(f.calls, []);
  } finally {
    db.close();
  }
});

test("simulated cleanup key cannot be reused for a different operation", async (t) => {
  const f = fixture(t);
  const g = fixture(t);
  // Put a second uncertain bootstrap in the same database with the same actor.
  const workspace = f.store.createWorkspace(
    "https://github.com/example/second",
  );
  const create = f.store.lifecycle.request(
    workspace.id,
    "create",
    "second-create",
  );
  const claim = f.store.lifecycle.claim(5000)!;
  f.store.lifecycle.dispatch(claim.id, claim.leaseToken!);
  f.store.lifecycle.complete(claim.id, claim.leaseToken!, {
    state: "ready",
    providerId: "second-provider",
    creationMarker: create.id,
  });
  const second = f.store.repositories.request(
    workspace.id,
    "operator",
    "refs/heads/main",
    "second-bootstrap",
  );
  const owned = f.store.repositories.claim(5000)!;
  f.store.repositories.authorize(second.id, owned.leaseToken!, 303, 404);
  f.store.repositories.settle(second.id, owned.leaseToken!);
  await f.cleanup();
  await assert.rejects(
    cleanupRepository(
      f.store.repositories,
      g.inspector,
      g.adapter,
      f.vault(),
      second.id,
      "operator",
      "cleanup",
    ),
    /another operation/,
  );
  assert.equal(
    f.store.repositories.recoveryCleanup(second.id, "operator"),
    null,
  );
  assert.deepEqual(g.calls, []);
});
