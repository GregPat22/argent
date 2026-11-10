import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunEvent, RunView, Workspace } from "../src/domain.js";
import {
  fakeDocument,
  loadRenderer,
  settle,
  type FakeElement,
} from "./renderer-loader.js";

async function launch(
  status: RunView["status"] = "running",
  simulation = false,
) {
  const { element, document } = fakeDocument();
  const workspace: Workspace = {
    id: "workspace",
    provider: "local-worktree",
    repository: "/repo",
    state: "running",
    createdAt: 1,
    local: {
      repositoryPath: "/repo",
      worktreePath: "/worktrees/workspace",
      branch: "argent/fixture",
      baseSha: "a".repeat(40),
    },
  };
  const run: RunView = {
    id: "run",
    workspaceId: workspace.id,
    task: "Task",
    status,
    simulation,
    permissionMode: "edits",
    maxRuntimeMs: 30000,
    createdAt: 1,
    deadlineAt: null,
    leaseExpiresAt: null,
  };
  const history: RunEvent[] = [];
  let timer: (() => void) | undefined;
  let createCalls = 0;
  let resolveCalls = 0;
  let pendingCreation: Promise<Workspace | null> | undefined;
  let pendingRefresh: Promise<void> | undefined;
  loadRenderer({
    Error,
    window: {
      argent: {
        status: async () => ({ connected: true }),
        listWorkspaces: async () => ({
          items: [{ ...workspace }],
          nextCursor: null,
        }),
        listRuns: async () => {
          await pendingRefresh;
          return { items: [{ ...run }], nextCursor: null };
        },
        events: async (_id: string, after: number) => {
          const events = history
            .filter((event) => event.cursor > after)
            .slice(0, 100);
          return { events, nextCursor: events.at(-1)?.cursor ?? after };
        },
        createLocalWorkspace: async () => {
          createCalls++;
          return pendingCreation ?? null;
        },
        resolveRun: async () => {
          resolveCalls++;
          return run;
        },
      },
      addEventListener() {},
    },
    document,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
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
    run,
    history,
    get createCalls() {
      return createCalls;
    },
    get resolveCalls() {
      return resolveCalls;
    },
    holdCreation() {
      return new Promise<(workspace: Workspace | null) => void>((resolve) => {
        pendingCreation = new Promise((release) => resolve(release));
      });
    },
    holdRefresh() {
      return new Promise<() => void>((resolve) => {
        pendingRefresh = new Promise((release) => resolve(release));
      });
    },
    append(count: number) {
      for (let i = 0; i < count; i++) {
        const cursor = history.length + 1;
        history.push({
          cursor,
          runId: run.id,
          type: "agent.log",
          data: { kind: "text", message: `Message ${cursor}` },
          createdAt: cursor,
        });
      }
    },
    async poll() {
      assert.ok(timer);
      const callback = timer;
      timer = undefined;
      callback();
      await settle();
    },
  };
}

function descendants(element: FakeElement): FakeElement[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}
function messages(root: FakeElement): string[] {
  return descendants(root)
    .map((item) => item.textContent)
    .filter((text) => /^Message \d+$/.test(text));
}
function control(root: FakeElement, action: string): FakeElement {
  const button = root.find((item) => item.dataset.action === action);
  assert.ok(button, `${action} control must exist`);
  return button;
}

test("long turn history keeps first and last pages reachable while polling", async () => {
  const app = await launch();
  app.append(1200);
  for (let i = 0; i < 3; i++) await app.poll();
  const transcript = app.element("transcript");
  assert.equal(messages(transcript).length, 500);
  assert.equal(messages(transcript)[0], "Message 701");
  assert.equal(messages(transcript).at(-1), "Message 1200");
  control(transcript, "earlier-events").click();
  assert.equal(control(transcript, "earlier-events").focused, true);
  control(transcript, "earlier-events").click();
  assert.equal(
    control(transcript, "later-events").focused,
    true,
    "at the first page focus moves to the enabled later control",
  );
  assert.equal(messages(transcript)[0], "Message 1");
  assert.equal(messages(transcript).at(-1), "Message 500");
  app.append(100);
  await app.poll();
  assert.equal(
    messages(transcript)[0],
    "Message 1",
    "polling preserves the older page",
  );
  assert.equal(messages(transcript).at(-1), "Message 500");
  control(transcript, "later-events").click();
  control(transcript, "later-events").click();
  assert.equal(
    control(transcript, "earlier-events").focused,
    true,
    "at the latest page focus moves to the enabled earlier control",
  );
  assert.equal(messages(transcript).at(-1), "Message 1300");
  app.append(1);
  await app.poll();
  assert.equal(
    messages(transcript).at(-1),
    "Message 1301",
    "latest page follows incoming events",
  );
  assert.equal(messages(transcript).length, 500);
  app.run.status = "failed";
  await app.poll();
  assert.equal(
    messages(transcript).length,
    500,
    "settled agent prose is paginated too",
  );
  control(transcript, "earlier-events").click();
  control(transcript, "earlier-events").click();
  assert.equal(messages(transcript)[0], "Message 1");
});

test("real interrupted turns explain reconciliation without an abandon action", async () => {
  const app = await launch("needs_attention");
  const transcript = app.element("transcript");
  assert.equal(
    transcript.find((item) => item.attributes.get("data-action") === "resolve"),
    undefined,
  );
  assert.match(transcript.text, /process.*reconcil/i);
  assert.equal(app.element("composer-submit").disabled, true);
  app.element("resolve-form").fire("submit");
  await settle();
  assert.equal(app.resolveCalls, 0);
});

test("stale review actions cannot open or submit resolution for a real run", async () => {
  const app = await launch("needs_attention", true);
  const button = app
    .element("transcript")
    .find((item) => item.attributes.get("data-action") === "resolve");
  assert.ok(button);
  button.click();
  assert.equal(
    app.element("resolve-dialog").open,
    true,
    "simulated recovery remains available",
  );
  app.element("resolve-dialog").close();
  app.run.simulation = false;
  await app.poll();
  button.fire("click");
  assert.equal(app.element("resolve-dialog").open, false);
  app.element("resolve-form").fire("submit");
  await settle();
  assert.equal(app.resolveCalls, 0);
});

test("polling and synthetic duplicate clicks cannot unlock pending repository creation", async () => {
  const app = await launch();
  const release = await app.holdCreation();
  app.element("new-workspace").click();
  assert.equal(app.createCalls, 1);
  const refresh = await app.holdRefresh();
  await app.poll();
  assert.equal(app.element("new-workspace").disabled, true);
  app.element("new-workspace").fire("click");
  app.element("welcome-create").fire("click");
  assert.equal(app.createCalls, 1);
  refresh();
  await settle();
  assert.equal(app.element("new-workspace").disabled, true);
  app.element("new-workspace").fire("click");
  assert.equal(app.createCalls, 1);
  release(null);
  await settle();
  assert.equal(app.element("new-workspace").disabled, false);
});

test("failed provider output stays literal text beside a clear failure summary", async () => {
  const app = await launch();
  const explanation =
    "Usage limit reached. Try again after the limit resets. <img src=x onerror=alert(1)>";
  app.append(1);
  app.history.push(
    {
      cursor: 2,
      runId: app.run.id,
      type: "agent.log",
      data: { kind: "tool_error", message: explanation },
      createdAt: 2,
    },
    {
      cursor: 3,
      runId: app.run.id,
      type: "run.failed",
      data: { reason: "Claude Code failed (exit 1)." },
      createdAt: 3,
    },
  );
  app.run.status = "failed";
  await app.poll();
  const transcript = app.element("transcript");
  const detail = transcript.find((item) => item.textContent === explanation);
  assert.ok(detail, "provider explanation is retained as textContent");
  assert.equal(detail.children.length, 0);
  assert.match(transcript.text, /Message 1/);
  assert.match(transcript.text, /Failed\. Claude Code failed \(exit 1\)\./);
  assert.doesNotMatch(transcript.text, /exit 1, success|Argent recorded/);
  assert.ok(
    transcript.find((item) => item.className === "status status-failed"),
  );
  const beforePoll = transcript.text;
  await app.poll();
  assert.equal(app.element("transcript").text, beforePoll);
});
