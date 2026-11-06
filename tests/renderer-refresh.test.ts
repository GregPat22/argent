import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { Workspace } from "../src/domain.js";
import { mergeHistory } from "../ui/history.js";

// Run the compiled renderer with a controlled bridge, DOM and polling clock.
const renderer = ts.transpileModule(
  readFileSync(new URL("../ui/app.js", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

class Element {
  textContent = "";
  hidden = false;
  disabled = false;
  className = "";
  dataset: Record<string, string> = {};
  children: Element[] = [];
  listeners = new Map<string, () => void>();
  append(...children: Element[]): void {
    this.children.push(...children);
  }
  replaceChildren(): void {
    this.children = [];
  }
  setAttribute(): void {}
  addEventListener(name: string, callback: () => void): void {
    this.listeners.set(name, callback);
  }
  click(): void {
    this.listeners.get("click")?.();
  }
}

const settle = async (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

async function launch(saved = true) {
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
  const elements = new Map<string, Element>();
  function element(id: string): Element {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id)!;
  }
  let timer: (() => void) | undefined;
  let connected = true;
  let readError = false;
  let pendingRead: Promise<Workspace> | undefined;
  const reads: string[] = [];
  const runReads: string[] = [];
  const preferences = new Map(
    saved
      ? [["argent.selection", JSON.stringify({ workspaceId: older.id })]]
      : [],
  );
  runInNewContext(renderer, {
    Error,
    exports: {},
    require: (path: string) => {
      assert.equal(path, "./history.js");
      return { mergeHistory };
    },
    window: {
      argent: {
        status: async () => ({ connected }),
        listWorkspaces: async (cursor?: string) => ({
          items: cursor ? [{ ...older }] : recent.map((item) => ({ ...item })),
          nextCursor: cursor ? null : "older-page",
        }),
        getWorkspace: async (id: string) => {
          reads.push(id);
          if (readError) throw new Error("Workspace read unavailable");
          return pendingRead ?? { ...older };
        },
        listRuns: async (id: string) => {
          runReads.push(id);
          return { items: [], nextCursor: null };
        },
      },
      addEventListener: () => {},
    },
    document: {
      getElementById: element,
      createElement: () => new Element(),
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
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
  return {
    element,
    recent,
    reads,
    runReads,
    setState: (state: Workspace["state"]) => {
      older = { ...older, state };
    },
    setConnected: (value: boolean) => {
      connected = value;
    },
    setReadError: (value: boolean) => {
      readError = value;
    },
    holdRead: () =>
      new Promise<(workspace: Workspace) => void>((resolve) => {
        pendingRead = new Promise<Workspace>((release) => resolve(release));
      }),
    async poll() {
      assert.ok(timer, "renderer must schedule its next poll");
      const callback = timer;
      timer = undefined;
      callback();
      await settle();
    },
    select(id: string) {
      const button = element("workspace-list").children.find(
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
      for (const id of ["new-task", "empty-new-task"])
        assert.equal(element(id).disabled, state !== "running");
    },
  };
}

test("saved workspace beyond page one follows external stop/start and reconnect", async () => {
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
  assert.equal(app.element("new-task").disabled, true);
  app.setState("stopped");
  app.setConnected(true);
  await app.poll();
  app.assertState("stopped");
  assert.equal(app.reads.length, 4);
});

test("workspace selected from an older page refreshes without saved preferences", async () => {
  const app = await launch(false);
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
  const app = await launch(false);
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
