import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { DomainError } from "../src/domain.js";
import { readLocalCommandConfig } from "../src/local-command-config.js";
import { CONSENT_POLICY } from "../src/local-command-consent.js";
import {
  REVIEW_LIMITS,
  reviewLocalCommandCandidate,
} from "../src/local-command-review.js";
import { createLocalWorkspace } from "../src/local-worktree.js";
import { Store } from "../src/store.js";

const CONFIG =
  '{"version":1,"commands":{"test":{"argv":["node","marker.js"]}}}\n';
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
async function fixture(t: TestContext, config = CONFIG) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "argent-consent-")));
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "--quiet", "--initial-branch=main");
  writeFileSync(join(repo, "argent.json"), config);
  writeFileSync(join(repo, "file.txt"), "before\n");
  writeFileSync(join(repo, "binary.dat"), Buffer.from([0, 1, 2]));
  writeFileSync(
    join(repo, "marker.js"),
    'require("node:fs").writeFileSync("executed", "bad");\n',
  );
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "initial");
  const database = join(root, "store.sqlite");
  const store = new Store(database),
    db = new DatabaseSync(database);
  const connections = [store];
  const worktrees = join(root, "worktrees");
  const workspace = await createLocalWorkspace(store, worktrees, repo);
  const directory = workspace.local!.worktreePath;
  const descriptor = (await readLocalCommandConfig(
    store,
    worktrees,
    workspace.id,
  ))!;
  const approval = await store.localCommandApprovals.approve(
    worktrees,
    workspace.id,
    "operator",
    descriptor.approvalCandidate.identity,
    "approve",
  );
  t.after(() => {
    db.close();
    for (const connection of connections) connection.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    repo,
    database,
    store,
    db,
    worktrees,
    workspace,
    directory,
    approval,
    review: (id = workspace.id, operator = "operator") =>
      reviewLocalCommandCandidate(store, worktrees, id, operator),
    consent: (
      expected: string,
      key = "request",
      operator = "operator",
      id = workspace.id,
      signal?: AbortSignal,
    ) =>
      store.localCommandConsents.consent(
        worktrees,
        id,
        operator,
        expected,
        key,
        signal,
      ),
    lookup: (id: string, workspaceId = workspace.id, operator = "operator") =>
      store.localCommandConsents.lookup(worktrees, workspaceId, operator, id),
    commit: () => {
      git(directory, "add", "--all", ".");
      git(directory, "commit", "--quiet", "--allow-empty", "-m", "candidate");
    },
    counts: () =>
      ["local_command_consents", "local_command_consent_events"].map(
        (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n,
      ),
    reopen: () => {
      const next = new Store(database);
      connections.push(next);
      return next;
    },
  };
}

test("consent binds a complete text review to the exact commit without execution", async (t) => {
  const f = await fixture(t);
  writeFileSync(join(f.directory, "file.txt"), "after\n");
  f.commit();
  const review = await f.review();
  const receipt = await f.consent(review.identity);
  assert.equal(receipt.binding.policyVersion, CONSENT_POLICY);
  assert.equal(receipt.binding.action, "setup-test");
  assert.equal(receipt.binding.reviewIdentity, review.identity);
  assert.equal(
    receipt.binding.observationIdentity,
    review.observation.identity,
  );
  assert.equal(receipt.binding.headSha, git(f.directory, "rev-parse", "HEAD"));
  assert.equal(
    receipt.binding.treeId,
    git(f.directory, "rev-parse", "HEAD^{tree}"),
  );
  assert.equal(receipt.binding.approvalId, f.approval.approval.id);
  assert.equal(receipt.historical, true);
  assert.equal(receipt.executionAllowed, false);
  assert.equal(receipt.tested, false);
  assert.equal(receipt.event.createdAt, receipt.createdAt);
  assert.deepEqual(f.counts(), [1, 1]);
  const match = await f.lookup(receipt.id);
  assert.deepEqual(match?.receipt, receipt);
  assert.deepEqual(match?.review, review);
  assert.equal(match?.executionAllowed, false);
  for (const value of [receipt, receipt.binding, receipt.event, match])
    assert.ok(Object.isFrozen(value));
  assert.equal(f.store.claim(1000), null);
  for (const table of ["runs", "events", "command_jobs"])
    assert.equal(
      f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n,
      0,
    );
  for (const path of [f.repo, f.directory]) {
    assert.equal(existsSync(join(path, "executed")), false);
    assert.equal(git(path, "status", "--porcelain"), "");
  }
  const payload = f.db
    .prepare("SELECT payload FROM local_command_consents")
    .get()!.payload as string;
  assert.equal(payload.includes("after"), false);
});

test("historical retries survive restart and missing files while new consent and lookup revalidate", async (t) => {
  const f = await fixture(t);
  const review = await f.review();
  const receipt = await f.consent(review.identity);
  await assert.rejects(f.consent("a".repeat(64)), /different payload/);
  await assert.rejects(
    f.consent(review.identity, "request", "other"),
    /different payload/,
  );
  renameSync(f.directory, join(f.root, "moved"));
  const reopened = f.reopen();
  assert.deepEqual(
    await reopened.localCommandConsents.consent(
      f.worktrees,
      f.workspace.id,
      "operator",
      review.identity,
      "request",
    ),
    receipt,
  );
  await assert.rejects(f.consent(review.identity, "new"), rejected(409));
  await assert.rejects(f.lookup(receipt.id), rejected(409));
  assert.deepEqual(f.counts(), [1, 1]);
});

test("a later commit with identical tree, dirty files and changed tests cannot reuse consent", async (t) => {
  const f = await fixture(t);
  const review = await f.review();
  const receipt = await f.consent(review.identity);
  writeFileSync(join(f.directory, "file.txt"), "dirty\n");
  await assert.rejects(f.lookup(receipt.id), rejected(409));
  await assert.rejects(f.consent(review.identity, "dirty"), rejected(409));
  writeFileSync(join(f.directory, "file.txt"), "before\n");
  f.commit();
  assert.equal(
    git(f.directory, "rev-parse", "HEAD^{tree}"),
    receipt.binding.treeId,
  );
  assert.equal(await f.lookup(receipt.id), null);
  await assert.rejects(f.consent(review.identity, "stale"), rejected(409));
  writeFileSync(join(f.directory, "marker.js"), "// changed test machinery\n");
  writeFileSync(
    join(f.directory, "argent.json"),
    '{"version":1,"commands":{"test":{"argv":["false"]}}}',
  );
  f.commit();
  const current = await f.review();
  assert.equal(current.configuration, "changed");
  assert.equal(await f.lookup(receipt.id), null);
  const next = await f.consent(current.identity, "new");
  assert.equal(next.binding.approvalId, receipt.binding.approvalId);
  assert.deepEqual((await f.lookup(next.id))?.receipt, next);
  assert.deepEqual(f.counts(), [2, 2]);
});

test("consent cannot cross actors or sibling workspaces", async (t) => {
  const f = await fixture(t);
  const review = await f.review();
  const receipt = await f.consent(review.identity);
  const sibling = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  assert.equal(await f.lookup(receipt.id, sibling.id), null);
  assert.equal(await f.lookup(receipt.id, f.workspace.id, "other"), null);
  await assert.rejects(
    f.consent(review.identity, "request", "operator", sibling.id),
    /different payload/,
  );
  await assert.rejects(
    f.consent(review.identity, "sibling", "operator", sibling.id),
    rejected(409),
  );
  await assert.rejects(
    f.consent(review.identity, "other", "other"),
    rejected(409),
  );
  assert.deepEqual(f.counts(), [1, 1]);
});

test("binary and invalid UTF-8 additions, deletions, renames and mode changes are never consentable", async (t) => {
  for (const kind of [
    "add",
    "invalid-utf8",
    "modify",
    "delete",
    "rename",
    "mode",
  ]) {
    await t.test(kind, async (t) => {
      const f = await fixture(t);
      const path = join(f.directory, "binary.dat");
      if (kind === "add")
        writeFileSync(join(f.directory, "new.dat"), Buffer.from([0, 3]));
      if (kind === "invalid-utf8")
        writeFileSync(join(f.directory, "new.dat"), Buffer.from([255, 254]));
      if (kind === "modify") writeFileSync(path, Buffer.from([0, 3]));
      if (kind === "delete") unlinkSync(path);
      if (kind === "rename") renameSync(path, join(f.directory, "renamed.dat"));
      if (kind === "mode") chmodSync(path, 0o755);
      f.commit();
      const review = await f.review();
      assert.equal(review.summary.binaryFiles, 1);
      await assert.rejects(
        f.consent(review.identity),
        /binary changes are not supported/,
      );
      assert.deepEqual(f.counts(), [0, 0]);
    });
  }
});

test("oversized changed blobs and diff overflow cannot produce consent", async (t) => {
  const f = await fixture(t);
  for (const size of [REVIEW_LIMITS.fileBytes + 1, REVIEW_LIMITS.diffBytes]) {
    writeFileSync(join(f.directory, "large.txt"), "x".repeat(size));
    f.commit();
    await assert.rejects(f.consent("a".repeat(64)), rejected(413));
    assert.deepEqual(f.counts(), [0, 0]);
  }
});

test("no test command, invalid inputs, simulation, cancellation and stale identity leave no consent", async (t) => {
  const f = await fixture(
    t,
    '{"version":1,"commands":{"run":{"argv":["node","marker.js"]}}}',
  );
  const review = await f.review();
  await assert.rejects(f.consent(review.identity), rejected(409));
  await assert.rejects(f.consent("a".repeat(64)), rejected(409));
  await assert.rejects(f.consent(review.identity + "\n"), rejected(400));
  await assert.rejects(f.consent(review.identity, ""), rejected(400));
  await assert.rejects(f.consent(review.identity, "key", ""), rejected(400));
  await assert.rejects(
    f.consent(review.identity, "key", "operator", "invalid"),
    rejected(400),
  );
  const simulation = f.store.createWorkspace("https://github.com/example/repo");
  await assert.rejects(
    f.consent(review.identity, "key", "operator", simulation.id),
    rejected(409),
  );
  await assert.rejects(
    f.consent(
      review.identity,
      "key",
      "operator",
      f.workspace.id,
      AbortSignal.abort(new Error("fixture aborted")),
    ),
    /fixture aborted/,
  );
  assert.deepEqual(f.counts(), [0, 0]);
});

test("stopped, active and uncertain workspaces reject new consent and current matches", async (t) => {
  const f = await fixture(t);
  const review = await f.review();
  const receipt = await f.consent(review.identity);
  f.db
    .prepare("UPDATE workspaces SET state = 'stopped' WHERE id = ?")
    .run(f.workspace.id);
  await assert.rejects(f.consent(review.identity, "stopped"), /idle/);
  await assert.rejects(f.lookup(receipt.id), /idle/);
  f.db
    .prepare("UPDATE workspaces SET state = 'running' WHERE id = ?")
    .run(f.workspace.id);
  const run = f.store.createRun(f.workspace.id, "fixture", "active");
  for (const status of ["queued", "running", "cancelling", "needs_attention"]) {
    f.db.prepare("UPDATE runs SET status = ? WHERE id = ?").run(status, run.id);
    await assert.rejects(f.consent(review.identity, status), /idle/);
    await assert.rejects(f.lookup(receipt.id), /idle/);
  }
  assert.deepEqual(await f.consent(review.identity), receipt);
  assert.deepEqual(f.counts(), [1, 1]);
});

test("event failure rolls back consent and the approval is checked before insertion", async (t) => {
  const f = await fixture(t);
  const review = await f.review();
  f.db.exec(
    "CREATE TRIGGER reject_consent BEFORE INSERT ON local_command_consent_events BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END",
  );
  await assert.rejects(f.consent(review.identity), /fixture rollback/);
  assert.deepEqual(f.counts(), [0, 0]);
  f.db.exec("DROP TRIGGER reject_consent");
  const get = f.store.localCommandApprovals.get.bind(
    f.store.localCommandApprovals,
  );
  t.mock.method(f.store.localCommandApprovals, "get", (id: string) => {
    const result = get(id);
    // Executed inside the consent transaction, after the final idle check.
    // Simulate an invalidated approval; no partial writes may survive.
    return Object.freeze({ ...result, operatorId: "other" });
  });
  await assert.rejects(f.consent(review.identity), rejected(409));
  assert.deepEqual(f.counts(), [0, 0]);
});

test("stored payload, fingerprint, event and policy corruption fail closed", async (t) => {
  const f = await fixture(t);
  const receipt = await f.consent((await f.review()).identity);
  const original = f.db.prepare("SELECT * FROM local_command_consents").get()!;
  for (const [payload, recompute] of [
    ["{", true],
    [JSON.stringify({ ...receipt.binding, action: "run" }), true],
    [JSON.stringify({ ...receipt.binding, policyVersion: "old-policy" }), true],
    [JSON.stringify({ ...receipt.binding, headSha: "a".repeat(40) }), false],
    [JSON.stringify({ ...receipt.binding, extra: true }), true],
  ] as const) {
    f.db
      .prepare(
        "UPDATE local_command_consents SET payload = ?, payload_sha256 = ?",
      )
      .run(
        payload,
        recompute
          ? createHash("sha256").update(payload).digest("hex")
          : (original.payload_sha256 as string),
      );
    assert.throws(
      () => f.store.localCommandConsents.get(receipt.id),
      /Invalid stored/,
    );
    await assert.rejects(
      f.consent(receipt.binding.reviewIdentity),
      /Invalid stored/,
    );
  }
  f.db
    .prepare(
      "UPDATE local_command_consents SET payload = ?, payload_sha256 = ?",
    )
    .run(original.payload as string, original.payload_sha256 as string);
  f.db
    .prepare("UPDATE local_command_consents SET fingerprint = ?")
    .run("a".repeat(64));
  assert.throws(
    () => f.store.localCommandConsents.get(receipt.id),
    /Invalid stored/,
  );
  f.db
    .prepare("UPDATE local_command_consents SET fingerprint = ?")
    .run(original.fingerprint as string);
  f.db
    .prepare(
      "UPDATE local_command_consent_events SET created_at = created_at + 1",
    )
    .run();
  assert.throws(
    () => f.store.localCommandConsents.get(receipt.id),
    /Invalid stored/,
  );
  f.db
    .prepare("UPDATE local_command_consent_events SET created_at = ?")
    .run(receipt.createdAt);
  assert.deepEqual(f.store.localCommandConsents.get(receipt.id), receipt);
  f.db
    .prepare(
      "UPDATE schema_versions SET version = 2 WHERE component = 'local-command-consent'",
    )
    .run();
  assert.throws(
    () => new Store(f.database),
    /Unsupported local command consent schema/,
  );
});

test("work admitted during review prevents consent even when the reviewed commit stays clean", async (t) => {
  const f = await fixture(t);
  const review = await f.review();
  const lookup = f.store.localCommandApprovals.lookup.bind(
    f.store.localCommandApprovals,
  );
  let admitted = false;
  t.mock.method(
    f.store.localCommandApprovals,
    "lookup",
    async (...args: Parameters<typeof lookup>) => {
      const result = await lookup(...args);
      if (!admitted) {
        admitted = true;
        f.store.createRun(f.workspace.id, "fixture", "during-review");
      }
      return result;
    },
  );
  await assert.rejects(f.consent(review.identity), /idle/);
  assert.equal(admitted, true);
  assert.deepEqual(f.counts(), [0, 0]);
});

test("a workspace binding changed during review cannot acquire consent", async (t) => {
  const f = await fixture(t);
  const review = await f.review();
  const lookup = f.store.localCommandApprovals.lookup.bind(
    f.store.localCommandApprovals,
  );
  let altered = false;
  t.mock.method(
    f.store.localCommandApprovals,
    "lookup",
    async (...args: Parameters<typeof lookup>) => {
      const result = await lookup(...args);
      if (!altered) {
        altered = true;
        f.db
          .prepare(
            "UPDATE local_worktrees SET worktree_path = ? WHERE workspace_id = ?",
          )
          .run(join(f.root, "missing"), f.workspace.id);
      }
      return result;
    },
  );
  await assert.rejects(f.consent(review.identity), rejected(409));
  assert.equal(altered, true);
  assert.deepEqual(f.counts(), [0, 0]);
});

test("existing databases add consent tables without changing history", async (t) => {
  const f = await fixture(t);
  f.db.exec(
    "DROP TABLE local_command_consent_events; DROP TABLE local_command_consents; DELETE FROM schema_versions WHERE component = 'local-command-consent'",
  );
  const next = f.reopen();
  assert.deepEqual(next.getWorkspace(f.workspace.id), f.workspace);
  assert.deepEqual(
    next.localCommandApprovals.get(f.approval.approval.id),
    f.approval.approval,
  );
  assert.deepEqual(f.counts(), [0, 0]);
});

test(
  "separate processes racing one consent key persist one receipt and event",
  { timeout: 45000 },
  async (t) => {
    const f = await fixture(t);
    const review = await f.review();
    const children = [0, 1].map(() => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(
            new URL("./local-command-consent-fixture.js", import.meta.url),
          ),
          f.database,
          f.worktrees,
          f.workspace.id,
          review.identity,
          "race",
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
      child.stderr!.on("data", (bytes: Buffer) => {
        stderr = (stderr + bytes.toString()).slice(-8192);
      });
      const exited = once(child, "exit");
      void exited.catch(() => {});
      async function message() {
        if (child.exitCode !== null || child.signalCode !== null)
          throw new Error("Consent fixture already exited");
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(new Error("Consent fixture timed out")),
          20000,
        );
        try {
          return await Promise.race([
            once(child, "message", { signal: controller.signal }),
            exited.then(() => {
              throw new Error(
                `Consent fixture exited before response: ${stderr}`,
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
          controller.abort();
        }
      }
      const ready = message();
      void ready.catch(() => {});
      return { child, ready, message, exited };
    });
    async function boundedExit(exited: Promise<unknown[]>) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          exited,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error("Consent fixture did not exit")),
              5000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    try {
      for (const result of await Promise.all(
        children.map((process) => process.ready),
      ))
        assert.equal(result[0], "ready");
      const replies = children.map((process) => process.message());
      const result = Promise.all(replies);
      for (const process of children) process.child.send("go");
      const responses = await result;
      for (const exit of await Promise.all(
        children.map((process) => boundedExit(process.exited)),
      ))
        assert.deepEqual(exit, [0, null]);
      assert.deepEqual(responses[0]![0], responses[1]![0]);
      assert.ok((responses[0]![0] as { receipt?: unknown }).receipt);
      assert.deepEqual(f.counts(), [1, 1]);
    } finally {
      for (const { child } of children)
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
      await Promise.all(children.map((process) => boundedExit(process.exited)));
    }
  },
);
