import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { stopService } from "../scripts/harness.js";
import type {
  CheckoutPlan,
  RepositoryAuthorization,
  SimulatedGitHubAccess,
  SimulatedRepositoryAuthority,
  SimulatedRepositoryBootstrap,
} from "../src/repository-access.js";
import { tokenExpiry } from "../src/repository-access.js";
import { RepositoryCredentialVault } from "../src/repository-credentials.js";
import { workRepository } from "../src/repository-worker.js";
import {
  resolveRepository,
  type SimulatedRepositoryRecovery,
} from "../src/repository-recovery.js";
import type { RepositoryOperation } from "../src/repository-store.js";
import { Store } from "../src/store.js";

const repository = "https://github.com/example/private-fixture";
const ref = "refs/heads/main";
const sha = "a".repeat(40);
const secret = "simulated_canary_bootstrap_secret_12345678";

// No network, Git command, dependency script or provider resource is involved.
class SimulationAccess
  implements
    SimulatedRepositoryAuthority,
    SimulatedGitHubAccess,
    SimulatedRepositoryBootstrap
{
  readonly simulation = true;
  readonly calls: string[] = [];
  grant: unknown = {
    operatorId: "operator",
    repository,
    ref,
    repositoryId: 101,
    installationId: 202,
  };
  token: Record<string, unknown> = {
    token: secret,
    expires_at: new Date(Date.now() + 3500000).toISOString(),
    repository_selection: "selected",
    permissions: { contents: "read", metadata: "read" },
    repositories: [{ id: 101, full_name: "example/private-fixture" }],
  };
  resolved: unknown = sha;
  fail: string | null = null;
  hang: string | null = null;
  checkoutPlan: CheckoutPlan | null = null;
  inspection: Record<string, unknown> = {};
  channel: string | null = null;
  revoked = false;
  mintedScope: unknown = null;
  onCall: (name: string) => void = () => {};

  private async call(name: string): Promise<void> {
    this.calls.push(name);
    this.onCall(name);
    if (this.fail === name)
      throw new Error(`Untrusted adapter error ${secret}`);
    if (this.hang === name) await new Promise(() => {});
  }

  async authorize(
    operatorId: string,
    url: string,
    branch: string,
  ): Promise<unknown> {
    assert.equal(operatorId, "operator");
    assert.equal(url, repository);
    assert.equal(branch, ref);
    await this.call("authorize");
    return this.grant;
  }
  async mint(
    installationId: number,
    scope: { repository_ids: [number]; permissions: { contents: "read" } },
  ): Promise<unknown> {
    assert.equal(installationId, 202);
    this.mintedScope = structuredClone(scope);
    await this.call("mint");
    return this.token;
  }
  async resolve(token: string, url: string, branch: string): Promise<unknown> {
    assert.equal(token, secret);
    assert.equal(url, repository);
    assert.equal(branch, ref);
    await this.call("resolve");
    return this.resolved;
  }
  async revoke(token: string): Promise<void> {
    assert.equal(token, secret);
    await this.call("revoke");
    this.revoked = true;
  }
  async checkout(plan: CheckoutPlan, token: string): Promise<void> {
    assert.equal(token, secret);
    this.channel = token;
    this.checkoutPlan = structuredClone(plan);
    await this.call("checkout");
  }
  async inspect(): Promise<unknown> {
    await this.call("inspect");
    return {
      ...this.checkoutPlan,
      credentialPersisted: false,
      ...this.inspection,
    };
  }
  async clearCredential(): Promise<void> {
    await this.call("clear");
    this.channel = null;
  }
}

function ready(store: Store) {
  const workspace = store.createWorkspace(repository);
  const intent = store.lifecycle.request(
    workspace.id,
    "create",
    `create-${workspace.id}`,
  );
  const claim = store.lifecycle.claim(1000)!;
  store.lifecycle.dispatch(claim.id, claim.leaseToken!);
  store.lifecycle.complete(claim.id, claim.leaseToken!, {
    state: "ready",
    providerId: `sim-${workspace.id}`,
    creationMarker: intent.id,
  });
  return workspace;
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "argent-repository-"));
  const path = join(root, "platform.sqlite");
  const f = {
    root,
    path,
    store: new Store(path),
    adapter: new SimulationAccess(),
    reopen() {
      f.store.close();
      f.store = new Store(path);
    },
    work(leaseMs = 1000, cleanupMs = 100) {
      return workRepository(
        f.store.repositories,
        f.adapter,
        f.adapter,
        f.adapter,
        new RepositoryCredentialVault(
          f.store.repositories,
          "simulation-key",
          Buffer.alloc(32, 7),
        ),
        leaseMs,
        cleanupMs,
      );
    },
  };
  const workspace = ready(f.store);
  const request = (key = "request", runtime = 30000) =>
    f.store.repositories.request(workspace.id, "operator", ref, key, runtime);
  t.after(() => {
    f.store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return Object.assign(f, { workspace, request });
}

test("simulated repository bootstrap pins identity, narrows scope and cleans credentials before success", async (t) => {
  const f = fixture(t);
  const op = f.request();
  f.adapter.onCall = (call) => {
    const persisted = f.store.repositories.operation(op.id);
    if (call === "mint") {
      assert.equal(persisted.phase, "minting");
      assert.equal(persisted.credential, "unknown");
    }
    if (call === "checkout") {
      assert.equal(persisted.phase, "checkout");
      assert.equal(persisted.headSha, sha);
      assert.equal(persisted.channel, "unknown");
    }
    if (call === "revoke" || call === "clear")
      assert.equal(persisted.status, "running");
  };
  assert.equal(await f.work(), true);
  const result = f.store.repositories.operation(op.id);
  assert.equal(result.status, "succeeded");
  assert.equal(result.headSha, sha);
  assert.equal(result.repositoryId, 101);
  assert.equal(result.installationId, 202);
  assert.equal(result.credential, "revoked");
  assert.equal(result.channel, "cleared");
  assert.throws(() => vault(f.store).recover(op.id, "operator"), /unavailable/);
  assert.equal(result.simulation, true);
  assert.equal(f.adapter.channel, null);
  assert.equal(f.adapter.revoked, true);
  assert.deepEqual(f.adapter.mintedScope, {
    repository_ids: [101],
    permissions: { contents: "read" },
  });
  assert.deepEqual(f.adapter.calls, [
    "authorize",
    "mint",
    "resolve",
    "checkout",
    "inspect",
    "revoke",
    "clear",
  ]);
  const events = f.store.repositories.events(op.id);
  assert.equal(events.at(-1)!.type, "repository.succeeded");
  assert.ok(
    events.findIndex((event) => event.type === "repository.token_revoked") <
      events.length - 1,
  );
  assert.deepEqual(
    f.store.repositories.events(op.id, events[0]!.cursor),
    events.slice(1),
  );
  assert.equal(
    JSON.stringify([result, events, f.adapter.checkoutPlan]).includes(secret),
    false,
  );
  for (const suffix of ["", "-wal"])
    assert.equal(
      readFileSync(f.path + suffix).includes(Buffer.from(secret)),
      false,
    );
  f.reopen();
  assert.equal(f.store.repositories.operation(op.id).status, "succeeded");
  assert.equal(f.request().id, op.id);
  assert.equal(await f.work(), false);
  assert.equal(f.adapter.calls.length, 7);
  assert.throws(() => f.request("new-key"), /already has/);
  // Completion unblocks explicitly requested lifecycle mutations.
  assert.equal(
    f.store.lifecycle.request(f.workspace.id, "pause", "after-checkout").kind,
    "pause",
  );
});

for (const [name, patch] of [
  ["another operator", { operatorId: "intruder" }],
  ["second repository", { repository: "https://github.com/example/other" }],
  ["unapproved ref", { ref: "refs/heads/other" }],
  ["forged installation", { installationId: 0 }],
  ["invalid repository id", { repositoryId: "101" }],
] as const) {
  test(`simulated authorization rejects ${name} before minting`, async (t) => {
    const f = fixture(t);
    const op = f.request();
    f.adapter.grant = {
      ...(f.adapter.grant as RepositoryAuthorization),
      ...patch,
    };
    await f.work();
    assert.deepEqual(f.adapter.calls, ["authorize"]);
    assert.equal(f.store.repositories.operation(op.id).status, "failed");
    assert.equal(f.store.repositories.operation(op.id).credential, "none");
  });
}

test("simulated denial before minting fails cleanly and a new request can retry", async (t) => {
  const f = fixture(t);
  const op = f.request();
  f.adapter.grant = null;
  await f.work();
  const result = f.store.repositories.operation(op.id);
  assert.equal(result.status, "failed");
  assert.equal(result.leaseToken, null);
  assert.equal(
    f.store.repositories.events(op.id).at(-1)!.type,
    "repository.failed",
  );
  // The same key still names the failed attempt; a retry needs a new key.
  assert.equal(f.request().id, op.id);
  assert.equal(await f.work(), false);
  f.adapter.grant = {
    operatorId: "operator",
    repository,
    ref,
    repositoryId: 101,
    installationId: 202,
  };
  const retry = f.request("retry");
  assert.notEqual(retry.id, op.id);
  assert.equal(await f.work(), true);
  assert.equal(f.store.repositories.operation(retry.id).status, "succeeded");
  assert.equal(f.store.repositories.operation(op.id).status, "failed");
  assert.throws(() => f.request("third"), /already has/);
});

test("simulated denial before minting leaves lifecycle requests available", async (t) => {
  const f = fixture(t);
  f.request();
  f.adapter.fail = "authorize";
  await f.work();
  assert.equal(
    f.store.lifecycle.request(f.workspace.id, "delete", "after-denial").kind,
    "delete",
  );
});

test("simulated revoked access is rechecked for another workspace and cannot mint", async (t) => {
  const f = fixture(t);
  f.request();
  await f.work();
  const second = ready(f.store);
  const op = f.store.repositories.request(second.id, "operator", ref, "second");
  f.adapter.grant = null;
  await f.work();
  assert.equal(
    f.adapter.calls.filter((call) => call === "authorize").length,
    2,
  );
  assert.equal(f.adapter.calls.filter((call) => call === "mint").length, 1);
  assert.equal(f.store.repositories.operation(op.id).status, "failed");
});

for (const [name, patch] of [
  ["write permission", { permissions: { contents: "write" } }],
  [
    "extra read permission",
    { permissions: { contents: "read", issues: "read" } },
  ],
  [
    "extra repository",
    {
      repositories: [
        { id: 101, full_name: "example/private-fixture" },
        { id: 102, full_name: "example/other" },
      ],
    },
  ],
  [
    "wrong repository id",
    { repositories: [{ id: 102, full_name: "example/private-fixture" }] },
  ],
  ["all repositories", { repository_selection: "all" }],
  ["expired token", { expires_at: new Date(0).toISOString() }],
  [
    "unbounded expiration",
    { expires_at: new Date(Date.now() + 7200000).toISOString() },
  ],
  ["invalid expiration", { expires_at: "never" }],
] as const) {
  test(`simulated token validation rejects ${name} and revokes without checkout`, async (t) => {
    const f = fixture(t);
    const op = f.request();
    Object.assign(f.adapter.token, patch);
    await f.work();
    assert.deepEqual(f.adapter.calls, ["authorize", "mint", "revoke"]);
    const result = f.store.repositories.operation(op.id);
    assert.equal(result.status, "needs_attention");
    assert.equal(result.credential, "revoked");
    assert.equal(result.channel, "none");
  });
}

for (const [name, patch] of [
  ["wrong provider", { providerId: "sim-other" }],
  ["wrong operation", { operationId: "other" }],
  ["wrong SHA", { headSha: "b".repeat(40) }],
  ["wrong repository", { repositoryId: 102 }],
  [
    "credential in remote",
    { remoteUrl: `https://${secret}@github.com/example/private-fixture` },
  ],
  ["persisted credential", { credentialPersisted: true }],
  ["submodules", { submodules: true }],
  ["LFS", { lfs: true }],
  ["hooks", { hooks: true }],
] as const) {
  test(`simulated independent checkout inspection rejects ${name} and cleans up`, async (t) => {
    const f = fixture(t);
    const op = f.request();
    f.adapter.inspection = patch;
    await f.work();
    const result = f.store.repositories.operation(op.id);
    assert.equal(result.status, "needs_attention");
    assert.equal(result.credential, "revoked");
    assert.equal(result.channel, "cleared");
    assert.equal(
      JSON.stringify([result, f.store.repositories.events(op.id)]).includes(
        secret,
      ),
      false,
    );
  });
}

for (const failure of [
  "mint",
  "resolve",
  "checkout",
  "inspect",
  "revoke",
  "clear",
]) {
  test(`simulated ${failure} failure retains cleanup obligations and never replays`, async (t) => {
    const f = fixture(t);
    const op = f.request();
    f.adapter.fail = failure;
    await f.work();
    const result = f.store.repositories.operation(op.id);
    assert.equal(result.status, "needs_attention");
    if (["resolve", "checkout", "inspect", "clear"].includes(failure))
      assert.equal(result.credential, "revoked");
    if (["checkout", "inspect", "revoke"].includes(failure))
      assert.equal(result.channel, "cleared");
    if (failure === "mint") assert.equal(result.credential, "unknown");
    if (failure === "revoke") assert.equal(result.credential, "issued");
    if (failure === "clear") assert.equal(result.channel, "unknown");
    const calls = [...f.adapter.calls];
    const events = f.store.repositories.events(op.id);
    assert.equal(JSON.stringify([result, events]).includes(secret), false);
    f.reopen();
    assert.equal(f.request().id, op.id);
    assert.equal(await f.work(), false);
    assert.deepEqual(f.adapter.calls, calls);
    assert.deepEqual(f.store.repositories.events(op.id), events);
    assert.throws(
      () => f.store.lifecycle.request(f.workspace.id, "pause", "blocked"),
      /repository bootstrap/,
    );
    assert.throws(
      () =>
        f.store.lifecycle.request(f.workspace.id, "delete", "blocked-delete"),
      /repository bootstrap/,
    );
  });
}

test("simulated invalid SHA never dispatches checkout", async (t) => {
  const f = fixture(t);
  const op = f.request();
  f.adapter.resolved = "main";
  await f.work();
  assert.deepEqual(f.adapter.calls, ["authorize", "mint", "resolve", "revoke"]);
  assert.equal(f.store.repositories.operation(op.id).headSha, null);
});

for (const malformed of [
  "null",
  "missing-token",
  "non-string-token",
  "missing-permissions",
]) {
  test(`simulated malformed mint response (${malformed}) never reaches checkout`, async (t) => {
    const f = fixture(t);
    const op = f.request();
    f.adapter.mint = async () => {
      f.adapter.calls.push("mint");
      if (malformed === "null") return null;
      const value = { ...f.adapter.token };
      if (malformed === "missing-token") delete value.token;
      if (malformed === "non-string-token") value.token = 123;
      if (malformed === "missing-permissions") delete value.permissions;
      return value;
    };
    await f.work();
    const result = f.store.repositories.operation(op.id);
    assert.equal(result.status, "needs_attention");
    assert.equal(result.channel, "none");
    const knownToken = malformed === "missing-permissions";
    assert.equal(result.credential, knownToken ? "revoked" : "unknown");
    assert.deepEqual(
      f.adapter.calls,
      knownToken ? ["authorize", "mint", "revoke"] : ["authorize", "mint"],
    );
    assert.equal(
      JSON.stringify([result, f.store.repositories.events(op.id)]).includes(
        secret,
      ),
      false,
    );
  });
}

test("simulated heartbeat failure aborts an outstanding authorization call", async (t) => {
  const f = fixture(t);
  const op = f.request("request", 1000);
  f.adapter.hang = "authorize";
  let heartbeats = 0;
  f.store.repositories.heartbeat = () => {
    heartbeats++;
    throw new Error(secret);
  };
  await f.work(100);
  assert.equal(heartbeats, 1);
  assert.deepEqual(f.adapter.calls, ["authorize"]);
  const result = f.store.repositories.operation(op.id);
  assert.equal(result.status, "failed");
  assert.equal(result.credential, "none");
  assert.equal(
    JSON.stringify([result, f.store.repositories.events(op.id)]).includes(
      secret,
    ),
    false,
  );
});

test("simulated checkout adapter cannot mutate its verification baseline", async (t) => {
  const f = fixture(t);
  const op = f.request();
  f.adapter.checkout = async (plan) => {
    plan.headSha = "b".repeat(40);
  };
  await f.work();
  const result = f.store.repositories.operation(op.id);
  assert.equal(result.status, "needs_attention");
  assert.equal(result.headSha, sha);
  assert.equal(result.credential, "revoked");
  assert.equal(result.channel, "cleared");
  assert.equal(f.adapter.calls.includes("inspect"), false);
});

for (const hang of ["mint", "checkout", "revoke", "clear"]) {
  test(`simulated hung ${hang} is bounded, blocked and not retried`, async (t) => {
    const f = fixture(t);
    const op = f.request(
      "request",
      hang === "mint" || hang === "checkout" ? 100 : 30000,
    );
    f.adapter.hang = hang;
    await f.work(1000, 100);
    const result = f.store.repositories.operation(op.id);
    assert.equal(result.status, "needs_attention");
    if (hang === "mint") assert.equal(result.credential, "unknown");
    if (hang === "revoke") {
      assert.equal(result.credential, "issued");
      assert.equal(result.channel, "cleared");
    }
    if (hang === "clear") assert.equal(result.channel, "unknown");
    const calls = [...f.adapter.calls];
    assert.equal(await f.work(), false);
    assert.deepEqual(f.adapter.calls, calls);
  });
}

test("simulated bootstrap ownership expiry rejects stale writes and restart retains intent", async (t) => {
  const f = fixture(t);
  const op = f.request();
  const claimed = f.store.repositories.claim(100)!;
  f.store.repositories.authorize(op.id, claimed.leaseToken!, 101, 202);
  await delay(120);
  f.reopen();
  assert.throws(
    () =>
      f.store.repositories.minted(
        op.id,
        claimed.leaseToken!,
        Date.now() + 3500000,
      ),
    /ownership lost/,
  );
  assert.equal(f.store.repositories.reconcileExpired(), 1);
  assert.equal(f.store.repositories.operation(op.id).credential, "unknown");
  assert.equal(f.store.repositories.operation(op.id).status, "needs_attention");
  assert.equal(await f.work(), false);
  assert.deepEqual(f.adapter.calls, []);
});

test("simulated heartbeat keeps a slow authorization claim alive", async (t) => {
  const f = fixture(t);
  const op = f.request();
  const original = f.adapter.authorize.bind(f.adapter);
  f.adapter.authorize = async (...args) => {
    await delay(250);
    return original(...args);
  };
  await f.work(100);
  assert.equal(f.store.repositories.operation(op.id).status, "succeeded");
});

test("simulated repository submissions enforce idempotency, readiness and lifecycle serialization", async (t) => {
  const f = fixture(t);
  const op = f.request();
  assert.equal(f.request().id, op.id);
  assert.throws(
    () => f.store.repositories.request(f.workspace.id, "other", ref, "request"),
    /different payload/,
  );
  assert.throws(
    () =>
      f.store.repositories.request(
        f.workspace.id,
        "operator",
        "refs/heads/other",
        "request",
      ),
    /different payload/,
  );
  assert.throws(() => f.request("request", 100), /different payload/);
  assert.throws(
    () =>
      f.store.repositories.request(
        f.workspace.id,
        "operator",
        "--upload-pack=bad",
        "bad",
      ),
    /explicit branch/,
  );
  assert.throws(
    () => f.store.lifecycle.request(f.workspace.id, "pause", "pause"),
    /repository bootstrap/,
  );
  const plain = f.store.createWorkspace(repository);
  assert.throws(
    () => f.store.repositories.request(plain.id, "operator", ref, "plain"),
    /ready lifecycle/,
  );
  const pausing = ready(f.store);
  f.store.lifecycle.request(pausing.id, "pause", "pausing");
  assert.throws(
    () =>
      f.store.repositories.request(
        pausing.id,
        "operator",
        ref,
        "pausing-bootstrap",
      ),
    /ready lifecycle/,
  );
});

test("simulated atomic repository claim has one winner across independent connections", (t) => {
  const f = fixture(t);
  const op = f.request();
  const second = new Store(f.path);
  try {
    assert.equal(f.store.repositories.claim(1000)!.id, op.id);
    assert.equal(second.repositories.claim(1000), null);
    assert.equal(second.repositories.operation(op.id).status, "running");
  } finally {
    second.close();
  }
});

test("simulated repository transition and event roll back together", (t) => {
  const f = fixture(t);
  const op = f.request();
  const claimed = f.store.repositories.claim(1000)!;
  const db = new DatabaseSync(f.path);
  try {
    db.exec(
      "CREATE TRIGGER reject_repository_event BEFORE INSERT ON repository_events BEGIN SELECT RAISE(ABORT, 'fixture rollback'); END",
    );
    assert.throws(
      () =>
        f.store.repositories.authorize(op.id, claimed.leaseToken!, 101, 202),
      /fixture rollback/,
    );
    assert.equal(f.store.repositories.operation(op.id).phase, "authorizing");
    assert.equal(f.store.repositories.operation(op.id).credential, "none");
    assert.equal(f.store.repositories.operation(op.id).repositoryId, null);
    assert.equal(
      f.store.repositories.operation(op.id).credentialReference,
      null,
    );
  } finally {
    db.close();
  }
});

test("simulated store rejects phase skipping and success before cleanup", (t) => {
  const f = fixture(t);
  const op = f.request();
  const claim = f.store.repositories.claim(1000)!;
  const fence = claim.leaseToken!;
  assert.throws(
    () => f.store.repositories.complete(op.id, fence),
    /Invalid repository transition/,
  );
  f.store.repositories.authorize(op.id, fence, 101, 202);
  new RepositoryCredentialVault(
    f.store.repositories,
    "simulation-key",
    Buffer.alloc(32, 7),
  ).capture(op.id, fence, secret);
  f.store.repositories.minted(op.id, fence, Date.now() + 3500000);
  f.store.repositories.checkout(op.id, fence, sha);
  f.store.repositories.verified(op.id, fence);
  assert.throws(
    () => f.store.repositories.complete(op.id, fence),
    /cleanup is incomplete/,
  );
});

test("repository worker refuses non-simulation adapters before claiming", async (t) => {
  const f = fixture(t);
  const op = f.request();
  const unsafe = Object.assign(Object.create(f.adapter), {
    simulation: false,
  }) as SimulatedGitHubAccess;
  await assert.rejects(
    workRepository(
      f.store.repositories,
      f.adapter,
      unsafe,
      f.adapter,
      new RepositoryCredentialVault(
        f.store.repositories,
        "simulation-key",
        Buffer.alloc(32, 7),
      ),
    ),
    /Only simulated/,
  );
  assert.equal(f.store.repositories.operation(op.id).status, "queued");
});

async function child(
  t: TestContext,
  path: string,
  mode: string,
  workspaceId: string,
) {
  const process = spawn(
    globalThis.process.execPath,
    [
      fileURLToPath(new URL("./repository-fixture.js", import.meta.url)),
      path,
      mode,
      workspaceId,
    ],
    { env: {}, stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  t.after(() => stopService(process));
  const exit = new Promise<void>((resolve, reject) => {
    process.once("error", reject);
    process.once("exit", (code, signal) =>
      code === 0 || signal === "SIGKILL"
        ? resolve()
        : reject(new Error("Simulation child failed")),
    );
  });
  const ready = await Promise.race([
    once(process, "message"),
    exit.then(() => {
      throw new Error("Simulation child exited before ready");
    }),
  ]);
  assert.equal(ready[0], "ready");
  return {
    process,
    exit,
    async go(
      message: string | { id: string; fence: string } = "go",
    ): Promise<{ id?: string | null; conflict?: true }> {
      const response = Promise.race([
        once(process, "message"),
        exit.then(() => {
          throw new Error("Simulation child exited before response");
        }),
      ]);
      process.send(message);
      return (await response)[0];
    },
  };
}

test("simulated repository claims race in separate processes with one winner", async (t) => {
  const f = fixture(t);
  const op = f.request();
  const children = await Promise.all([
    child(t, f.path, "claim", f.workspace.id),
    child(t, f.path, "claim", f.workspace.id),
  ]);
  const results = await Promise.all(children.map((entry) => entry.go()));
  assert.deepEqual(
    results.map((result) => result.id).sort(),
    [null, op.id].sort(),
  );
  await Promise.all(children.map((entry) => entry.exit));
  assert.equal(
    f.store.repositories
      .events(op.id)
      .filter((event) => event.type === "repository.claimed").length,
    1,
  );
});

test("simulated bootstrap enrollment and pause race in separate processes", async (t) => {
  const f = fixture(t);
  const children = await Promise.all([
    child(t, f.path, "request", f.workspace.id),
    child(t, f.path, "pause", f.workspace.id),
  ]);
  const results = await Promise.all(children.map((entry) => entry.go()));
  assert.equal(results.filter((result) => result.id).length, 1);
  assert.equal(results.filter((result) => result.conflict).length, 1);
  await Promise.all(children.map((entry) => entry.exit));
});

test("simulated process death after mint intent preserves unknown credential without redispatch", async (t) => {
  const f = fixture(t);
  const op = f.request();
  const worker = await child(t, f.path, "crash", f.workspace.id);
  assert.equal((await worker.go()).id, op.id);
  worker.process.kill("SIGKILL");
  await worker.exit;
  await delay(120);
  f.reopen();
  assert.equal(await f.work(), false);
  const result = f.store.repositories.operation(op.id);
  assert.equal(result.status, "needs_attention");
  assert.equal(result.credential, "unknown");
  assert.deepEqual(f.adapter.calls, []);
});

test("simulated late checkout acknowledgment never promotes timed-out bootstrap", async (t) => {
  const f = fixture(t);
  const op = f.request("request", 100);
  let release!: () => void;
  f.adapter.checkout = async () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  await f.work();
  release();
  await delay(0);
  assert.equal(f.store.repositories.operation(op.id).status, "needs_attention");
  assert.equal(f.adapter.calls.includes("inspect"), false);
  assert.equal(await f.work(), false);
});

test("simulated repository ownership is rechecked after database lock contention", async (t) => {
  const f = fixture(t);
  const op = f.request();
  const claim = f.store.repositories.claim(500)!;
  const lock = spawn(
    process.execPath,
    [fileURLToPath(new URL("./lock-fixture.js", import.meta.url))],
    { env: { PLATFORM_DATA_DIR: f.root }, stdio: ["ignore", "pipe", "pipe"] },
  );
  t.after(() => stopService(lock));
  await Promise.race([
    once(lock.stdout!, "data"),
    once(lock, "exit").then(() => {
      throw new Error("Lock fixture exited before locking");
    }),
  ]);
  assert.ok(Date.now() < claim.leaseExpiresAt!);
  assert.throws(
    () => f.store.repositories.authorize(op.id, claim.leaseToken!, 101, 202),
    /ownership lost/,
  );
  assert.equal(f.store.repositories.operation(op.id).credential, "none");
  assert.equal(f.store.repositories.reconcileExpired(), 1);
});

test("simulated token scope pins the repository ID and ignores owner/name changes", () => {
  const now = Date.now();
  const token = {
    token: secret,
    expires_at: new Date(now + 3500000).toISOString(),
    repository_selection: "selected",
    permissions: { contents: "read" },
    repositories: [{ id: 101, full_name: "new-owner/renamed-fixture" }],
  };
  const grant = {
    operatorId: "operator",
    repository: "https://github.com/Example/Private-Fixture.git",
    ref,
    repositoryId: 101,
    installationId: 202,
  };
  assert.equal(tokenExpiry(token, grant, now), Date.parse(token.expires_at));
  assert.throws(
    () =>
      tokenExpiry(
        {
          ...token,
          repositories: [{ id: 102, full_name: "example/private-fixture" }],
        },
        grant,
        now,
      ),
    /scope or expiration/,
  );
});

test("simulated bootstrap succeeds after the repository was renamed or transferred", async (t) => {
  const f = fixture(t);
  const op = f.request();
  f.adapter.token.repositories = [{ id: 101, full_name: "new-owner/renamed" }];
  await f.work();
  const result = f.store.repositories.operation(op.id);
  assert.equal(result.status, "succeeded");
  assert.equal(result.repositoryId, 101);
  assert.equal(result.credential, "revoked");
  assert.equal(result.channel, "cleared");
});

test("simulated requests accept dotted branch names and reject invalid Git refs", (t) => {
  const f = fixture(t);
  for (const branch of [
    "refs/heads/release-1.2",
    "refs/heads/v2.0",
    "refs/heads/feature/x.y_z",
  ]) {
    const workspace = ready(f.store);
    assert.equal(
      f.store.repositories.request(workspace.id, "operator", branch, branch)
        .ref,
      branch,
    );
  }
  for (const branch of [
    "refs/heads/.hidden",
    "refs/heads/a/.b",
    "refs/heads/a..b",
    "refs/heads/a.",
    "refs/heads/a.lock",
    "refs/heads/a.lock/b",
    "refs/tags/v1.0",
  ])
    assert.throws(
      () =>
        f.store.repositories.request(
          f.workspace.id,
          "operator",
          branch,
          branch,
        ),
      /explicit branch ref/,
    );
});

test("simulated token that expires before the deadline is revoked before resolve", async (t) => {
  const f = fixture(t);
  const op = f.request("request", 300000);
  f.adapter.token.expires_at = new Date(Date.now() + 90000).toISOString();
  await f.work();
  assert.deepEqual(f.adapter.calls, ["authorize", "mint", "revoke"]);
  const result = f.store.repositories.operation(op.id);
  assert.equal(result.status, "needs_attention");
  assert.equal(result.credential, "revoked");
  assert.equal(result.channel, "none");
});

test("simulated token that expires during the post-deadline cleanup window is revoked before resolve", async (t) => {
  const f = fixture(t);
  const op = f.request("request", 120000);
  // Outlives the deadline but not one 1000 ms cleanup timeout after it.
  f.adapter.token.expires_at = new Date(Date.now() + 120500).toISOString();
  await f.work(1000, 1000);
  assert.deepEqual(f.adapter.calls, ["authorize", "mint", "revoke"]);
  const result = f.store.repositories.operation(op.id);
  assert.equal(result.status, "needs_attention");
  assert.equal(result.credential, "revoked");
});

test("simulated expiry before mint intent fails cleanly and allows a retry", async (t) => {
  const f = fixture(t);
  const op = f.request();
  f.store.repositories.claim(100);
  await delay(120);
  f.reopen();
  assert.equal(f.store.repositories.reconcileExpired(), 1);
  assert.equal(f.store.repositories.operation(op.id).status, "failed");
  assert.equal(f.store.repositories.operation(op.id).credential, "none");
  assert.notEqual(f.request("retry").id, op.id);
});

function schema(path: string) {
  const db = new DatabaseSync(path);
  const result = {
    sql: db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE name = 'repository_operations'",
      )
      .get()!.sql as string,
    index: db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name = 'one_repository_bootstrap'",
      )
      .get(),
    version: db
      .prepare(
        "SELECT version FROM schema_versions WHERE component = 'repository'",
      )
      .get()?.version,
  };
  db.close();
  return result;
}

test("simulated repository schema migrates first-version rows without losing obligations", async (t) => {
  const f = fixture(t);
  const op = f.request();
  f.adapter.fail = "mint";
  await f.work();
  const before = f.store.repositories.operation(op.id);
  const events = f.store.repositories.events(op.id);
  assert.equal(before.status, "needs_attention");
  f.store.close();
  // Recreate the PR #6 table around the existing rows, without a version.
  const db = new DatabaseSync(f.path);
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE legacy (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL UNIQUE REFERENCES lifecycle_workspaces(workspace_id),
      operator_id TEXT NOT NULL, repository TEXT NOT NULL, ref TEXT NOT NULL,
      provider_id TEXT NOT NULL, repository_id INTEGER, installation_id INTEGER,
      head_sha TEXT, request_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','needs_attention')),
      phase TEXT NOT NULL CHECK(phase IN ('authorizing','minting','resolving','checkout','cleaning')),
      credential TEXT NOT NULL CHECK(credential IN ('none','unknown','issued','revoked')),
      channel TEXT NOT NULL CHECK(channel IN ('none','unknown','cleared')),
      token_expires_at INTEGER, max_runtime_ms INTEGER NOT NULL,
      created_at INTEGER NOT NULL, lease_token TEXT, lease_expires_at INTEGER, deadline_at INTEGER
    ) STRICT;
    INSERT INTO legacy SELECT * FROM repository_operations;
    DROP TABLE repository_operations;
    ALTER TABLE legacy RENAME TO repository_operations;
    DROP TABLE schema_versions;
    COMMIT;
  `);
  db.close();

  f.store = new Store(f.path);
  assert.deepEqual(f.store.repositories.operation(op.id), before);
  assert.deepEqual(f.store.repositories.events(op.id), events);
  assert.throws(() => f.request("retry"), /already has repository/);
  const migrated = schema(f.path);
  assert.match(migrated.sql, /'failed'/);
  assert.doesNotMatch(migrated.sql, /workspace_id TEXT NOT NULL UNIQUE/);
  assert.ok(migrated.index);
  assert.equal(migrated.version, 4);
});

test("simulated repository schema records unversioned databases and refuses newer ones", (t) => {
  const f = fixture(t);
  const op = f.request();
  f.store.close();
  const edit = (sql: string) => {
    const db = new DatabaseSync(f.path);
    db.exec(sql);
    db.close();
  };
  edit("UPDATE schema_versions SET version = 5");
  assert.throws(() => new Store(f.path), /newer than this build/);
  // A failed start must release the database for the next one.
  edit("DELETE FROM schema_versions");
  f.store = new Store(f.path);
  assert.equal(f.store.repositories.operation(op.id).status, "queued");
  assert.equal(schema(f.path).version, 4);
});

// Synthetic control-plane observations, independent of bootstrap/agent output.
// No actual provider cleanup or credential revocation is proved by this fixture.
class SimulationRecovery implements SimulatedRepositoryRecovery {
  readonly simulation = true;
  calls = 0;
  evidence: Record<string, unknown> = {};
  async inspectRecovery(op: Readonly<RepositoryOperation>): Promise<unknown> {
    this.calls++;
    assert.ok(Object.isFrozen(op));
    return {
      operationId: op.id,
      workspaceId: op.workspaceId,
      providerId: op.providerId,
      repositoryId: op.repositoryId,
      installationId: op.installationId,
      effectsSettled: true,
      credential: "revoked",
      channel: "cleared",
      checkout: "absent",
      observedAt: Date.now(),
      simulation: true,
      ...this.evidence,
    };
  }
}

async function uncertain(t: TestContext) {
  const f = fixture(t);
  const op = f.request();
  f.adapter.fail = "mint";
  await f.work();
  assert.equal(f.store.repositories.operation(op.id).status, "needs_attention");
  const inspector = new SimulationRecovery();
  return Object.assign(f, {
    op,
    inspector,
    resolve(key = "resolution", timeoutMs = 1000) {
      return resolveRepository(
        f.store.repositories,
        inspector,
        op.id,
        "operator",
        key,
        timeoutMs,
      );
    },
  });
}

test("simulated recovery audits clean resolution, preserves the old attempt and requires fresh authorization", async (t) => {
  const f = await uncertain(t);
  const before = f.store.repositories.operation(f.op.id);
  const calls = [...f.adapter.calls];
  const receipt = await f.resolve();
  assert.equal(receipt.status, "resolved");
  assert.equal(receipt.operatorId, "operator");
  assert.equal(receipt.simulation, true);
  assert.equal(receipt.reason, null);
  assert.ok(receipt.observedAt! <= receipt.createdAt);
  assert.deepEqual(f.adapter.calls, calls);
  assert.deepEqual(f.store.repositories.operation(f.op.id), {
    ...before,
    status: "failed",
  });
  assert.equal(
    f.store.repositories.events(f.op.id, receipt.eventCursor - 1)[0]?.type,
    "repository.resolution_resolved",
  );
  assert.equal(f.request().id, f.op.id); // The old submission key never replays.
  const retry = f.request("retry");
  assert.notEqual(retry.id, f.op.id);
  f.adapter.calls.length = 0;
  f.adapter.fail = "authorize";
  await f.work();
  assert.deepEqual(f.adapter.calls, ["authorize"]);
  assert.equal(f.store.repositories.operation(retry.id).status, "failed");
  assert.equal(f.store.repositories.operation(f.op.id).status, "failed");
});

test("simulated recovery receipts survive restart and completed duplicates only read", async (t) => {
  const f = await uncertain(t);
  const receipt = await f.resolve();
  const events = f.store.repositories.events(f.op.id);
  f.reopen();
  f.inspector.inspectRecovery = async () => {
    throw new Error(secret);
  };
  assert.deepEqual(await f.resolve(), receipt);
  assert.deepEqual(
    f.store.repositories.resolution(f.op.id, "operator", "resolution"),
    receipt,
  );
  assert.deepEqual(f.store.repositories.events(f.op.id), events);
  assert.equal(f.inspector.calls, 1);
});

for (const [field, bad] of Object.entries({
  operationId: "different-operation",
  workspaceId: "different-workspace",
  providerId: "different-provider",
  repositoryId: 102,
  installationId: 203,
  effectsSettled: false,
  credential: "issued",
  channel: "unknown",
  checkout: "present",
  observedAt: 1,
  simulation: false,
})) {
  test(`simulated recovery rejects unconfirmed ${field} and keeps lifecycle/bootstrap blocked`, async (t) => {
    const f = await uncertain(t);
    f.inspector.evidence[field] = bad;
    const receipt = await f.resolve();
    assert.equal(receipt.status, "rejected");
    assert.equal(receipt.reason, "unconfirmed");
    assert.equal(receipt.observedAt, null);
    assert.equal(
      f.store.repositories.operation(f.op.id).status,
      "needs_attention",
    );
    assert.throws(() => f.request("retry"), /already has repository/);
    assert.throws(
      () => f.store.lifecycle.request(f.workspace.id, "delete", "delete"),
      /bootstrap/,
    );
    f.inspector.evidence = {};
    assert.deepEqual(await f.resolve(), receipt);
    assert.equal(f.inspector.calls, 1);
    assert.equal((await f.resolve("new-resolution")).status, "resolved");
  });
}

test("simulated recovery rejects malformed, absent and future observations", async (t) => {
  const f = await uncertain(t);
  const original = f.inspector.inspectRecovery.bind(f.inspector);
  const good = await original(
    Object.freeze(f.store.repositories.operation(f.op.id)),
  );
  for (const [i, evidence] of [
    null,
    [],
    "clean",
    {},
    { ...(good as object), observedAt: Number.MAX_SAFE_INTEGER },
    { ...(good as object), credential: true },
  ].entries()) {
    f.inspector.inspectRecovery = async () => evidence;
    assert.equal((await f.resolve(`bad-${i}`)).reason, "unconfirmed");
  }
});

test("simulated recovery never treats prior cleanup acknowledgments as sufficient", async (t) => {
  const f = fixture(t);
  const op = f.request();
  f.adapter.fail = "inspect";
  await f.work();
  const before = f.store.repositories.operation(op.id);
  assert.equal(before.credential, "revoked");
  assert.equal(before.channel, "cleared");
  const inspector = new SimulationRecovery();
  inspector.evidence.effectsSettled = false;
  assert.equal(
    (
      await resolveRepository(
        f.store.repositories,
        inspector,
        op.id,
        "operator",
        "pending-checkout",
      )
    ).status,
    "rejected",
  );
  inspector.evidence = { checkout: "present" };
  assert.equal(
    (
      await resolveRepository(
        f.store.repositories,
        inspector,
        op.id,
        "operator",
        "partial-checkout",
      )
    ).status,
    "rejected",
  );
  assert.deepEqual(f.store.repositories.operation(op.id), before);
});

test("simulated recovery checks actor, state, adapter and input before inspection", async (t) => {
  const f = await uncertain(t);
  await assert.rejects(
    () =>
      resolveRepository(
        f.store.repositories,
        f.inspector,
        f.op.id,
        "other-operator",
        "key",
      ),
    /not authorized/,
  );
  await assert.rejects(() => f.resolve(""), /Idempotency-Key/);
  await assert.rejects(() => f.resolve("key", 99), /timeoutMs/);
  await assert.rejects(
    () =>
      resolveRepository(
        f.store.repositories,
        {
          simulation: false,
          inspectRecovery: f.inspector.inspectRecovery,
        } as unknown as SimulatedRepositoryRecovery,
        f.op.id,
        "operator",
        "key",
      ),
    /Only simulated/,
  );
  assert.equal(f.inspector.calls, 0);
  await f.resolve();
  await assert.rejects(() => f.resolve("new-key"), /does not need resolution/);
  const retry = f.request("retry");
  await assert.rejects(
    () =>
      resolveRepository(
        f.store.repositories,
        f.inspector,
        retry.id,
        "operator",
        "resolution",
      ),
    /already used/,
  );
  await assert.rejects(
    () =>
      resolveRepository(
        f.store.repositories,
        f.inspector,
        retry.id,
        "operator",
        "queued",
      ),
    /does not need resolution/,
  );
});

test("simulated recovery bounds hangs and ignores a late confirming observation", async (t) => {
  const f = await uncertain(t);
  const original = f.inspector.inspectRecovery.bind(f.inspector);
  let release!: (value: unknown) => void;
  f.inspector.inspectRecovery = async () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const receipt = await f.resolve("hung", 100);
  assert.equal(receipt.status, "rejected");
  assert.equal(receipt.reason, "timeout");
  const events = f.store.repositories.events(f.op.id);
  release(
    await original(Object.freeze(f.store.repositories.operation(f.op.id))),
  );
  await delay(0);
  assert.equal(
    f.store.repositories.operation(f.op.id).status,
    "needs_attention",
  );
  assert.deepEqual(f.store.repositories.events(f.op.id), events);
  f.inspector.inspectRecovery = original;
  assert.equal((await f.resolve("retry")).status, "resolved");
});

test("simulated recovery never persists inspector errors or extra secret fields", async (t) => {
  const f = await uncertain(t);
  const original = f.inspector.inspectRecovery.bind(f.inspector);
  f.inspector.inspectRecovery = async () => {
    throw new Error(secret);
  };
  assert.equal((await f.resolve("error")).reason, "inspection_failed");
  f.inspector.inspectRecovery = original;
  f.inspector.evidence = { token: secret, error: secret, output: secret };
  await f.resolve("clean");
  for (const path of [f.path, `${f.path}-wal`])
    assert.equal(readFileSync(path).includes(Buffer.from(secret)), false);
  assert.equal(
    JSON.stringify(f.store.repositories.events(f.op.id)).includes(secret),
    false,
  );
});

test("simulated concurrent recovery settlements serialize across database connections", async (t) => {
  const f = await uncertain(t);
  const other = new Store(f.path);
  t.after(() => other.close());
  const second = new SimulationRecovery();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = f.inspector.inspectRecovery.bind(f.inspector);
  f.inspector.inspectRecovery = async (op) => {
    await gate;
    return original(op);
  };
  const first = f.resolve("first");
  const winner = await resolveRepository(
    other.repositories,
    second,
    f.op.id,
    "operator",
    "second",
  );
  release();
  assert.equal(winner.status, "resolved");
  await assert.rejects(first, /does not need resolution/);
  assert.equal(
    f.store.repositories
      .events(f.op.id)
      .filter((event) => event.type === "repository.resolution_resolved")
      .length,
    1,
  );
  assert.equal(
    f.store.repositories.resolution(f.op.id, "operator", "first"),
    null,
  );
});

test("simulated concurrent duplicate resolutions commit one receipt and event", async (t) => {
  const f = await uncertain(t);
  const other = new Store(f.path);
  t.after(() => other.close());
  const second = new SimulationRecovery();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = f.inspector.inspectRecovery.bind(f.inspector);
  f.inspector.inspectRecovery = async (op) => {
    await gate;
    return original(op);
  };
  const first = f.resolve();
  const winner = await resolveRepository(
    other.repositories,
    second,
    f.op.id,
    "operator",
    "resolution",
  );
  release();
  assert.deepEqual(await first, winner);
  assert.equal(
    f.store.repositories
      .events(f.op.id)
      .filter((event) => event.type === "repository.resolution_resolved")
      .length,
    1,
  );
});

test("simulated recovery blocks lifecycle while inspection is outstanding and permits it after resolution", async (t) => {
  const f = await uncertain(t);
  const original = f.inspector.inspectRecovery.bind(f.inspector);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.inspector.inspectRecovery = async (op) => {
    await gate;
    return original(op);
  };
  const pending = f.resolve();
  const other = new Store(f.path);
  t.after(() => other.close());
  assert.throws(
    () => other.lifecycle.request(f.workspace.id, "delete", "delete"),
    /bootstrap/,
  );
  release();
  await pending;
  assert.equal(
    other.lifecycle.request(f.workspace.id, "delete", "delete").kind,
    "delete",
  );
  assert.throws(
    () => f.request("retry"),
    /ready lifecycle workspace|already has repository or lifecycle/,
  );
});

test("simulated resolution status, receipt and event roll back together", async (t) => {
  const f = await uncertain(t);
  const before = f.store.repositories.operation(f.op.id);
  const events = f.store.repositories.events(f.op.id);
  const db = new DatabaseSync(f.path);
  t.after(() => db.close());
  for (const table of ["repository_events", "repository_resolutions"]) {
    db.exec(
      `CREATE TRIGGER fail_resolution BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END`,
    );
    await assert.rejects(() => f.resolve(), /audit unavailable/);
    assert.deepEqual(f.store.repositories.operation(f.op.id), before);
    assert.deepEqual(f.store.repositories.events(f.op.id), events);
    assert.equal(
      f.store.repositories.resolution(f.op.id, "operator", "resolution"),
      null,
    );
    db.exec("DROP TRIGGER fail_resolution");
  }
  assert.equal((await f.resolve()).status, "resolved");
});

test("simulated version 2 upgrade preserves uncertain obligations and adds resolution storage", async (t) => {
  const f = await uncertain(t);
  const before = f.store.repositories.operation(f.op.id);
  const events = f.store.repositories.events(f.op.id);
  f.store.close();
  const db = new DatabaseSync(f.path);
  db.exec(
    "DROP TABLE repository_resolutions; UPDATE schema_versions SET version = 2 WHERE component = 'repository'",
  );
  db.close();
  f.store = new Store(f.path);
  assert.deepEqual(f.store.repositories.operation(f.op.id), before);
  assert.deepEqual(f.store.repositories.events(f.op.id), events);
  assert.equal(schema(f.path).version, 4);
  assert.equal((await f.resolve()).status, "resolved");
});

test("simulated recovery accepts independently confirmed absence without rewriting unknown cleanup history", async (t) => {
  const f = await uncertain(t);
  const before = f.store.repositories.operation(f.op.id);
  assert.equal(before.credential, "unknown");
  f.inspector.evidence = { credential: "absent", channel: "absent" };
  assert.equal((await f.resolve()).status, "resolved");
  assert.deepEqual(f.store.repositories.operation(f.op.id), {
    ...before,
    status: "failed",
  });
});

test("simulated recovery rechecks the inspection deadline after database lock contention", async (t) => {
  const f = await uncertain(t);
  const original = f.inspector.inspectRecovery.bind(f.inspector);
  f.inspector.inspectRecovery = async (op) => {
    const lock = spawn(
      process.execPath,
      [fileURLToPath(new URL("./lock-fixture.js", import.meta.url))],
      { env: { PLATFORM_DATA_DIR: f.root }, stdio: ["ignore", "pipe", "pipe"] },
    );
    t.after(() => stopService(lock));
    await Promise.race([
      once(lock.stdout!, "data"),
      once(lock, "exit").then(() => {
        throw new Error("Lock fixture exited before locking");
      }),
    ]);
    return original(op);
  };
  const receipt = await f.resolve("contention", 500);
  assert.equal(receipt.status, "rejected");
  assert.equal(receipt.reason, "timeout");
  assert.equal(
    f.store.repositories.operation(f.op.id).status,
    "needs_attention",
  );
});

function vault(
  store: Store,
  key = Buffer.alloc(32, 7),
  keyId = "simulation-key",
) {
  return new RepositoryCredentialVault(store.repositories, keyId, key);
}

function custodyClaim(f: ReturnType<typeof fixture>) {
  const op = f.request();
  const claim = f.store.repositories.claim(1000)!;
  f.store.repositories.authorize(op.id, claim.leaseToken!, 101, 202);
  return {
    op: f.store.repositories.operation(op.id),
    fence: claim.leaseToken!,
  };
}

test("simulated encrypted custody survives restart without replay or plaintext in SQLite/WAL", async (t) => {
  const f = fixture(t);
  const op = f.request();
  f.adapter.fail = "revoke";
  f.adapter.onCall = (call) => {
    if (call === "mint") {
      assert.ok(f.store.repositories.operation(op.id).credentialReference);
      assert.throws(
        () => vault(f.store).recover(op.id, "operator"),
        /unavailable/,
      );
    }
    if (call === "resolve")
      assert.equal(vault(f.store).recover(op.id, "operator"), secret);
  };
  await f.work();
  const before = f.store.repositories.operation(op.id);
  const events = f.store.repositories.events(op.id);
  assert.equal(before.status, "needs_attention");
  assert.ok(
    events.some((event) => event.type === "repository.credential_stored"),
  );
  const calls = [...f.adapter.calls];
  f.reopen();
  assert.equal(vault(f.store).recover(op.id, "operator"), secret);
  assert.equal(f.request().credentialReference, before.credentialReference);
  assert.equal(await f.work(), false);
  assert.deepEqual(f.adapter.calls, calls);
  assert.deepEqual(f.store.repositories.events(op.id), events);
  assert.equal(JSON.stringify([before, events]).includes(secret), false);
  for (const suffix of ["", "-wal"]) {
    const bytes = readFileSync(f.path + suffix);
    assert.equal(bytes.includes(Buffer.from(secret)), false);
    assert.equal(bytes.includes(Buffer.alloc(32, 7)), false);
  }
});

test("simulated process death after custody commit retains a recoverable token and blocks dispatch", async (t) => {
  const f = fixture(t);
  const op = f.request();
  const worker = await child(t, f.path, "custody-crash", f.workspace.id);
  assert.equal((await worker.go()).id, op.id);
  worker.process.kill("SIGKILL");
  await worker.exit;
  await delay(120);
  f.reopen();
  assert.equal(await f.work(), false);
  assert.equal(f.store.repositories.operation(op.id).status, "needs_attention");
  assert.equal(f.store.repositories.operation(op.id).credential, "unknown");
  assert.equal(vault(f.store).recover(op.id, "operator"), secret);
  assert.deepEqual(f.adapter.calls, []);
});

for (const denial of ["actor", "key", "key-id"] as const) {
  test(`simulated credential recovery rejects wrong ${denial}`, (t) => {
    const f = fixture(t);
    const { op, fence } = custodyClaim(f);
    vault(f.store).capture(op.id, fence, secret);
    const reader = vault(
      f.store,
      Buffer.alloc(32, denial === "key" ? 8 : 7),
      denial === "key-id" ? "different-key" : "simulation-key",
    );
    assert.throws(
      () => reader.recover(op.id, denial === "actor" ? "intruder" : "operator"),
      /not authorized|unavailable/,
    );
    assert.equal(vault(f.store).recover(op.id, "operator"), secret);
  });
}

for (const field of ["nonce", "tag", "ciphertext"] as const) {
  test(`simulated credential recovery authenticates ${field}`, (t) => {
    const f = fixture(t);
    const { op, fence } = custodyClaim(f);
    vault(f.store).capture(op.id, fence, secret);
    const db = new DatabaseSync(f.path);
    t.after(() => db.close());
    const sealed = f.store.repositories.credentialRecord(op.id, "operator");
    const changed = Buffer.from(sealed[field]);
    changed[0] = changed[0]! ^ 1;
    db.prepare(
      `UPDATE repository_credentials SET ${field} = ? WHERE operation_id = ?`,
    ).run(changed, op.id);
    assert.throws(
      () => vault(f.store).recover(op.id, "operator"),
      /unavailable/,
    );
  });
}

test("simulated custody uses fresh nonces and rejects ciphertext copied to another operation", (t) => {
  const f = fixture(t);
  const first = custodyClaim(f);
  vault(f.store).capture(first.op.id, first.fence, secret);
  const workspace = ready(f.store);
  const second = f.store.repositories.request(
    workspace.id,
    "operator",
    ref,
    "second",
  );
  const claim = f.store.repositories.claim(1000)!;
  f.store.repositories.authorize(second.id, claim.leaseToken!, 101, 202);
  vault(f.store).capture(second.id, claim.leaseToken!, secret);
  const a = f.store.repositories.credentialRecord(first.op.id, "operator");
  const b = f.store.repositories.credentialRecord(second.id, "operator");
  assert.notDeepEqual(a.nonce, b.nonce);
  assert.notDeepEqual(a.ciphertext, b.ciphertext);
  const db = new DatabaseSync(f.path);
  t.after(() => db.close());
  db.prepare(
    `UPDATE repository_credentials SET key_id = ?,nonce = ?,tag = ?,ciphertext = ?
    WHERE operation_id = ?`,
  ).run(a.keyId, a.nonce, a.tag, a.ciphertext, second.id);
  assert.throws(
    () => vault(f.store).recover(second.id, "operator"),
    /unavailable/,
  );
  assert.equal(vault(f.store).recover(first.op.id, "operator"), secret);
});

test("simulated custody authenticates persisted provider identity", (t) => {
  const f = fixture(t);
  const { op, fence } = custodyClaim(f);
  vault(f.store).capture(op.id, fence, secret);
  const db = new DatabaseSync(f.path);
  t.after(() => db.close());
  db.prepare(
    "UPDATE repository_operations SET provider_id = 'different-provider' WHERE id = ?",
  ).run(op.id);
  assert.throws(() => vault(f.store).recover(op.id, "operator"), /unavailable/);
});

test("simulated credential capture and event roll back together", (t) => {
  const f = fixture(t);
  const { op, fence } = custodyClaim(f);
  const events = f.store.repositories.events(op.id);
  const db = new DatabaseSync(f.path);
  t.after(() => db.close());
  db.exec(`CREATE TRIGGER fail_capture BEFORE INSERT ON repository_events
    WHEN NEW.type = 'repository.credential_stored' BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END`);
  assert.throws(
    () => vault(f.store).capture(op.id, fence, secret),
    /audit unavailable/,
  );
  assert.throws(() => vault(f.store).recover(op.id, "operator"), /unavailable/);
  assert.deepEqual(f.store.repositories.events(op.id), events);
  db.exec("DROP TRIGGER fail_capture");
  vault(f.store).capture(op.id, fence, secret);
  assert.equal(vault(f.store).recover(op.id, "operator"), secret);
});

test("simulated revocation and ciphertext erasure roll back with their event", (t) => {
  const f = fixture(t);
  const { op, fence } = custodyClaim(f);
  vault(f.store).capture(op.id, fence, secret);
  f.store.repositories.minted(op.id, fence, Date.now() + 3500000);
  const db = new DatabaseSync(f.path);
  t.after(() => db.close());
  // Erasure runs after the event insert: fail its write to test the whole transaction.
  db.exec(`CREATE TRIGGER fail_erase BEFORE UPDATE ON repository_credentials
    WHEN NEW.state = 'erased' BEGIN SELECT RAISE(ABORT, 'erase unavailable'); END`);
  const events = f.store.repositories.events(op.id);
  assert.throws(
    () => f.store.repositories.cleanup(op.id, fence, "credential"),
    /erase unavailable/,
  );
  assert.equal(f.store.repositories.operation(op.id).credential, "issued");
  assert.equal(vault(f.store).recover(op.id, "operator"), secret);
  assert.deepEqual(f.store.repositories.events(op.id), events);
  db.exec("DROP TRIGGER fail_erase");
  f.store.repositories.cleanup(op.id, fence, "credential");
  assert.equal(f.store.repositories.operation(op.id).credential, "revoked");
  assert.equal(
    f.store.repositories.operation(op.id).credentialReference,
    op.credentialReference,
  );
  assert.throws(() => vault(f.store).recover(op.id, "operator"), /unavailable/);
  const erased = db
    .prepare("SELECT * FROM repository_credentials WHERE operation_id = ?")
    .get(op.id)!;
  for (const field of ["key_id", "nonce", "tag", "ciphertext"])
    assert.equal(erased[field], null);
  f.reopen();
  assert.throws(() => vault(f.store).recover(op.id, "operator"), /unavailable/);
});

test("simulated resolution erases ciphertext atomically while retaining original credential history", async (t) => {
  const f = fixture(t);
  const op = f.request();
  f.adapter.fail = "revoke";
  await f.work();
  const before = f.store.repositories.operation(op.id);
  const db = new DatabaseSync(f.path);
  t.after(() => db.close());
  db.exec(`CREATE TRIGGER fail_custody_resolution BEFORE INSERT ON repository_resolutions
    BEGIN SELECT RAISE(ABORT, 'receipt unavailable'); END`);
  const resolve = (key: string) =>
    resolveRepository(
      f.store.repositories,
      new SimulationRecovery(),
      op.id,
      "operator",
      key,
    );
  await assert.rejects(() => resolve("resolution"), /receipt unavailable/);
  assert.equal(vault(f.store).recover(op.id, "operator"), secret);
  assert.deepEqual(f.store.repositories.operation(op.id), before);
  db.exec("DROP TRIGGER fail_custody_resolution");
  assert.equal((await resolve("resolution")).status, "resolved");
  assert.equal(f.store.repositories.operation(op.id).credential, "issued");
  assert.throws(() => vault(f.store).recover(op.id, "operator"), /unavailable/);
});

test("simulated expired ownership cannot capture a received credential", async (t) => {
  const f = fixture(t);
  const op = f.request();
  const claim = f.store.repositories.claim(100)!;
  f.store.repositories.authorize(op.id, claim.leaseToken!, 101, 202);
  await delay(120);
  assert.throws(
    () => vault(f.store).capture(op.id, claim.leaseToken!, secret),
    /ownership lost/,
  );
  assert.throws(() => vault(f.store).recover(op.id, "operator"), /unavailable/);
});

test("simulated competing processes cannot overwrite captured ciphertext", async (t) => {
  const f = fixture(t);
  const op = f.request();
  const claim = f.store.repositories.claim(5000)!;
  f.store.repositories.authorize(op.id, claim.leaseToken!, 101, 202);
  const workers = await Promise.all([
    child(t, f.path, "capture", f.workspace.id),
    child(t, f.path, "capture", f.workspace.id),
  ]);
  const results = await Promise.all(
    workers.map((worker) => worker.go({ id: op.id, fence: claim.leaseToken! })),
  );
  assert.equal(results.filter((result) => result.id === op.id).length, 1);
  assert.equal(results.filter((result) => result.conflict).length, 1);
  await Promise.all(workers.map((worker) => worker.exit));
  assert.equal(vault(f.store).recover(op.id, "operator"), secret);
  assert.equal(
    f.store.repositories
      .events(op.id)
      .filter((event) => event.type === "repository.credential_stored").length,
    1,
  );
});

test("simulated overbroad tokens enter custody before rejection and failed revocation", async (t) => {
  const f = fixture(t);
  const op = f.request();
  f.adapter.token.permissions = { contents: "write" };
  f.adapter.fail = "revoke";
  await f.work();
  assert.equal(vault(f.store).recover(op.id, "operator"), secret);
  assert.equal(f.store.repositories.operation(op.id).credential, "unknown");
  assert.deepEqual(f.adapter.calls, ["authorize", "mint", "revoke"]);
  assert.equal(
    f.store.repositories
      .events(op.id)
      .some((event) => event.type === "repository.token_accepted"),
    false,
  );
});

test("simulated capture failure revokes in-memory credentials without using them", async (t) => {
  const f = fixture(t);
  const op = f.request();
  const db = new DatabaseSync(f.path);
  t.after(() => db.close());
  db.exec(`CREATE TRIGGER reject_capture BEFORE INSERT ON repository_events
    WHEN NEW.type = 'repository.credential_stored' BEGIN SELECT RAISE(ABORT, 'custody unavailable'); END`);
  await f.work();
  assert.deepEqual(f.adapter.calls, ["authorize", "mint", "revoke"]);
  assert.equal(f.store.repositories.operation(op.id).status, "needs_attention");
  assert.equal(f.store.repositories.operation(op.id).credential, "revoked");
  assert.throws(() => vault(f.store).recover(op.id, "operator"), /unavailable/);
});

test("simulated store rejects token acceptance without custody", (t) => {
  const f = fixture(t);
  const { op, fence } = custodyClaim(f);
  assert.throws(
    () => f.store.repositories.minted(op.id, fence, Date.now() + 3500000),
    /custody is missing/,
  );
  assert.equal(f.store.repositories.operation(op.id).phase, "minting");
});

test("simulated credential custody requires a dedicated valid key and matching store", async (t) => {
  const f = fixture(t);
  for (const size of [0, 16, 31, 33])
    assert.throws(
      () => vault(f.store, Buffer.alloc(size)),
      /Invalid repository custody key/,
    );
  for (const id of ["", "bad/key", "x".repeat(65)])
    assert.throws(
      () => vault(f.store, Buffer.alloc(32), id),
      /Invalid repository custody key/,
    );
  const other = new Store(join(f.root, "other.sqlite"));
  t.after(() => other.close());
  const op = f.request();
  await assert.rejects(
    () =>
      workRepository(
        f.store.repositories,
        f.adapter,
        f.adapter,
        f.adapter,
        vault(other),
      ),
    /custody does not match/,
  );
  const unsafe = Object.assign(vault(f.store), { simulation: false });
  await assert.rejects(
    () =>
      workRepository(
        f.store.repositories,
        f.adapter,
        f.adapter,
        f.adapter,
        unsafe,
      ),
    /Only simulated/,
  );
  assert.equal(f.store.repositories.operation(op.id).status, "queued");
});

test("simulated version 3 upgrade preserves operations and events without inventing custody", async (t) => {
  const f = await uncertain(t);
  const before = {
    ...f.store.repositories.operation(f.op.id),
    credentialReference: null,
  };
  const events = f.store.repositories.events(f.op.id);
  f.store.close();
  const db = new DatabaseSync(f.path);
  db.exec(
    "DROP TABLE repository_credentials; UPDATE schema_versions SET version = 3 WHERE component = 'repository'",
  );
  db.close();
  f.store = new Store(f.path);
  assert.deepEqual(f.store.repositories.operation(f.op.id), before);
  assert.deepEqual(f.store.repositories.events(f.op.id), events);
  assert.equal(schema(f.path).version, 4);
  assert.throws(
    () => vault(f.store).recover(f.op.id, "operator"),
    /unavailable/,
  );
  assert.equal(await f.work(), false);
});
