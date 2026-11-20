import assert from "node:assert/strict";
import childProcess, { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type Mock, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { DesktopClient } from "../src/desktop/bridge.js";
import { buildIdentity, treeIdentity } from "../src/desktop/build-identity.js";
import {
  ensureService,
  isServiceAlive,
  OTHER_BUILD_MESSAGE,
  probeService,
  serviceRequest,
  type ServiceConnection,
} from "../src/desktop/service-client.js";
import { DomainError } from "../src/domain.js";

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
      new Response(
        JSON.stringify({
          instanceId: connection.instanceId,
          build: buildIdentity(),
        }),
      ),
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
      // Replace the fixture's mock rather than stacking a second one: stacked
      // method mocks restore to the first mock and leak it into later tests.
      (globalThis.fetch as Mock<typeof fetch>).mock.mockImplementation(
        async () => {
          probes++;
          return new Response(
            JSON.stringify({
              instanceId: "00000000-0000-4000-8000-000000000001",
              build: buildIdentity(),
            }),
            { status: probes === 1 ? 200 : 503 },
          );
        },
      );
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

test("build identity covers every compiled module's path and bytes, and nothing else", () => {
  const directory = mkdtempSync(join(tmpdir(), "argent-build-identity-"));
  try {
    mkdirSync(join(directory, "desktop"));
    writeFileSync(join(directory, "a.js"), "export const a = 1;");
    writeFileSync(join(directory, "desktop", "b.cjs"), "module.exports = 2;");
    const first = treeIdentity(directory);
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(treeIdentity(directory), first);
    writeFileSync(join(directory, "a.js.map"), "{}");
    writeFileSync(join(directory, "notes.txt"), "not code");
    assert.equal(treeIdentity(directory), first, "only modules count");
    writeFileSync(join(directory, "a.js"), "export const a = 2;");
    const changed = treeIdentity(directory);
    assert.notEqual(changed, first);
    renameSync(join(directory, "a.js"), join(directory, "c.js"));
    assert.notEqual(treeIdentity(directory), changed, "paths count");
    writeFileSync(join(directory, "c.js"), "export const a = 1;");
    renameSync(join(directory, "c.js"), join(directory, "a.js"));
    assert.equal(treeIdentity(directory), first);
    writeFileSync(join(directory, "desktop", "d.js"), "");
    assert.notEqual(treeIdentity(directory), first, "added modules count");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function otherBuildFixture(
  t: TestContext,
  run: (fixture: {
    directory: string;
    routes: string[];
    setBuild: (build: string | undefined) => void;
    connection: ServiceConnection;
  }) => Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "argent-other-build-"));
  const token = "b".repeat(64);
  const instanceId = randomUUID();
  let build: string | undefined = "0".repeat(64);
  const routes: string[] = [];
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    const route = request.url ?? "";
    response.setHeader("Content-Type", "application/json");
    if (route === "/health") {
      response.end(
        JSON.stringify({
          status: "ok",
          instanceId,
          ...(build === undefined ? {} : { build }),
        }),
      );
      return;
    }
    routes.push(`${request.method} ${route}`);
    response.end(
      JSON.stringify(
        route === "/service/stop"
          ? { stopping: true }
          : { items: [], nextCursor: null },
      ),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const connection: ServiceConnection = {
    version: 1,
    port: address.port,
    token,
    instanceId,
    pid: process.pid,
  };
  writeFileSync(join(directory, "service.json"), JSON.stringify(connection));
  let launches = 0;
  const restore = replaceSpawn((() => {
    launches++;
    throw new Error("a service of another build must not cause a launch");
  }) as typeof childProcess.spawn);
  try {
    await run({
      directory,
      routes,
      setBuild: (value) => {
        build = value;
      },
      connection,
    });
    assert.equal(launches, 0);
  } finally {
    restore();
    t.mock.restoreAll();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
}

test("a live service of another build is reported as such and never replaced by a launch", async (t) => {
  await otherBuildFixture(t, async ({ directory, setBuild, connection }) => {
    for (const build of ["0".repeat(64), undefined]) {
      setBuild(build);
      assert.equal(await probeService(connection), "other-build");
      assert.equal(await isServiceAlive(connection), false);
      await assert.rejects(ensureService(directory), (error: unknown) => {
        assert.ok(error instanceof DomainError);
        assert.equal(error.status, 409);
        assert.equal(error.message, OTHER_BUILD_MESSAGE);
        return true;
      });
    }
    assert.equal(
      await probeService({ ...connection, instanceId: randomUUID() }),
      "absent",
      "an unproven instance is not reported as another build",
    );
    setBuild(buildIdentity());
    assert.equal(await probeService(connection), "current");
    assert.deepEqual(await ensureService(directory), connection);
  });
});

test("the desktop bridge only stops a service of another build", async (t) => {
  await otherBuildFixture(t, async ({ directory, routes, setBuild }) => {
    const client = new DesktopClient(directory);
    for (const method of ["status", "startService"])
      assert.deepEqual(await client.call(method, []), {
        ok: true,
        value: { connected: false, otherBuild: true, engine: "local" },
      });
    const refused = await client.call("listWorkspaces", []);
    assert.equal(refused.ok, false);
    assert.match(refused.ok ? "" : refused.error, /different Argent build/);
    assert.deepEqual(routes, [], "no route of the other build is used");
    assert.equal((await client.call("stopService", [])).ok, true);
    assert.deepEqual(routes, ["POST /service/stop"]);
    setBuild(buildIdentity());
    assert.deepEqual(await client.call("status", []), {
      ok: true,
      value: { connected: true, otherBuild: false, engine: "local" },
    });
    assert.equal((await client.call("listWorkspaces", [])).ok, true);
    assert.deepEqual(routes.at(-1), "GET /workspaces");
  });
});
