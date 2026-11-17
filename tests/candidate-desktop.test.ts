import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
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
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { DesktopClient } from "../src/desktop/bridge.js";
import {
  validateCandidateReview,
  validateCandidateConsentReceipt,
} from "../src/desktop/candidate-review.js";
import type {
  BridgeReply,
  CandidateReviewView,
  CandidateConsentReceiptView,
} from "../src/desktop/contracts.js";
import { makeServer } from "../src/http.js";
import { createLocalWorkspace } from "../src/local-worktree.js";
import { readLocalCommandConfig } from "../src/local-command-config.js";
import { REVIEW_LIMITS } from "../src/local-command-review.js";
import { Store } from "../src/store.js";

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
function value<T>(reply: BridgeReply): T {
  assert.equal(reply.ok, true, reply.ok ? "" : reply.error);
  return (reply as { value: T }).value;
}
async function fixture(t: TestContext, testCommand = true, enabled = true) {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "argent-candidate-desktop-")),
  );
  const repo = join(root, "repo"),
    worktrees = join(root, "worktrees");
  mkdirSync(repo);
  git(repo, "init", "--quiet", "--initial-branch=main");
  writeFileSync(
    join(repo, "argent.json"),
    JSON.stringify({
      version: 1,
      commands: {
        [testCommand ? "test" : "run"]: { argv: ["node", "marker.js"] },
      },
    }),
  );
  writeFileSync(
    join(repo, "marker.js"),
    'require("node:fs").writeFileSync("executed", "bad");\n',
  );
  writeFileSync(join(repo, "notes.txt"), "original\n");
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "initial");
  const database = join(root, "store.sqlite"),
    store = new Store(database),
    db = new DatabaseSync(database);
  const workspace = await createLocalWorkspace(store, worktrees, repo);
  const cwd = workspace.local!.worktreePath;
  const candidate = await readLocalCommandConfig(
    store,
    worktrees,
    workspace.id,
  );
  assert.ok(candidate);
  await store.localCommandApprovals.approve(
    worktrees,
    workspace.id,
    "local-desktop",
    candidate.approvalCandidate.identity,
    "approve",
  );
  const commit = () => {
    git(cwd, "add", ".");
    return git(cwd, "commit", "--quiet", "--allow-empty", "-m", "candidate");
  };
  writeFileSync(
    join(cwd, "notes.txt"),
    "<script>untrusted</script>\n\t\u202e\u200b\n",
  );
  commit();
  const token = randomBytes(32).toString("hex");
  const server = makeServer(
    store,
    token,
    enabled
      ? { worktreeRoot: worktrees, localCommandOperatorId: "local-desktop" }
      : {},
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  writeFileSync(
    join(root, "service.json"),
    JSON.stringify({
      version: 1,
      port: address.port,
      token,
      instanceId: randomUUID(),
      pid: process.pid,
    }),
  );
  const client = new DesktopClient(root);
  const request = (path: string, init: RequestInit = {}) =>
    fetch(origin + path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...init.headers },
    });
  const read = (id = workspace.id) =>
    request(`/workspaces/${id}/candidate-review`);
  const consent = (identity: string, key = randomUUID(), id = workspace.id) =>
    request(`/workspaces/${id}/candidate-consents`, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ expectedReviewIdentity: identity }),
    });
  const counts = () =>
    [
      "local_command_consents",
      "local_command_consent_events",
      "runs",
      "events",
    ].map((table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n);
  t.after(async () => {
    const closed = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closed;
    db.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    repo,
    worktrees,
    cwd,
    workspace,
    store,
    db,
    token,
    origin,
    client,
    request,
    read,
    consent,
    counts,
    commit,
  };
}

test("desktop reviews the complete pinned change set and records exact-commit consent without execution", async (t) => {
  const f = await fixture(t);
  const read = async () =>
    value<CandidateReviewView>(
      await f.client.call("candidateReview", [f.workspace.id]),
    );
  const shown = await read();
  assert.equal(shown.headSha, git(f.cwd, "rev-parse", "HEAD"));
  assert.equal(shown.baseSha, f.workspace.local!.baseSha);
  assert.equal(shown.consent, null);
  assert.equal(shown.files.length, 1);
  assert.match(shown.files[0]!.diff, /<script>untrusted/);
  assert.equal(shown.summary.textFiles, 1);
  assert.deepEqual(shown.configuration.config.commands.test!.argv, [
    "node",
    "marker.js",
  ]);
  assert.doesNotMatch(JSON.stringify(shown), /operatorId|observationIdentity/);
  assert.equal(JSON.stringify(shown).includes(f.root), false);
  const key = randomUUID();
  const args = [f.workspace.id, shown.identity, key];
  const receipt = value<CandidateConsentReceiptView>(
    await f.client.call("consentCandidate", args),
  );
  assert.equal(receipt.historical, true);
  assert.equal(receipt.executionAllowed, false);
  assert.equal(receipt.tested, false);
  assert.equal(receipt.headSha, shown.headSha);
  assert.deepEqual(
    value(await f.client.call("consentCandidate", args)),
    receipt,
  );
  const fresh = await read();
  assert.deepEqual(fresh.consent, {
    id: receipt.id,
    createdAt: receipt.createdAt,
  });
  assert.deepEqual(f.counts(), [1, 1, 0, 0]);
  // Same tree, different commit: previous consent is history, not current.
  f.commit();
  const newer = await read();
  assert.notEqual(newer.identity, shown.identity);
  assert.equal(newer.consent, null);
  assert.equal((await f.consent(shown.identity)).status, 409);
  assert.deepEqual(
    value(await f.client.call("consentCandidate", args)),
    receipt,
  );
  assert.equal(f.store.claim(1000), null);
  assert.equal(f.store.claimCommandJob(1000), null);
  assert.equal(existsSync(join(f.cwd, "executed")), false);
  assert.equal(existsSync(join(f.repo, "executed")), false);
  // Restarted store still matches fresh consent and retries need no worktree.
  const restarted = new Store(join(f.root, "store.sqlite"));
  try {
    assert.equal(
      (
        await restarted.localCommandConsents.inspect(
          f.worktrees,
          f.workspace.id,
          "local-desktop",
        )
      ).receipt,
      null,
    );
  } finally {
    restarted.close();
  }
  renameSync(f.cwd, join(f.root, "kept-worktree"));
  assert.deepEqual(
    value(await f.client.call("consentCandidate", args)),
    receipt,
  );
  assert.equal((await f.read()).status, 409);
});

test("candidate inspection shares approved bytes across later bases without reusing workspace consent", async (t) => {
  const f = await fixture(t);
  const first = (await (await f.read()).json()) as CandidateReviewView;
  await f.consent(first.identity);
  git(f.repo, "commit", "--allow-empty", "--quiet", "-m", "later base");
  const sibling = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const view = value<CandidateReviewView>(
    await f.client.call("candidateReview", [sibling.id]),
  );
  assert.equal(view.approvalId, first.approvalId);
  assert.equal(view.configuration.source.baseSha, sibling.local!.baseSha);
  assert.equal(view.consent, null);
  assert.equal(view.files.length, 0);
  assert.equal(
    (await f.consent(first.identity, randomUUID(), sibling.id)).status,
    409,
  );
  assert.equal(
    (await f.consent(view.identity, randomUUID(), sibling.id)).status,
    200,
  );
});

test("dirty, binary, no-test, active, uncertain and stopped candidates cannot receive consent", async (t) => {
  const f = await fixture(t);
  const shown = (await (await f.read()).json()) as CandidateReviewView;
  writeFileSync(join(f.cwd, "notes.txt"), "dirty");
  assert.equal((await f.read()).status, 409);
  assert.equal((await f.consent(shown.identity)).status, 409);
  f.commit();
  writeFileSync(join(f.cwd, "binary.bin"), Buffer.from([0, 255]));
  f.commit();
  const binary = value<CandidateReviewView>(
    await f.client.call("candidateReview", [f.workspace.id]),
  );
  assert.equal(binary.summary.binaryFiles, 1);
  assert.equal((await f.consent(binary.identity)).status, 409);
  assert.deepEqual(f.counts(), [0, 0, 0, 0]);
  const withoutTest = await fixture(t, false);
  const noTest = (await (
    await withoutTest.read()
  ).json()) as CandidateReviewView;
  assert.equal(noTest.configuration.config.commands.test, undefined);
  assert.equal((await withoutTest.consent(noTest.identity)).status, 409);
  const busy = await fixture(t);
  const before = (await (await busy.read()).json()) as CandidateReviewView;
  const run = busy.store.createRun(busy.workspace.id, "test", "agent");
  assert.equal((await busy.read()).status, 409);
  assert.equal((await busy.consent(before.identity)).status, 409);
  busy.store.claim(1000, 1000);
  busy.store.reconcile(2000);
  assert.equal(busy.store.getRun(run.id).status, "needs_attention");
  assert.equal((await busy.consent(before.identity)).status, 409);
  assert.equal(busy.counts()[0], 0);
  const stopped = await fixture(t);
  const stopView = (await (await stopped.read()).json()) as CandidateReviewView;
  stopped.store.setWorkspaceState(stopped.workspace.id, "stopped");
  assert.equal((await stopped.read()).status, 409);
  assert.equal((await stopped.consent(stopView.identity)).status, 409);
});

test("candidate routes reject browser origins, caller authority, malformed requests and disabled service", async (t) => {
  const f = await fixture(t),
    disabled = await fixture(t, true, false);
  const review = (await (await f.read()).json()) as CandidateReviewView;
  for (const [suffix, method] of [
    ["candidate-review", "GET"],
    ["candidate-consents", "POST"],
  ] as const) {
    const path = `/workspaces/${f.workspace.id}/${suffix}`;
    assert.equal(
      (await f.request(path, { method, headers: { Authorization: "wrong" } }))
        .status,
      401,
    );
    assert.equal(
      (
        await f.request(path, {
          method,
          headers: { Origin: "https://example.invalid" },
        })
      ).status,
      403,
    );
    assert.equal((await disabled.request(path, { method })).status, 409);
    assert.equal(
      (await f.request(path + "?revision=HEAD", { method })).status,
      400,
    );
  }
  const path = `/workspaces/${f.workspace.id}/candidate-consents`;
  for (const extra of [
    { operatorId: "forged" },
    { argv: ["sh"] },
    { revision: "HEAD" },
    { path: f.cwd },
    { approvalId: review.approvalId },
  ]) {
    assert.equal(
      (
        await f.request(path, {
          method: "POST",
          headers: { "Idempotency-Key": randomUUID() },
          body: JSON.stringify({
            expectedReviewIdentity: review.identity,
            ...extra,
          }),
        })
      ).status,
      400,
    );
  }
  for (const body of [
    "null",
    "[]",
    "{",
    "{}",
    JSON.stringify({ expectedReviewIdentity: 42 }),
  ])
    assert.equal((await f.request(path, { method: "POST", body })).status, 400);
  assert.equal(
    (await f.request(path, { method: "POST", body: "x".repeat(16385) })).status,
    413,
  );
  assert.equal((await f.read("not-a-uuid")).status, 400);
  assert.equal((await f.read(randomUUID())).status, 404);
  assert.equal((await f.consent("x".repeat(64))).status, 400);
  assert.equal(
    (
      await f.read(
        f.store.createWorkspace("https://github.com/example/test-repo").id,
      )
    ).status,
    409,
  );
  assert.deepEqual(f.counts(), [0, 0, 0, 0]);
});

test("current consent fails closed on corrupt receipts and oversized reviews", async (t) => {
  const f = await fixture(t);
  const shown = (await (await f.read()).json()) as CandidateReviewView;
  await f.consent(shown.identity);
  f.db
    .prepare("UPDATE local_command_consents SET payload_sha256 = ?")
    .run("f".repeat(64));
  assert.equal((await f.read()).status, 409);
  const large = await fixture(t);
  writeFileSync(
    join(large.cwd, "large.txt"),
    "a".repeat(REVIEW_LIMITS.fileBytes + 1),
  );
  large.commit();
  assert.equal((await large.read()).status, 413);
  assert.equal((await large.consent("a".repeat(64))).status, 413);
  assert.deepEqual(large.counts(), [0, 0, 0, 0]);
});

test(
  "disconnect aborts candidate reads and writes; unexpected errors stay redacted",
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t);
    const shown = (await (await f.read()).json()) as CandidateReviewView;
    for (const method of ["inspect", "consent"] as const) {
      let entered!: () => void, finished!: () => void;
      const started = new Promise<void>((resolve) => (entered = resolve)),
        ended = new Promise<void>((resolve) => (finished = resolve));
      const consents = f.store.localCommandConsents;
      const original = consents[method];
      // Intercept only the outer operation to observe the HTTP cancellation signal.
      Object.assign(consents, {
        [method]: async (...args: unknown[]) => {
          const signal = args.at(-1) as AbortSignal;
          entered();
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true }),
          );
          finished();
          signal.throwIfAborted();
        },
      });
      const request = httpRequest(
        `${f.origin}/workspaces/${f.workspace.id}/${method === "inspect" ? "candidate-review" : "candidate-consents"}`,
        {
          method: method === "inspect" ? "GET" : "POST",
          headers: {
            Authorization: `Bearer ${f.token}`,
            "Idempotency-Key": randomUUID(),
          },
        },
      );
      request.on("error", () => {});
      request.end(
        method === "consent"
          ? JSON.stringify({ expectedReviewIdentity: shown.identity })
          : undefined,
      );
      await started;
      request.destroy();
      await ended;
      Object.assign(consents, { [method]: original });
    }
    f.store.localCommandConsents.inspect = async () => {
      throw new Error("private repository details");
    };
    const response = await f.read();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Internal error" });
    assert.deepEqual(f.counts(), [0, 0, 0, 0]);
  },
);

test("bridge validates exact inputs, bounded responses and the long review timeout", async (t) => {
  const f = await fixture(t);
  const shown = (await (await f.read()).json()) as CandidateReviewView;
  const receipt = (await (
    await f.consent(shown.identity)
  ).json()) as CandidateConsentReceiptView;
  const originalFetch = globalThis.fetch,
    originalTimeout = AbortSignal.timeout;
  let payload: unknown = shown;
  const calls: { url: string; init: RequestInit | undefined }[] = [],
    timeouts: number[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json(payload);
  };
  AbortSignal.timeout = (ms) => {
    timeouts.push(ms);
    return new AbortController().signal;
  };
  try {
    for (const args of [
      [],
      ["../path"],
      [f.workspace.id + "\n"],
      [f.workspace.id, "extra"],
      [42],
    ])
      assert.equal((await f.client.call("candidateReview", args)).ok, false);
    for (const args of [
      [],
      [f.workspace.id],
      [f.workspace.id, shown.identity, "not-key"],
      [f.workspace.id, shown.identity, randomUUID() + "\n"],
      [f.workspace.id + "\n", shown.identity, randomUUID()],
      [f.workspace.id, "HEAD", randomUUID()],
      [f.workspace.id, shown.identity, randomUUID(), {}],
    ])
      assert.equal((await f.client.call("consentCandidate", args)).ok, false);
    assert.equal(calls.length, 0);
    assert.deepEqual(
      value(await f.client.call("candidateReview", [f.workspace.id])),
      shown,
    );
    payload = receipt;
    const key = randomUUID();
    value(
      await f.client.call("consentCandidate", [
        f.workspace.id,
        shown.identity,
        key,
      ]),
    );
    assert.deepEqual(timeouts, [
      REVIEW_LIMITS.timeoutMs + 10000,
      REVIEW_LIMITS.timeoutMs + 10000,
    ]);
    assert.equal(
      calls[1]!.init!.body,
      JSON.stringify({ expectedReviewIdentity: shown.identity }),
    );
    assert.equal(
      (calls[1]!.init!.headers as Record<string, string>)["Idempotency-Key"],
      key,
    );
  } finally {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  }
  // Five mode-only changes read 20 MiB, not 40 MiB: the same blob is read once.
  const modes = structuredClone(shown);
  modes.files = Array.from({ length: 5 }, (_, index) => ({
    ...shown.files[0]!,
    path: `mode-${index}.txt`,
    oldMode: "100644" as const,
    newMode: "100755" as const,
    oldBlobId: "a".repeat(40),
    newBlobId: "a".repeat(40),
    oldBytes: REVIEW_LIMITS.fileBytes,
    newBytes: REVIEW_LIMITS.fileBytes,
    diff: "old mode 100644\nnew mode 100755\n",
  }));
  modes.summary = { files: 5, textFiles: 5, binaryFiles: 0 };
  assert.equal(validateCandidateReview(modes, f.workspace.id).files.length, 5);
  const inconsistent = structuredClone(modes);
  inconsistent.files = [{ ...modes.files[0]!, newBytes: 1 }];
  inconsistent.summary = { files: 1, textFiles: 1, binaryFiles: 0 };
  assert.throws(
    () => validateCandidateReview(inconsistent, f.workspace.id),
    /invalid/,
  );
  const corruptions: ((value: any) => void)[] = [
    (x) => (x.workspaceId = randomUUID()),
    (x) => (x.identity = "HEAD"),
    (x) => (x.policyVersion = "future"),
    (x) => (x.configurationState = ["changed"]),
    (x) => (x.tested = true),
    (x) => (x.executionAllowed = true),
    (x) => (x.actor = "forged"),
    (x) => (x.configuration.config.commands.test.argv = "npm test"),
    (x) => (x.configuration.source.baseSha = "f".repeat(40)),
    (x) => x.summary.files++,
    (x) => x.summary.binaryFiles++,
    (x) => (x.files[0].path = "../file"),
    (x) => (x.files[0].oldBlobId = "HEAD"),
    (x) => (x.files[0].newBytes = -1),
    (x) => (x.files[0].oldBytes = REVIEW_LIMITS.fileBytes + 1),
    (x) => (x.files[0].diff = "a".repeat(REVIEW_LIMITS.diffBytes + 1)),
    (x) => (x.files[0].configuration = true),
    (x) => (x.files[0].operatorId = "private"),
    (x) => (x.files[0].binary = true),
    (x) => (x.files[0].oldMode = null),
    (x) => (x.consent = { id: "wrong", createdAt: 0 }),
    (x) => (x.consent = { id: randomUUID(), createdAt: -1 }),
  ];
  for (const corrupt of corruptions) {
    const bad = structuredClone(shown);
    corrupt(bad);
    assert.throws(
      () => validateCandidateReview(bad, f.workspace.id),
      /invalid/,
    );
  }
  for (const extra of [
    { historical: false },
    { executionAllowed: true },
    { tested: true },
    { headSha: "HEAD" },
    { id: "bad" },
    { reviewIdentity: "f".repeat(64) },
    { workspaceId: randomUUID() },
    { createdAt: -1 },
    { actor: "private" },
  ])
    assert.throws(
      () =>
        validateCandidateConsentReceipt(
          { ...receipt, ...extra },
          f.workspace.id,
          shown.identity,
        ),
      /invalid/,
    );
});

test("run-only desktop review records separate consent and rejects responses for the other purpose", async (t) => {
  const f = await fixture(t, false);
  const shown = value<CandidateReviewView>(
    await f.client.call("runCandidateReview", [f.workspace.id]),
  );
  assert.equal(shown.action, "setup-run");
  assert.equal(shown.configuration.config.commands.test, undefined);
  assert.equal(shown.consent, null);
  assert.throws(
    () => validateCandidateReview(shown, f.workspace.id),
    /invalid/,
  );
  const checkReview = value<CandidateReviewView>(
    await f.client.call("candidateReview", [f.workspace.id]),
  );
  assert.throws(
    () => validateCandidateReview(checkReview, f.workspace.id, true),
    /invalid/,
  );
  const key = randomUUID();
  const receipt = value<CandidateConsentReceiptView>(
    await f.client.call("consentRunCandidate", [
      f.workspace.id,
      shown.identity,
      key,
    ]),
  );
  assert.equal(receipt.action, "setup-run");
  assert.deepEqual(
    validateCandidateConsentReceipt(
      receipt,
      f.workspace.id,
      shown.identity,
      true,
    ),
    receipt,
  );
  assert.throws(
    () =>
      validateCandidateConsentReceipt(receipt, f.workspace.id, shown.identity),
    /invalid/,
  );
  assert.equal(
    (
      await f.client.call("consentCandidate", [
        f.workspace.id,
        shown.identity,
        key,
      ])
    ).ok,
    false,
  );
  const reread = value<CandidateReviewView>(
    await f.client.call("runCandidateReview", [f.workspace.id]),
  );
  assert.equal(reread.consent?.id, receipt.id);
  assert.equal(
    value<CandidateReviewView>(
      await f.client.call("candidateReview", [f.workspace.id]),
    ).consent,
    null,
  );
  assert.deepEqual(f.counts(), [1, 1, 0, 0]);
  assert.equal(existsSync(join(f.cwd, "executed")), false);
  for (const [method, args] of [
    ["runCandidateReview", [f.workspace.id, "HEAD"]],
    ["consentRunCandidate", [f.workspace.id, shown.identity, key, ["node"]]],
  ] as const)
    assert.equal((await f.client.call(method, args)).ok, false);
  const disabled = await fixture(t, false, false);
  assert.equal(
    (await disabled.client.call("runCandidateReview", [disabled.workspace.id]))
      .ok,
    false,
  );
  assert.equal(
    (
      await disabled.client.call("consentRunCandidate", [
        disabled.workspace.id,
        shown.identity,
        key,
      ])
    ).ok,
    false,
  );
});
