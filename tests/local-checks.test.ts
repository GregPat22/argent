import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
  chmodSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { deflateSync } from "node:zlib";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Store } from "../src/store.js";
import { createLocalWorkspace } from "../src/local-worktree.js";
import { readLocalCommandConfig } from "../src/local-command-config.js";
import { reviewLocalCommandCandidate } from "../src/local-command-review.js";
import { LocalCheckWorker } from "../src/local-check-worker.js";
import { makeServer } from "../src/http.js";
import { inspectLocalCommandCandidate } from "../src/workspace-changes.js";
import { validateCheckResult } from "../src/local-checks.js";
import { validateCheckView } from "../src/desktop/checks.js";

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
async function fixture(
  t: TestContext,
  setup = 'require("node:fs").writeFileSync("deps", "ready")',
  testCode = 'if(require("node:fs").readFileSync("deps", "utf8") !== "ready") process.exit(9); console.log("tested");',
  purpose: "setup-test" | "setup-run" = "setup-test",
  runOnly = false,
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "argent-check-"))),
    repo = join(root, "repo"),
    database = join(root, "store.sqlite"),
    worktrees = join(root, "worktrees"),
    verification = join(root, "verification");
  mkdirSync(repo);
  git(repo, "init", "--quiet", "--initial-branch=main");
  writeFileSync(
    join(repo, "argent.json"),
    JSON.stringify({
      version: 1,
      commands: {
        ...(runOnly
          ? {}
          : {
              setup: { argv: [process.execPath, "setup.cjs"] },
              test: { argv: [process.execPath, "test.cjs"] },
            }),
        run: { argv: [process.execPath, "run.cjs"] },
      },
    }),
  );
  writeFileSync(join(repo, "setup.cjs"), setup);
  writeFileSync(
    join(repo, "test.cjs"),
    purpose === "setup-run" ? "throw new Error('test must not run')" : testCode,
  );
  writeFileSync(
    join(repo, "run.cjs"),
    purpose === "setup-run"
      ? testCode
      : "throw new Error('run must not execute')",
  );
  writeFileSync(join(repo, ".gitignore"), "deps\n");
  writeFileSync(join(repo, "file.txt"), "original\n");
  mkdirSync(join(repo, "nested"));
  writeFileSync(join(repo, "nested", "value.txt"), "original\n");
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "initial");
  const store = new Store(database),
    db = new DatabaseSync(database);
  const connections = [store];
  t.after(() => {
    db.close();
    for (const c of connections) c.close();
    rmSync(root, { recursive: true, force: true });
  });
  const workspace = await createLocalWorkspace(store, worktrees, repo),
    id = workspace.id,
    directory = workspace.local!.worktreePath;
  const descriptor = (await readLocalCommandConfig(store, worktrees, id))!;
  await store.localCommandApprovals.approve(
    worktrees,
    id,
    "operator",
    descriptor.approvalCandidate.identity,
    "approve",
  );
  const review = await reviewLocalCommandCandidate(
    store,
    worktrees,
    id,
    "operator",
  );
  const consent = await store.localCommandConsents.consent(
    worktrees,
    id,
    "operator",
    review.identity,
    "consent",
    undefined,
    purpose,
  );
  const worker = new LocalCheckWorker(
    store,
    { worktreeRoot: worktrees, verificationRoot: verification },
    10000,
  );
  const enqueue = (key = "check") =>
    store.localChecks.enqueue(
      worktrees,
      id,
      "operator",
      consent.id,
      key,
      undefined,
      purpose,
    );
  const latest = () =>
    store.localChecks.latest(worktrees, id, "operator", undefined, purpose);
  return {
    root,
    repo,
    directory,
    database,
    db,
    store,
    connections,
    worktrees,
    verification,
    workspace,
    id,
    consent,
    review,
    enqueue,
    latest,
    worker,
  };
}

test("desktop/service check runs approved setup then test in a fresh checkout, persists exact evidence and detects later changes", async (t) => {
  const f = await fixture(t);
  writeFileSync(
    join(f.directory, "deps"),
    "workspace dependency must stay behind",
  );
  const job = await f.enqueue();
  assert.equal(f.store.claim(5000), null);
  assert.equal(f.store.claimCommandJob(5000), null);
  await assert.rejects(
    f.store.localChecks.enqueue(
      f.worktrees,
      f.id,
      "operator",
      f.consent.id,
      "other",
    ),
  );
  assert.equal(await f.worker.tick(), true);
  const view = (await f.latest())!;
  assert.equal(view.status, "completed");
  assert.equal(view.freshness, "current");
  assert.equal(view.result?.outcome, "passed");
  assert.deepEqual(
    view.result?.phases.map((p) => p.action),
    ["setup", "test"],
  );
  assert.equal(view.result?.headSha, f.workspace.local!.baseSha);
  assert.equal(
    readFileSync(join(f.directory, "deps"), "utf8"),
    "workspace dependency must stay behind",
  );
  assert.equal(existsSync(join(f.verification, job.run.id)), false);
  assert.equal(
    f.store.events(job.run.id).filter((e) => e.type === "check.result").length,
    1,
  );
  assert.deepEqual(validateCheckView(view, f.id), view);
  const restarted = new Store(f.database);
  f.connections.push(restarted);
  assert.equal(
    (await restarted.localChecks.latest(f.worktrees, f.id, "operator"))?.result
      ?.outcome,
    "passed",
  );
  assert.equal((await f.enqueue()).run.id, job.run.id);
  assert.equal(await f.worker.tick(), false);
  writeFileSync(join(f.directory, "file.txt"), "dirty\n");
  assert.equal((await f.latest())?.freshness, "stale");
  git(f.directory, "add", ".");
  git(f.directory, "commit", "--quiet", "-m", "later");
  assert.equal((await f.latest())?.freshness, "stale");
  assert.equal((await f.enqueue()).run.id, job.run.id);
  await assert.rejects(f.enqueue("new"));
});

test("nonzero setup prevents test; nonzero test records failed exact-commit evidence", async (t) => {
  for (const setupFailure of [true, false]) {
    const f = await fixture(
      t,
      setupFailure ? "process.exit(7)" : "console.log('setup')",
      "process.exit(9)",
    );
    await f.enqueue();
    await f.worker.tick();
    const view = (await f.latest())!;
    assert.equal(view.result?.outcome, "failed");
    assert.equal(view.freshness, "current");
    assert.equal(view.result?.phases.length, setupFailure ? 1 : 2);
    assert.equal(view.result?.phases.at(-1)?.exitCode, setupFailure ? 7 : 9);
  }
});

test("changes after enqueue and setup changing tracked bytes never produce a passed result", async (t) => {
  const f = await fixture(t);
  await f.enqueue();
  writeFileSync(join(f.directory, "file.txt"), "changed after consent");
  await f.worker.tick();
  assert.equal((await f.latest())?.status, "failed");
  assert.equal((await f.latest())?.result, null);
  const changed = await fixture(
    t,
    'require("node:fs").writeFileSync("file.txt", "different")',
    "process.exit(0)",
  );
  const job = await changed.enqueue();
  await changed.worker.tick();
  assert.equal((await changed.latest())?.status, "failed");
  assert.equal((await changed.latest())?.result, null);
  assert.equal(existsSync(join(changed.verification, job.run.id)), false);
});

test("queued cancellation, live cancellation and shutdown preserve no-replay semantics", async (t) => {
  const queued = await fixture(t);
  const q = await queued.enqueue();
  queued.store.cancel(q.run.id);
  assert.equal(await queued.worker.tick(), false);
  assert.equal((await queued.latest())?.status, "cancelled");
  for (const shutdown of [false, true]) {
    const f = await fixture(
      t,
      'require("node:fs").writeFileSync("deps", "started"); setInterval(() => {}, 1000)',
      "process.exit(0)",
    );
    const job = await f.enqueue(),
      controller = new AbortController();
    const running = f.worker.tick(controller.signal);
    const end = Date.now() + 10000;
    while (
      !existsSync(join(f.verification, job.run.id, "deps")) &&
      Date.now() < end
    )
      await delay(20);
    assert.ok(existsSync(join(f.verification, job.run.id, "deps")));
    // This ignored marker is written by the configured process after spawn.
    if (shutdown) controller.abort();
    else f.store.cancel(job.run.id);
    await running;
    assert.equal(
      (await f.latest())?.status,
      shutdown ? "needs_attention" : "cancelled",
    );
    assert.equal((await f.latest())?.result, null);
    assert.equal(await f.worker.tick(), false);
    if (shutdown) await assert.rejects(f.enqueue("another"));
  }
});

test("claim expiry blocks late results and restart never reclaims an interrupted check", async (t) => {
  const f = await fixture(t);
  const job = await f.enqueue();
  const claimed = f.store.localChecks.claim(100)!;
  f.store.reconcile(claimed.run.leaseExpiresAt!);
  assert.equal(f.store.getRun(job.run.id).status, "needs_attention");
  assert.throws(() =>
    f.store.localChecks.assertOwned(job.run.id, claimed.run.leaseToken!),
  );
  const second = new Store(f.database);
  f.connections.push(second);
  assert.equal(second.localChecks.claim(5000), null);
  await assert.rejects(f.enqueue("new"));
});

test("executable enqueue/claim/result and audit events are atomic; result corruption fails closed", async (t) => {
  const f = await fixture(t);
  f.db.exec(
    "CREATE TRIGGER reject_check BEFORE INSERT ON events WHEN NEW.type='check.queued' BEGIN SELECT RAISE(ABORT,'injected'); END;",
  );
  await assert.rejects(f.enqueue(), /injected/);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM runs").get()!.n, 0);
  f.db.exec("DROP TRIGGER reject_check");
  const job = await f.enqueue();
  f.db.exec(
    "CREATE TRIGGER reject_claim BEFORE INSERT ON events WHEN NEW.type='check.claimed' BEGIN SELECT RAISE(ABORT,'injected'); END;",
  );
  assert.throws(() => f.store.localChecks.claim(5000), /injected/);
  assert.equal(f.store.getRun(job.run.id).status, "queued");
  f.db.exec("DROP TRIGGER reject_claim");
  await f.worker.tick();
  f.db
    .prepare("UPDATE local_checks SET result_sha256=? WHERE run_id=?")
    .run("0".repeat(64), job.run.id);
  await assert.rejects(f.latest(), /Invalid check record/);
});

test("authenticated check routes reject caller commands, origins, queries and standalone mode; duplicates only read history", async (t) => {
  const f = await fixture(t),
    token = "t".repeat(32);
  const server = makeServer(f.store, token, {
    worktreeRoot: f.worktrees,
    localCommandOperatorId: "operator",
    localChecks: true,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/workspaces/${f.id}/checks`;
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "idempotency-key": randomUUID(),
  };
  assert.equal((await fetch(url)).status, 401);
  assert.equal(
    (
      await fetch(url, {
        headers: { ...headers, origin: "http://example.invalid" },
      })
    ).status,
    403,
  );
  assert.equal((await fetch(url + "?argv=no", { headers })).status, 400);
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ consentId: f.consent.id, argv: ["bad"] }),
      })
    ).status,
    400,
  );
  const request = () =>
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ consentId: f.consent.id }),
    });
  const first = await request();
  assert.equal(first.status, 202);
  const body = (await first.json()) as { id: string };
  const again = await request();
  assert.equal(((await again.json()) as { id: string }).id, body.id);
  assert.equal(
    (
      await fetch(url.replace(/checks$/, `checks/${body.id}/cancel`), {
        method: "POST",
        headers,
        body: "{}",
      })
    ).status,
    200,
  );
  assert.equal((await fetch(url, { headers })).status, 200);
  const standalone = makeServer(f.store, token);
  await new Promise<void>((resolve) =>
    standalone.listen(0, "127.0.0.1", resolve),
  );
  try {
    const address = standalone.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/workspaces/${f.id}/checks`,
      { headers },
    );
    assert.equal(response.status, 409);
  } finally {
    await new Promise<void>((resolve) => standalone.close(() => resolve()));
  }
});

test("post-setup manifest detects forged tree data that Git accepts as clean", async (t) => {
  const setup = `const fs = require("node:fs"), cp = require("node:child_process"), path = require("node:path"), zlib = require("node:zlib");
    const git = (...args) => cp.execFileSync("git", args).toString().trim();
    const oldTree = git("rev-parse", "HEAD:nested");
    fs.writeFileSync("nested/value.txt", "forged bytes"); git("add", "nested/value.txt");
    const newRoot = git("write-tree"); const newTree = git("rev-parse", newRoot + ":nested");
    const raw = cp.execFileSync("git", ["cat-file", "tree", newTree]);
    const common = path.resolve(git("rev-parse", "--git-common-dir"));
    const object = path.join(common,"objects",oldTree.slice(0,2),oldTree.slice(2));
    fs.chmodSync(object, 0o600);
    fs.writeFileSync(object,zlib.deflateSync(Buffer.concat([Buffer.from("tree " + raw.length + "\\0"),raw])));`;
  const f = await fixture(t, setup, "console.log('must not run')");
  await f.enqueue();
  await f.worker.tick();
  const result = await f.latest();
  assert.equal(result?.status, "failed");
  assert.equal(result?.result, null);
});

test("result and event rollback together, and desktop rejects inconsistent or unbounded evidence", async (t) => {
  const f = await fixture(t);
  const job = await f.enqueue();
  f.db.exec(
    "CREATE TRIGGER reject_result BEFORE INSERT ON events WHEN NEW.type='check.result' BEGIN SELECT RAISE(ABORT,'injected'); END;",
  );
  await f.worker.tick();
  assert.equal(
    f.db
      .prepare("SELECT result FROM local_checks WHERE run_id=?")
      .get(job.run.id)!.result,
    null,
  );
  assert.equal(f.store.getRun(job.run.id).status, "failed");
  assert.equal(
    f.store.events(job.run.id).filter((e) => e.type === "check.result").length,
    0,
  );
  const clean = await fixture(t);
  await clean.enqueue();
  await clean.worker.tick();
  const view = (await clean.latest())!;
  assert.throws(() =>
    validateCheckView({ ...view, workspaceId: randomUUID() }, clean.id),
  );
  assert.throws(() =>
    validateCheckView(
      { ...view, result: { ...view.result, phases: [] } },
      clean.id,
    ),
  );
  assert.throws(() =>
    validateCheckView({ ...view, status: "running" }, clean.id),
  );
  // Integrity checksum alone cannot make an inconsistent outcome displayable.
  const bad = JSON.stringify({ ...view.result, headSha: "0".repeat(40) });
  clean.db
    .prepare("UPDATE local_checks SET result=?,result_sha256=?")
    .run(bad, createHash("sha256").update(bad).digest("hex"));
  await assert.rejects(clean.latest());
});

test("claim migration preserves active rows, references, indexes and triggers and rolls back broken references", async (t) => {
  const f = await fixture(t);
  // Recreate the previous constraint on an empty runs table, then populate it
  // through the unchanged dormant/agent APIs before opening the new store.
  f.db.exec(`ALTER TABLE runs DROP COLUMN command_claim_version;
    ALTER TABLE runs ADD COLUMN command_claim_version INTEGER NOT NULL DEFAULT 0
      CHECK(command_claim_version IN (0,1)
      AND (kind = 'command' OR command_claim_version = 0)
      AND (kind <> 'command' OR (simulation = 0 AND permission_mode = 'edits'
        AND status <> 'completed'
        AND (status <> 'queued' OR command_claim_version = 0)
        AND (status NOT IN ('running','cancelling','needs_attention') OR command_claim_version = 1))));`);
  const approved = f.store.localCommandApprovals.get(
    f.consent.binding.approvalId,
  );
  const dormant = await f.store.createCommandJob(f.worktrees, {
    workspaceId: f.id,
    operatorId: "operator",
    approvalId: approved.id,
    candidateIdentity: approved.descriptor.approvalCandidate.identity,
    action: "test",
    requestKey: "dormant",
  });
  f.store.claimCommandJob(5000);
  const workspace = f.store.createWorkspace(
    "https://github.com/example/repository",
  );
  const agent = f.store.createRun(workspace.id, "fixture", "agent");
  f.store.claim(5000);
  f.db.exec(
    "CREATE TRIGGER preserved_trigger BEFORE UPDATE OF task ON runs BEGIN SELECT RAISE(ABORT,'preserved'); END;",
  );
  const before = f.db.prepare("SELECT * FROM runs ORDER BY id").all(),
    events = f.db.prepare("SELECT * FROM events ORDER BY cursor").all();
  f.db.exec(
    "PRAGMA foreign_keys=OFF; CREATE TABLE migration_fault (id TEXT REFERENCES runs(id)); INSERT INTO migration_fault VALUES ('missing'); PRAGMA foreign_keys=ON;",
  );
  assert.throws(() => new Store(f.database), /broke a reference/);
  assert.deepEqual(
    f.db.prepare("SELECT * FROM runs ORDER BY id").all(),
    before,
  );
  assert.match(
    f.db.prepare("SELECT sql FROM sqlite_master WHERE name='runs'").get()!
      .sql as string,
    /command_claim_version IN \(0,1\)/,
  );
  f.db.exec("DROP TABLE migration_fault");
  const migrated = new Store(f.database);
  f.connections.push(migrated);
  assert.deepEqual(
    f.db.prepare("SELECT * FROM runs ORDER BY id").all(),
    before,
  );
  assert.deepEqual(
    f.db.prepare("SELECT * FROM events ORDER BY cursor").all(),
    events,
  );
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(migrated.getRun(agent.id).status, "running");
  assert.equal(migrated.getCommandJob(dormant.run.id).run.status, "running");
  assert.throws(
    () =>
      f.db.prepare("UPDATE runs SET task='changed' WHERE id=?").run(agent.id),
    /preserved/,
  );
  assert.throws(
    () =>
      f.db
        .prepare("UPDATE runs SET status='completed' WHERE id=?")
        .run(dormant.run.id),
    /CHECK/,
  );
  assert.ok(
    f.db
      .prepare("SELECT name FROM sqlite_master WHERE name='one_active_run'")
      .get(),
  );
});

test("independent connections serialize duplicate checks and exclude an agent while queued", async (t) => {
  const f = await fixture(t);
  const second = new Store(f.database);
  f.connections.push(second);
  const requests = await Promise.all([
    f.enqueue("same"),
    second.localChecks.enqueue(
      f.worktrees,
      f.id,
      "operator",
      f.consent.id,
      "same",
    ),
  ]);
  assert.equal(requests[0]!.run.id, requests[1]!.run.id);
  assert.equal(
    f.store.events(requests[0]!.run.id).filter((e) => e.type === "check.queued")
      .length,
    1,
  );
  assert.throws(() => second.createRun(f.id, "agent", "agent-key"), /active/);
  const first = f.store.localChecks.claim(5000);
  assert.ok(first);
  assert.equal(second.localChecks.claim(5000), null);
  assert.equal(second.claim(5000), null);
});

test("freshness refuses forged tree objects after a successful check", async (t) => {
  const f = await fixture(t);
  await f.enqueue();
  await f.worker.tick();
  assert.equal((await f.latest())?.freshness, "current");
  const oldTree = git(f.directory, "rev-parse", "HEAD:nested");
  writeFileSync(join(f.directory, "nested", "value.txt"), "unverified bytes");
  git(f.directory, "add", "nested/value.txt");
  const rootTree = git(f.directory, "write-tree");
  const forged = git(f.directory, "rev-parse", `${rootTree}:nested`);
  const raw = execFileSync("git", ["cat-file", "tree", forged], {
    cwd: f.directory,
  });
  const object = join(
    f.repo,
    ".git",
    "objects",
    oldTree.slice(0, 2),
    oldTree.slice(2),
  );
  chmodSync(object, 0o600);
  writeFileSync(
    object,
    deflateSync(Buffer.concat([Buffer.from(`tree ${raw.length}\0`), raw])),
  );
  const observation = await inspectLocalCommandCandidate(
    f.store,
    f.worktrees,
    f.id,
    "operator",
  );
  assert.equal(
    observation.headSha,
    f.workspace.local!.baseSha,
    "the old observation alone accepts the forged tree",
  );
  assert.equal((await f.latest())?.freshness, "stale");
});

test("an identical accepted receipt wins even when a competing inspection returns no match", async (t) => {
  const f = await fixture(t),
    second = new Store(f.database);
  f.connections.push(second);
  let release!: (value: null) => void;
  t.mock.method(
    f.store.localCommandConsents,
    "lookup",
    () =>
      new Promise<null>((resolve) => {
        release = resolve;
      }),
  );
  const pending = f.enqueue("race");
  const accepted = await second.localChecks.enqueue(
    f.worktrees,
    f.id,
    "operator",
    f.consent.id,
    "race",
  );
  release(null);
  assert.equal((await pending).run.id, accepted.run.id);
  assert.equal(
    f.store.events(accepted.run.id).filter((e) => e.type === "check.queued")
      .length,
    1,
  );
});

test("separate run consent executes setup then run in a fresh checkout without test evidence", async (t) => {
  const f = await fixture(t, undefined, undefined, "setup-run");
  assert.equal(f.consent.binding.action, "setup-run");
  assert.equal(
    f.consent.binding.policyVersion,
    "argent-local-run-consent-full-display-v1",
  );
  const tests = await f.store.localCommandConsents.consent(
    f.worktrees,
    f.id,
    "operator",
    f.review.identity,
    "test-consent",
  );
  assert.notEqual(tests.id, f.consent.id);
  await assert.rejects(
    f.store.localCommandConsents.consent(
      f.worktrees,
      f.id,
      "operator",
      f.review.identity,
      "consent",
    ),
    /different payload/,
  );
  assert.equal(
    await f.store.localCommandConsents.lookup(
      f.worktrees,
      f.id,
      "operator",
      f.consent.id,
    ),
    null,
  );
  await assert.rejects(
    f.store.localChecks.enqueue(
      f.worktrees,
      f.id,
      "operator",
      f.consent.id,
      "wrong-test",
    ),
    /matching/,
  );
  await assert.rejects(
    f.store.localChecks.enqueue(
      f.worktrees,
      f.id,
      "operator",
      tests.id,
      "wrong-run",
      undefined,
      "setup-run",
    ),
    /matching/,
  );
  writeFileSync(join(f.directory, "deps"), "workspace must stay untouched");
  const job = await f.enqueue();
  assert.equal(f.store.claim(5000), null);
  assert.equal(f.store.claimCommandJob(5000), null);
  assert.throws(
    () => f.store.localChecks.view(job.run.id, f.id, "operator"),
    /not found/,
  );
  await f.worker.tick();
  const view = (await f.latest())!;
  assert.equal(view.kind, "local-run-action");
  assert.equal(view.status, "completed");
  assert.equal(view.result?.policy, "argent-local-run-v1");
  assert.equal(view.result?.outcome, "succeeded");
  assert.deepEqual(
    view.result?.phases.map((p) => p.action),
    ["setup", "run"],
  );
  assert.equal(view.freshness, "current");
  assert.equal(
    await f.store.localChecks.latest(f.worktrees, f.id, "operator"),
    null,
  );
  assert.deepEqual(validateCheckView(view, f.id, true), view);
  assert.throws(() => validateCheckView(view, f.id), /Invalid/);
  assert.throws(
    () => validateCheckResult({ ...view.result, outcome: "passed" }),
    /Invalid/,
  );
  assert.throws(
    () =>
      validateCheckResult({
        ...view.result,
        policy: "argent-local-check-v1",
        outcome: "passed",
      }),
    /Invalid/,
  );
  assert.throws(
    () =>
      validateCheckResult({
        ...view.result,
        phases: view.result!.phases.map((p) => ({
          ...p,
          action: p.action === "run" ? "test" : p.action,
        })),
      }),
    /Invalid/,
  );
  assert.equal(
    readFileSync(join(f.directory, "deps"), "utf8"),
    "workspace must stay untouched",
  );
  assert.equal(existsSync(join(f.verification, job.run.id)), false);
  assert.equal(
    f.store.events(job.run.id).filter((e) => e.type === "run-action.result")
      .length,
    1,
  );
  assert.equal(
    f.store.events(job.run.id).filter((e) => e.type === "check.result").length,
    0,
  );
  const restarted = new Store(f.database);
  f.connections.push(restarted);
  assert.equal(
    restarted.localCommandConsents.get(tests.id).binding.policyVersion,
    "argent-local-command-consent-full-display-v1",
  );
  assert.equal(
    (
      await restarted.localChecks.latest(
        f.worktrees,
        f.id,
        "operator",
        undefined,
        "setup-run",
      )
    )?.result?.outcome,
    "succeeded",
  );
  assert.equal((await f.enqueue()).run.id, job.run.id);
  writeFileSync(join(f.directory, "file.txt"), "later edit");
  assert.equal((await f.latest())?.freshness, "stale");
  assert.equal((await f.enqueue()).run.id, job.run.id);
  await assert.rejects(f.enqueue("new"));
});

test("run setup failure suppresses run and run failure retains a distinct failed outcome", async (t) => {
  for (const setupFailure of [true, false]) {
    const f = await fixture(
      t,
      setupFailure ? "process.exit(7)" : "console.log('setup')",
      "process.exit(9)",
      "setup-run",
    );
    await f.enqueue();
    await f.worker.tick();
    const result = (await f.latest())!.result!;
    assert.equal(result.policy, "argent-local-run-v1");
    assert.equal(result.outcome, "failed");
    assert.deepEqual(
      result.phases.map((p) => p.action),
      setupFailure ? ["setup"] : ["setup", "run"],
    );
    assert.equal(result.phases.at(-1)!.exitCode, setupFailure ? 7 : 9);
  }
});

test("run cancellation reaps the running command and never produces a successful result or replay", async (t) => {
  const f = await fixture(
    t,
    "process.exit(0)",
    'require("node:fs").writeFileSync("deps", "started"); setInterval(() => {}, 1000)',
    "setup-run",
  );
  const job = await f.enqueue();
  const running = f.worker.tick();
  const deadline = Date.now() + 10000;
  while (
    !existsSync(join(f.verification, job.run.id, "deps")) &&
    Date.now() < deadline
  )
    await delay(20);
  assert.ok(existsSync(join(f.verification, job.run.id, "deps")));
  f.store.cancel(job.run.id);
  await running;
  assert.equal((await f.latest())?.status, "cancelled");
  assert.equal((await f.latest())?.result, null);
  assert.equal(existsSync(join(f.verification, job.run.id)), false);
  assert.equal(await f.worker.tick(), false);
});

test("run action service rejects check consent and cross-action cancellation, and exposes separate review receipts", async (t) => {
  const f = await fixture(t, undefined, undefined, "setup-run");
  const token = "t".repeat(32);
  const server = makeServer(f.store, token, {
    worktreeRoot: f.worktrees,
    localCommandOperatorId: "operator",
    localChecks: true,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/workspaces/${f.id}`;
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "idempotency-key": randomUUID(),
  };
  const read = (await (
    await fetch(base + "/run-candidate-review", { headers })
  ).json()) as { action: string; consent: { id: string } };
  assert.equal(read.action, "setup-run");
  assert.equal(read.consent.id, f.consent.id);
  const checkRead = (await (
    await fetch(base + "/candidate-review", { headers })
  ).json()) as { consent: unknown };
  assert.equal(checkRead.consent, null);
  const consent = await fetch(base + "/run-candidate-consents", {
    method: "POST",
    headers,
    body: JSON.stringify({ expectedReviewIdentity: f.review.identity }),
  });
  assert.equal(consent.status, 200);
  assert.equal(
    ((await consent.json()) as { action: string }).action,
    "setup-run",
  );
  const request = (path: string, body: object) =>
    fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
  assert.equal(
    (await request("/checks", { consentId: f.consent.id })).status,
    409,
  );
  assert.equal(
    (await request("/run-actions", { consentId: f.consent.id, argv: ["bad"] }))
      .status,
    400,
  );
  const response = await request("/run-actions", { consentId: f.consent.id });
  assert.equal(response.status, 202);
  const job = (await response.json()) as { id: string; kind: string };
  assert.equal(job.kind, "local-run-action");
  assert.equal((await request(`/checks/${job.id}/cancel`, {})).status, 404);
  assert.equal(f.store.getRun(job.id).status, "queued");
  assert.equal(
    (await request(`/run-actions/${job.id}/cancel`, {})).status,
    200,
  );
  assert.equal(f.store.getRun(job.id).status, "cancelled");
  assert.equal(
    (await request("/run-actions", { consentId: f.consent.id })).status,
    202,
  );
  assert.equal(await f.worker.tick(), false);
});

test("a run-only configuration needs no test command and unsupported purposes are rejected", async (t) => {
  const f = await fixture(t, undefined, "process.exit(0)", "setup-run", true);
  await assert.rejects(
    f.store.localCommandConsents.consent(
      f.worktrees,
      f.id,
      "operator",
      f.review.identity,
      "test-consent",
    ),
    /no longer matches/,
  );
  await assert.rejects(
    f.store.localChecks.enqueue(
      f.worktrees,
      f.id,
      "operator",
      f.consent.id,
      "invalid",
      undefined,
      "wrong" as "setup-run",
    ),
    /Invalid command purpose/,
  );
  await assert.rejects(
    f.store.localCommandConsents.consent(
      f.worktrees,
      f.id,
      "operator",
      f.review.identity,
      "invalid",
      undefined,
      "wrong" as "setup-run",
    ),
    /Invalid command purpose/,
  );
  await f.enqueue();
  await f.worker.tick();
  const result = (await f.latest())!.result!;
  assert.equal(result.outcome, "succeeded");
  assert.deepEqual(
    result.phases.map((p) => p.action),
    ["run"],
  );
});
