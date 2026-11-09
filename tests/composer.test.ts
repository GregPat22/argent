import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunView, Workspace } from "../src/domain.js";
import { fakeDocument, loadRenderer, settle } from "./renderer-loader.js";

type Created = [string, string, number, string, string | undefined];

// The composer sends straight to the service; these tests drive the compiled
// renderer with a fake bridge and record every createRun request.
async function launch(
  options: { local?: boolean; state?: Workspace["state"] } = {},
) {
  const local = options.local ?? true;
  let workspace: Workspace = {
    id: "workspace",
    repository: local
      ? "local:/repos/project"
      : "https://github.com/example/demo",
    provider: local ? "local-worktree" : "local-simulation",
    state: options.state ?? "running",
    createdAt: 1,
    ...(local
      ? {
          local: {
            repositoryPath: "/repos/project",
            branch: "argent/abc12345",
            baseSha: "a".repeat(40),
            worktreePath: "/worktrees/abc12345",
          },
        }
      : {}),
  };
  const runs: RunView[] = [];
  const created: Created[] = [];
  let failure: Error | null = null;
  let keys = 0;
  const { element, document } = fakeDocument();
  let timer: (() => void) | undefined;
  loadRenderer({
    Error,
    crypto: { randomUUID: () => `key-${++keys}` },
    window: {
      argent: {
        status: async () => ({ connected: true }),
        listWorkspaces: async () => ({
          items: [{ ...workspace }],
          nextCursor: null,
        }),
        getWorkspace: async () => ({ ...workspace }),
        listRuns: async () => ({
          items: runs.map((run) => ({ ...run })),
          nextCursor: null,
        }),
        events: async () => ({ events: [], nextCursor: 0 }),
        artifact: async () => {
          throw new Error("No artifact in this test");
        },
        createRun: async (...args: Created) => {
          created.push(args);
          if (failure) throw failure;
          const run: RunView = {
            id: `run-${created.length}`,
            workspaceId: args[0],
            task: args[1],
            status: "queued",
            simulation: !local,
            permissionMode: args[4] === "full" ? "full" : "edits",
            maxRuntimeMs: args[2],
            createdAt: 10 + created.length,
            deadlineAt: null,
            leaseExpiresAt: null,
          };
          runs.unshift(run);
          return { ...run };
        },
      },
      addEventListener: () => {},
    },
    document,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
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
  const composer = element("composer-input");
  return {
    element,
    composer,
    created,
    runs,
    failWith(error: Error | null) {
      failure = error;
    },
    setState(state: Workspace["state"]) {
      workspace = { ...workspace, state };
    },
    async type(text: string) {
      composer.value = text;
      composer.fire("input");
    },
    async enter(modifiers: Record<string, boolean> = {}) {
      composer.fire("keydown", { key: "Enter", ...modifiers });
      await settle();
      await settle();
    },
    async poll() {
      const callback = timer;
      timer = undefined;
      callback?.();
      await settle();
      await settle();
    },
  };
}

test("Enter sends straight to the service with edits only and the default limit", async () => {
  const ui = await launch();
  await ui.type("  inspect the change  ");
  await ui.enter({ shiftKey: true });
  assert.equal(ui.created.length, 0, "Shift+Enter keeps writing");
  await ui.enter();
  assert.deepEqual(ui.created, [
    ["workspace", "inspect the change", 1800000, "key-1", "edits"],
  ]);
  assert.equal(ui.composer.value, "");
  assert.equal(ui.element("transcript").children.length, 1);
  assert.match(ui.element("transcript").text, /inspect the change/);
});

test("full access needs one confirmation per workspace and resets after each send", async () => {
  const ui = await launch();
  const toggle = ui.element("permission-toggle");
  assert.equal(toggle.textContent, "Edits only");
  toggle.click();
  assert.equal(ui.element("full-access-confirm").popoverOpen, true);
  assert.equal(toggle.textContent, "Edits only", "not granted until allowed");
  ui.element("full-access-allow").click();
  assert.equal(toggle.textContent, "Full access");
  await ui.type("run the tests");
  await ui.enter();
  assert.equal(ui.created[0]![4], "full");
  assert.equal(toggle.textContent, "Edits only");
  // The run is still active, so finish it before the next message.
  ui.runs[0]!.status = "completed";
  await ui.poll();
  ui.element("full-access-confirm").popoverOpen = false;
  toggle.click();
  assert.equal(ui.element("full-access-confirm").popoverOpen, false);
  assert.equal(toggle.textContent, "Full access");
  toggle.click();
  assert.equal(toggle.textContent, "Edits only");
});

test("an unconfirmed message keeps its key and text until a retry is accepted", async () => {
  const ui = await launch();
  ui.failWith(new Error("socket hang up"));
  await ui.type("uncertain work");
  await ui.enter();
  assert.equal(ui.element("pending-bar").hidden, false);
  assert.equal(ui.composer.readOnly, true);
  assert.equal(ui.composer.value, "uncertain work");
  assert.equal(ui.element("permission-toggle").disabled, true);
  ui.composer.value = "edited after the failure";
  ui.failWith(null);
  ui.element("pending-retry").click();
  await settle();
  await settle();
  assert.deepEqual(
    ui.created.map((call) => [call[1], call[3]]),
    [
      ["uncertain work", "key-1"],
      ["uncertain work", "key-1"],
    ],
  );
  assert.equal(ui.element("pending-bar").hidden, true);
  assert.equal(ui.composer.readOnly, false);
});

test("a definite rejection clears the pending key and keeps the text editable", async () => {
  const ui = await launch();
  ui.failWith(new Error("Request rejected (409): Workspace has an active run"));
  await ui.type("rejected work");
  await ui.enter();
  assert.equal(ui.element("pending-bar").hidden, true);
  assert.equal(ui.composer.readOnly, false);
  assert.equal(ui.composer.value, "rejected work");
  assert.equal(
    ui.element("error-text").textContent,
    "Workspace has an active run",
  );
  ui.failWith(null);
  await ui.enter();
  assert.equal(ui.created.at(-1)![3], "key-2", "a new message gets a new key");
});

test("a stopped workspace, a blank message or a working run cannot send", async () => {
  const stopped = await launch({ state: "stopped" });
  assert.equal(stopped.composer.disabled, true);
  assert.equal(stopped.element("composer-start").hidden, false);
  await stopped.type("do work");
  await stopped.enter();
  assert.equal(stopped.created.length, 0);

  const ui = await launch();
  await ui.type("   ");
  await ui.enter();
  assert.equal(ui.created.length, 0);
  await ui.type("first");
  await ui.enter();
  assert.equal(ui.element("composer-submit").hidden, true);
  assert.equal(ui.element("cancel-run").hidden, false);
  assert.equal(ui.composer.disabled, false, "drafting continues while working");
  await ui.type("second");
  await ui.enter();
  assert.equal(ui.created.length, 1);
});

test("demo workspaces send in seconds without a permission mode", async () => {
  const ui = await launch({ local: false });
  assert.equal(ui.element("permission-toggle").hidden, true);
  await ui.type("scripted");
  await ui.enter();
  assert.deepEqual(ui.created, [
    ["workspace", "scripted", 30000, "key-1", undefined],
  ]);
});
