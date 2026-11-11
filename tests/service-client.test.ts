import assert from "node:assert/strict";
import childProcess, { ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  ensureService,
  isServiceAlive,
  serviceRequest,
  type ServiceConnection,
} from "../src/desktop/service-client.js";

const script = fileURLToPath(
  new URL("../src/desktop/service-main.js", import.meta.url),
);
const originalSpawn = childProcess.spawn;

type Owned = { child: ChildProcess; exited: boolean; exit: Promise<void> };
function observe(child: ChildProcess): Owned {
  const owned: Owned = { child, exited: false, exit: Promise.resolve() };
  owned.exit = new Promise<void>((resolve) => {
    child.once("exit", () => {
      owned.exited = true;
      resolve();
    });
    child.on("error", () => {
      if (child.pid === undefined) {
        owned.exited = true;
        resolve();
      }
    });
  });
  return owned;
}
async function boundedExit(owned: Owned, milliseconds = 3000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      owned.exit,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("owned service did not exit")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function replaceSpawn(replacement: typeof childProcess.spawn): () => void {
  childProcess.spawn = replacement;
  syncBuiltinESMExports();
  return () => {
    childProcess.spawn = originalSpawn;
    syncBuiltinESMExports();
  };
}
async function realFixture(delayed: boolean): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "argent-startup-"));
  const owned: Owned[] = [];
  const restore = replaceSpawn(((command, args, options) => {
    assert.equal(options?.env?.PLATFORM_DATA_DIR, directory);
    const child =
      delayed && owned.length === 1
        ? originalSpawn(
            command,
            [
              "-e",
              "process.on('message', async () => { await import(process.argv[1]); }); process.send('waiting');",
              script,
            ],
            { ...options, stdio: ["ignore", "ignore", "ignore", "ipc"] },
          )
        : originalSpawn(command, args ?? [], options);
    owned.push(observe(child));
    return child;
  }) as typeof childProcess.spawn);
  const pending: Promise<ServiceConnection>[] = [];
  try {
    pending.push(ensureService(directory), ensureService(directory));
    for (const promise of pending) void promise.catch(() => {});
    const [first, second] = await Promise.all(pending);
    assert.equal(first!.instanceId, second!.instanceId);
    assert.equal(owned.length, 2);
    const winner = owned.find(({ child }) => child.pid === first!.pid)!;
    const loser = owned.find((entry) => entry !== winner)!;
    assert.equal(
      loser.exited,
      true,
      "startup must reap its unselected child before returning",
    );
    assert.equal(
      winner.exited,
      false,
      "selected daemon must survive launcher cleanup",
    );
    assert.equal(await isServiceAlive(first!), true);
    await serviceRequest(first!, "/service/stop", "POST", {});
    await boundedExit(winner);
    assert.equal(
      owned.every((entry) => entry.exited),
      true,
    );
    assert.equal(existsSync(join(directory, "service.json")), false);
  } finally {
    restore();
    for (const entry of owned) if (!entry.exited) entry.child.kill("SIGKILL");
    await Promise.all(owned.map((entry) => boundedExit(entry)));
    await Promise.allSettled(pending);
    rmSync(directory, { recursive: true, force: true });
  }
}

test("concurrent service startup reaps the losing launch before returning", async () => {
  await realFixture(false);
});
test("a delayed contender cannot start after the selected service stops", async () => {
  await realFixture(true);
});
test("an occupied ownership lock prevents a contender from publishing", async () => {
  const directory = mkdtempSync(join(tmpdir(), "argent-startup-lock-"));
  const lock = new DatabaseSync(join(directory, "service-owner.sqlite"));
  lock.exec("BEGIN EXCLUSIVE");
  const owned = observe(
    originalSpawn(process.execPath, [script], {
      stdio: "ignore",
      env: { PATH: process.env.PATH, PLATFORM_DATA_DIR: directory },
    }),
  );
  try {
    await boundedExit(owned);
    assert.notEqual(owned.child.exitCode, 0);
    assert.equal(existsSync(join(directory, "service.json")), false);
  } finally {
    lock.exec("ROLLBACK");
    lock.close();
    if (!owned.exited) owned.child.kill("SIGKILL");
    await boundedExit(owned);
    rmSync(directory, { recursive: true, force: true });
  }
});

async function fakeFixture(
  t: TestContext,
  run: (
    directory: string,
    child: ChildProcess,
    signals: NodeJS.Signals[],
    publish: () => void,
  ) => Promise<void>,
  options: {
    exitOn?: NodeJS.Signals | null;
    spawnError?: boolean;
    publish?: boolean;
  } = {},
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "argent-startup-unit-"));
  const child = new ChildProcess();
  if (!options.spawnError) Object.defineProperty(child, "pid", { value: 100 });
  const signals: NodeJS.Signals[] = [];
  let unrefs = 0;
  child.kill = ((signal: NodeJS.Signals) => {
    signals.push(signal);
    if (signal === (options.exitOn === undefined ? "SIGTERM" : options.exitOn))
      queueMicrotask(() => child.emit("exit", null, signal));
    return true;
  }) as typeof child.kill;
  child.unref = () => {
    unrefs++;
  };
  const connection: ServiceConnection = {
    version: 1,
    pid: 200,
    port: 12345,
    token: "a".repeat(64),
    instanceId: "00000000-0000-4000-8000-000000000001",
  };
  const publish = () =>
    writeFileSync(join(directory, "service.json"), JSON.stringify(connection));
  const restore = replaceSpawn((() => {
    if (options.publish) publish();
    if (options.spawnError)
      queueMicrotask(() => child.emit("error", new Error("launch failed")));
    return child;
  }) as typeof childProcess.spawn);
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ instanceId: connection.instanceId })),
  );
  try {
    await run(directory, child, signals, publish);
    assert.equal(unrefs, 0, "unselected launch must never transfer ownership");
  } finally {
    restore();
    t.mock.restoreAll();
    rmSync(directory, { recursive: true, force: true });
  }
}

test("returning another owner waits for the actual contender exit and preserves that owner", async (t) => {
  await fakeFixture(
    t,
    async (directory, child, signals) => {
      let finished = false;
      const pending = ensureService(directory).then((value) => {
        finished = true;
        return value;
      });
      await delay(30);
      assert.deepEqual(signals, ["SIGTERM"]);
      assert.equal(finished, false);
      child.emit("exit", 0, null);
      const connection = await pending;
      assert.equal(connection.pid, 200);
      assert.deepEqual(signals, ["SIGTERM"]);
    },
    { publish: true, exitOn: null },
  );
});

test("startup timeout escalates cleanup of only the spawned handle", async (t) => {
  await fakeFixture(
    t,
    async (directory, _child, signals) => {
      let now = 0;
      t.mock.method(Date, "now", () => (now += 13000));
      await assert.rejects(ensureService(directory), /did not start/);
      assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
    },
    { exitOn: "SIGKILL" },
  );
});
test("unconfirmed contender cleanup fails explicitly instead of returning a healthy owner", async (t) => {
  await fakeFixture(
    t,
    async (directory, _child, signals) => {
      await assert.rejects(
        ensureService(directory),
        /cleanup could not be confirmed/,
      );
      assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
    },
    { publish: true, exitOn: null },
  );
});
test("spawn errors are observed without signaling a PID from a connection record", async (t) => {
  await fakeFixture(
    t,
    async (directory, _child, signals) => {
      await assert.rejects(ensureService(directory), /Could not launch/);
      assert.deepEqual(signals, []);
    },
    { spawnError: true },
  );
});
test("an early connection-read failure still reaps the launched process", async (t) => {
  await fakeFixture(t, async (directory, child, signals, publish) => {
    // Read succeeds before launch; the launch callback then publishes a record.
    // An operational read error on the next pass exercises the outer finally.
    const restore = replaceSpawn((() => {
      publish();
      t.mock.method(JSON, "parse", () => {
        throw new Error("read failed");
      });
      return child;
    }) as typeof childProcess.spawn);
    try {
      await assert.rejects(ensureService(directory), /read failed/);
      assert.deepEqual(signals, ["SIGTERM"]);
    } finally {
      restore();
    }
  });
});

test("a disappearing selected owner fails after contender cleanup without another launch", async (t) => {
  await fakeFixture(
    t,
    async (directory, _child, signals) => {
      let probes = 0;
      t.mock.method(globalThis, "fetch", async () => {
        probes++;
        return new Response(
          JSON.stringify({
            instanceId: "00000000-0000-4000-8000-000000000001",
          }),
          { status: probes === 1 ? 200 : 503 },
        );
      });
      await assert.rejects(ensureService(directory), /stopped during startup/);
      assert.equal(probes, 2);
      assert.deepEqual(signals, ["SIGTERM"]);
    },
    { publish: true },
  );
});

test("a signaling error with a spawned PID does not prove contender exit", async (t) => {
  await fakeFixture(
    t,
    async (directory, child, signals) => {
      let finished = false;
      const pending = ensureService(directory).then((value) => {
        finished = true;
        return value;
      });
      await delay(30);
      child.emit("error", new Error("signal failed"));
      await delay(30);
      assert.equal(finished, false);
      assert.deepEqual(signals, ["SIGTERM"]);
      child.emit("exit", null, "SIGTERM");
      await pending;
    },
    { publish: true, exitOn: null },
  );
});
