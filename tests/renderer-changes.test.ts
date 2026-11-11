import assert from "node:assert/strict";
import { test } from "node:test";
import type { Workspace, WorkspaceChanges } from "../src/domain.js";
import { fakeDocument, loadRenderer, settle } from "./renderer-loader.js";

const workspace = (id: string): Workspace => ({
  id,
  provider: "local-worktree",
  repository: "/repo",
  state: "running",
  createdAt: 1,
  local: {
    repositoryPath: "/repo",
    worktreePath: `/worktrees/${id}`,
    branch: `argent/${id}`,
    baseSha: "a".repeat(40),
  },
});
const changes = (id = "one"): WorkspaceChanges => ({
  kind: "workspace-changes",
  workspaceId: id,
  baseSha: "a".repeat(40),
  headSha: "b".repeat(40),
  simulation: false,
  tested: false,
  consistency: "live",
  files: [
    {
      path: "<img onerror=alert(1)>\n\t\u202e.txt",
      previousPath: null,
      status: "added",
      oldMode: null,
      newMode: "100644",
      binary: false,
      diff: "+++ file\n+<script>alert(1)</script>\u001b\u202e\n",
    },
    {
      path: "binary",
      previousPath: null,
      status: "added",
      oldMode: null,
      newMode: "100644",
      binary: true,
      diff: "",
    },
  ],
});
async function launch() {
  const { element, document } = fakeDocument();
  let online = true;
  let timer: (() => void) | undefined;
  let calls = 0;
  const requests: {
    resolve: (value: WorkspaceChanges) => void;
    reject: (error: Error) => void;
    id: string;
  }[] = [];
  const workspaces = [
    workspace("one"),
    workspace("two"),
    {
      id: "demo",
      provider: "local-simulation",
      repository: "https://github.com/test/repo",
      state: "running",
      createdAt: 1,
    },
  ];
  loadRenderer({
    Error,
    window: {
      argent: {
        status: async () => ({ connected: online }),
        listWorkspaces: async () => ({ items: workspaces, nextCursor: null }),
        listRuns: async () => ({ items: [], nextCursor: null }),
        workspaceChanges: (id: string) => {
          calls++;
          return new Promise<WorkspaceChanges>((resolve, reject) =>
            requests.push({ resolve, reject, id }),
          );
        },
      },
      addEventListener() {},
    },
    document,
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
  return {
    element,
    requests,
    get calls() {
      return calls;
    },
    setOnline(value: boolean) {
      online = value;
    },
    async poll() {
      assert.ok(timer);
      timer();
      await settle();
    },
    select(id: string) {
      const row = element("workspace-list").find(
        (item) => item.dataset.workspaceId === id,
      );
      assert.ok(row);
      row.click();
    },
    open() {
      element("workspace-changes").click();
    },
    close() {
      element("changes-close").click();
    },
  };
}

test("changes are requested only on open or refresh, with literal hostile text and binary metadata", async () => {
  const app = await launch();
  assert.equal(app.calls, 0);
  app.open();
  assert.match(app.element("changes-status").textContent, /Reading/);
  app.element("changes-refresh").fire("click");
  assert.equal(app.calls, 1, "duplicate clicks cannot overlap a pending read");
  app.requests[0]!.resolve(changes());
  await settle();
  assert.match(app.element("changes-files").text, /<img onerror/);
  assert.match(app.element("changes-files").text, /\\n\\t\\u202e/);
  assert.doesNotMatch(app.element("changes-files").text, /[\n\t\u202e]/);
  assert.equal(app.element("changes-files").children[0]!.children.length, 0);
  assert.match(
    app.element("changes-diff").textContent,
    /<script>alert\(1\)<\/script>\\u001b\\u202e/,
  );
  assert.equal(app.element("changes-diff").children.length, 0);
  app.element("changes-files").children[1]!.click();
  assert.match(app.element("changes-diff").textContent, /Binary or non-UTF-8/);
  await app.poll();
  assert.equal(app.calls, 1);
  app.element("changes-refresh").click();
  assert.equal(app.calls, 2);
  assert.equal(
    app.element("changes-diff").textContent,
    "",
    "old content clears during refresh",
  );
  app.requests[1]!.resolve(changes());
  await settle();
  assert.match(
    app.element("changes-diff").textContent,
    /Binary or non-UTF-8/,
    "manual refresh preserves selected path",
  );
  app.close();
  assert.equal(app.element("workspace-changes").focused, true);
});

test("selection, close/reopen and disconnect invalidate late success and errors", async () => {
  const app = await launch();
  app.open();
  app.close();
  app.open();
  app.element("changes-dialog").fire("close");
  app.requests[0]!.resolve(changes());
  await settle();
  assert.equal(app.element("changes-content").hidden, true);
  app.requests[1]!.resolve(changes());
  await settle();
  assert.equal(app.element("changes-content").hidden, false);
  app.element("changes-refresh").click();
  app.select("two");
  await settle();
  assert.equal(app.element("changes-dialog").open, false);
  app.open();
  app.requests[2]!.reject(new Error("Old request error"));
  await settle();
  assert.doesNotMatch(app.element("changes-status").textContent, /Old request/);
  app.setOnline(false);
  await app.poll();
  assert.match(app.element("changes-status").textContent, /disconnected/);
  app.requests[3]!.resolve(changes("two"));
  await settle();
  assert.equal(app.element("changes-content").hidden, true);
  app.setOnline(true);
  await app.poll();
  assert.equal(app.calls, 4);
  assert.match(app.element("changes-status").textContent, /reconnected/);
  app.element("changes-refresh").click();
  app.requests[4]!.resolve(changes("two"));
  await settle();
  assert.equal(app.element("changes-content").hidden, false);
  app.element("changes-dialog").fire("cancel");
  assert.equal(app.element("changes-dialog").open, false);
});

test("empty, wrong identity, oversized, missing worktree and demo views stay honest", async () => {
  const app = await launch();
  app.open();
  app.requests[0]!.resolve({ ...changes(), files: [] });
  await settle();
  assert.match(
    app.element("changes-status").textContent,
    /No changes.*not tested/,
  );
  assert.equal(app.element("changes-content").hidden, true);
  app.element("changes-refresh").click();
  app.requests[1]!.resolve(changes("two"));
  await settle();
  assert.match(
    app.element("changes-status").textContent,
    /different workspace/,
  );
  for (const error of [
    "Request rejected (413): Workspace changes exceed inspection limits",
    "Request rejected (409): The workspace directory is missing",
  ]) {
    app.element("changes-refresh").click();
    app.requests.at(-1)!.reject(new Error(error));
    await settle();
    assert.equal(
      app.element("changes-status").textContent,
      error.replace(/^Request rejected \(\d+\): /, ""),
    );
    assert.equal(app.element("changes-content").hidden, true);
    assert.equal(app.element("changes-refresh").disabled, false);
  }
  app.close();
  app.select("demo");
  await settle();
  const calls = app.calls;
  app.open();
  assert.match(
    app.element("changes-status").textContent,
    /Scripted demo.*no real diff/,
  );
  app.element("changes-refresh").fire("click");
  assert.equal(app.calls, calls);
});

test("quoted filenames distinguish literal backslashes from newline and tab characters", async () => {
  const app = await launch();
  app.open();
  const fixture = changes();
  fixture.files = ["a\\nb", "a\nb", "a\\tb", "a\tb"].map((path) => ({
    ...fixture.files[0]!,
    path,
  }));
  app.requests[0]!.resolve(fixture);
  await settle();
  const labels = app
    .element("changes-files")
    .children.map((item) => item.textContent);
  assert.equal(new Set(labels).size, 4);
  assert.ok(labels.every((label) => !/[\n\t]/.test(label)));
});
