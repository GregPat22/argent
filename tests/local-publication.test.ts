import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Store } from "../src/store.js";
import { makeServer } from "../src/http.js";
import { reviewLocalCommandCandidate } from "../src/local-command-review.js";
import { localCheckFixture as fixture, git } from "./local-check-fixture.js";
import type {
  PublicationTarget,
  PublicationTransport,
} from "../src/github-publisher.js";
import { LocalPublications } from "../src/local-publication.js";
import type {
  PublicationReview,
  PublicationStatus,
} from "../src/publication-record.js";

async function publicationFixture(t: TestContext, check = false) {
  const f = await fixture(t);
  for (const text of ["intermediate fixture bytes", "final bytes"]) {
    writeFileSync(join(f.directory, "file.txt"), text);
    git(f.directory, "commit", "--quiet", "-am", "Fixture change");
  }
  const candidate = await reviewLocalCommandCandidate(
    f.store,
    f.worktrees,
    f.id,
    "operator",
  );
  if (check) {
    const consent = await f.store.localCommandConsents.consent(
      f.worktrees,
      f.id,
      "operator",
      candidate.identity,
      "publish-test-consent",
    );
    await f.store.localChecks.enqueue(
      f.worktrees,
      f.id,
      "operator",
      consent.id,
      "publish-test-run",
    );
    assert.equal(await f.worker.tick(), true);
  }
  const input = {
    reviewIdentity: candidate.identity,
    repository: "example/your-test-repo",
    baseBranch: "main",
    title: "Review fixture changes",
  };
  const url = "https://github.com/example/your-test-repo/pull/17";
  const effects: string[] = [];
  let observed: PublicationTarget | undefined;
  const transport: PublicationTransport = {
    async preflight(target) {
      observed = target;
      effects.push("preflight");
    },
    async push(worktree, target, beforePush) {
      await beforePush();
      assert.equal(worktree, f.directory);
      assert.equal(target, observed);
      assert.equal(f.store.publicationStatus(f.id)?.phase, "push");
      effects.push("push");
    },
    async confirmHead(target) {
      assert.equal(target, observed);
      effects.push("confirm-head");
    },
    async createDraft(target) {
      assert.equal(target, observed);
      assert.equal(f.store.publicationStatus(f.id)?.phase, "draft");
      effects.push("draft");
      return url;
    },
    async verifyDraft(target, result) {
      assert.equal(target, observed);
      assert.equal(result, url);
      effects.push("verify");
    },
  };
  const token = randomUUID();
  const shutdown = new AbortController();
  const publications = new LocalPublications(transport, shutdown.signal);
  const server = makeServer(f.store, token, {
    worktreeRoot: f.worktrees,
    localCommandOperatorId: "operator",
    localChecks: true,
    publisher: publications,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}/workspaces/${f.id}/publication`;
  const api = (suffix: string, payload?: unknown) =>
    fetch(endpoint + suffix, {
      method: payload === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
  const prepare = async () => {
    const response = await api("/review", input);
    assert.equal(response.status, 200);
    return (await response.json()) as PublicationReview;
  };
  return {
    ...f,
    input,
    url,
    effects,
    transport,
    api,
    prepare,
    shutdown,
    publications,
  };
}

test("publication reviews two commits locally and records exactly one verified GitHub draft across reconnects", async (t) => {
  const f = await publicationFixture(t, true),
    review = await f.prepare();
  assert.equal(review.commitCount, 2);
  assert.equal(review.headSha, git(f.directory, "rev-parse", "HEAD"));
  assert.equal(review.baseSha, f.workspace.local!.baseSha);
  assert.equal(review.branch, f.workspace.local!.branch);
  assert.match(review.body, /### Judging changes/);
  assert.match(review.body, /Checks passed for the reviewed commit/);
  assert.equal(await (await f.api("")).json(), null);
  assert.deepEqual(f.effects, []);
  const confirm = { ...f.input, identity: review.identity };
  assert.equal(
    (await f.api("", { ...confirm, title: "Different title" })).status,
    409,
  );
  assert.equal(
    (await f.api("", { ...confirm, auth: "caller credential" })).status,
    400,
  );
  assert.deepEqual(f.effects, []);
  const response = await f.api("", confirm);
  assert.equal(response.status, 200);
  const receipt = (await response.json()) as PublicationStatus;
  assert.equal(receipt.status, "published");
  assert.equal(receipt.url, f.url);
  assert.equal(receipt.headSha, review.headSha);
  assert.equal(
    (await f.api("", { ...confirm, title: "Another draft" })).status,
    409,
  );
  assert.deepEqual(await (await f.api("", confirm)).json(), receipt);
  const restarted = new Store(f.database);
  f.connections.push(restarted);
  assert.deepEqual(restarted.publicationStatus(f.id), receipt);
  assert.equal(restarted.getWorkspace(f.id).state, "running");
  assert.deepEqual(f.effects, [
    "preflight",
    "push",
    "confirm-head",
    "draft",
    "verify",
  ]);
});

test("publication preflight rereads the candidate before a push and records no write on mismatch", async (t) => {
  const f = await publicationFixture(t),
    review = await f.prepare();
  f.transport.preflight = async () => {
    writeFileSync(join(f.directory, "file.txt"), "changed after review");
  };
  const response = await f.api("", { ...f.input, identity: review.identity });
  assert.equal(response.status, 409);
  assert.equal(f.store.publicationStatus(f.id), null);
  assert.deepEqual(f.effects, []);
});

test("publication intent survives an unknown push and an unverified draft without replay", async (t) => {
  for (const phase of ["push", "draft"] as const) {
    const f = await publicationFixture(t),
      review = await f.prepare();
    if (phase === "push")
      f.transport.confirmHead = async () => {
        throw new Error("fixture lost response");
      };
    else
      f.transport.verifyDraft = async () => {
        throw new Error("fixture returned a different draft");
      };
    const confirm = { ...f.input, identity: review.identity };
    const result = (await (
      await f.api("", confirm)
    ).json()) as PublicationStatus;
    assert.equal(result.status, "needs_attention");
    assert.equal(result.phase, phase);
    assert.equal(result.url, null);
    const restarted = new Store(f.database);
    f.connections.push(restarted);
    assert.deepEqual(restarted.publicationStatus(f.id), result);
    assert.throws(
      () => restarted.setWorkspaceState(f.id, "running"),
      /needs attention/,
    );
    assert.throws(
      () => restarted.lifecycle.request(f.id, "create", "during-publication"),
      /needs attention/,
    );
    const attempts = f.effects.slice();
    assert.deepEqual(await (await f.api("", confirm)).json(), result);
    assert.deepEqual(await (await f.api("")).json(), result);
    assert.deepEqual(f.effects, attempts);
  }
});

test("publication preparation failure leaves the workspace usable for a fresh explicit confirmation", async (t) => {
  const f = await publicationFixture(t),
    review = await f.prepare();
  const original = f.transport.push;
  f.transport.push = async () => {
    throw new Error("fixture refused pack before dispatch");
  };
  const input = { ...f.input, identity: review.identity };
  assert.equal((await f.api("", input)).status, 409);
  assert.equal(f.store.publicationStatus(f.id), null);
  assert.equal(f.store.getWorkspace(f.id).state, "running");
  f.transport.push = original;
  assert.equal(
    ((await (await f.api("", input)).json()) as PublicationStatus).status,
    "published",
  );
});

test("publication overlap while push is running reads the existing intent", async (t) => {
  const f = await publicationFixture(t),
    review = await f.prepare();
  let start!: () => void, finish!: () => void;
  const entered = new Promise<void>((resolve) => {
      start = resolve;
    }),
    gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
  const push = f.transport.push.bind(f.transport);
  f.transport.push = async (...args) => {
    await push(...args);
    start();
    await gate;
  };
  const confirm = { ...f.input, identity: review.identity };
  const owner = f.api("", confirm);
  try {
    await entered;
    const duplicate = (await (
      await f.api("", confirm)
    ).json()) as PublicationStatus;
    assert.equal(duplicate.phase, "push");
  } finally {
    finish();
  }
  const receipt = (await (await owner).json()) as PublicationStatus;
  assert.equal(receipt.status, "published");
  assert.deepEqual(f.effects, [
    "preflight",
    "push",
    "confirm-head",
    "draft",
    "verify",
  ]);
});

test("publication service shutdown after push keeps the durable intent and starts no draft", async (t) => {
  const f = await publicationFixture(t),
    review = await f.prepare();
  const push = f.transport.push.bind(f.transport);
  f.transport.push = async (...args) => {
    await push(...args);
    f.shutdown.abort();
  };
  const result = (await (
    await f.api("", { ...f.input, identity: review.identity })
  ).json()) as PublicationStatus;
  await f.publications.drain();
  assert.equal(result.phase, "push");
  assert.equal(result.status, "needs_attention");
  assert.deepEqual(f.effects, ["preflight", "push"]);
});
