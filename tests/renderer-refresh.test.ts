import assert from "node:assert/strict";
import { test } from "node:test";
import type { Workspace } from "../src/domain.js";
import {
  fakeDocument,
  loadRenderer,
  settle,
  openWorkspace,
} from "./renderer-loader.js";

// Run the compiled renderer with a controlled bridge, DOM and polling clock.

async function launch(
  open: "older" | "first" | "none" = "older",
  stored: Record<string, string> = {},
) {
  const recent: Workspace[] = Array.from({ length: 50 }, (_, index) => ({
    id: `recent-${index}`,
    repository: `https://github.com/example/recent-${index}`,
    provider: "local-simulation",
    state: "running",
    createdAt: 100 - index,
  }));
  let older: Workspace = {
    ...recent[0]!,
    id: "older",
    repository: "https://github.com/example/older",
    createdAt: 1,
  };
  const { element, document } = fakeDocument();
  let timer: (() => void) | undefined;
  let connected = true;
  let readError: boolean | string = false;
  let pendingRead: Promise<Workspace> | undefined;
  const reads: string[] = [];
  const runReads: string[] = [];
  const preferences = new Map(Object.entries(stored));
  loadRenderer({
    Error,
    window: {
      argent: {
        status: async () => ({ connected }),
        listWorkspaces: async (cursor?: string) => ({
          items: cursor ? [{ ...older }] : recent.map((item) => ({ ...item })),
          nextCursor: cursor ? null : "older-page",
        }),
        getWorkspace: async (id: string) => {
          reads.push(id);
          if (readError)
            throw new Error(
              typeof readError === "string"
                ? readError
                : "Workspace read unavailable",
            );
          return pendingRead ?? { ...older };
        },
        listRuns: async (id: string) => {
          runReads.push(id);
          return { items: [], nextCursor: null };
        },
      },
      addEventListener: () => {},
    },
    document,
    localStorage: {
      getItem: (key: string) => preferences.get(key) ?? null,
      setItem: (key: string, value: string) => preferences.set(key, value),
      removeItem: (key: string) => preferences.delete(key),
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
  if (open === "older") {
    element("more-workspaces").click();
    await settle();
    await openWorkspace(element, older.id);
  } else if (open === "first") await openWorkspace(element);
  return {
    element,
    preferences,
    recent,
    reads,
    runReads,
    setState: (state: Workspace["state"]) => {
      older = { ...older, state };
    },
    setConnected: (value: boolean) => {
      connected = value;
    },
    setReadError: (value: boolean | string) => {
      readError = value;
    },
    holdRead: () =>
      new Promise<(workspace: Workspace) => void>((resolve) => {
        pendingRead = new Promise<Workspace>((release) => resolve(release));
      }),
    holdReadFailure: () =>
      new Promise<(error: Error) => void>((resolve) => {
        pendingRead = new Promise<Workspace>((_release, reject) =>
          resolve(reject),
        );
      }),
    async poll() {
      assert.ok(timer, "renderer must schedule its next poll");
      const callback = timer;
      timer = undefined;
      callback();
      await settle();
    },
    select(id: string) {
      const button = element("workspace-list").find(
        (child) => child.dataset.workspaceId === id,
      );
      assert.ok(button, `workspace ${id} must be rendered`);
      button.click();
    },
    assertState(state: Workspace["state"]) {
      assert.equal(
        element("workspace-state").textContent,
        state === "running" ? "Ready" : "Stopped",
      );
      assert.equal(
        element("workspace-lifecycle").textContent,
        state === "running" ? "Stop workspace" : "Start workspace",
      );
      assert.equal(element("composer-input").disabled, state !== "running");
    },
  };
}

test("workspace opened beyond page one follows external stop/start and reconnect", async () => {
  const app = await launch();
  app.assertState("running");
  app.setState("stopped");
  await app.poll();
  app.assertState("stopped");
  app.setState("running");
  await app.poll();
  app.assertState("running");
  app.setConnected(false);
  await app.poll();
  assert.equal(app.element("composer-input").disabled, true);
  app.setState("stopped");
  app.setConnected(true);
  await app.poll();
  app.assertState("stopped");
  assert.equal(app.reads.length, 4);
});

test("workspace selected from an older page after another refreshes", async () => {
  const app = await launch("first");
  app.element("more-workspaces").click();
  await settle();
  app.select("older");
  await settle();
  app.assertState("running");
  app.setState("stopped");
  await app.poll();
  app.assertState("stopped");
  app.setState("running");
  await app.poll();
  app.assertState("running");
});

test("selected first-page workspace uses the fresh page without an extra read", async () => {
  const app = await launch("first");
  app.recent[0]!.state = "stopped";
  await app.poll();
  app.assertState("stopped");
  assert.deepEqual(app.reads, []);
});

test("failed selected-workspace read is surfaced and a later poll recovers", async () => {
  const app = await launch();
  app.setState("stopped");
  app.setReadError(true);
  await app.poll();
  assert.equal(app.element("error-banner").hidden, false);
  assert.equal(
    app.element("error-text").textContent,
    "Workspace read unavailable",
  );
  app.setReadError(false);
  await app.poll();
  app.assertState("stopped");
});

test("late workspace response cannot update a changed selection", async () => {
  const app = await launch();
  const release = await app.holdRead();
  await app.poll();
  assert.equal(app.reads.length, 2, "poll must fetch the older selection");
  app.select("recent-0");
  release({ ...app.recent[0]!, id: "older", state: "stopped" });
  await settle();
  assert.deepEqual(app.runReads, ["older"]);
  await app.poll();
  app.assertState("running");
  assert.equal(app.element("workspace-title").textContent, "recent-0");
  assert.deepEqual(app.runReads, ["older", "recent-0"]);
});

test("launch opens the welcome screen even after a workspace was open", async () => {
  const app = await launch("none", {
    "argent.selection": JSON.stringify({ workspaceId: "older" }),
  });
  assert.equal(app.element("welcome").hidden, false);
  assert.equal(app.element("workspace-list").children.length > 0, true);
  assert.deepEqual(app.reads, []);
  assert.deepEqual(app.runReads, []);
  assert.equal(app.preferences.has("argent.selection"), false);
  await app.poll();
  assert.equal(app.element("welcome").hidden, false);
  assert.deepEqual(app.runReads, []);
  app.select("recent-1");
  await settle();
  assert.equal(app.element("welcome").hidden, true);
  assert.equal(app.element("workspace-title").textContent, "recent-1");
});

test("an uncertain submission reopens its workspace so the retry stays visible", async () => {
  const app = await launch("none", {
    "argent.pending": JSON.stringify({
      workspaceId: "older",
      task: "Unconfirmed task",
      maxRuntimeMs: 60_000,
      key: "key",
    }),
  });
  assert.deepEqual(app.reads, ["older"]);
  assert.deepEqual(app.runReads, ["older"]);
  assert.equal(app.element("welcome").hidden, true);
  assert.equal(app.element("workspace-title").textContent, "older");
  assert.equal(app.element("pending-bar").hidden, false);
});

test("missing selected workspace surfaces the error without changing selection", async () => {
  const app = await launch();
  app.setReadError("Request rejected (404): Workspace not found");
  await app.poll();
  assert.equal(app.element("error-banner").hidden, false);
  assert.equal(app.element("error-text").textContent, "Workspace not found");
  assert.equal(app.element("workspace-title").textContent, "older");
  assert.deepEqual(app.runReads, ["older"]);
  app.setReadError(false);
  app.setState("stopped");
  await app.poll();
  app.assertState("stopped");
});

test("late workspace read failure cannot surface an error for a changed selection", async () => {
  const app = await launch();
  const reject = await app.holdReadFailure();
  await app.poll();
  assert.equal(app.reads.length, 2);
  app.select("recent-0");
  reject(new Error("Read failed for previous selection"));
  await settle();
  assert.equal(app.element("error-banner").hidden, true);
  assert.deepEqual(app.runReads, ["older"]);
  await app.poll();
  app.assertState("running");
  assert.equal(app.element("workspace-title").textContent, "recent-0");
});

test("composer drafts remain attached to their selected workspace", async () => {
  const app = await launch();
  const composer = app.element("composer-input") as unknown as {
    value: string;
  };
  composer.value = "older workspace draft";
  app.select("recent-0");
  await settle();
  assert.equal(composer.value, "");
  composer.value = "recent workspace draft";
  app.select("older");
  await settle();
  assert.equal(composer.value, "older workspace draft");
  app.select("recent-0");
  await settle();
  assert.equal(composer.value, "recent workspace draft");
});
