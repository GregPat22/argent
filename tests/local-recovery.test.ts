import { randomUUID } from "node:crypto";
import { Store } from "../src/store.js";
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import {
  readConnection,
  serviceRequest,
  type ServiceConnection,
} from "../src/desktop/service-client.js";
import type { RunView, Workspace } from "../src/domain.js";

function absent(id: number): boolean {
  try {
    process.kill(id, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

async function until(check: () => boolean | Promise<boolean>) {
  const end = Date.now() + 10000;
  while (!(await check())) {
    assert.ok(Date.now() < end, "fixture timed out");
    await delay(25);
  }
}

test(
  "after service death, only the workspace with a confirmed absent agent group can continue",
  { timeout: 25000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "argent-recovery-")));
    const repo = join(root, "repo");
    const data = join(root, "data");
    mkdirSync(repo);
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        [
          "-c",
          "user.name=Test",
          "-c",
          "user.email=test@example.invalid",
          ...args,
        ],
        { cwd: repo, stdio: "pipe" },
      );
    git("init", "--quiet");
    writeFileSync(join(repo, "README"), "fixture");
    git("add", ".");
    git("commit", "-qm", "initial");
    const cli = join(root, "fake-claude");
    const pidFile = join(root, "agent.pid");
    const stopAll = join(root, "stop-all");
    const member = join(root, "member.cjs");
    writeFileSync(
      member,
      `const fs = require("node:fs");
fs.writeFileSync("member-ready", "");
const timer = setInterval(() => {
  if (fs.existsSync("stop-member") || fs.existsSync(${JSON.stringify(stopAll)})) clearInterval(timer);
}, 20);
setTimeout(() => process.exit(0), 30000).unref();`,
    );
    writeFileSync(
      cli,
      `#!${process.execPath}
if (process.argv.includes('--version')) { console.log('2.1.259 (Claude Code)'); process.exit(0); }
const fs = require('node:fs');
process.stdout.on('error', () => {});
let task = '';
process.stdin.on('data', chunk => { task += chunk; });
process.stdin.on('end', () => {
  fs.appendFileSync(${JSON.stringify(pidFile)}, String(process.pid) + "\\n");
  if (task === 'new task') {
    console.log(JSON.stringify({type:'result',subtype:'success',is_error:false,result:'OK'}));
    return;
  }
  if (task === 'wait') require('node:child_process').spawn(process.execPath, [${JSON.stringify(member)}], {stdio:'ignore'}).unref();
  setInterval(() => {
    if (fs.existsSync('stop-leader') || fs.existsSync(${JSON.stringify(stopAll)})) process.exit(0);
    fs.appendFileSync('writes', 'x');
  }, 20);
  setTimeout(() => process.exit(0), 30000).unref();
});
`,
      { mode: 0o755 },
    );
    let service: ChildProcess | undefined;
    let connection: ServiceConnection;
    async function start() {
      service = spawn(
        process.execPath,
        [
          fileURLToPath(
            new URL("../src/desktop/service-main.js", import.meta.url),
          ),
        ],
        {
          env: {
            ...process.env,
            PLATFORM_DATA_DIR: data,
            ARGENT_CLAUDE_PATH: cli,
          },
          stdio: "ignore",
        },
      );
      await until(() => {
        const value = readConnection(data);
        if (!value || value.pid !== service!.pid) return false;
        connection = value;
        return true;
      });
    }
    try {
      await start();
      const workspace = (await serviceRequest(
        connection!,
        "/workspaces",
        "POST",
        { source: "local", path: repo },
      )) as Workspace;
      const run = (await serviceRequest(
        connection!,
        "/runs",
        "POST",
        { workspaceId: workspace.id, task: "wait" },
        "first",
      )) as RunView;
      await until(
        () =>
          existsSync(pidFile) &&
          existsSync(join(workspace.local!.worktreePath, "writes")) &&
          existsSync(join(workspace.local!.worktreePath, "member-ready")),
      );
      const other = (await serviceRequest(connection!, "/workspaces", "POST", {
        source: "local",
        path: repo,
      })) as Workspace;
      const second = (await serviceRequest(
        connection!,
        "/runs",
        "POST",
        { workspaceId: other.id, task: "parallel" },
        "parallel",
      )) as RunView;
      await until(
        () => readFileSync(pidFile, "utf8").trim().split("\n").length === 2,
      );
      assert.equal(
        ((await serviceRequest(connection!, `/runs/${run.id}`)) as RunView)
          .status,
        "running",
      );
      assert.equal(
        ((await serviceRequest(connection!, `/runs/${second.id}`)) as RunView)
          .status,
        "running",
      );
      await assert.rejects(
        serviceRequest(
          connection!,
          "/runs",
          "POST",
          { workspaceId: workspace.id, task: "overlap" },
          "overlap",
        ),
        /active or uncertain/,
      );
      const gone = once(service!, "exit");
      service!.kill("SIGKILL");
      await gone;
      await start();
      await until(
        async () =>
          ((await serviceRequest(connection!, `/runs/${run.id}`)) as RunView)
            .status === "needs_attention",
      );
      process.kill(
        Number(readFileSync(pidFile, "utf8").trim().split("\n")[0]),
        0,
      );
      await assert.rejects(
        serviceRequest(connection!, `/runs/${run.id}/resolve`, "POST", {
          note: "Inspected files",
        }),
        /process reconciliation/,
      );
      await assert.rejects(
        serviceRequest(
          connection!,
          "/runs",
          "POST",
          { workspaceId: workspace.id, task: "replacement" },
          "second",
        ),
        /uncertain work/,
      );
      assert.equal(
        ((await serviceRequest(connection!, `/runs/${run.id}`)) as RunView)
          .status,
        "needs_attention",
      );
      const reconcile = (body = {}) =>
        serviceRequest(
          connection!,
          `/runs/${run.id}/reconcile-agent`,
          "POST",
          body,
        );
      await assert.rejects(reconcile({ pgid: 2 }), /only the run ID/);
      await assert.rejects(reconcile(), /group still exists/);
      const leader = Number(readFileSync(pidFile, "utf8").split("\n")[0]);
      writeFileSync(join(workspace.local!.worktreePath, "stop-leader"), "");
      await until(() => absent(leader));
      await assert.rejects(reconcile(), /group still exists/);
      writeFileSync(join(workspace.local!.worktreePath, "stop-member"), "");
      await until(() => absent(-leader));
      assert.equal(((await reconcile()) as RunView).status, "failed");
      await assert.rejects(reconcile(), /Only an interrupted local agent/);
      const history = (await serviceRequest(
        connection!,
        `/runs/${run.id}/events`,
      )) as { events: { type: string; data: Record<string, unknown> }[] };
      assert.deepEqual(
        history.events.slice(-2).map((e) => e.type),
        ["run.resolved", "run.failed"],
      );
      assert.equal(history.events.at(-2)?.data.replayed, false);
      assert.equal(readFileSync(pidFile, "utf8").trim().split("\n").length, 2);
      // Each worker renews its own lease; the second lease can expire later.
      await until(
        async () =>
          ((await serviceRequest(connection!, `/runs/${second.id}`)) as RunView)
            .status === "needs_attention",
      );
      await assert.rejects(
        serviceRequest(
          connection!,
          `/runs/${second.id}/reconcile-agent`,
          "POST",
          {},
        ),
        /group still exists/,
      );
      const fresh = (await serviceRequest(
        connection!,
        "/runs",
        "POST",
        { workspaceId: workspace.id, task: "new task" },
        "new-task",
      )) as RunView;
      await until(
        async () =>
          ((await serviceRequest(connection!, `/runs/${fresh.id}`)) as RunView)
            .status === "completed",
      );
    } finally {
      writeFileSync(stopAll, "");
      if (service && service.exitCode === null && service.signalCode === null) {
        const gone = once(service, "exit");
        service.kill("SIGTERM");
        await gone;
      }
      if (existsSync(pidFile)) {
        const groups = readFileSync(pidFile, "utf8")
          .trim()
          .split("\n")
          .map(Number);
        await until(() => groups.every((pid) => absent(-pid)));
      }
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test("launch evidence is lease-bound and every ambiguous recovery probe keeps ownership blocked", async (t) => {
  const store = new Store(":memory:");
  t.after(() => store.close());
  const workspace = store.createLocalWorkspace(
    randomUUID(),
    {
      repositoryPath: "/repo",
      worktreePath: "/worktree",
      branch: "argent/fixture",
      baseSha: "a".repeat(40),
    },
    randomUUID(),
  );
  const run = store.createRun(workspace.id, "Task", "task-key");
  const lease = store.claim(60_000)!;
  const owner = { instanceId: "original", bootScope: "boot" };
  const next = { ...owner, instanceId: "next" };
  assert.throws(
    () => store.recordAgentGroup(run.id, "wrong", owner, 42),
    /lease lost/i,
  );
  store.recordAgentGroup(run.id, lease.leaseToken!, owner, 42);
  assert.throws(
    () => store.recordAgentGroup(run.id, lease.leaseToken!, owner, 43),
    /UNIQUE/,
  );
  store.reconcile(lease.leaseExpiresAt!);
  const before = store.events(run.id);
  let calls = 0;
  let code = "EPERM";
  t.mock.method(process, "kill", (pid: number, signal: number) => {
    assert.equal(pid, -42);
    assert.equal(signal, 0);
    calls++;
    throw Object.assign(new Error(), { code });
  });
  assert.throws(
    () => store.reconcileAgentGroup(run.id, owner),
    /original service/,
  );
  assert.throws(
    () => store.reconcileAgentGroup(run.id, { ...next, bootScope: "other" }),
    /No matching/,
  );
  assert.equal(calls, 0);
  for (code of ["EPERM", "EINVAL"]) {
    assert.throws(
      () => store.reconcileAgentGroup(run.id, next),
      /could not inspect/,
    );
  }
  assert.deepEqual(store.events(run.id), before);
  assert.equal(store.getRun(run.id).status, "needs_attention");
  code = "ESRCH";
  assert.equal(store.reconcileAgentGroup(run.id, next).status, "failed");
  assert.equal(calls, 3);
});
