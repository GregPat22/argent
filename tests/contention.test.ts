import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { stopService } from "../scripts/harness.js";
import { Store } from "../src/store.js";

for (const operation of ["completion", "heartbeat", "log append"]) {
  test(`${operation} rechecks lease after waiting for another process's lock`, async () => {
    const root = mkdtempSync(join(tmpdir(), "platform-contention-"));
    const store = new Store(join(root, "platform.sqlite"));
    const workspace = store.createWorkspace(
      "https://github.com/example/project",
    );
    store.createRun(workspace.id, "Task", "key", 500);
    const run = store.claim(500)!;
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("./lock-fixture.js", import.meta.url))],
      {
        env: { ...process.env, PLATFORM_DATA_DIR: root },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    try {
      const ready = Promise.race([
        once(child.stdout!, "data"),
        once(child, "exit").then(() => {
          throw new Error("Lock fixture exited before acquiring lock");
        }),
      ]);
      await ready;
      assert.ok(
        Date.now() < run.leaseExpiresAt!,
        "Fixture must acquire lock before the lease expires",
      );
      const attempt = () => {
        if (operation === "heartbeat")
          store.heartbeat(run.id, run.leaseToken!, 1000);
        else if (operation === "log append")
          store.appendLog(run.id, run.leaseToken!, "Late log");
        else
          store.finish(
            run.id,
            run.leaseToken!,
            "completed",
            {},
            {
              kind: "simulation-artifact-check",
              passed: true,
              artifact: "fixture.json",
              sha256: "a".repeat(64),
              simulation: true,
            },
          );
      };
      assert.throws(attempt, /lease lost/);
      assert.equal(store.reconcile(), 1);
      assert.equal(store.getRun(run.id).status, "needs_attention");
      assert.equal(
        store
          .events(run.id)
          .some((event) => event.type === "verification.recorded"),
        false,
      );
    } finally {
      await stopService(child);
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}
