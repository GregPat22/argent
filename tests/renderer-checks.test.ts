import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeDocument, loadRenderer, settle } from "./renderer-loader.js";
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
      getItem: (key: string) =>
        key === "argent.selection"
          ? JSON.stringify({ workspaceId: "one" })
          : null,
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
  return {
    element,
    reads,
    cancels,
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
