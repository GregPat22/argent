import assert from "node:assert/strict";
import { test } from "node:test";
import type { Workspace } from "../src/domain.js";
import {
  fakeDocument,
  loadRenderer,
  openWorkspace,
  settle,
} from "./renderer-loader.js";

async function launch(pending = false) {
  const workspaces: Workspace[] = ["one", "two"].map((id) => ({
    id,
    repository: "/repo",
    provider: "local-worktree",
    createdAt: 1,
    state: "running",
    local: {
      repositoryPath: "/repo",
      worktreePath: `/worktrees/${id}`,
      branch: `argent/${id}`,
      baseSha: "a".repeat(40),
    },
  }));
  const { element, document } = fakeDocument();
  const sent: unknown[] = [];
  const requests: unknown[] = [];
  let tick: (() => void) | undefined;
  let connected = true;
  const bridge = {
    status: async () => ({ connected }),
    listWorkspaces: async () => ({
      items: workspaces.map((w) => ({ ...w })),
      nextCursor: null,
    }),
    listRuns: async () => ({ items: [], nextCursor: null }),
    latestCheck: async (id: string) => {
      requests.push(["latestCheck", id]);
      return null;
    },
    createLocalWorkspace: async (id: string) => {
      requests.push(["createLocalWorkspace", id]);
      return null;
    },
    createRun: async () => {
      requests.push(["createRun"]);
    },
    setWorkspaceState: async () => {
      requests.push(["setWorkspaceState"]);
    },
    archiveWorkspace: async (id: string, discard: boolean) => {
      sent.push([id, discard]);
      const w = workspaces.find((w) => w.id === id)!;
      w.archiveStatus = "archived";
      w.state = "stopped";
      return { ...w };
    },
  };
  const storage = new Map<string, string>();
  if (pending)
    storage.set(
      "argent.pending",
      JSON.stringify({
        workspaceId: "one",
        task: "a message",
        maxRuntimeMs: 9000,
        key: "a key",
      }),
    );
  loadRenderer({
    Error,
    window: { argent: bridge, addEventListener() {} },
    document,
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    },
    setTimeout: (callback: () => void) => {
      tick = callback;
      return 1;
    },
    clearTimeout: () => {
      tick = undefined;
    },
  });
  await settle();
  await openWorkspace(element, "one");
  return {
    element,
    sent,
    requests,
    workspaces,
    storage,
    async poll(value = connected) {
      connected = value;
      assert.ok(tick);
      tick();
      await settle();
    },
  };
}

test("archive confirmation identifies its branch, resets discard, and sends once", async () => {
  const { element, sent, requests } = await launch();
  const open = () => element("workspace-archive").click();
  open();
  assert.match(element("archive-target").textContent, /repo \/ argent\/one/);
  assert.equal(element("archive-cancel").focused, true);
  element("archive-discard").checked = true;
  element("archive-cancel").click();
  assert.equal(element("archive-dialog").open, false);
  assert.deepEqual(sent, []);
  open();
  assert.equal(element("archive-discard").checked, false);
  element("archive-confirm").click();
  element("archive-confirm").fire("click");
  await settle();
  assert.deepEqual(sent, [["one", false]]);
  assert.equal(element("workspace-state").textContent, "Archived");
  for (const id of [
    "workspace-commands",
    "workspace-changes",
    "workspace-repository",
    "composer-input",
    "workspace-lifecycle",
  ])
    assert.equal(element(id).disabled, true, id);
  element("composer-start").fire("click");
  element("composer-form").fire("submit");
  element("workspace-archive").fire("click");
  assert.equal(element("archive-dialog").open, false);
  element("workspace-checks").click();
  await settle();
  assert.match(element("checks-status").textContent, /No checks were recorded/);
  element("checks-close").click();
  element("workspace-parallel").click();
  await settle();
  assert.deepEqual(requests, [
    // The Checks badge reads once when the workspace opens; the dialog once.
    ["latestCheck", "one"],
    ["latestCheck", "one"],
    ["createLocalWorkspace", "one"],
  ]);
});

test("switching workspace or disconnecting cancels the original archive confirmation", async () => {
  const { element, poll, sent } = await launch();
  element("workspace-archive").click();
  element("archive-discard").checked = true;
  await openWorkspace(element, "two");
  element("archive-confirm").fire("click");
  assert.equal(element("archive-dialog").open, false);
  element("workspace-archive").click();
  await poll(false);
  assert.equal(element("archive-dialog").open, false);
  await poll(true);
  element("archive-confirm").fire("click");
  assert.deepEqual(sent, []);
  element("workspace-archive").click();
  element("archive-discard").checked = true;
  element("archive-discard").fire("change");
  assert.equal(element("archive-confirm").textContent, "Discard and archive");
  element("archive-confirm").click();
  await settle();
  assert.deepEqual(sent, [["two", true]]);
});

test("an uncertain message prevents archive and can be dismissed after external archive uncertainty", async () => {
  const { element, storage, requests, workspaces, poll } = await launch(true);
  assert.equal(element("workspace-archive").disabled, true);
  element("workspace-archive").fire("click");
  assert.equal(element("archive-dialog").open, false);
  Object.assign(workspaces[0]!, {
    archiveStatus: "needs_attention",
    state: "stopped",
  });
  await poll();
  assert.equal(
    element("workspace-state").textContent,
    "Archive needs attention",
  );
  element("pending-retry").fire("click");
  // Only the Checks badge's reading: the retry sends nothing.
  assert.deepEqual(
    requests.filter((request) => (request as string[])[0] !== "latestCheck"),
    [],
  );
  assert.ok(storage.has("argent.pending"));
  element("pending-dismiss").click();
  assert.equal(storage.has("argent.pending"), false);
});
