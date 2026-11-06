import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Store } from "../src/store.js";

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "platform-store-"));
  const store = new Store(join(directory, "db.sqlite"));
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const workspace = store.createWorkspace(
    "https://github.com/example/project",
    1000,
  );
  return { store, workspace, directory };
}

test("submission is idempotent and payload changes conflict", (t) => {
  const { store, workspace } = fixture(t);
  const first = store.createRun(workspace.id, "Task", "key", 1000, 1000);
  assert.deepEqual(store.createRun(workspace.id, "Task", "key", 1000), first);
  assert.throws(
    () => store.createRun(workspace.id, "Changed", "key", 1000),
    /different payload/,
  );
  assert.throws(
    () => store.createRun(workspace.id, "Task", "other"),
    /active or uncertain/,
  );
  assert.equal(store.events(first.id).length, 1);
});

test("atomic claim and fenced lease prevent stale completion and replay", (t) => {
  const { store, workspace, directory } = fixture(t);
  const run = store.createRun(workspace.id, "Task", "key", 1000, 1000);
  const secondConnection = new Store(join(directory, "db.sqlite"));
  t.after(() => secondConnection.close());
  const claim = store.claim(100, 1000)!;
  assert.equal(secondConnection.claim(100, 1000), null);
  assert.throws(
    () => store.appendLog(run.id, "wrong", "invalid", 1001),
    /lease lost/,
  );
  assert.throws(
    () => store.heartbeat(run.id, claim.leaseToken!, 100, 1100),
    /lease lost/,
  );
  assert.equal(secondConnection.reconcile(1100), 1);
  assert.equal(store.getRun(run.id).status, "needs_attention");
  assert.equal(store.claim(100, 1101), null);
  assert.throws(
    () =>
      store.finish(run.id, claim.leaseToken!, "failed", {}, undefined, 1101),
    /lease lost/,
  );
  assert.throws(
    () => store.createRun(workspace.id, "Another task", "other"),
    /uncertain/,
  );
  assert.throws(
    () => store.setWorkspaceState(workspace.id, "stopped"),
    /uncertain/,
  );
  assert.equal(store.events(run.id).at(-1)?.data.replayed, false);
});

test("heartbeat extends only an existing live lease", (t) => {
  const { store, workspace } = fixture(t);
  store.createRun(workspace.id, "Task", "key", 1000, 1000);
  const run = store.claim(100, 1000)!;
  assert.equal(
    store.heartbeat(run.id, run.leaseToken!, 100, 1090).leaseExpiresAt,
    1190,
  );
  assert.equal(store.reconcile(1100), 0);
  assert.equal(store.reconcile(1190), 1);
});

test("cursor pagination survives reopening the database", (t) => {
  const { store, workspace, directory } = fixture(t);
  const run = store.createRun(workspace.id, "Task", "key", 1000, 1000);
  const claimed = store.claim(100, 1000)!;
  store.appendLog(run.id, claimed.leaseToken!, "safe log", 1001);
  const first = store.events(run.id, 0, 1);
  const connection = new Store(join(directory, "db.sqlite"));
  t.after(() => connection.close());
  const rest = connection.events(run.id, first[0]!.cursor);
  assert.equal(rest.length, 2);
  assert.ok(rest.every((event) => event.cursor > first[0]!.cursor));
  assert.equal(
    connection.getWorkspace(workspace.id).repository,
    workspace.repository,
  );
});

test("queued cancellation prevents dispatch and active cancellation requires acknowledgement", (t) => {
  const { store, workspace } = fixture(t);
  const run = store.createRun(workspace.id, "Task", "key", 1000, 1000);
  assert.equal(store.cancel(run.id, 1000).status, "cancelled");
  assert.equal(store.claim(100, 1000), null);
  const other = store.createRun(workspace.id, "Task", "other", 1000, 1000);
  store.claim(100, 1000);
  assert.equal(store.cancel(other.id, 1001).status, "cancelling");
  store.reconcile(1100);
  assert.equal(store.getRun(other.id).status, "needs_attention");
});

test("completion requires independent evidence and a live deadline", (t) => {
  const { store, workspace } = fixture(t);
  const run = store.createRun(workspace.id, "Task", "key", 100, 1000);
  const claim = store.claim(1000, 1000)!;
  assert.throws(
    () =>
      store.finish(run.id, claim.leaseToken!, "completed", {}, undefined, 1001),
    /evidence/,
  );
  assert.throws(
    () =>
      store.finish(
        run.id,
        claim.leaseToken!,
        "completed",
        {},
        {
          kind: "simulation-artifact-check",
          passed: true,
          artifact: "fixture.json",
          sha256: "a".repeat(64),
          simulation: true,
        },
        1100,
      ),
    /evidence/,
  );
  assert.equal(
    store
      .events(run.id)
      .some((event) => event.type === "verification.recorded"),
    false,
  );
});

test("stop/start retains identity and blocks dispatch while stopped", (t) => {
  const { store, workspace } = fixture(t);
  assert.equal(
    store.setWorkspaceState(workspace.id, "stopped").state,
    "stopped",
  );
  assert.throws(() => store.createRun(workspace.id, "Task", "key"), /stopped/);
  assert.equal(
    store.setWorkspaceState(workspace.id, "running").id,
    workspace.id,
  );
});

test("validation rejects credential URLs, invalid limits and path inputs", (t) => {
  const { store, workspace } = fixture(t);
  for (const url of [
    "https://token@github.com/org/repo",
    "file:///etc/passwd",
    "https://github.com/../repo",
  ]) {
    assert.throws(() => store.createWorkspace(url));
  }
  assert.throws(() => store.createRun(workspace.id, "", "key"));
  assert.throws(() => store.createRun(workspace.id, "Task", "key", Infinity));
  const run = store.createRun(workspace.id, "Task", "key");
  assert.throws(() => store.events(run.id, -1));
  assert.throws(() => store.events(run.id, 0, 101));
});
