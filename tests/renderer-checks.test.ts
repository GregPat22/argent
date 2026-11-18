import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fakeDocument,
  loadRenderer,
  settle,
  openWorkspace,
} from "./renderer-loader.js";
import type { LocalCheckView } from "../src/local-checks.js";

function view(
  freshness: LocalCheckView["freshness"] = "current",
): LocalCheckView {
  return {
    kind: "local-check",
    id: "check",
    workspaceId: "one",
    headSha: "a".repeat(40),
    createdAt: 1,
    status: "completed",
    freshness,
    result: {
      policy: "argent-local-check-v1",
      headSha: "a".repeat(40),
      baseSha: "b".repeat(40),
      treeId: "c".repeat(40),
      consentId: "consent",
      reviewIdentity: "d".repeat(64),
      configurationIdentity: "e".repeat(64),
      outcome: "passed",
      phases: [
        {
          action: "test",
          argv: ["node", "<script>\n\u202e"],
          outcome: "exited",
          exitCode: 0,
          signal: null,
          startedAt: 1,
          durationMs: 2,
          stdout: { bytes: 10, sha256: "f".repeat(64) },
          stderr: { bytes: 0, sha256: "0".repeat(64) },
        },
      ],
    },
  };
}
async function launch() {
  const { element, document } = fakeDocument();
  const reads: {
    resolve(value: LocalCheckView | null): void;
    reject(error: Error): void;
  }[] = [];
  const runReads: typeof reads = [];
  const runCancels: unknown[][] = [];
  let online = true,
    tick = () => {};
  const cancels: unknown[][] = [];
  const workspaces = ["one", "two"].map((id) => ({
    id,
    repository: "/repo",
    provider: "local-worktree",
    state: "running",
    createdAt: 1,
    local: {
      repositoryPath: "/repo",
      worktreePath: `/trees/${id}`,
      branch: `argent/${id}`,
      baseSha: "b".repeat(40),
    },
  }));
  loadRenderer({
    Error,
    Map,
    crypto: { randomUUID: () => "key" },
    document,
    window: {
      addEventListener() {},
      argent: {
        status: async () => ({ connected: online }),
        listWorkspaces: async () => ({ items: workspaces, nextCursor: null }),
        listRuns: async () => ({ items: [], nextCursor: null }),
        latestRunAction: () =>
          new Promise<LocalCheckView | null>((resolve, reject) =>
            runReads.push({ resolve, reject }),
          ),
        cancelRunAction: async (...args: unknown[]) => {
          runCancels.push(args);
          return {
            ...view(),
            kind: "local-run-action",
            status: "cancelled",
            result: null,
          };
        },
        latestCheck: () =>
          new Promise<LocalCheckView | null>((resolve, reject) =>
            reads.push({ resolve, reject }),
          ),
        cancelCheck: async (...args: unknown[]) => {
          cancels.push(args);
          return { ...view(), status: "cancelled", result: null };
        },
      },
    },
    localStorage: {
      getItem: () => null,
      setItem() {},
      removeItem() {},
    },
    setInterval: () => {},
    clearInterval: () => {},
    setTimeout: (fn: () => void) => {
      tick = fn;
      return 1;
    },
    clearTimeout: () => {},
  });
  await settle();
  await settle();
  await openWorkspace(element, "one");
  return {
    element,
    reads,
    cancels,
    runReads,
    runCancels,
    disconnect: async () => {
      online = false;
      tick();
      await settle();
    },
    open: async () => {
      element("workspace-checks").fire("click");
      await settle();
    },
  };
}

test("check results show literal commands, explicit freshness and read only on request", async () => {
  const app = await launch();
  assert.equal(app.reads.length, 0);
  await app.open();
  app.reads[0]!.resolve(view());
  await settle();
  assert.match(
    app.element("checks-status").textContent,
    /Checks passed.*matches this reading/,
  );
  assert.match(app.element("checks-result").text, /<script>\\n\\u202e/);
  assert.match(
    app.element("checks-result").text,
    /Raw command output is not retained/,
  );
  app.element("checks-refresh").fire("click");
  assert.equal(app.element("checks-result").text, "");
  app.reads[1]!.resolve(view("stale"));
  await settle();
  assert.match(
    app.element("checks-status").textContent,
    /Checks passed.*stale/,
  );
  assert.equal(app.element("checks-cancel").disabled, true);
});

test("close and disconnect discard late check results; cancel is an explicit request", async () => {
  const app = await launch();
  await app.open();
  app.element("checks-close").fire("click");
  app.reads[0]!.resolve(view());
  await settle();
  assert.equal(app.element("checks-result").text, "");
  await app.open();
  app.reads[1]!.resolve({
    ...view(),
    result: null,
    status: "running",
    freshness: "unknown",
  });
  await settle();
  assert.equal(app.element("checks-cancel").disabled, false);
  app.element("checks-cancel").fire("click");
  await settle();
  assert.deepEqual(app.cancels, [["one", "check"]]);
  await app.disconnect();
  app.reads[2]!.resolve(view());
  await settle();
  assert.equal(app.element("checks-result").text, "");
  assert.match(app.element("checks-status").textContent, /Disconnected/);
});

test("run outcomes stay separate from test evidence and discard results from the other dialog purpose", async () => {
  const app = await launch();
  await app.open();
  app.element("checks-close").click();
  app.element("workspace-run-action").click();
  app.reads[0]!.resolve(view());
  await settle();
  assert.equal(app.element("checks-result").text, "");
  const run = view();
  run.kind = "local-run-action";
  run.result!.policy = "argent-local-run-v1";
  run.result!.outcome = "succeeded";
  run.result!.phases[0]!.action = "run";
  app.runReads[0]!.resolve(run);
  await settle();
  assert.match(
    app.element("checks-status").text,
    /Run command succeeded.*not test evidence/,
  );
  assert.doesNotMatch(app.element("checks-status").text, /Checks passed/);
  app.element("checks-refresh").click();
  app.runReads[1]!.resolve({
    ...run,
    status: "running",
    result: null,
    freshness: "unknown",
  });
  await settle();
  app.element("checks-cancel").click();
  await settle();
  assert.deepEqual(app.runCancels, [["one", "check"]]);
  assert.equal(app.cancels.length, 0);
  await app.disconnect();
  app.runReads[2]!.resolve(run);
  await settle();
  assert.equal(app.element("checks-result").text, "");
});

test("a failed setup says the selected command never started, and interrupted work says it stays blocked", async () => {
  const app = await launch();
  await app.open();
  const setupFailed = view();
  setupFailed.status = "failed";
  setupFailed.result!.outcome = "failed";
  setupFailed.result!.phases[0]!.action = "setup";
  setupFailed.result!.phases[0]!.exitCode = 7;
  app.reads[0]!.resolve(setupFailed);
  await settle();
  assert.match(
    app.element("checks-status").text,
    /^Checks failed · setup failed, test did not run · matches this reading\. Refresh/,
  );
  app.element("checks-refresh").click();
  app.reads[1]!.resolve({
    ...view(),
    status: "needs_attention",
    result: null,
    freshness: "unknown",
  });
  await settle();
  const interrupted = app.element("checks-status").text;
  assert.match(interrupted, /^Check interrupted · needs attention\./);
  assert.match(interrupted, /commands may still be running/);
  assert.match(interrupted, /planned, not available/);
  assert.doesNotMatch(interrupted, /\.\./);
  app.element("checks-close").click();
  app.element("workspace-run-action").click();
  const run = view();
  run.kind = "local-run-action";
  run.status = "failed";
  run.result!.policy = "argent-local-run-v1";
  run.result!.outcome = "failed";
  run.result!.phases[0]!.action = "setup";
  run.result!.phases[0]!.exitCode = 7;
  app.runReads[0]!.resolve(run);
  await settle();
  assert.match(
    app.element("checks-status").text,
    /^Run command did not start · setup failed · not test evidence/,
  );
  assert.doesNotMatch(app.element("checks-status").text, /Run command failed/);
});
