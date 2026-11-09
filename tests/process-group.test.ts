import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { captureProcess } from "../src/process-group.js";
import { UncertainExecutionError } from "../src/domain.js";

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
