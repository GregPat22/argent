import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Store } from "../src/store.js";
import { LocalWorkspace, ScriptedAgent } from "../src/adapters.js";
import { inspectArtifact } from "../src/artifacts.js";
import { Worker } from "../src/worker.js";

test("NUL input is rejected before SQLite can truncate strings and corrupt idempotency", () => {
  const store = new Store(":memory:");
  try {
    const workspace = store.createWorkspace("https://github.com/test/repo");
    assert.throws(() =>
      store.createRun(workspace.id, "Keep this\0 and this", "key"),
    );
    assert.throws(() => store.createRun(workspace.id, "Task", "key\0suffix"));
    assert.equal(store.listRuns(workspace.id).items.length, 0);
  } finally {
    store.close();
  }
});

test("valid escaped task content remains inspectable when its artifact exceeds HTTP input size", async () => {
  const root = mkdtempSync(join(tmpdir(), "argent-large-artifact-"));
  const store = new Store(":memory:");
  try {
    const workspace = store.createWorkspace("https://github.com/test/repo");
    const task = "\u0001".repeat(2719);
    const run = store.createRun(workspace.id, task, "key");
    await new Worker(
      store,
      new LocalWorkspace(root),
      new ScriptedAgent(1),
    ).tick();
    assert.equal(store.getRun(run.id).status, "completed");
    assert.ok(
      statSync(join(root, workspace.id, `${run.id}.json`)).size > 16384,
    );
    assert.equal(
      (inspectArtifact(store, root, run.id).content as { task: string }).task,
      task,
    );
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
