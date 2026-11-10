import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { captureProcess, launchProcess } from "../src/process-group.js";
import { UncertainExecutionError } from "../src/domain.js";

for (const transientSignal of [0, "SIGTERM"] as const) {
  test(`transient EPERM for group ${transientSignal} requires a fresh successful probe or signal`, async (t) => {
    const original = process.kill.bind(process);
    const execution = launchProcess(
      process.execPath,
      ["-e", "console.log('ready'); setInterval(() => {}, 1000)"],
      { env: {} },
    );
    execution.child.stdin.end();
    execution.child.stderr.resume();
    t.after(async () => {
      t.mock.restoreAll();
      try {
        original(-execution.child.pid!, "SIGKILL");
      } catch {
        /* fixture already stopped */
      }
      await execution.dispose().catch(() => {});
    });
    await once(execution.child.stdout, "data");
    let denied = false;
    let retried = false;
    t.mock.method(
      process,
      "kill",
      (pid: number, signal?: NodeJS.Signals | number) => {
        if (pid === -execution.child.pid! && signal === transientSignal) {
          if (!denied) {
            denied = true;
            throw Object.assign(new Error("group exiting"), { code: "EPERM" });
          }
          retried = true;
        }
        return original(pid, signal);
      },
    );
    await execution.dispose();
    assert.equal(denied, true);
    assert.equal(retried, true, "EPERM alone is never proof of termination");
    assert.equal(execution.child.signalCode, "SIGTERM");
  });
}

test("an exiting group can report EPERM before a fresh probe confirms ESRCH", async (t) => {
  const execution = launchProcess(process.execPath, ["-e", ""], { env: {} });
  execution.child.stdin.end();
  execution.child.stdout.resume();
  execution.child.stderr.resume();
  await execution.exited;
  const original = process.kill.bind(process);
  let probes = 0;
  t.mock.method(
    process,
    "kill",
    (pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === -execution.child.pid! && signal === 0) {
        probes++;
        if (probes === 1)
          throw Object.assign(new Error("group exiting"), { code: "EPERM" });
        throw Object.assign(new Error("group gone"), { code: "ESRCH" });
      }
      return original(pid, signal);
    },
  );
  await execution.dispose();
  assert.equal(probes, 2);
});

test("failed liveness inspection returns uncertainty instead of hanging after abort", async (t) => {
  const shutdown = new AbortController();
  const original = process.kill.bind(process);
  const groups = new Set<number>();
  const mocked = t.mock.method(
    process,
    "kill",
    (pid: number, signal?: NodeJS.Signals | number) => {
      if (pid < 0) groups.add(pid);
      if (pid < 0 && signal === 0)
        throw Object.assign(new Error("inspection failed"), { code: "EPERM" });
      return original(pid, signal);
    },
  );
  const run = captureProcess(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    { env: {} },
    { signal: shutdown.signal },
  );
  try {
    await delay(100);
    shutdown.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await assert.rejects(
        Promise.race([
          run,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error("cleanup hung")), 3000);
          }),
        ]),
        UncertainExecutionError,
      );
    } finally {
      clearTimeout(timer);
    }
  } finally {
    mocked.mock.restore();
    for (const pid of groups) {
      try {
        original(pid, "SIGKILL");
      } catch {
        /* fixture stopped */
      }
    }
  }
});
