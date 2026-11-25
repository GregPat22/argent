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
  // Readings while the dialog is closed are the header badge's.
  const badgeReads: typeof reads = [];
  // Re-reading of active work, kept apart from the app's refresh timer.
  const polls: (() => void)[] = [];
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
            (element("checks-dialog").open ? reads : badgeReads).push({
              resolve,
              reject,
            }),
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
    setTimeout: (fn: () => void, ms: number) => {
      if (ms === 3000) polls.push(fn);
      else tick = fn;
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
    badgeReads,
    polls,
    disconnect: async () => {
      online = false;
      tick();
      await settle();
    },
    reconnect: async () => {
      online = true;
      tick();
      await settle();
    },
    open: async () => {
      element("workspace-checks").fire("click");
      await settle();
    },
  };
}

test("check results show literal commands, explicit freshness and the dialog reads on open and Refresh", async () => {
  const app = await launch();
  assert.equal(app.reads.length, 0);
  assert.equal(app.badgeReads.length, 1, "the badge reads once on opening");
  await app.open();
  app.reads[0]!.resolve(view());
  await settle();
  assert.match(
    app.element("checks-status").textContent,
    /Checks passed.*matches this reading/,
  );
  // Green only for a pass that matches this reading.
  assert.match(app.element("checks-status").className, /verdict-passed/);
  assert.ok(
    app
      .element("checks-result")
      .find(
        (e) =>
          e.className === "phase-digests" && e.text.includes("f".repeat(64)),
      ),
  );
  assert.match(app.element("checks-result").text, /count not recorded/);
  assert.match(app.element("checks-result").text, /<script>\\n\\u202e/);
  assert.match(
    app.element("checks-result").text,
    /Raw command output is not retained/,
  );
  app.element("checks-refresh").fire("click");
  assert.equal(app.element("checks-result").text, "");
  const stale = view("stale");
  stale.result!.judgingChangeCount = 3;
  app.reads[1]!.resolve(stale);
  await settle();
  assert.match(
    app.element("checks-status").textContent,
    /Checks passed.*stale/,
  );
  assert.doesNotMatch(app.element("checks-status").className, /verdict-passed/);
  assert.match(app.element("checks-status").className, /verdict-neutral/);
  assert.match(app.element("checks-result").text, /3 reported judging changes/);
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

test("switching workspaces returns each conversation to where it was left and shows no empty state before reading", async () => {
  const app = await launch();
  const scroller = app.element("conversation");
  scroller.scrollHeight = 1000;
  scroller.clientHeight = 200;
  scroller.scrollTop = 300;
  const row = (id: string) =>
    app.element("workspace-list").find((e) => e.dataset.workspaceId === id)!;
  row("two").click();
  // Nothing is read yet, so the empty state must not claim the branch is fresh.
  assert.equal(app.element("detail-empty").hidden, true);
  await settle();
  assert.equal(app.element("detail-empty").hidden, false);
  assert.equal(
    scroller.scrollTop,
    1000,
    "an unvisited workspace opens at the end",
  );
  row("one").click();
  await settle();
  assert.equal(scroller.scrollTop, 300, "a visited workspace keeps its place");
  assert.match(
    app.element("conversation-column").className,
    /\bconversation-arrive\b/,
  );
});

test("the Checks button shows the latest check at a glance and follows a running check", async () => {
  const app = await launch();
  const dot = app.element("checks-badge");
  const button = app.element("workspace-checks");
  app.badgeReads[0]!.resolve({
    ...view(),
    status: "running",
    result: null,
    freshness: "unknown",
  });
  await settle();
  assert.equal(dot.hidden, false);
  assert.match(dot.className, /check-badge-running/);
  assert.match(
    button.getAttribute("aria-label")!,
    /Checks · running, started .+ · \d+ min so far/,
  );
  // A running check is read again on its own, then shows its outcome.
  assert.equal(app.polls.length, 1);
  app.polls.shift()!();
  await settle();
  app.badgeReads[1]!.resolve(view());
  await settle();
  assert.match(dot.className, /check-badge-passed/);
  assert.match(
    button.getAttribute("aria-label")!,
    /passed, matches the reading at/,
  );
  assert.equal(app.polls.length, 0, "a finished check is not read again");
  // Only a pass that matches the current reading is green.
  await app.disconnect();
  assert.equal(dot.hidden, true, "disconnecting clears the badge");
  await app.reconnect();
  app.badgeReads[2]!.resolve(view("stale"));
  await settle();
  assert.match(dot.className, /check-badge-neutral/);
  assert.match(button.getAttribute("aria-label")!, /passed, stale at/);
  // Another workspace shows nothing until its own reading arrives.
  await openWorkspace(app.element, "two");
  assert.equal(dot.hidden, true);
  assert.equal(app.badgeReads.length, 4);
});

test("an open dialog follows a running check without clearing what it shows", async () => {
  const app = await launch();
  app.badgeReads[0]!.resolve(null);
  await app.open();
  app.reads[0]!.resolve({
    ...view(),
    status: "running",
    result: null,
    freshness: "unknown",
  });
  await settle();
  // A long check shows when it started and how long it has run.
  assert.match(
    app.element("checks-status").textContent,
    /Check running · started .+ · \d+ min so far\. Updates on its own/,
  );
  const shown = app.element("checks-result").children[0];
  assert.ok(shown);
  const running = () => ({
    ...view(),
    createdAt: Date.now() - 125_000,
    status: "running" as const,
    result: null,
    freshness: "unknown" as const,
  });
  // Fires every pending re-read (the dialog's and the badge's) and answers it.
  const tick = async (answer: () => LocalCheckView) => {
    const before = app.reads.length;
    for (const fire of app.polls.splice(0)) fire();
    await settle();
    assert.ok(app.reads.length > before, "active work is read again");
    for (const read of app.reads.slice(before)) read.resolve(answer());
    await settle();
  };
  await tick(running);
  // An unchanged reading is not redrawn, so nothing flickers or scrolls; only
  // the elapsed time moves.
  assert.equal(app.element("checks-result").children[0], shown);
  assert.match(app.element("checks-status").textContent, /2 min so far/);
  assert.equal(app.element("checks-cancel").hidden, false);
  await tick(() => view());
  assert.match(
    app.element("checks-status").textContent,
    /Checks passed.*matches this reading. Refresh to read again/,
  );
  assert.equal(app.polls.length, 0, "a finished check is not read again");
  assert.equal(app.element("checks-cancel").hidden, true);
});
