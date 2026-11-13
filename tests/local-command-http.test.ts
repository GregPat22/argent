import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { request as httpRequest, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { makeServer, type ServerOptions } from "../src/http.js";
import type { LocalCommandApprovalReceipt } from "../src/local-command-approvals.js";
import type { LocalCommandConfigDescriptor } from "../src/local-command-config.js";
import { createLocalWorkspace } from "../src/local-worktree.js";
import { Store } from "../src/store.js";

const CONFIG = JSON.stringify({
  version: 1,
  commands: { test: { argv: ["node", "marker.js"] } },
});
type Configuration = {
  kind: "local-command-configuration";
  workspaceId: string;
  configuration: LocalCommandConfigDescriptor | null;
  approval: { id: string; approvedAt: number } | null;
  executionAllowed: false;
};
type Receipt = Omit<LocalCommandApprovalReceipt, "approval"> & {
  approval: Omit<LocalCommandApprovalReceipt["approval"], "operatorId">;
  historical: true;
  executionAllowed: false;
};

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

async function close(server: Server): Promise<void> {
  const closed = new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  server.closeAllConnections();
  await closed;
}

async function fixture(t: TestContext, config: string | null = CONFIG) {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "argent-command-http-")),
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
  const stores = [new Store(database)];
  const store = stores[0]!;
  const worktrees = join(root, "worktrees");
  const workspace = await createLocalWorkspace(store, worktrees, repo);
  const servers = new Set<Server>();
  const db = new DatabaseSync(database);
  t.after(async () => {
    for (const server of servers) await close(server);
    db.close();
    for (const connection of stores) connection.close();
    rmSync(root, { recursive: true, force: true });
  });
  async function serve(
    options: ServerOptions = {
      worktreeRoot: worktrees,
      localCommandOperatorId: "local-desktop",
    },
    connection = store,
  ) {
    const token = randomBytes(32).toString("hex");
    const server = makeServer(connection, token, options);
    servers.add(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const request = (path: string, init: RequestInit = {}) =>
      fetch(origin + path, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...init.headers },
      });
    return {
      origin,
      token,
      request,
      read: (id = workspace.id) =>
        request(`/workspaces/${id}/command-configuration`),
      approve: (expected: string, key = "request", id = workspace.id) =>
        request(`/workspaces/${id}/command-approvals`, {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify({ expectedCandidateIdentity: expected }),
        }),
      stop: async () => {
        await close(server);
        servers.delete(server);
      },
    };
  }
  return {
    root,
    repo,
    store,
    worktrees,
    workspace,
    db,
    serve,
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
    reopen: () => {
      const next = new Store(database);
      stores.push(next);
      return next;
    },
  };
}

test("HTTP configuration approval binds the base, projects audit data and never queues code", async (t) => {
  const f = await fixture(t);
  const api = await f.serve();
  writeFileSync(
    join(f.workspace.local!.worktreePath, "argent.json"),
    "untrusted candidate",
  );
  const response = await api.read();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const view = (await response.json()) as Configuration;
  assert.equal(view.kind, "local-command-configuration");
  assert.equal(view.workspaceId, f.workspace.id);
  assert.equal(view.executionAllowed, false);
  assert.equal(view.approval, null);
  assert.deepEqual(view.configuration!.config, JSON.parse(CONFIG));
  assert.equal(view.configuration!.source.baseSha, f.workspace.local!.baseSha);
  const approval = await api.approve(
    view.configuration!.approvalCandidate.identity,
  );
  assert.equal(approval.status, 200);
  const receipt = (await approval.json()) as Receipt;
  assert.equal(receipt.kind, "local-command-approval-receipt");
  assert.equal(receipt.historical, true);
  assert.equal(receipt.executionAllowed, false);
  assert.deepEqual(receipt.approval.descriptor, view.configuration);
  assert.equal(receipt.event.type, "configuration.approved");
  assert.equal(Object.hasOwn(receipt.approval, "operatorId"), false);
  assert.equal(
    f.store.localCommandApprovals.get(receipt.approval.id).operatorId,
    "local-desktop",
  );
  assert.deepEqual(
    ((await (await api.read()).json()) as Configuration).approval,
    { id: receipt.approval.id, approvedAt: receipt.approval.approvedAt },
  );
  assert.deepEqual(f.counts(), [1, 1, 1, 0, 0]);
  assert.equal(f.store.claim(1000), null);
  for (const directory of [f.repo, f.workspace.local!.worktreePath])
    assert.equal(existsSync(join(directory, "executed")), false);
  assert.equal(JSON.stringify({ view, receipt }).includes(f.root), false);
});

test("HTTP approval receipts survive service restart and token rotation as historical reads", async (t) => {
  const f = await fixture(t);
  const api = await f.serve();
  const view = (await (await api.read()).json()) as Configuration;
  const identity = view.configuration!.approvalCandidate.identity;
  const receipt = await (await api.approve(identity)).json();
  await api.stop();
  const restarted = await f.serve(undefined, f.reopen());
  assert.notEqual(restarted.token, api.token);
  assert.equal(
    ((await (await restarted.read()).json()) as Configuration).approval!.id,
    (receipt as Receipt).approval.id,
  );
  assert.equal(
    (
      await restarted.request(
        `/workspaces/${f.workspace.id}/command-configuration`,
        { headers: { Authorization: `Bearer ${api.token}` } },
      )
    ).status,
    401,
  );
  renameSync(f.workspace.local!.worktreePath, join(f.root, "kept-worktree"));
  assert.deepEqual(await (await restarted.approve(identity)).json(), receipt);
  assert.equal((await restarted.read()).status, 409);
  assert.equal((await restarted.approve(identity, "new-request")).status, 409);
  assert.equal((await restarted.approve("b".repeat(64))).status, 409);
  assert.deepEqual(f.counts(), [1, 1, 1, 0, 0]);
});

test("HTTP approval reuses sibling configuration, separates operators and requires approval for changed base bytes", async (t) => {
  const f = await fixture(t);
  const api = await f.serve();
  const original = (await (await api.read()).json()) as Configuration;
  const identity = original.configuration!.approvalCandidate.identity;
  const receipt = (await (await api.approve(identity)).json()) as Receipt;
  const sibling = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const siblingView = (await (
    await api.read(sibling.id)
  ).json()) as Configuration;
  assert.equal(siblingView.approval!.id, receipt.approval.id);
  assert.equal(
    (await api.approve(identity, "request", sibling.id)).status,
    409,
  );
  const reused = (await (
    await api.approve(identity, "sibling", sibling.id)
  ).json()) as Receipt;
  assert.equal(reused.workspaceId, sibling.id);
  assert.equal(reused.approval.workspaceId, f.workspace.id);
  assert.equal(reused.event.type, "configuration.reused");
  const other = await f.serve({
    worktreeRoot: f.worktrees,
    localCommandOperatorId: "other-operator",
  });
  assert.equal(
    ((await (await other.read()).json()) as Configuration).approval,
    null,
  );
  assert.equal((await other.approve(identity)).status, 409);
  writeFileSync(join(f.repo, "argent.json"), CONFIG + "\n");
  git(f.repo, "add", ".");
  git(f.repo, "commit", "--quiet", "-m", "config bytes changed");
  const newer = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const changed = (await (await api.read(newer.id)).json()) as Configuration;
  assert.equal(changed.approval, null);
  assert.notEqual(changed.configuration!.approvalCandidate.identity, identity);
  assert.equal((await api.approve(identity, "stale", newer.id)).status, 409);
  assert.equal(
    (
      await api.approve(
        changed.configuration!.approvalCandidate.identity,
        "fresh",
        newer.id,
      )
    ).status,
    200,
  );
  assert.deepEqual(f.counts(), [2, 3, 3, 0, 0]);
});

test("HTTP approval routes require authentication, no browser origin and explicit service enablement", async (t) => {
  const f = await fixture(t);
  const api = await f.serve();
  const paths = [
    [`/workspaces/${f.workspace.id}/command-configuration`, "GET"],
    [`/workspaces/${f.workspace.id}/command-approvals`, "POST"],
  ] as const;
  for (const [path, method] of paths) {
    assert.equal(
      (await api.request(path, { method, headers: { Authorization: "wrong" } }))
        .status,
      401,
    );
    assert.equal(
      (
        await api.request(path, {
          method,
          headers: { Origin: "https://example.invalid" },
        })
      ).status,
      403,
    );
    for (const options of [{}, { worktreeRoot: f.worktrees }]) {
      const disabled = await f.serve(options);
      assert.equal((await disabled.request(path, { method })).status, 409);
    }
    assert.equal(
      (await api.request(path + "?operatorId=forged", { method })).status,
      400,
    );
    assert.equal((await api.request(path, { method: "DELETE" })).status, 404);
  }
  assert.throws(
    () =>
      makeServer(f.store, randomBytes(32).toString("hex"), {
        localCommandOperatorId: "operator",
      }),
    /require local/,
  );
  const simulated = f.store.createWorkspace(
    "https://github.com/example/test-repo",
  );
  assert.equal((await api.read(simulated.id)).status, 409);
  assert.equal((await api.read("not-a-uuid")).status, 400);
  assert.deepEqual(f.counts(), [0, 0, 0, 0, 0]);
});

test("HTTP approval rejects caller authority, malformed bodies, stale identities and oversized requests", async (t) => {
  const f = await fixture(t);
  const api = await f.serve();
  const view = (await (await api.read()).json()) as Configuration;
  const expected = view.configuration!.approvalCandidate.identity;
  const path = `/workspaces/${f.workspace.id}/command-approvals`;
  const body = { expectedCandidateIdentity: expected };
  for (const extra of [
    { operatorId: "forged" },
    { worktreeRoot: f.root },
    { argv: ["node", "marker.js"] },
    { descriptor: view.configuration },
    { approvalId: "forged" },
    { source: "HEAD" },
  ]) {
    const response = await api.request(path, {
      method: "POST",
      headers: { "Idempotency-Key": "reject" },
      body: JSON.stringify({ ...body, ...extra }),
    });
    assert.equal(response.status, 400);
  }
  for (const invalid of [
    "null",
    "[]",
    "{",
    "{}",
    JSON.stringify({ expectedCandidateIdentity: 42 }),
  ])
    assert.equal(
      (
        await api.request(path, {
          method: "POST",
          headers: { "Idempotency-Key": "reject" },
          body: invalid,
        })
      ).status,
      400,
    );
  assert.equal(
    (await api.request(path, { method: "POST", body: JSON.stringify(body) }))
      .status,
    400,
  );
  assert.equal((await api.approve("g".repeat(64))).status, 400);
  assert.equal((await api.approve("b".repeat(64))).status, 409);
  assert.equal(
    (await api.request(path, { method: "POST", body: "x".repeat(16385) }))
      .status,
    413,
  );
  assert.deepEqual(f.counts(), [0, 0, 0, 0, 0]);
});

test("HTTP configuration distinguishes missing config and fails closed on malformed and corrupt state", async (t) => {
  for (const config of [null, "malformed"]) {
    await t.test(config === null ? "missing" : "malformed", async (child) => {
      const f = await fixture(child, config);
      const api = await f.serve();
      const response = await api.read();
      if (config === null) {
        assert.equal(response.status, 200);
        const view = (await response.json()) as Configuration;
        assert.equal(view.configuration, null);
        assert.equal(view.approval, null);
      } else assert.equal(response.status, 409);
      assert.equal((await api.approve("a".repeat(64))).status, 409);
      assert.deepEqual(f.counts(), [0, 0, 0, 0, 0]);
    });
  }
  const f = await fixture(t);
  const api = await f.serve();
  const identity = ((await (await api.read()).json()) as Configuration)
    .configuration!.approvalCandidate.identity;
  await api.approve(identity);
  f.db
    .prepare("UPDATE local_command_approvals SET descriptor_sha256 = ?")
    .run("b".repeat(64));
  assert.equal((await api.read()).status, 409);
  assert.equal((await api.approve(identity)).status, 409);
  assert.deepEqual(f.counts(), [1, 1, 1, 0, 0]);
});

test("HTTP configuration disconnect aborts inspection and unexpected failures stay redacted", async (t) => {
  const f = await fixture(t);
  const api = await f.serve();
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  let aborted!: () => void;
  const cancelled = new Promise<void>((resolve) => {
    aborted = resolve;
  });
  const original = f.store.localCommandApprovals.inspect;
  f.store.localCommandApprovals.inspect = async (
    _root,
    _workspace,
    _operator,
    signal,
  ) => {
    assert.ok(signal);
    started();
    await new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    );
    aborted();
    throw signal.reason;
  };
  const request = httpRequest(
    `${api.origin}/workspaces/${f.workspace.id}/command-configuration`,
    { headers: { Authorization: `Bearer ${api.token}` } },
  );
  request.on("error", () => {});
  request.end();
  await entered;
  request.destroy();
  await cancelled;
  f.store.localCommandApprovals.inspect = async () => {
    throw new Error("private repository details");
  };
  const failure = await api.read();
  assert.equal(failure.status, 500);
  assert.deepEqual(await failure.json(), { error: "Internal error" });
  f.store.localCommandApprovals.inspect = original;
  assert.deepEqual(f.counts(), [0, 0, 0, 0, 0]);
});

test(
  "HTTP approval disconnect passes cancellation to the transaction without recording a receipt",
  { timeout: 10000 },
  async (t) => {
    const f = await fixture(t);
    const api = await f.serve();
    const identity = ((await (await api.read()).json()) as Configuration)
      .configuration!.approvalCandidate.identity;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finished!: () => void;
    const settled = new Promise<void>((resolve) => {
      finished = resolve;
    });
    const approvals = f.store.localCommandApprovals;
    const original = approvals.approve;
    approvals.approve = async (...args) => {
      const signal = args[5];
      assert.ok(signal);
      started();
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      try {
        return await original.apply(approvals, args);
      } finally {
        finished();
      }
    };
    const request = httpRequest(
      `${api.origin}/workspaces/${f.workspace.id}/command-approvals`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${api.token}`,
          "Idempotency-Key": "disconnected",
        },
      },
    );
    request.on("error", () => {});
    request.end(JSON.stringify({ expectedCandidateIdentity: identity }));
    await entered;
    request.destroy();
    await settled;
    approvals.approve = original;
    assert.deepEqual(f.counts(), [0, 0, 0, 0, 0]);
    assert.equal((await api.approve(identity, "disconnected")).status, 200);
    assert.deepEqual(f.counts(), [1, 1, 1, 0, 0]);
  },
);
