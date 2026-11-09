import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inspectArtifact } from "../src/artifacts.js";
import { LocalWorkspace, ScriptedAgent } from "../src/adapters.js";
import type { RunView, Workspace, WorktreeEvidence } from "../src/domain.js";
import { Store } from "../src/store.js";
import { Worker } from "../src/worker.js";
import {
  APP_URL,
  DesktopClient,
  trustedSender,
} from "../src/desktop/bridge.js";
import {
  ensureService,
  isServiceAlive,
  readConnection,
  serviceRequest,
} from "../src/desktop/service-client.js";

test("workspace and task history paginate without losing equal-timestamp records", () => {
  const store = new Store(":memory:");
  try {
    const expected = Array.from({ length: 5 }, () =>
      store.createWorkspace("https://github.com/test/repo", 1000),
    );
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = store.listWorkspaces(2, cursor);
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.equal(new Set(ids).size, 5);
    assert.deepEqual([...ids].sort(), expected.map((item) => item.id).sort());
    const workspace = expected[0]!;
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const run = store.createRun(workspace.id, "Task", `key${i}`, 1000, 1000);
      runs.push(run);
      store.cancel(run.id);
    }
    const first = store.listRuns(workspace.id, 2);
    const second = store.listRuns(workspace.id, 2, first.nextCursor!);
    const third = store.listRuns(workspace.id, 2, second.nextCursor!);
    const listed = [...first.items, ...second.items, ...third.items];
    assert.deepEqual(
      listed.map((item) => item.id).sort(),
      runs.map((item) => item.id).sort(),
    );
    assert.equal(third.nextCursor, null);
    const foreign = store.createRun(expected[1]!.id, "Other", "foreign");
    assert.throws(
      () => store.listRuns(workspace.id, 2, foreign.id),
      /another workspace/,
    );
    assert.throws(() => store.listWorkspaces(101));
  } finally {
    store.close();
  }
});

test("reviewing an uncertain simulation records abandonment and allows new work without replay", () => {
  const store = new Store(":memory:");
  try {
    const workspace = store.createWorkspace("https://github.com/test/repo");
    const run = store.createRun(workspace.id, "Task", "key", 1000, 1000);
    store.claim(100, 1000);
    assert.throws(
      () => store.resolveSimulation(run.id, "Reviewed"),
      /uncertain/,
    );
    store.reconcile(1100);
    assert.throws(() => store.resolveSimulation(run.id, ""));
    assert.equal(
      store.resolveSimulation(
        run.id,
        "Inspected the simulation; abandon this attempt.",
      ).status,
      "failed",
    );
    assert.equal(store.events(run.id).at(-2)?.data.replayed, false);
    assert.equal(store.claim(100), null);
    assert.ok(store.createRun(workspace.id, "New attempt", "other"));
  } finally {
    store.close();
  }
});

test("an uncertain real run stays blocked until process reconciliation exists", () => {
  const store = new Store(":memory:");
  try {
    const workspace = store.createLocalWorkspace(
      "00000000-0000-4000-8000-000000000001",
      {
        repositoryPath: "/repo",
        branch: "argent/00000000",
        baseSha: "0".repeat(40),
        worktreePath: "/data/worktrees/00000000-0000-4000-8000-000000000001",
      },
      "00000000-0000-4000-8000-000000000002",
      1000,
    );
    const run = store.createRun(workspace.id, "Task", "key", 1000, 1000);
    store.claim(100, 1000);
    store.reconcile(1100);
    const events = store.events(run.id);
    assert.throws(
      () => store.resolveSimulation(run.id, "Inspected files"),
      /process reconciliation/,
    );
    assert.equal(store.getRun(run.id).status, "needs_attention");
    assert.deepEqual(store.events(run.id), events);
    assert.throws(
      () => store.createRun(workspace.id, "Replacement", "new"),
      /uncertain work/,
    );
  } finally {
    store.close();
  }
});

test("artifact inspection checks retained bytes against committed evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "argent-artifact-"));
  const store = new Store(":memory:");
  try {
    const workspace = store.createWorkspace("https://github.com/test/repo");
    const run = store.createRun(workspace.id, "Task", "key");
    const worker = new Worker(
      store,
      new LocalWorkspace(root),
      new ScriptedAgent(1),
    );
    await worker.tick();
    const inspected = inspectArtifact(store, root, run.id);
    assert.equal((inspected.content as { task: string }).task, "Task");
    writeFileSync(
      join(root, workspace.id, `${run.id}.json`),
      '{"tampered":true}',
    );
    assert.throws(
      () => inspectArtifact(store, root, run.id),
      /changed after verification/,
    );
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("only the exact packaged main frame is trusted by the desktop bridge", () => {
  assert.equal(trustedSender(APP_URL, true), true);
  for (const url of [
    "file:///tmp/index.html",
    "https://app/index.html",
    `${APP_URL}?x=1`,
    `${APP_URL}#x`,
    "argent://evil/index.html",
  ]) {
    assert.equal(trustedSender(url, true), false);
  }
  assert.equal(trustedSender(APP_URL, false), false);
});

test("detached service persists across clients, deduplicates startup, and exposes no credential through bridge", async () => {
  const root = mkdtempSync(join(tmpdir(), "argent-service-"));
  let connection;
  try {
    const connections = await Promise.all([
      ensureService(root),
      ensureService(root),
    ]);
    connection = connections[0]!;
    assert.equal(connections[1]!.instanceId, connection.instanceId);
    assert.equal(await isServiceAlive(connection), true);
    assert.equal(statSync(join(root, "service.json")).mode & 0o777, 0o600);
    const client = new DesktopClient(root);
    const status = await client.call("status", []);
    assert.deepEqual(status, {
      ok: true,
      value: { connected: true, engine: "local" },
    });
    assert.equal(JSON.stringify(status).includes(connection.token), false);
    assert.equal(
      (await client.call("fetch", ["https://example.com"])).ok,
      false,
    );
    assert.equal(
      (await client.call("createRun", ["x", "Task", Infinity, "key"])).ok,
      false,
    );
    const created = await client.call("createWorkspace", [
      "https://github.com/test/repo",
    ]);
    assert.equal(created.ok, true);
    const workspace = created.ok ? (created.value as { id: string }) : null;
    const recreatedClient = new DesktopClient(root);
    const page = await recreatedClient.call("listWorkspaces", []);
    assert.equal(
      page.ok && (page.value as { items: { id: string }[] }).items[0]?.id,
      workspace!.id,
    );
    assert.equal(readConnection(root)?.instanceId, connection.instanceId);
    assert.equal(
      readFileSync(join(root, "service.json"), "utf8").includes(
        connection.token,
      ),
      true,
    );
    const previousInstance = connection.instanceId;
    process.kill(connection.pid, "SIGKILL");
    const deadline = Date.now() + 3000;
    while (await isServiceAlive(connection)) {
      if (Date.now() > deadline)
        throw new Error("Owned test service did not exit");
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    connection = await ensureService(root);
    assert.notEqual(connection.instanceId, previousInstance);
    const restored = await new DesktopClient(root).call("listWorkspaces", []);
    assert.equal(
      restored.ok &&
        (restored.value as { items: { id: string }[] }).items[0]?.id,
      workspace!.id,
    );
  } finally {
    if (connection) {
      await serviceRequest(connection, "/service/stop", "POST", {});
      const until = Date.now() + 5000;
      while (Date.now() < until && (await isServiceAlive(connection)))
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("stopping an active desktop service closes polling connections and preserves uncertainty", async () => {
  const root = mkdtempSync(join(tmpdir(), "argent-active-stop-"));
  let connection;
  const pause = () => new Promise((resolve) => setTimeout(resolve, 30));
  try {
    connection = await ensureService(root);
    const workspace = (await serviceRequest(connection, "/workspaces", "POST", {
      repository: "https://github.com/test/shutdown",
    })) as { id: string };
    const run = (await serviceRequest(
      connection,
      "/runs",
      "POST",
      {
        workspaceId: workspace.id,
        task: "Observe interrupted simulation",
        maxRuntimeMs: 30000,
      },
      "active-stop",
    )) as { id: string };
    const runningDeadline = Date.now() + 3000;
    while (
      (
        (await serviceRequest(connection, `/runs/${run.id}`)) as {
          status: string;
        }
      ).status !== "running"
    ) {
      assert.ok(Date.now() < runningDeadline, "fixture run must start");
      await pause();
    }
    await serviceRequest(connection, "/service/stop", "POST", {});
    const deadline = Date.now() + 2500;
    while (readConnection(root)) {
      assert.ok(
        Date.now() < deadline,
        "active service must release ownership despite client polling",
      );
      await isServiceAlive(connection);
      await pause();
    }
    assert.equal(await isServiceAlive(connection), false);
    const store = new Store(join(root, "platform.sqlite"));
    try {
      assert.equal(store.getRun(run.id).status, "needs_attention");
      assert.equal(store.claim(5000), null, "an uncertain run cannot replay");
    } finally {
      store.close();
    }
  } finally {
    // This fixture owns its private profile and process, including on pre-fix failure.
    if (
      connection &&
      readConnection(root)?.instanceId === connection.instanceId
    ) {
      try {
        process.kill(connection.pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
      await pause();
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("desktop bridge creates local workspaces only from a chosen folder and runs Claude Code in them", async () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "argent-desktop-local-")),
  );
  const repository = join(root, "repo");
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Argent Test",
        "-c",
        "user.email=test@example.invalid",
        ...args,
      ],
      { cwd: repository, stdio: "ignore" },
    );
  mkdirSync(repository);
  git("init", "--quiet", "--initial-branch=main");
  writeFileSync(join(repository, "README.md"), "# test\n");
  git("add", "README.md");
  git("commit", "--quiet", "-m", "initial");
  // A fake CLI: announces the session, edits one file and reports success.
  const claude = join(root, "claude");
  writeFileSync(
    claude,
    `#!${process.execPath}
if (process.argv.includes('--version')) { console.log('2.1.259 (Claude Code)'); process.exit(0); }
const fs = require("node:fs");
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  const args = process.argv.slice(2);
  const session = args[args.indexOf("--session-id") + 1 || args.indexOf("--resume") + 1];
  const out = (event) => process.stdout.write(JSON.stringify(event) + "\\n");
  out({ type: "system", subtype: "init", session_id: session, model: "fake" });
  fs.writeFileSync("hello.txt", input);
  out({ type: "assistant", message: { content: [{ type: "text", text: "Wrote hello.txt (" + args[args.indexOf("--permission-mode") + 1] + ")" }] } });
  out({ type: "result", subtype: "success", is_error: false, num_turns: 1, duration_ms: 5, result: "done" });
});
`,
  );
  chmodSync(claude, 0o755);
  const service = join(root, "service");
  const previous = process.env.ARGENT_CLAUDE_PATH;
  process.env.ARGENT_CLAUDE_PATH = claude;
  let connection;
  try {
    connection = await ensureService(service);
    const value = <T>(reply: Awaited<ReturnType<DesktopClient["call"]>>): T => {
      assert.equal(reply.ok, true, reply.ok ? "" : reply.error);
      return (reply as { value: T }).value;
    };
    let asked = 0;
    const client = new DesktopClient(service, async () => {
      asked++;
      return repository;
    });
    assert.equal(
      value(await new DesktopClient(service).call("createLocalWorkspace", [])),
      null,
      "a cancelled folder dialog creates nothing",
    );
    const first = value<Workspace>(
      await client.call("createLocalWorkspace", []),
    );
    assert.equal(asked, 1);
    assert.equal(first.provider, "local-worktree");
    assert.match(first.local!.branch, /^argent\/[0-9a-f]{8}$/);
    assert.equal(first.local!.repositoryPath, repository);
    const parallel = value<Workspace>(
      await client.call("createLocalWorkspace", [first.id]),
    );
    assert.equal(
      asked,
      1,
      "a parallel workspace reuses the recorded repository",
    );
    assert.equal(parallel.local!.repositoryPath, repository);
    assert.notEqual(parallel.local!.branch, first.local!.branch);
    assert.notEqual(parallel.local!.worktreePath, first.local!.worktreePath);
    const simulated = value<Workspace>(
      await client.call("createWorkspace", ["https://github.com/test/repo"]),
    );
    const refused = await client.call("createLocalWorkspace", [simulated.id]);
    assert.equal(refused.ok, false);
    assert.match(refused.ok ? "" : refused.error, /local repository workspace/);
    assert.equal(
      (await client.call("createLocalWorkspace", [first.id, "/elsewhere"])).ok,
      false,
      "the renderer cannot supply a repository path",
    );
    const invalid = await client.call("createRun", [
      first.id,
      "Task",
      60000,
      "bad",
      "root",
    ]);
    assert.equal(invalid.ok, false);
    const run = value<RunView>(
      await client.call("createRun", [
        first.id,
        "hello",
        3600000,
        "local-1",
        "full",
      ]),
    );
    assert.equal(run.simulation, false);
    assert.equal(run.permissionMode, "full");
    const deadline = Date.now() + 15000;
    let status = run.status;
    while (status !== "completed") {
      assert.ok(
        !["failed", "cancelled", "needs_attention"].includes(status),
        status,
      );
      assert.ok(Date.now() < deadline, "the local run must finish");
      await new Promise((resolve) => setTimeout(resolve, 100));
      status = value<RunView>(await client.call("getRun", [run.id])).status;
    }
    const artifact = value<{ evidence: WorktreeEvidence; simulation: boolean }>(
      await client.call("artifact", [run.id]),
    );
    assert.equal(artifact.simulation, false);
    assert.equal(artifact.evidence.kind, "worktree-record");
    assert.equal(artifact.evidence.branch, first.local!.branch);
    assert.equal(artifact.evidence.changedFiles, 1);
    assert.equal(
      readFileSync(join(first.local!.worktreePath, "hello.txt"), "utf8"),
      "hello",
    );
    assert.equal(
      existsSync(join(parallel.local!.worktreePath, "hello.txt")),
      false,
    );
    assert.equal(existsSync(join(repository, "hello.txt")), false);
    const events = value<{
      events: { type: string; data: Record<string, unknown> }[];
    }>(await client.call("events", [run.id, 0])).events;
    assert.ok(
      events.some(
        (event) => event.data.message === "Wrote hello.txt (bypassPermissions)",
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.ARGENT_CLAUDE_PATH;
    else process.env.ARGENT_CLAUDE_PATH = previous;
    if (connection) {
      await serviceRequest(connection, "/service/stop", "POST", {});
      const until = Date.now() + 5000;
      while (Date.now() < until && (await isServiceAlive(connection)))
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    rmSync(root, { recursive: true, force: true });
  }
});
