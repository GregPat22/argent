import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
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
import { exportHistory } from "../src/continuity-export.js";
import { ContinuityStore } from "../src/continuity-store.js";
import { decodeHistory } from "../src/continuity.js";
import { DomainError } from "../src/domain.js";
import { readLocalCommandConfig } from "../src/local-command-config.js";
import type { LocalCommandApprovalReceipt } from "../src/local-command-approvals.js";
import { createLocalWorkspace } from "../src/local-worktree.js";
import { Store } from "../src/store.js";

const CONFIG =
  '{"version":1,"commands":{"test":{"argv":["node","marker.js"]}}}\n';
const CHANGED =
  '{"version":1,"commands":{"test":{"argv":["node","other.js"]}}}\n';
const tables = [
  "local_command_approvals",
  "local_command_approval_events",
  "local_command_approval_receipts",
];
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
const rejected = (status: number) => (error: unknown) =>
  error instanceof DomainError && error.status === status;

async function fixture(t: TestContext, bytes: string | null = CONFIG) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "argent-approvals-")));
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "--quiet", "--initial-branch=main");
  writeFileSync(
    join(repo, "marker.js"),
    'require("node:fs").writeFileSync("executed", "bad");\n',
  );
  if (bytes !== null) writeFileSync(join(repo, "argent.json"), bytes);
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "initial");
  const database = join(root, "store.sqlite");
  const store = new Store(database);
  const connections = [store];
  const db = new DatabaseSync(database);
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  const worktrees = join(root, "worktrees");
  const workspace = await createLocalWorkspace(store, worktrees, repo);
  t.after(() => {
    db.close();
    for (const connection of connections) connection.close();
    rmSync(root, { recursive: true, force: true });
  });
  const read = (id = workspace.id) =>
    readLocalCommandConfig(store, worktrees, id);
  const candidate =
    (await read())?.approvalCandidate.identity ?? "a".repeat(64);
  return {
    root,
    repo,
    database,
    store,
    db,
    worktrees,
    workspace,
    read,
    candidate,
    counts: () =>
      tables.map(
        (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n,
      ),
    reopen: () => {
      const next = new Store(database);
      connections.push(next);
      return next;
    },
    approve: (
      key = "request",
      expected = candidate,
      operator = "operator",
      id = workspace.id,
      signal?: AbortSignal,
    ) =>
      store.localCommandApprovals.approve(
        worktrees,
        id,
        operator,
        expected,
        key,
        signal,
      ),
    lookup: (id = workspace.id, operator = "operator") =>
      store.localCommandApprovals.lookup(worktrees, id, operator),
    commit: (bytes: string) => {
      writeFileSync(join(repo, "argent.json"), bytes);
      git(repo, "add", "argent.json");
      git(repo, "commit", "--quiet", "-m", "change");
    },
  };
}

test("approval records the fresh base snapshot, actor and event atomically without execution", async (t) => {
  const f = await fixture(t);
  assert.equal(await f.lookup(), null);
  const receipt = await f.approve();
  assert.equal(receipt.kind, "local-command-approval-receipt");
  assert.equal(receipt.approval.operatorId, "operator");
  assert.equal(receipt.approval.workspaceId, f.workspace.id);
  assert.equal(receipt.workspaceId, f.workspace.id);
  assert.equal(receipt.event.type, "configuration.approved");
  assert.equal(receipt.event.createdAt, receipt.approval.approvedAt);
  assert.deepEqual(receipt.approval.descriptor, await f.read());
  assert.deepEqual(f.counts(), [1, 1, 1]);
  const match = await f.lookup();
  assert.equal(match?.kind, "local-command-approval-match");
  assert.equal(match?.approval.id, receipt.approval.id);
  assert.equal(f.store.claim(1000), null);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM runs").get()!.n, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM events").get()!.n, 0);
  for (const path of [f.repo, f.workspace.local!.worktreePath]) {
    assert.equal(existsSync(join(path, "executed")), false);
    assert.equal(git(path, "status", "--porcelain"), "");
  }
  for (const value of [
    receipt,
    receipt.event,
    receipt.approval,
    receipt.approval.descriptor,
    receipt.approval.descriptor.config.commands.test!.argv,
    match,
  ])
    assert.ok(Object.isFrozen(value));
  assert.throws(
    () =>
      (receipt.approval.descriptor.config.commands.test!.argv as string[]).push(
        "bad",
      ),
    TypeError,
  );
});

test("receipts are idempotent historical reads; fresh lookup and new requests revalidate source", async (t) => {
  const f = await fixture(t);
  const first = await f.approve();
  assert.deepEqual(await f.approve(), first);
  await assert.rejects(
    f.approve("request", "b".repeat(64)),
    /different payload/,
  );
  await assert.rejects(
    f.approve("request", f.candidate, "other-operator"),
    /different payload/,
  );
  const sibling = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  await assert.rejects(
    f.approve("request", f.candidate, "operator", sibling.id),
    /different payload/,
  );
  renameSync(f.workspace.local!.worktreePath, join(f.root, "moved"));
  assert.deepEqual(await f.approve(), first);
  const restarted = f.reopen();
  assert.deepEqual(
    await restarted.localCommandApprovals.approve(
      f.worktrees,
      f.workspace.id,
      "operator",
      f.candidate,
      "request",
    ),
    first,
  );
  await assert.rejects(f.lookup(), rejected(409));
  await assert.rejects(f.approve("new"), rejected(409));
  assert.deepEqual(f.counts(), [1, 1, 1]);
});

test("identical bytes reuse across sibling and later-base workspaces but approvals remain operator scoped", async (t) => {
  const f = await fixture(t);
  const original = await f.approve();
  const sibling = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  assert.equal((await f.lookup(sibling.id))?.approval.id, original.approval.id);
  const reused = await f.approve(
    "sibling",
    f.candidate,
    "operator",
    sibling.id,
  );
  assert.equal(reused.approval.id, original.approval.id);
  assert.equal(reused.event.type, "configuration.reused");
  assert.equal(reused.workspaceId, sibling.id);
  writeFileSync(join(f.repo, "unrelated.txt"), "next base\n");
  git(f.repo, "add", ".");
  git(f.repo, "commit", "--quiet", "-m", "unrelated");
  const newer = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const match = await f.lookup(newer.id);
  assert.equal(match?.approval.id, original.approval.id);
  assert.notEqual(
    match?.candidate.source.baseSha,
    original.approval.descriptor.source.baseSha,
  );
  assert.equal(await f.lookup(newer.id, "another-operator"), null);
  const another = await f.approve(
    "another-operator",
    f.candidate,
    "another-operator",
    newer.id,
  );
  assert.notEqual(another.approval.id, original.approval.id);
  assert.deepEqual(f.counts(), [2, 3, 3]);
});

test("changed exact bytes need fresh consent; current worktree configuration cannot replace the trusted base", async (t) => {
  const f = await fixture(t);
  const first = await f.approve();
  writeFileSync(join(f.workspace.local!.worktreePath, "argent.json"), CHANGED);
  assert.equal((await f.lookup())?.approval.id, first.approval.id);
  f.commit(CONFIG + " ");
  const next = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  assert.equal(await f.lookup(next.id), null);
  await assert.rejects(
    f.approve("stale", f.candidate, "operator", next.id),
    rejected(409),
  );
  assert.deepEqual(f.counts(), [1, 1, 1]);
  const candidate = (await f.read(next.id))!.approvalCandidate.identity;
  const approved = await f.approve("fresh", candidate, "operator", next.id);
  assert.notEqual(approved.approval.id, first.approval.id);
  assert.deepEqual(
    approved.approval.descriptor.config,
    first.approval.descriptor.config,
  );
  assert.deepEqual(f.counts(), [2, 2, 2]);
});

test("same configuration in another repository does not reuse an approval", async (t) => {
  const f = await fixture(t);
  await f.approve();
  const other = join(f.root, "other-repository");
  git(f.root, "clone", "--quiet", "--no-local", f.repo, other);
  const workspace = await createLocalWorkspace(f.store, f.worktrees, other);
  assert.equal(await f.lookup(workspace.id), null);
  await assert.rejects(
    f.approve("other", f.candidate, "operator", workspace.id),
    rejected(409),
  );
  assert.deepEqual(f.counts(), [1, 1, 1]);
});

test("missing configuration, invalid inputs, wrong digest and abort create no authority", async (t) => {
  const f = await fixture(t, null);
  assert.equal(await f.lookup(), null);
  await assert.rejects(f.approve(), rejected(409));
  await assert.rejects(f.approve("", f.candidate), rejected(400));
  await assert.rejects(f.approve("key", f.candidate + "\n"), rejected(400));
  await assert.rejects(f.approve("key", f.candidate, ""), rejected(400));
  await assert.rejects(
    f.approve("key", f.candidate, "operator", "invalid"),
    rejected(400),
  );
  const controller = new AbortController();
  controller.abort(new Error("fixture aborted"));
  await assert.rejects(
    f.approve(
      "abort",
      f.candidate,
      "operator",
      f.workspace.id,
      controller.signal,
    ),
    /fixture aborted/,
  );
  const simulation = f.store.createWorkspace("https://github.com/example/repo");
  await assert.rejects(
    f.approve("simulation", f.candidate, "operator", simulation.id),
    rejected(409),
  );
  assert.deepEqual(f.counts(), [0, 0, 0]);
});

test("event or receipt insertion failure rolls back the snapshot and all audit writes", async (t) => {
  const f = await fixture(t);
  for (const table of tables.slice(1)) {
    f.db.exec(
      `CREATE TRIGGER reject_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'fixture'); END`,
    );
    await assert.rejects(f.approve(), /fixture/);
    assert.deepEqual(f.counts(), [0, 0, 0]);
    f.db.exec("DROP TRIGGER reject_write");
  }
  const receipt = await f.approve();
  f.db.exec(
    "CREATE TRIGGER reject_reuse BEFORE INSERT ON local_command_approval_receipts BEGIN SELECT RAISE(ABORT, 'fixture'); END",
  );
  await assert.rejects(f.approve("reuse"), /fixture/);
  assert.deepEqual(f.counts(), [1, 1, 1]);
  assert.deepEqual(await f.approve(), receipt);
});

test("approval rechecks the stored workspace binding after its asynchronous source read", async (t) => {
  const f = await fixture(t);
  writeFileSync(join(f.repo, "new-base.txt"), "later base\n");
  git(f.repo, "add", ".");
  git(f.repo, "commit", "--quiet", "-m", "later");
  const newer = git(f.repo, "rev-parse", "HEAD");
  const getWorkspace = f.store.getWorkspace.bind(f.store);
  let reads = 0;
  t.mock.method(f.store, "getWorkspace", (id: string) => {
    const result = getWorkspace(id);
    if (++reads === 2)
      f.db
        .prepare(
          "UPDATE local_worktrees SET base_sha = ? WHERE workspace_id = ?",
        )
        .run(newer, id);
    return result;
  });
  await assert.rejects(f.approve(), /configuration changed/);
  assert.deepEqual(f.counts(), [0, 0, 0]);
});

test("stored snapshot corruption fails closed and never overwrites an existing approval", async (t) => {
  const f = await fixture(t);
  const first = await f.approve();
  const original = JSON.stringify(first.approval.descriptor);
  const modified = JSON.parse(original) as {
    approvalCandidate: Record<string, unknown>;
    source: Record<string, unknown>;
  };
  const cases = [
    "{",
    JSON.stringify({ ...modified, extra: true }),
    JSON.stringify({ ...modified, config: JSON.parse(CHANGED) }),
    JSON.stringify({
      ...modified,
      approvalCandidate: {
        ...modified.approvalCandidate,
        policyVersion: "old-policy",
      },
    }),
    JSON.stringify({
      ...modified,
      source: { ...modified.source, sha256: "b".repeat(64) },
    }),
  ];
  for (const value of cases) {
    f.db
      .prepare("UPDATE local_command_approvals SET descriptor = ?")
      .run(value);
    await assert.rejects(f.lookup(), /Invalid stored command approval/);
    await assert.rejects(f.approve(), /Invalid stored command approval/);
    await assert.rejects(f.approve("new"), /Invalid stored command approval/);
    assert.deepEqual(f.counts(), [1, 1, 1]);
  }
  f.db
    .prepare("UPDATE local_command_approvals SET descriptor = ?")
    .run(original);
  assert.equal((await f.lookup())?.approval.id, first.approval.id);
});

test("additive migration preserves existing runs and rejects a newer approval schema", async (t) => {
  const f = await fixture(t);
  const simulated = f.store.createWorkspace("https://github.com/example/repo");
  const run = f.store.createRun(simulated.id, "existing", "run-key");
  for (const table of [...tables].reverse()) f.db.exec(`DROP TABLE ${table}`);
  f.db.exec(
    "DELETE FROM schema_versions WHERE component = 'local-command-approvals'",
  );
  const migrated = f.reopen();
  assert.deepEqual(migrated.getRun(run.id), run);
  assert.equal(migrated.events(run.id).length, 1);
  assert.deepEqual(f.counts(), [0, 0, 0]);
  assert.equal(f.db.prepare("PRAGMA foreign_key_check").get(), undefined);
  f.db.exec(
    "UPDATE schema_versions SET version=2 WHERE component='local-command-approvals'",
  );
  assert.throws(
    () => new Store(f.database),
    /Unsupported local command approval schema/,
  );
  assert.equal(
    f.db
      .prepare(
        "SELECT version FROM schema_versions WHERE component='local-command-approvals'",
      )
      .get()!.version,
    2,
  );
});

test("approval authority never enters portable history or restored execution state", async (t) => {
  const f = await fixture(t);
  const approved = await f.approve();
  const simulation = f.store.createWorkspace("https://github.com/example/repo");
  f.store.createRun(simulation.id, "history", "simulation-key");
  const bytes = exportHistory(f.database, f.worktrees, simulation.id);
  for (const text of [
    approved.approval.id,
    f.candidate,
    "marker.js",
    "operator",
    "request",
  ])
    assert.equal(bytes.includes(text), false);
  assert.ok(
    decodeHistory(Buffer.from(bytes)).payload.omissions.includes(
      "provider-operations-and-approvals",
    ),
  );
  assert.throws(
    () => exportHistory(f.database, f.worktrees, f.workspace.id),
    rejected(409),
  );
  const historyPath = join(f.root, "history.sqlite");
  const history = new ContinuityStore(historyPath);
  const imported = history.restore(Buffer.from(bytes));
  assert.equal(imported.readOnly, true);
  history.close();
  const restored = new DatabaseSync(historyPath, { readOnly: true });
  try {
    assert.deepEqual(
      restored
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all()
        .map((row) => row.name),
      ["history_bundles", "history_events"],
    );
  } finally {
    restored.close();
  }
  assert.deepEqual(f.counts(), [1, 1, 1]);
});

async function approvalProcess(
  f: Awaited<ReturnType<typeof fixture>>,
  key: string,
  expected = f.candidate,
  operator = "operator",
) {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("./local-command-approval-fixture.js", import.meta.url),
      ),
      f.database,
      f.worktrees,
      f.workspace.id,
      expected,
      key,
      operator,
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
            () => reject(new Error("Approval fixture did not exit")),
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
      throw new Error(`Approval fixture exited before ${stage}`);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        once(child, "message", { signal: controller.signal }),
        exited.then(() => {
          throw new Error(`Approval fixture exited before ${stage}: ${stderr}`);
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error(`Approval fixture timed out before ${stage}`)),
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
        child.send("approve");
        const [response] = await result;
        await waitForExit();
        return response as {
          receipt?: LocalCommandApprovalReceipt;
          conflict?: boolean;
        };
      } catch (error) {
        await stop();
        throw error;
      }
    },
  };
}

test(
  "independent processes serialize duplicate and distinct requests and preserve receipts after restart",
  { timeout: 60000 },
  async (t) => {
    const f = await fixture(t);
    const children: Awaited<ReturnType<typeof approvalProcess>>[] = [];
    try {
      children.push(await approvalProcess(f, "shared"));
      children.push(await approvalProcess(f, "shared"));
      children.push(await approvalProcess(f, "distinct"));
      const results = await Promise.all(children.map((child) => child.run()));
      assert.ok(results.every((result) => result.receipt));
      assert.deepEqual(results[0], results[1]);
      assert.equal(
        new Set(results.map((result) => result.receipt!.approval.id)).size,
        1,
      );
      assert.deepEqual(f.counts(), [1, 2, 2]);
      const restarted = await approvalProcess(f, "shared");
      children.push(restarted);
      assert.deepEqual(await restarted.run(), results[0]);
      const conflict = await approvalProcess(f, "shared", "b".repeat(64));
      children.push(conflict);
      assert.deepEqual(await conflict.run(), { conflict: true });
      assert.deepEqual(f.counts(), [1, 2, 2]);
    } finally {
      await Promise.all(children.map((child) => child.stop()));
    }
  },
);

test(
  "concurrent payload conflicts produce one attributed receipt and no partial approval",
  { timeout: 60000 },
  async (t) => {
    const f = await fixture(t);
    const children: Awaited<ReturnType<typeof approvalProcess>>[] = [];
    try {
      children.push(
        await approvalProcess(f, "contended", f.candidate, "first-operator"),
      );
      children.push(
        await approvalProcess(f, "contended", f.candidate, "second-operator"),
      );
      const results = await Promise.all(children.map((child) => child.run()));
      assert.equal(results.filter((result) => result.receipt).length, 1);
      assert.equal(results.filter((result) => result.conflict).length, 1);
      assert.deepEqual(f.counts(), [1, 1, 1]);
      const receipt = results.find((result) => result.receipt)!.receipt!;
      assert.equal(
        f.db
          .prepare("SELECT operator_id FROM local_command_approval_events")
          .get()!.operator_id,
        receipt.approval.operatorId,
      );
      assert.equal(f.db.prepare("PRAGMA foreign_key_check").get(), undefined);
    } finally {
      await Promise.all(children.map((child) => child.stop()));
    }
  },
);
