import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  CandidateReviewView,
  CandidateConsentReceiptView,
} from "../src/desktop/contracts.js";
import { fakeDocument, loadRenderer, settle } from "./renderer-loader.js";

const base = "a".repeat(40),
  identity = "c".repeat(64);
const config = {
  kind: "local-command-config" as const,
  config: {
    version: 1 as const,
    commands: {
      setup: { argv: ["npm", "ci"] },
      test: { argv: ["node", "test.js"] },
    },
  },
  source: {
    path: "argent.json" as const,
    baseSha: base,
    blobId: "b".repeat(40),
    sha256: "d".repeat(64),
  },
  approvalCandidate: {
    identity,
    policyVersion: "argent-local-commands-v1" as const,
  },
};
const review = (workspaceId = "one"): CandidateReviewView => ({
  kind: "local-candidate-review",
  workspaceId,
  identity,
  policyVersion: "argent-local-command-review-v1",
  baseSha: base,
  headSha: "e".repeat(40),
  treeId: "f".repeat(40),
  configurationState: "changed",
  configuration: config,
  approvalId: "approval",
  summary: { files: 2, textFiles: 2, binaryFiles: 0 },
  files: [
    {
      path: "argent.json",
      previousPath: null,
      status: "modified",
      oldMode: "100644",
      newMode: "100755",
      oldBlobId: "1".repeat(40),
      newBlobId: "2".repeat(40),
      oldBytes: 100,
      newBytes: 200,
      configuration: true,
      binary: false,
      diff: "--- argent.json\n+++ argent.json\n-npm test\n+<script>alert(1)</script>\n+\t\u202e\u200b\\t\n",
    },
    {
      path: "new\nname",
      previousPath: 'old"name',
      status: "renamed",
      oldMode: "120000",
      newMode: "120000",
      oldBlobId: "3".repeat(40),
      newBlobId: "3".repeat(40),
      oldBytes: 3,
      newBytes: 3,
      configuration: false,
      binary: false,
      diff: "",
    },
  ],
  consent: null,
  executionAllowed: false,
  tested: false,
});
const receipt: CandidateConsentReceiptView = {
  kind: "local-candidate-consent-receipt",
  workspaceId: "one",
  id: "consent",
  reviewIdentity: identity,
  headSha: "e".repeat(40),
  createdAt: 1000,
  historical: true,
  executionAllowed: false,
  tested: false,
};
interface Deferred<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  args: unknown[];
}
async function launch() {
  const { element, document } = fakeDocument();
  let online = true,
    timer: (() => void) | undefined,
    keys = 0;
  const reads: Deferred<CandidateReviewView>[] = [],
    writes: Deferred<CandidateConsentReceiptView>[] = [];
  const workspaces = ["one", "two"].map((id) => ({
    id,
    provider: "local-worktree",
    repository: "/repo",
    state: "running",
    createdAt: 1,
    local: {
      repositoryPath: "/repo",
      worktreePath: `/worktrees/${id}`,
      branch: `argent/${id}`,
      baseSha: base,
    },
  }));
  loadRenderer({
    Error,
    Map,
    crypto: { randomUUID: () => `key-${++keys}` },
    document,
    window: {
      argent: {
        status: async () => ({ connected: online }),
        listWorkspaces: async () => ({ items: workspaces, nextCursor: null }),
        listRuns: async () => ({ items: [], nextCursor: null }),
        commandConfiguration: async (workspaceId: string) => ({
          kind: "local-command-configuration",
          workspaceId,
          configuration: config,
          approval: { id: "approval", approvedAt: 1 },
          executionAllowed: false,
        }),
        candidateReview: (...args: unknown[]) =>
          new Promise<CandidateReviewView>((resolve, reject) =>
            reads.push({ resolve, reject, args }),
          ),
        consentCandidate: (...args: unknown[]) =>
          new Promise<CandidateConsentReceiptView>((resolve, reject) =>
            writes.push({ resolve, reject, args }),
          ),
      },
      addEventListener() {},
    },
    localStorage: {
      getItem: (key: string) =>
        key === "argent.selection"
          ? JSON.stringify({ workspaceId: "one" })
          : null,
      setItem() {},
      removeItem() {},
    },
    setTimeout: (callback: () => void) => {
      timer = callback;
      return 1;
    },
    clearTimeout: () => {
      timer = undefined;
    },
  });
  await settle();
  const app = {
    element,
    reads,
    writes,
    status: () => element("candidate-status").textContent,
    async open() {
      element("workspace-commands").click();
      await settle();
      assert.equal(element("commands-review").disabled, false);
      element("commands-review").click();
    },
    async show(shown = review()) {
      await app.open();
      reads.at(-1)!.resolve(shown);
      await settle();
    },
    async poll(value = online) {
      online = value;
      assert.ok(timer);
      timer();
      await settle();
    },
    async select(id: string) {
      const row = element("workspace-list").find(
        (e) => e.dataset.workspaceId === id,
      );
      assert.ok(row);
      row.click();
      await settle();
    },
  };
  return app;
}

test("candidate dialog shows all text, command arguments and change metadata literally without polling the repository", async () => {
  const app = await launch();
  assert.equal(app.reads.length, 0);
  await app.show();
  assert.equal(app.element("commands-dialog").open, false);
  assert.equal(app.element("candidate-dialog").open, true);
  const shown = app.element("candidate-files").text;
  for (const expected of [
    base,
    "e".repeat(40),
    "f".repeat(40),
    '"npm"',
    '"ci"',
    '"node"',
    '"test.js"',
    "100644",
    "100755",
    "120000",
    "1".repeat(40),
    "2".repeat(40),
    "100 bytes",
    "200 bytes",
    "configuration",
    "<script>alert(1)</script>",
    "\\t\\u202e\\u200b\\\\t",
    '"new\\nname"',
    '"old\\"name"',
  ])
    assert.ok(shown.includes(expected), expected);
  assert.doesNotMatch(shown, /[\u202e\u200b]/);
  assert.equal(
    app
      .element("candidate-files")
      .find(
        (e) => e.textContent.includes("<script>") && e.children.length !== 0,
      ),
    undefined,
  );
  assert.equal(app.element("candidate-consent").disabled, false);
  await app.poll();
  await app.poll();
  assert.equal(app.reads.length, 1);
  assert.equal(app.writes.length, 0);
  app.element("candidate-refresh").click();
  assert.equal(app.element("candidate-content").hidden, true);
  assert.equal(app.element("candidate-consent").disabled, true);
  app.element("candidate-refresh").fire("click");
  assert.equal(app.reads.length, 2);
});

test("consent sends only the displayed review identity and refreshes before showing a current match", async () => {
  const app = await launch();
  await app.show();
  app.element("candidate-consent").click();
  app.element("candidate-consent").fire("click");
  assert.deepEqual(app.writes[0]!.args, ["one", identity, "key-1"]);
  assert.equal(app.writes.length, 1);
  assert.equal(app.element("candidate-refresh").disabled, true);
  assert.equal(app.element("candidate-close").focused, true);
  app.writes[0]!.resolve(receipt);
  await settle();
  assert.equal(app.reads.length, 2);
  assert.equal(app.element("candidate-content").hidden, true);
  assert.doesNotMatch(
    app.element("candidate-consent-status").textContent,
    /recorded/,
  );
  app.reads[1]!.resolve({
    ...review(),
    consent: { id: "consent", createdAt: 1000 },
  });
  await settle();
  assert.match(app.status(), /matches this reading.*does not run checks/);
  assert.equal(app.element("candidate-consent").disabled, true);
  app.element("candidate-consent").fire("click");
  assert.equal(app.writes.length, 1);
  app.element("candidate-dialog").fire("cancel");
  assert.equal(app.element("candidate-dialog").open, false);
  assert.equal(app.element("workspace-commands").focused, true);
});

test("binary and no-test reviews remain readable but cannot be consented to; failures show no partial review", async () => {
  const app = await launch();
  const binary = structuredClone(review());
  binary.files = [{ ...binary.files[0]!, binary: true, diff: "" }];
  binary.summary = { files: 1, textFiles: 0, binaryFiles: 1 };
  await app.show(binary);
  assert.match(app.status(), /Binary.*cannot receive consent/);
  assert.match(app.element("candidate-files").text, /not displayed/);
  assert.equal(app.element("candidate-consent").disabled, true);
  app.element("candidate-consent").fire("click");
  assert.equal(app.writes.length, 0);
  app.element("candidate-refresh").click();
  const noTest = structuredClone(review());
  noTest.configuration = {
    ...noTest.configuration,
    config: { version: 1, commands: { setup: { argv: ["npm", "ci"] } } },
  };
  app.reads.at(-1)!.resolve(noTest);
  await settle();
  assert.match(app.status(), /no test command/);
  assert.equal(app.element("candidate-consent").disabled, true);
  for (const error of [
    "Request rejected (409): Workspace does not match an approved clean commit",
    "Request rejected (413): Candidate review exceeds inspection limits",
    "Request rejected (409): Consent requires an idle local workspace",
  ]) {
    app.element("candidate-refresh").click();
    app.reads.at(-1)!.reject(new Error(error));
    await settle();
    assert.equal(app.element("candidate-content").hidden, true);
    assert.equal(app.element("candidate-consent").disabled, true);
    assert.equal(
      app.status(),
      error.replace(/^Request rejected \(\d+\): /, ""),
    );
  }
  app.element("candidate-refresh").click();
  app.reads.at(-1)!.resolve({ ...review(), baseSha: "9".repeat(40) });
  await settle();
  assert.match(app.status(), /different workspace or base/);
});

test("uncertain and rejected consent retries preserve the key for exactly that review", async () => {
  const app = await launch();
  await app.show();
  for (const error of [
    "Service unavailable",
    "Request rejected (409): Candidate changed",
  ]) {
    app.element("candidate-consent").click();
    app.writes.at(-1)!.reject(new Error(error));
    await settle();
    assert.match(app.status(), /Refresh/);
    assert.equal(app.element("candidate-content").hidden, true);
    app.element("candidate-refresh").click();
    app.reads.at(-1)!.resolve(review());
    await settle();
  }
  app.element("candidate-consent").click();
  assert.deepEqual(
    app.writes.map((w) => w.args[2]),
    ["key-1", "key-1", "key-1"],
  );
  app.writes.at(-1)!.reject(new Error("Changed"));
  await settle();
  app.element("candidate-refresh").click();
  app.reads.at(-1)!.resolve({ ...review(), identity: "f".repeat(64) });
  await settle();
  app.element("candidate-consent").click();
  assert.deepEqual(app.writes.at(-1)!.args, ["one", "f".repeat(64), "key-2"]);
});

test("close, workspace change and disconnect invalidate late candidate responses, receipts and errors", async () => {
  const app = await launch();
  await app.open();
  app.element("candidate-close").click();
  await app.open();
  app.reads[0]!.resolve(review());
  await settle();
  assert.equal(app.element("candidate-content").hidden, true);
  app.reads[1]!.resolve(review());
  await settle();
  app.element("candidate-consent").click();
  await app.select("two");
  assert.equal(app.element("candidate-dialog").open, false);
  await app.open();
  app.writes[0]!.resolve(receipt);
  await settle();
  assert.equal(app.reads.length, 3);
  app.reads[2]!.resolve(review("one"));
  await settle();
  assert.match(app.status(), /different workspace/);
  app.element("candidate-refresh").click();
  await app.poll(false);
  app.reads[3]!.resolve(review("two"));
  await settle();
  assert.equal(app.element("candidate-content").hidden, true);
  assert.match(app.status(), /disconnected/);
  await app.poll(true);
  assert.match(app.status(), /reconnected\. Refresh/);
  assert.equal(app.reads.length, 4);
  app.element("candidate-refresh").click();
  app.reads[4]!.resolve(review("two"));
  await settle();
  app.element("candidate-consent").click();
  await app.poll(false);
  await app.poll(true);
  app.writes[1]!.reject(new Error("Request rejected (409): Old failure"));
  await settle();
  assert.doesNotMatch(app.status(), /Old failure/);
});
