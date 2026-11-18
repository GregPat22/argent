import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  CommandApprovalReceiptView,
  CommandConfigurationView,
} from "../src/desktop/contracts.js";
import type { Workspace } from "../src/domain.js";
import {
  fakeDocument,
  loadRenderer,
  settle,
  openWorkspace,
} from "./renderer-loader.js";

const base = "a".repeat(40);
const identity = "c".repeat(64);
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
    baseSha: base,
  },
});
const hostile = '<img src=x onerror=alert(1)> "quoted"\n\t‮​';
const configuration = (
  id = "one",
  approval: CommandConfigurationView["approval"] = null,
): CommandConfigurationView => ({
  kind: "local-command-configuration",
  workspaceId: id,
  configuration: {
    kind: "local-command-config",
    config: {
      version: 1,
      commands: {
        setup: { argv: ["npm", "ci"] },
        run: { argv: ["npm", "start"] },
        test: { argv: ["nрm", "test", "", " padded ", hostile] },
      },
    },
    source: {
      path: "argent.json",
      baseSha: base,
      blobId: "b".repeat(40),
      sha256: "d".repeat(64),
    },
    approvalCandidate: {
      identity,
      policyVersion: "argent-local-commands-v1",
    },
  },
  approval,
  executionAllowed: false,
});
const receipt = (): CommandApprovalReceiptView => ({
  kind: "local-command-approval-receipt",
  workspaceId: "one",
  approval: {
    id: "approval",
    workspaceId: "one",
    descriptor: configuration().configuration!,
    approvedAt: 1000,
  },
  event: { cursor: 1, type: "configuration.approved", createdAt: 1000 },
  historical: true,
  executionAllowed: false,
});

interface Deferred<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}
async function launch() {
  const { element, document } = fakeDocument();
  let online = true;
  let timer: (() => void) | undefined;
  let keys = 0;
  const reads: (Deferred<CommandConfigurationView> & { id: string })[] = [];
  const approvals: (Deferred<CommandApprovalReceiptView> & {
    args: unknown[];
  })[] = [];
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
    Map,
    crypto: { randomUUID: () => `key-${++keys}` },
    window: {
      argent: {
        status: async () => ({ connected: online }),
        listWorkspaces: async () => ({ items: workspaces, nextCursor: null }),
        listRuns: async () => ({ items: [], nextCursor: null }),
        commandConfiguration: (id: string) =>
          new Promise<CommandConfigurationView>((resolve, reject) =>
            reads.push({ resolve, reject, id }),
          ),
        approveCommandConfiguration: (...args: unknown[]) =>
          new Promise<CommandApprovalReceiptView>((resolve, reject) =>
            approvals.push({ resolve, reject, args }),
          ),
      },
      addEventListener() {},
    },
    document,
    localStorage: {
      getItem: () => null,
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
  await openWorkspace(element, "one");
  const app = {
    element,
    reads,
    approvals,
    status: () => element("commands-status").textContent,
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
      element("workspace-commands").click();
    },
    /** Opens the dialog and shows one unapproved configuration. */
    async show(view = configuration()) {
      app.open();
      reads.at(-1)!.resolve(view);
      await settle();
    },
  };
  return app;
}

test("the configuration is read only on open, refresh and approval, and every argument is literal text", async () => {
  const app = await launch();
  assert.equal(app.reads.length, 0);
  assert.equal(app.element("workspace-commands").hidden, false);
  app.open();
  assert.match(app.status(), /Reading/);
  assert.equal(app.element("commands-approve").disabled, true);
  app.element("commands-refresh").fire("click");
  assert.equal(app.reads.length, 1, "a pending read is not repeated");
  app.reads[0]!.resolve(configuration());
  await settle();
  assert.equal(app.element("commands-content").hidden, false);
  assert.equal(app.element("commands-example").hidden, true);
  assert.match(app.status(), /Review every argument/);
  assert.match(
    app.element("commands-source").textContent,
    /argent\.json · base a{12} · content SHA-256 d{12}/,
  );
  const actions = app.element("commands-list").children;
  assert.deepEqual(
    actions.map((action) => action.children[0]!.textContent),
    ["setup", "test", "run"],
    "actions appear in the order Argent plans to run them",
  );
  const list = actions[1]!.children[2]!;
  const shown = list.children.map((item) => item.textContent);
  assert.deepEqual(shown, [
    '"n\\u0440m"',
    '"test"',
    '""',
    '" padded "',
    '"<img src=x onerror=alert(1)> \\"quoted\\"\\n\\t\\u202e\\u200b"',
  ]);
  assert.ok(
    list.children.every((item) => item.children.length === 0),
    "arguments never become elements",
  );
  assert.doesNotMatch(app.element("commands-list").text, /[^ -~]/);
  assert.match(actions[1]!.children[1]!.textContent, /5 arguments/);
  assert.match(app.element("commands-approval").textContent, /Not approved/);
  assert.equal(app.element("commands-approve").disabled, false);
  await app.poll();
  await app.poll();
  assert.equal(app.reads.length, 1, "polling never reads the repository");
  assert.equal(app.approvals.length, 0, "nothing is approved without a click");
  app.element("commands-refresh").click();
  assert.equal(app.reads.length, 2);
  assert.equal(app.element("commands-content").hidden, true);
  assert.equal(
    app.element("commands-approve").disabled,
    true,
    "nothing can be approved while it is not shown",
  );
  app.element("commands-close").click();
  assert.equal(app.element("commands-dialog").open, false);
  assert.equal(app.element("workspace-commands").focused, true);
});

test("approval sends only the identity on screen, then reads the current state again", async () => {
  const app = await launch();
  await app.show();
  app.element("commands-approve").click();
  app.element("commands-approve").fire("click");
  assert.equal(app.approvals.length, 1, "a pending approval is not repeated");
  assert.deepEqual(app.approvals[0]!.args, ["one", identity, "key-1"]);
  assert.match(app.status(), /Recording your approval/);
  assert.equal(app.element("commands-approve").disabled, true);
  assert.equal(app.element("commands-refresh").disabled, true);
  assert.equal(app.element("commands-close").focused, true);
  assert.equal(
    app.element("commands-content").hidden,
    false,
    "the reviewed commands stay visible while the approval is recorded",
  );
  app.approvals[0]!.resolve(receipt());
  await settle();
  assert.equal(app.reads.length, 2, "the receipt is not shown as the state");
  assert.equal(app.element("commands-content").hidden, true);
  assert.doesNotMatch(app.element("commands-approval").textContent, /Approved/);
  app.reads[1]!.resolve(
    configuration("one", { id: "approval", approvedAt: 1000 }),
  );
  await settle();
  assert.match(app.status(), /approved\. Review the commit/);
  assert.match(
    app.element("commands-approval").textContent,
    /^Approved .* A changed configuration needs a fresh approval\.$/,
  );
  assert.equal(app.element("commands-approve").textContent, "Approved");
  assert.equal(app.element("commands-approve").disabled, true);
  app.element("commands-approve").fire("click");
  assert.equal(app.approvals.length, 1, "an approved view cannot approve");
});

test("a rejected approval approves nothing and an uncertain one retries with the same key", async () => {
  const app = await launch();
  await app.show();
  app.element("commands-approve").click();
  app.approvals[0]!.reject(
    new Error(
      "Request rejected (409): Command configuration changed or is not configured",
    ),
  );
  await settle();
  assert.equal(
    app.status(),
    "Command configuration changed or is not configured. Nothing was approved. Refresh to read the configuration again.",
  );
  assert.equal(app.element("commands-content").hidden, true);
  assert.equal(app.element("commands-approve").disabled, true);
  assert.equal(app.reads.length, 1, "a failure never re-reads on its own");
  app.element("commands-refresh").click();
  app.reads[1]!.resolve(configuration());
  await settle();
  app.element("commands-approve").click();
  app.approvals[1]!.reject(
    new Error(
      "The local execution service is disconnected. Reconnect to continue.",
    ),
  );
  await settle();
  assert.match(app.status(), /could not confirm.*records it only once/);
  assert.equal(app.element("commands-content").hidden, true);
  app.element("commands-refresh").click();
  app.reads[2]!.resolve(configuration());
  await settle();
  app.element("commands-approve").click();
  assert.deepEqual(
    app.approvals.map((request) => request.args[2]),
    ["key-1", "key-1", "key-1"],
    "one request key per reviewed configuration",
  );
  // A different configuration is a different request.
  app.approvals[2]!.reject(new Error("Request rejected (409): Changed"));
  await settle();
  app.element("commands-refresh").click();
  const changed = configuration();
  changed.configuration = {
    ...changed.configuration!,
    approvalCandidate: {
      identity: "e".repeat(64),
      policyVersion: "argent-local-commands-v1",
    },
  };
  app.reads[3]!.resolve(changed);
  await settle();
  app.element("commands-approve").click();
  assert.deepEqual(app.approvals[3]!.args, ["one", "e".repeat(64), "key-2"]);
});

test("closing, switching workspace and disconnecting invalidate late readings and receipts", async () => {
  const app = await launch();
  app.open();
  app.element("commands-close").click();
  app.open();
  app.element("commands-dialog").fire("close");
  app.reads[0]!.resolve(configuration());
  await settle();
  assert.equal(app.element("commands-content").hidden, true);
  app.reads[1]!.resolve(configuration());
  await settle();
  assert.equal(app.element("commands-content").hidden, false);

  // A receipt arriving after the workspace changed starts no read there.
  app.element("commands-approve").click();
  app.select("two");
  await settle();
  assert.equal(app.element("commands-dialog").open, false);
  app.open();
  assert.equal(app.reads.length, 3);
  assert.equal(app.reads[2]!.id, "two");
  app.approvals[0]!.resolve(receipt());
  await settle();
  assert.equal(app.reads.length, 3);
  assert.match(app.status(), /Reading/);
  // A reading for the previous workspace is refused, not displayed.
  app.reads[2]!.resolve(configuration("one"));
  await settle();
  assert.match(app.status(), /different workspace or base/);
  assert.equal(app.element("commands-content").hidden, true);
  assert.equal(app.element("commands-approve").disabled, true);

  app.element("commands-refresh").click();
  app.setOnline(false);
  await app.poll();
  assert.match(app.status(), /disconnected/);
  assert.equal(app.element("commands-refresh").disabled, true);
  app.reads[3]!.resolve(configuration("two"));
  await settle();
  assert.equal(app.element("commands-content").hidden, true);
  app.setOnline(true);
  await app.poll();
  assert.match(app.status(), /reconnected\. Refresh/);
  assert.equal(app.reads.length, 4, "reconnecting waits for an explicit read");
  app.element("commands-refresh").click();
  app.reads[4]!.resolve(configuration("two"));
  await settle();
  assert.equal(app.element("commands-content").hidden, false);
  // A failure from an approval made before a disconnect is not reported later.
  app.element("commands-approve").click();
  app.setOnline(false);
  await app.poll();
  app.setOnline(true);
  await app.poll();
  app.approvals[1]!.reject(new Error("Request rejected (409): Old failure"));
  await settle();
  assert.doesNotMatch(app.status(), /Old failure/);
  app.element("commands-dialog").fire("cancel");
  assert.equal(app.element("commands-dialog").open, false);
});

test("missing, mismatched, unreadable and demo configurations stay honest and unapprovable", async () => {
  const app = await launch();
  await app.show({ ...configuration(), configuration: null });
  assert.match(app.status(), /No argent\.json at this workspace's base commit/);
  assert.equal(app.element("commands-example").hidden, false);
  assert.equal(app.element("commands-content").hidden, true);
  assert.equal(app.element("commands-approve").disabled, true);
  const otherBase = configuration();
  otherBase.configuration = {
    ...otherBase.configuration!,
    source: { ...otherBase.configuration!.source, baseSha: "f".repeat(40) },
  };
  for (const view of [
    otherBase,
    { ...configuration(), executionAllowed: true },
    {
      ...configuration(),
      configuration: null,
      approval: { id: "approval", approvedAt: 1 },
    },
  ]) {
    app.element("commands-refresh").click();
    app.reads.at(-1)!.resolve(view as CommandConfigurationView);
    await settle();
    assert.match(app.status(), /different workspace or base/);
    assert.equal(app.element("commands-content").hidden, true);
    assert.equal(app.element("commands-example").hidden, true);
    assert.equal(app.element("commands-approve").disabled, true);
  }
  for (const error of [
    "Request rejected (409): Invalid local command configuration",
    "Request rejected (413): Local command configuration exceeds limits",
    "Request rejected (408): Local command configuration read timed out",
  ]) {
    app.element("commands-refresh").click();
    app.reads.at(-1)!.reject(new Error(error));
    await settle();
    assert.equal(
      app.status(),
      error.replace(/^Request rejected \(\d+\): /, ""),
    );
    assert.equal(app.element("commands-content").hidden, true);
    assert.equal(app.element("commands-refresh").disabled, false);
    assert.equal(app.element("commands-approve").disabled, true);
  }
  app.element("commands-close").click();
  app.select("demo");
  await settle();
  const reads = app.reads.length;
  app.open();
  assert.match(app.status(), /Scripted demo.*no command configuration/);
  app.element("commands-refresh").fire("click");
  app.element("commands-approve").fire("click");
  assert.equal(app.reads.length, reads);
  assert.equal(app.approvals.length, 0);
});
