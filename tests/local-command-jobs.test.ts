import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LocalWorkspace,
  ScriptedAgent,
  type AgentAdapter,
  type WorkspaceAdapter,
} from "../src/adapters.js";
import { exportHistory } from "../src/continuity-export.js";
import { DomainError } from "../src/domain.js";
import { makeServer } from "../src/http.js";
import { readLocalCommandConfig } from "../src/local-command-config.js";
import type { CommandJobRequest } from "../src/local-command-jobs.js";
import { createLocalWorkspace } from "../src/local-worktree.js";
import { Store } from "../src/store.js";
import { Worker } from "../src/worker.js";

const rejected = (error: unknown) =>
  error instanceof DomainError && error.status === 409;
function git(cwd: string, ...args: string[]) {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=Argent Test",
      "-c",
      "user.email=test@example.invalid",
      ...args,
    ],
    { cwd, stdio: ["ignore", "pipe", "pipe"] },
  )
    .toString()
    .trim();
}
async function fixture(t: TestContext) {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "argent-command-jobs-")),
  );
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "--quiet", "--initial-branch=main");
  writeFileSync(
    join(repo, "argent.json"),
    JSON.stringify({
      version: 1,
      commands: {
        test: { argv: ["node", "marker.js"] },
        run: { argv: ["node", "marker.js", "run"] },
      },
    }),
  );
  writeFileSync(
    join(repo, "marker.js"),
    'require("node:fs").writeFileSync("executed","bad");\n',
  );
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "initial");
  const database = join(root, "store.sqlite"),
    worktrees = join(root, "worktrees");
  const store = new Store(database),
    db = new DatabaseSync(database);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  t.after(() => {
    db.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const workspace = await createLocalWorkspace(store, worktrees, repo);
  const candidate = (await readLocalCommandConfig(
    store,
    worktrees,
    workspace.id,
  ))!;
  const receipt = await store.localCommandApprovals.approve(
    worktrees,
    workspace.id,
    "operator",
    candidate.approvalCandidate.identity,
    "approve",
  );
  const request: CommandJobRequest = {
    workspaceId: workspace.id,
    operatorId: "operator",
    approvalId: receipt.approval.id,
    candidateIdentity: candidate.approvalCandidate.identity,
    action: "test",
    requestKey: "command",
    maxRuntimeMs: 1000,
  };
  const enqueue = (overrides: Partial<CommandJobRequest> = {}) =>
    store.createCommandJob(worktrees, { ...request, ...overrides });
  const counts = () =>
    ["runs", "command_jobs", "events"].map(
      (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n,
    );
  return {
    root,
    repo,
    database,
    worktrees,
    store,
    db,
    workspace,
    candidate,
    request,
    enqueue,
    counts,
  };
}

test("dormant jobs bind fresh approvals, preserve immutable snapshots and historical idempotency", async (t) => {
  const f = await fixture(t);
  for (const change of [
    { operatorId: "other" },
    { approvalId: randomUUID() },
    { candidateIdentity: "a".repeat(64) },
    { action: "setup" as const },
  ])
    await assert.rejects(f.enqueue(change), rejected);
  assert.deepEqual(f.counts(), [0, 0, 0]);
  const job = await f.enqueue();
  assert.equal(job.kind, "dormant-command-job");
  assert.equal(job.plan.execution, "forbidden");
  assert.deepEqual(job.plan.candidate, f.candidate);
  assert.throws(() => {
    (job.plan.candidate.config.commands.test!.argv as string[])[0] = "changed";
  }, TypeError);
  for (const change of [
    { action: "run" as const },
    { operatorId: "other" },
    { maxRuntimeMs: 2000 },
    { approvalId: randomUUID() },
    { candidateIdentity: "b".repeat(64) },
  ])
    await assert.rejects(f.enqueue(change), rejected);
  assert.throws(
    () =>
      f.store.createRun(
        f.workspace.id,
        "Dormant test command",
        "command",
        1000,
      ),
    rejected,
  );
  renameSync(f.repo, join(f.root, "unavailable"));
  assert.deepEqual(await f.enqueue(), job);
  const reopened = new Store(f.database);
  try {
    assert.deepEqual(reopened.getCommandJob(job.run.id), job);
  } finally {
    reopened.close();
  }
  assert.deepEqual(f.counts(), [1, 1, 1]);
  assert.equal(
    f.db
      .prepare(
        "SELECT agent_session_started AS started FROM local_worktrees WHERE workspace_id=?",
      )
      .get(f.workspace.id)!.started,
    0,
  );
  assert.equal(
    existsSync(join(f.workspace.local!.worktreePath, "executed")),
    false,
  );
});

test("reused approval records the new workspace base while ignoring unapproved worktree bytes", async (t) => {
  const f = await fixture(t);
  writeFileSync(join(f.repo, "new.txt"), "new base\n");
  git(f.repo, "add", ".");
  git(f.repo, "commit", "--quiet", "-m", "new base");
  const sibling = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  writeFileSync(join(sibling.local!.worktreePath, "argent.json"), "unapproved");
  const job = await f.enqueue({ workspaceId: sibling.id });
  assert.notEqual(
    job.plan.candidate.source.baseSha,
    f.candidate.source.baseSha,
  );
  assert.equal(job.plan.candidate.source.baseSha, sibling.local!.baseSha);
  assert.equal(job.plan.approvalId, f.request.approvalId);
  assert.deepEqual(job.plan.candidate.config, f.candidate.config);
});

test("cross-kind exclusion, cancellation, deadlines and exact expiry preserve uncertainty", async (t) => {
  const f = await fixture(t);
  const agent = f.store.createRun(f.workspace.id, "agent", "agent", 1000);
  await assert.rejects(f.enqueue(), rejected);
  await assert.rejects(f.enqueue({ requestKey: "agent" }), rejected);
  f.store.cancel(agent.id);
  const queued = await f.enqueue();
  assert.throws(
    () => f.store.createRun(f.workspace.id, "agent", "next", 1000),
    rejected,
  );
  assert.throws(
    () => f.store.setWorkspaceState(f.workspace.id, "stopped"),
    rejected,
  );
  assert.throws(
    () => f.store.lifecycle.request(f.workspace.id, "create", "lifecycle"),
    rejected,
  );
  assert.equal(f.store.claim(100, 1000), null);
  f.store.cancel(queued.run.id);
  assert.equal(f.store.claimCommandJob(100, 1000), null);
  await f.enqueue({ requestKey: "second" });
  const claimed = f.store.claimCommandJob(100, 1000)!;
  assert.equal(claimed.run.deadlineAt, 2000);
  const id = claimed.run.id,
    token = claimed.run.leaseToken!;
  assert.throws(
    () => f.store.finish(id, token, "completed", {}, undefined, 1001),
    rejected,
  );
  assert.throws(
    () => f.store.appendLog(id, token, "not an agent", 1001),
    rejected,
  );
  assert.throws(() => f.store.evidence(id), rejected);
  assert.throws(() => f.store.resolveSimulation(id, "not allowed"), rejected);
  f.store.heartbeat(id, token, 100, 1099);
  assert.throws(() => f.store.heartbeat(id, token, 100, 1199), rejected);
  assert.throws(
    () => f.store.finish(id, token, "failed", {}, undefined, 1199),
    rejected,
  );
  f.store.reconcile(1199);
  assert.equal(f.store.getRun(id).status, "needs_attention");
  assert.equal(f.store.claimCommandJob(100, 1200), null);
  await assert.rejects(f.enqueue({ requestKey: "blocked" }), rejected);
  assert.throws(
    () => f.store.createRun(f.workspace.id, "agent", "blocked-agent", 1000),
    rejected,
  );
  assert.ok(
    f.store.events(id).every((event) => event.type.startsWith("command.")),
  );
});

test("claimed cancellation requires live acknowledgement and cannot record evidence", async (t) => {
  const f = await fixture(t);
  await f.enqueue();
  const { run } = f.store.claimCommandJob(5000, 1000)!;
  assert.equal(f.store.cancel(run.id, 1001).status, "cancelling");
  assert.throws(
    () =>
      f.store.finish(
        run.id,
        run.leaseToken!,
        "failed",
        {},
        {
          kind: "simulation-artifact-check",
          passed: true,
          simulation: true,
          artifact: "bad",
          sha256: "a".repeat(64),
        },
        1002,
      ),
    rejected,
  );
  assert.equal(
    f.store.finish(
      run.id,
      run.leaseToken!,
      "cancelled",
      { reason: "pre_dispatch" },
      undefined,
      1002,
    ).status,
    "cancelled",
  );
  await f.enqueue({ requestKey: "next" });
  const next = f.store.claimCommandJob(5000, 1000)!;
  f.store.reconcile(2000);
  // Reconciliation fences dead owners; a deadline is not evidence of dispatch.
  assert.equal(f.store.getRun(next.run.id).status, "running");
  assert.equal(next.run.deadlineAt, 2000);
  assert.equal(f.store.cancel(next.run.id, 2000).status, "cancelling");
  assert.equal(
    f.store.finish(
      next.run.id,
      next.run.leaseToken!,
      "failed",
      {},
      undefined,
      2001,
    ).status,
    "failed",
  );
});

test("legacy prepared SQL claims fail atomically for commands after additive migration", async (t) => {
  const f = await fixture(t);
  // Recreate the pre-kind schema without dropping or rewriting any existing row.
  f.db.exec(
    "DROP TABLE command_jobs; ALTER TABLE runs DROP COLUMN command_claim_version; ALTER TABLE runs DROP COLUMN kind; DELETE FROM schema_versions WHERE component='command-jobs';",
  );
  const legacy = f.db.prepare(
    "UPDATE runs SET status='running',lease_token=?,lease_expires_at=?,deadline_at=? WHERE id=?",
  );
  const agent = f.store.createWorkspace(
    "https://github.com/example/repository",
  );
  // An old-shaped row remains unchanged through migration.
  const agentId = randomUUID();
  f.db
    .prepare(
      "INSERT INTO runs(id,workspace_id,task,request_key,status,max_runtime_ms,created_at) VALUES(?,?,?,'legacy','queued',1000,1)",
    )
    .run(agentId, agent.id, "legacy");
  const migrated = new Store(f.database);
  try {
    assert.equal(migrated.runKind(agentId), "agent");
    legacy.run("agent-token", 5000, 10000, agentId);
    assert.equal(migrated.getRun(agentId).status, "running");
    const job = await migrated.createCommandJob(f.worktrees, f.request);
    const before = f.db
      .prepare("SELECT * FROM runs WHERE id=?")
      .get(job.run.id);
    assert.throws(() => {
      f.db.exec("BEGIN IMMEDIATE");
      try {
        legacy.run("old-token", 5000, 10000, job.run.id);
        f.db
          .prepare(
            "INSERT INTO events(run_id,type,data,created_at) VALUES(?,'run.started','{}',1)",
          )
          .run(job.run.id);
        f.db.exec("COMMIT");
      } catch (error) {
        f.db.exec("ROLLBACK");
        throw error;
      }
    }, /CHECK constraint failed/);
    assert.deepEqual(
      f.db.prepare("SELECT * FROM runs WHERE id=?").get(job.run.id),
      before,
    );
    assert.deepEqual(
      migrated.events(job.run.id).map((event) => event.type),
      ["command.queued"],
    );
    assert.equal(migrated.claimCommandJob(5000, 1000)!.run.id, job.run.id);
    assert.equal(
      f.db
        .prepare("SELECT command_claim_version AS v FROM runs WHERE id=?")
        .get(job.run.id)!.v,
      1,
    );
    assert.throws(
      () =>
        f.db
          .prepare("UPDATE runs SET status='completed' WHERE id=?")
          .run(job.run.id),
      /CHECK constraint failed/,
    );
    assert.throws(
      () =>
        f.db
          .prepare("UPDATE runs SET status='queued' WHERE id=?")
          .run(job.run.id),
      /CHECK constraint failed/,
    );
  } finally {
    migrated.close();
  }
});

test("command insertion and claim events roll back together; corrupted plans never claim", async (t) => {
  const f = await fixture(t);
  for (const table of ["command_jobs", "events"]) {
    f.db.exec(
      `CREATE TRIGGER fail_insert BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'injected'); END;`,
    );
    await assert.rejects(f.enqueue(), /injected/);
    assert.deepEqual(f.counts(), [0, 0, 0]);
    f.db.exec("DROP TRIGGER fail_insert");
  }
  const job = await f.enqueue();
  f.db.exec(
    "CREATE TRIGGER fail_claim BEFORE INSERT ON events WHEN NEW.type='command.claimed' BEGIN SELECT RAISE(ABORT,'injected'); END;",
  );
  assert.throws(() => f.store.claimCommandJob(100), /injected/);
  assert.equal(f.store.getRun(job.run.id).status, "queued");
  assert.equal(
    f.db.prepare("SELECT command_claim_version AS v FROM runs").get()!.v,
    0,
  );
  f.db.exec("DROP TRIGGER fail_claim");
  const original = JSON.stringify(job.plan);
  for (const change of [
    { ...job.plan, version: 2 },
    { ...job.plan, execution: "allowed" },
    { ...job.plan, operatorId: "other" },
    {
      ...job.plan,
      candidate: {
        ...job.plan.candidate,
        source: { ...job.plan.candidate.source, baseSha: "a".repeat(40) },
      },
    },
  ]) {
    const payload = JSON.stringify(change);
    f.db
      .prepare("UPDATE command_jobs SET payload=?,payload_sha256=?")
      .run(payload, createHash("sha256").update(payload).digest("hex"));
    assert.throws(() => f.store.claimCommandJob(100), rejected);
    assert.equal(f.store.getRun(job.run.id).status, "queued");
  }
  f.db
    .prepare("UPDATE command_jobs SET payload=?,payload_sha256='wrong'")
    .run(original);
  assert.throws(() => f.store.claimCommandJob(100), rejected);
  assert.deepEqual(
    f.store.events(job.run.id).map((event) => event.type),
    ["command.queued"],
  );
});

test("default worker skips commands and its explicit guard prevents adapter dispatch", async (t) => {
  const f = await fixture(t);
  const command = await f.enqueue();
  const workspace = f.store.createWorkspace(
    "https://github.com/example/repository",
  );
  const agent = f.store.createRun(workspace.id, "simulation", "simulation");
  const worker = new Worker(
    f.store,
    new LocalWorkspace(join(f.root, "artifacts")),
    new ScriptedAgent(1),
  );
  assert.equal(await worker.tick(), true);
  assert.equal(f.store.getRun(agent.id).status, "completed");
  assert.equal(await worker.tick(), false);
  assert.equal(f.store.getRun(command.run.id).status, "queued");
  let calls = 0;
  const blockedWorkspace: WorkspaceAdapter = {
    prepare() {
      calls++;
      throw new Error("dispatch");
    },
    verify() {
      calls++;
      throw new Error("verify");
    },
  };
  const blockedAgent: AgentAdapter = {
    async *execute() {
      calls++;
      throw new Error("execute");
    },
  };
  const claimed = f.store.claimCommandJob(5000)!;
  t.mock.method(f.store, "claim", () => claimed.run);
  await new Worker(f.store, blockedWorkspace, blockedAgent, 5000, {
    workspace: blockedWorkspace,
    agent: blockedAgent,
  }).tick();
  assert.equal(calls, 0);
  assert.equal(f.store.getRun(command.run.id).status, "failed");
  assert.equal(
    existsSync(join(f.workspace.local!.worktreePath, "executed")),
    false,
  );
});

test("public lists, routes and history never expose or mutate internal command jobs", async (t) => {
  const f = await fixture(t);
  const first = f.store.createRun(f.workspace.id, "first", "first", 1000, 1);
  f.store.cancel(first.id);
  const command = await f.enqueue();
  f.store.cancel(command.run.id);
  const last = f.store.createRun(
    f.workspace.id,
    "last",
    "last",
    1000,
    Date.now() + 1000,
  );
  f.store.cancel(last.id);
  assert.deepEqual(
    f.store.listRuns(f.workspace.id, 1).items.map((run) => run.id),
    [last.id],
  );
  assert.deepEqual(
    f.store.listRuns(f.workspace.id, 1, last.id).items.map((run) => run.id),
    [first.id],
  );
  assert.throws(
    () => f.store.listRuns(f.workspace.id, 1, command.run.id),
    rejected,
  );
  const token = "command-test-token-".repeat(3),
    server = makeServer(f.store, token, {
      artifactRoot: join(f.root, "artifacts"),
    });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const call = (path: string, method = "GET") =>
    fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
  const before = f.store.events(command.run.id);
  for (const [suffix, method] of [
    ["", "GET"],
    ["/events", "GET"],
    ["/artifact", "GET"],
    ["/cancel", "POST"],
    ["/resolve", "POST"],
  ]) {
    const response = await call(`/runs/${command.run.id}${suffix}`, method);
    assert.equal(response.status, 409);
    assert.doesNotMatch(
      await response.text(),
      /marker\.js|approvalId|candidate/,
    );
  }
  assert.deepEqual(f.store.events(command.run.id), before);
  const response = await call(`/runs/${first.id}`);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(body.id, first.id);
  assert.equal("kind" in body, false);
  assert.equal("leaseToken" in body, false);
  const workspace = (await (
    await call(`/workspaces/${f.workspace.id}`)
  ).json()) as Record<string, unknown>;
  assert.equal("latestRun" in workspace, false);
  assert.throws(
    () => exportHistory(f.database, f.worktrees, f.workspace.id),
    rejected,
  );
  // Explicit kind refusal also protects otherwise exportable simulation metadata.
  const simulation = f.store.createWorkspace(
    "https://github.com/example/repository",
  );
  const run = f.store.createRun(simulation.id, "legacy", "legacy");
  f.store.cancel(run.id);
  f.db
    .prepare("UPDATE runs SET kind='command',simulation=0 WHERE id=?")
    .run(run.id);
  assert.throws(
    () => exportHistory(f.database, f.worktrees, simulation.id),
    /Command jobs are not portable/,
  );
});

async function commandProcess(
  f: Awaited<ReturnType<typeof fixture>>,
  mode: "command" | "agent" | "claim",
  request = f.request,
) {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("./local-command-job-fixture.js", import.meta.url)),
      f.database,
      f.worktrees,
      mode,
      JSON.stringify(request),
    ],
    {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin",
        HOME: f.root,
        TMPDIR: tmpdir(),
      },
    },
  );
  let stderr = "";
  child.stderr!.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-8192);
  });
  const exited = once(child, "exit");
  void exited.catch(() => {});
  async function waitForExit() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        exited,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("Command fixture did not exit")),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function stop() {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await waitForExit();
  }
  async function message(stage: string) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`Command fixture exited before ${stage}`);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        once(child, "message", { signal: controller.signal }),
        exited.then(() => {
          throw new Error(`Command fixture exited before ${stage}: ${stderr}`);
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error(`Command fixture timed out before ${stage}`)),
            15000,
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
  return {
    stop,
    async run() {
      const result = message("response");
      void result.catch(() => {});
      try {
        child.send("start");
        const [response] = await result;
        await waitForExit();
        return response as {
          id?: string | null;
          token?: string | null;
          conflict?: boolean;
        };
      } catch (error) {
        await stop();
        throw error;
      }
    },
  };
}

test("separate processes serialize duplicate command requests and claim one fence", async (t) => {
  const f = await fixture(t);
  const children: Awaited<ReturnType<typeof commandProcess>>[] = [];
  t.after(async () => {
    await Promise.all(children.map((child) => child.stop()));
  });
  children.push(await commandProcess(f, "command"));
  children.push(await commandProcess(f, "command"));
  const created = await Promise.all(children.map((child) => child.run()));
  assert.ok(created[0]!.id);
  assert.equal(created[0]!.id, created[1]!.id);
  assert.deepEqual(f.counts(), [1, 1, 1]);
  const claims: Awaited<ReturnType<typeof commandProcess>>[] = [];
  claims.push(await commandProcess(f, "claim"));
  children.push(claims[0]!);
  claims.push(await commandProcess(f, "claim"));
  children.push(claims[1]!);
  const results = await Promise.all(claims.map((child) => child.run()));
  assert.equal(results.filter((result) => result.id).length, 1);
  const winner = results.find((result) => result.id)!;
  assert.equal(f.store.getRun(winner.id!).leaseToken, winner.token);
  assert.deepEqual(
    f.store.events(winner.id!).map((event) => event.type),
    ["command.queued", "command.claimed"],
  );
});

test("separate agent and command enqueue processes share one workspace exclusion", async (t) => {
  const f = await fixture(t);
  const children: Awaited<ReturnType<typeof commandProcess>>[] = [];
  t.after(async () => {
    await Promise.all(children.map((child) => child.stop()));
  });
  children.push(await commandProcess(f, "command"));
  children.push(
    await commandProcess(f, "agent", {
      ...f.request,
      requestKey: "agent-race",
    }),
  );
  const results = await Promise.all(children.map((child) => child.run()));
  assert.equal(results.filter((result) => result.id).length, 1);
  assert.equal(results.filter((result) => result.conflict).length, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM runs").get()!.n, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM events").get()!.n, 1);
});
