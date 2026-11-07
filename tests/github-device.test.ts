import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  verify,
} from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { test, type TestContext } from "node:test";
import { DomainError } from "../src/domain.js";
import {
  signInGitHubDevice,
  type GitHubDevicePrompt,
} from "../src/github-device.js";
import { loadPilotGitHubSigner } from "../src/github-pilot-key.js";
import { readGitHubPilotConfig, runGitHubPilot } from "../src/github-pilot.js";

const clientId = "Iv23simulationClientId";
const deviceCode = "d".repeat(40);
const userToken = "ghu_simulatedDeviceSession123456789";
const refreshToken = "ghr_simulatedRefreshSecret123456789";
const sha = "a".repeat(40);
const binding = {
  operatorId: `local-uid:${process.getuid!()}`,
  githubUserId: 11,
  appId: 22,
  installationId: 33,
  repositoryId: 44,
  repository: "https://github.com/example/fixture",
  ref: "refs/heads/main",
};

function protocol() {
  let now = Date.now();
  const waits: number[] = [];
  const calls: { url: URL; init: RequestInit; at: number }[] = [];
  const prompts: Readonly<GitHubDevicePrompt>[] = [];
  const initial: Record<string, unknown> = {
    device_code: deviceCode,
    user_code: "ABCD-EFGH",
    verification_uri: "https://github.com/login/device",
    expires_in: 900,
    interval: 5,
  };
  const success: Record<string, unknown> = {
    access_token: userToken,
    refresh_token: refreshToken,
    expires_in: 28800,
    scope: "",
    token_type: "bearer",
  };
  const polls: unknown[] = [{ error: "authorization_pending" }, success];
  let index = 0;
  let onRequest: (
    url: URL,
    init: RequestInit,
  ) => Promise<Response | void> = async () => {};
  const options = {
    clock: {
      now: () => now,
      async sleep(ms: number, signal: AbortSignal) {
        signal.throwIfAborted();
        waits.push(ms);
        now += ms;
      },
    },
    async transport(url: URL, init: RequestInit) {
      calls.push({ url, init, at: now });
      const overridden = await onRequest(url, init);
      if (overridden) return overridden;
      if (url.pathname === "/login/device/code") return Response.json(initial);
      if (url.pathname === "/login/oauth/access_token")
        return Response.json(polls[index++]);
      if (url.pathname === "/user") return Response.json({ id: 11 });
      if (url.pathname === "/repos/example/fixture")
        return Response.json({
          id: 44,
          archived: false,
          disabled: false,
          permissions: { pull: true },
        });
      if (url.pathname.endsWith("/installation"))
        return Response.json({
          id: 33,
          app_id: 22,
          suspended_at: null,
          repository_selection: "selected",
          permissions: { contents: "read", metadata: "read" },
        });
      if (url.pathname.endsWith("/git/ref/heads/main"))
        return Response.json({
          ref: binding.ref,
          object: { type: "commit", sha },
        });
      throw new Error("Unexpected fixture request");
    },
  };
  return {
    initial,
    success,
    polls,
    calls,
    prompts,
    waits,
    options,
    advance(ms: number) {
      now += ms;
    },
    set onRequest(value: typeof onRequest) {
      onRequest = value;
    },
    signIn(signal?: AbortSignal) {
      return signInGitHubDevice(
        clientId,
        44,
        (prompt) => prompts.push(prompt),
        { ...options, ...(signal ? { signal } : {}) },
      );
    },
  };
}

test("simulated device flow obeys intervals, sends only fixed POSTs and returns an opaque session", async () => {
  const f = protocol();
  const session = await f.signIn();
  assert.deepEqual(f.waits, [5000, 5000]);
  assert.equal(f.calls.length, 3);
  assert.equal(f.prompts.length, 1);
  assert.equal(
    f.prompts[0]!.verificationUri,
    "https://github.com/login/device",
  );
  assert.equal(f.prompts[0]!.userCode, "ABCD-EFGH");
  assert.equal(f.prompts[0]!.simulation, true);
  assert.ok(Object.isFrozen(f.prompts[0]));
  assert.equal(session.simulation, true);
  for (const call of f.calls) {
    assert.equal(call.url.origin, "https://github.com");
    assert.equal(call.url.search, "");
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.redirect, "error");
    assert.equal(call.init.credentials, "omit");
    assert.equal(new Headers(call.init.headers).has("Authorization"), false);
  }
  assert.deepEqual(
    Object.fromEntries(new URLSearchParams(f.calls[0]!.init.body as string)),
    { client_id: clientId },
  );
  assert.deepEqual(
    Object.fromEntries(new URLSearchParams(f.calls[1]!.init.body as string)),
    {
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      repository_id: "44",
    },
  );
  for (const secret of [deviceCode, userToken, refreshToken]) {
    assert.equal(JSON.stringify(f.prompts).includes(secret), false);
    assert.equal(JSON.stringify(session).includes(secret), false);
    assert.equal(inspect(session).includes(secret), false);
  }
  const result = await session.preflight(
    binding,
    binding.operatorId,
    "header.payload.signature",
  );
  assert.equal(result.headSha, sha);
  assert.equal(result.simulation, true);
  const api = f.calls.filter((c) => c.url.hostname === "api.github.com");
  assert.equal(api.length, 4);
  assert.equal(
    new Headers(api[0]!.init.headers).get("Authorization"),
    `Bearer ${userToken}`,
  );
  session.close();
  const count = f.calls.length;
  await assert.rejects(
    session.preflight(binding, binding.operatorId, "header.payload.signature"),
    /expired or cancelled/,
  );
  assert.equal(f.calls.length, count);
});

test("simulated device slow-down waits at least five additional seconds and accepts larger server intervals", async () => {
  const f = protocol();
  f.polls.splice(
    0,
    f.polls.length,
    { error: "slow_down", interval: 10 },
    { error: "slow_down", interval: 20 },
    f.success,
  );
  const session = await f.signIn();
  assert.deepEqual(f.waits, [5000, 10000, 20000]);
  session.close();
});

test("device flow snapshots its injected transport before caller options can mutate", async () => {
  const f = protocol();
  const options: Parameters<typeof signInGitHubDevice>[3] = { ...f.options };
  f.onRequest = async () => {
    delete options.transport;
  };
  const session = await signInGitHubDevice(
    clientId,
    44,
    (prompt) => f.prompts.push(prompt),
    options,
  );
  try {
    assert.equal(f.prompts[0]!.simulation, true);
    assert.equal(session.simulation, true);
    const observation = await session.preflight(
      binding,
      binding.operatorId,
      "header.payload.signature",
    );
    assert.equal(observation.simulation, true);
    assert.equal(observation.source, "injected_transport");
    assert.equal(
      f.calls.filter((call) => call.url.hostname === "api.github.com").length,
      4,
    );
  } finally {
    session.close();
  }
});

for (const [field, value] of Object.entries({
  device_code: "bad",
  user_code: "bad",
  verification_uri: "https://evil.invalid/device",
  expires_in: 901,
  interval: 0,
})) {
  test(`simulated device flow rejects malformed ${field} before displaying a code`, async () => {
    const f = protocol();
    f.initial[field] = value;
    await assert.rejects(f.signIn(), /sign-in rejected/);
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.prompts, []);
  });
}
for (const error of [
  "access_denied",
  "expired_token",
  "device_flow_disabled",
  "incorrect_client_credentials",
  `unknown_${refreshToken}`,
]) {
  test(`simulated device flow terminates fixed protocol denial ${error.split("_").slice(0, 2).join("_")}`, async () => {
    const f = protocol();
    f.polls.splice(0, f.polls.length, {
      error,
      error_description: refreshToken,
    });
    await assert.rejects(
      f.signIn(),
      (e) =>
        e instanceof DomainError &&
        e.message === "GitHub sign-in rejected" &&
        !String(e.stack).includes(refreshToken),
    );
    assert.equal(f.calls.length, 2);
  });
}
for (const [field, value] of Object.entries({
  access_token: "ghp_wrongToken123456",
  expires_in: 0,
  token_type: "unknown",
  scope: "repo",
})) {
  test(`simulated device flow rejects invalid issued ${field}`, async () => {
    const f = protocol();
    f.success[field] = value;
    f.polls.splice(0, f.polls.length, f.success);
    await assert.rejects(f.signIn(), /sign-in rejected/);
    assert.equal(f.calls.length, 2);
  });
}

test("simulated device flow rejects ambiguous token/pending responses and invalid slow-down intervals", async () => {
  for (const response of [
    { ...protocol().success, error: "authorization_pending" },
    { error: "slow_down", interval: "10" },
  ]) {
    const f = protocol();
    f.polls.splice(0, f.polls.length, response);
    await assert.rejects(f.signIn(), /sign-in rejected/);
    assert.equal(f.calls.length, 2);
  }
});

test("simulated device flow expiry does not restart or poll after its deadline", async () => {
  const f = protocol();
  f.initial.expires_in = 5;
  await assert.rejects(f.signIn(), /expired or cancelled/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.prompts.length, 1);
});

test("simulated expired session cannot send any preflight request", async () => {
  const f = protocol();
  f.polls.splice(0, f.polls.length, f.success);
  f.success.expires_in = 10;
  const session = await f.signIn();
  f.advance(10000);
  const count = f.calls.length;
  await assert.rejects(
    session.preflight(binding, binding.operatorId, "header.payload.signature"),
    /expired or cancelled/,
  );
  assert.equal(f.calls.length, count);
  session.close();
});

test("simulated wrong GitHub identity never yields a preflight receipt", async () => {
  const f = protocol();
  const session = await f.signIn();
  f.onRequest = async (url) =>
    url.hostname === "api.github.com" ? Response.json({ id: 99 }) : undefined;
  await assert.rejects(
    session.preflight(binding, binding.operatorId, "header.payload.signature"),
    /identity or policy/,
  );
  assert.equal(
    f.calls.filter((c) => c.url.hostname === "api.github.com").length,
    1,
  );
  session.close();
});

for (const status of [302, 401, 403, 429, 500]) {
  test(`simulated device transport HTTP ${status} never retries or exposes its body`, async () => {
    const f = protocol();
    f.onRequest = async () =>
      new Response(refreshToken, {
        status,
        headers: {
          Location: "https://evil.invalid/",
          "Content-Type": "application/json",
        },
      });
    await assert.rejects(
      f.signIn(),
      (e) =>
        e instanceof DomainError &&
        e.message === "GitHub sign-in request failed" &&
        !String(e.stack).includes(refreshToken),
    );
    assert.equal(f.calls.length, 1);
  });
}

test("simulated lost exchange response stops polling and strips transport errors", async () => {
  const f = protocol();
  f.onRequest = async (url) => {
    if (url.pathname.includes("access_token"))
      throw new Error(`${deviceCode} ${userToken} ${refreshToken}`);
  };
  await assert.rejects(
    f.signIn(),
    (e) =>
      e instanceof DomainError &&
      e.message === "GitHub sign-in request failed" &&
      ![deviceCode, userToken, refreshToken].some((x) =>
        String(e.stack).includes(x),
      ),
  );
  assert.equal(f.calls.length, 2);
});

test("simulated response stream is bounded even with a false content length", async () => {
  const f = protocol();
  let cancelled = false;
  f.onRequest = async () =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(16385));
        },
        cancel() {
          cancelled = true;
        },
      }),
      {
        headers: { "Content-Type": "application/json", "Content-Length": "1" },
      },
    );
  await assert.rejects(f.signIn(), /request failed/);
  assert.equal(cancelled, true);
  assert.equal(f.calls.length, 1);
});

test("simulated cancelled or hung device requests never display/accept a late token", async () => {
  const f = protocol();
  const controller = new AbortController();
  let reached!: () => void;
  const started = new Promise<void>((r) => {
    reached = r;
  });
  let release!: (value: Response) => void;
  f.onRequest = async () => {
    reached();
    return new Promise<Response>((r) => {
      release = r;
    });
  };
  const pending = f.signIn(controller.signal);
  await started;
  controller.abort(new Error(refreshToken));
  await assert.rejects(pending, /expired or cancelled/);
  release(Response.json(f.initial));
  assert.deepEqual(f.prompts, []);
  const g = protocol();
  await assert.rejects(g.signIn(controller.signal), /expired or cancelled/);
  assert.deepEqual(g.calls, []);
});

test("simulated cancelled token exchanges cancel hung bodies and reject late issued tokens without retry", async () => {
  for (const mode of ["body", "headers"] as const) {
    const f = protocol();
    const controller = new AbortController();
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: (response: Response) => void;
    let cancelled = false;
    f.onRequest = async (url) => {
      if (url.pathname !== "/login/oauth/access_token") return;
      if (mode === "headers") {
        entered();
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      return new Response(
        new ReadableStream<Uint8Array>(
          {
            pull() {
              entered();
              return new Promise<void>(() => {});
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 },
        ),
        { headers: { "Content-Type": "application/json" } },
      );
    };
    const pending = f.signIn(controller.signal);
    await reached;
    controller.abort(new Error(`${userToken} ${refreshToken}`));
    await assert.rejects(
      pending,
      (error) =>
        error instanceof DomainError &&
        error.message === "GitHub sign-in expired or cancelled" &&
        ![userToken, refreshToken].some((secret) =>
          String(error.stack).includes(secret),
        ),
    );
    if (mode === "headers") release(Response.json(f.success));
    else assert.equal(cancelled, true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(f.calls.length, 2);
    assert.equal(f.prompts.length, 1);
    assert.equal(f.calls[1]!.init.signal?.aborted, true);
  }
});

test("device configuration rejects invalid IDs/runtime and test clock without injected transport", async () => {
  const f = protocol();
  await assert.rejects(
    signInGitHubDevice("bad", 44, () => {}, f.options),
    /client ID/,
  );
  await assert.rejects(
    signInGitHubDevice(clientId, 0, () => {}, f.options),
    /repositoryId/,
  );
  await assert.rejects(
    signInGitHubDevice(clientId, 44, () => {}, {
      ...f.options,
      maxRuntimeMs: 900001,
    }),
    /maxRuntimeMs/,
  );
  await assert.rejects(
    signInGitHubDevice(clientId, 44, () => {}, { clock: f.options.clock }),
    /test clock/,
  );
  assert.deepEqual(f.calls, []);
});

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = keys.privateKey.export({ type: "pkcs1", format: "pem" });
const fingerprint = `SHA256:${createHash("sha256")
  .update(keys.publicKey.export({ type: "spki", format: "der" }))
  .digest("base64")}`;
function privateFixture(t: TestContext) {
  const directory = realpathSync(
    mkdtempSync(join(tmpdir(), "argent-github-auth-")),
  );
  chmodSync(directory, 0o700);
  const keyPath = join(directory, "pilot.pem");
  writeFileSync(keyPath, pem, { mode: 0o600 });
  const config = {
    githubUserId: 11,
    appId: 22,
    clientId,
    installationId: 33,
    repositoryId: 44,
    repository: binding.repository,
    ref: binding.ref,
    keyPath,
    keyFingerprint: fingerprint,
  };
  const configPath = join(directory, "pilot.json");
  const write = () =>
    writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
  write();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, keyPath, config, configPath, write };
}

test("pilot key loader verifies the fingerprint and produces a bounded RS256 JWT without exporting its key", async (t) => {
  const f = privateFixture(t);
  const signer = await loadPilotGitHubSigner(f.keyPath, fingerprint, clientId);
  const now = Date.now();
  const jwt = signer.jwt(now);
  const [header, payload, signature] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header!, "base64url").toString()), {
    alg: "RS256",
    typ: "JWT",
  });
  assert.deepEqual(JSON.parse(Buffer.from(payload!, "base64url").toString()), {
    iat: Math.floor(now / 1000) - 60,
    exp: Math.floor(now / 1000) + 120,
    iss: clientId,
  });
  assert.equal(
    verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      createPublicKey(keys.privateKey),
      Buffer.from(signature!, "base64url"),
    ),
    true,
  );
  assert.equal(JSON.stringify(signer).includes("PRIVATE KEY"), false);
  assert.equal(inspect(signer).includes("PRIVATE KEY"), false);
});
for (const loader of ["config", "key"] as const) {
  test(`pilot ${loader} loader rejects a FIFO without waiting for a writer`, (t) => {
    const f = privateFixture(t);
    const path = join(f.directory, "unsafe-fifo");
    const fifo = spawnSync("mkfifo", ["-m", "600", path]);
    assert.equal(fifo.status, 0);
    const module = new URL(
      loader === "config"
        ? "../src/github-pilot.js"
        : "../src/github-pilot-key.js",
      import.meta.url,
    ).href;
    const call =
      loader === "config"
        ? `readGitHubPilotConfig(${JSON.stringify(path)})`
        : `loadPilotGitHubSigner(${JSON.stringify(path)}, ${JSON.stringify(fingerprint)}, ${JSON.stringify(clientId)})`;
    const child = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import assert from 'node:assert/strict';
         import { ${loader === "config" ? "readGitHubPilotConfig" : "loadPilotGitHubSigner"} } from ${JSON.stringify(module)};
         await assert.rejects(${call}, /unavailable or unsafe/);`,
      ],
      { timeout: 3000, encoding: "utf8" },
    );
    assert.equal(
      child.error,
      undefined,
      "loader must not block opening a FIFO",
    );
    assert.equal(child.status, 0, child.stderr);
  });
}
for (const denial of [
  "key permissions",
  "directory permissions",
  "symlink",
  "wrong fingerprint",
  "malformed key",
  "oversized key",
]) {
  test(`pilot key loader rejects ${denial} without exposing key material`, async (t) => {
    const f = privateFixture(t);
    let path = f.keyPath;
    let expected = fingerprint;
    if (denial === "key permissions") chmodSync(path, 0o644);
    if (denial === "directory permissions") chmodSync(f.directory, 0o755);
    if (denial === "symlink") {
      path = join(f.directory, "link.pem");
      symlinkSync(f.keyPath, path);
    }
    if (denial === "wrong fingerprint")
      expected = `SHA256:${Buffer.alloc(32).toString("base64")}`;
    if (denial === "malformed key")
      writeFileSync(path, refreshToken.repeat(10));
    if (denial === "oversized key") writeFileSync(path, "A".repeat(16385));
    await assert.rejects(
      loadPilotGitHubSigner(path, expected, clientId),
      (e) =>
        e instanceof DomainError &&
        e.message === "GitHub pilot signing key is unavailable or unsafe" &&
        !String(e.stack).includes(refreshToken),
    );
  });
}

test("pilot config is private, immutable and contains only expected non-secret fields", async (t) => {
  const f = privateFixture(t);
  const config = await readGitHubPilotConfig(f.configPath);
  assert.deepEqual(config, f.config);
  assert.ok(Object.isFrozen(config));
  chmodSync(f.configPath, 0o644);
  await assert.rejects(
    readGitHubPilotConfig(f.configPath),
    /unavailable or unsafe/,
  );
  chmodSync(f.configPath, 0o600);
  writeFileSync(
    f.configPath,
    JSON.stringify({ ...f.config, userAccessToken: refreshToken }),
  );
  await assert.rejects(readGitHubPilotConfig(f.configPath), /Unexpected/);
  assert.equal(readFileSync(f.keyPath, "utf8"), pem);
});

test("pilot config denies invalid repository input and unsafe paths before authentication", async (t) => {
  const f = privateFixture(t);
  f.config.repository = "https://evil.invalid/fixture";
  f.write();
  await assert.rejects(
    readGitHubPilotConfig(f.configPath),
    /repository selection/,
  );
  await assert.rejects(readGitHubPilotConfig("relative.json"), /absolute/);
  const alias = join(f.directory, "config-link.json");
  symlinkSync(f.configPath, alias);
  await assert.rejects(readGitHubPilotConfig(alias), /unavailable or unsafe/);
});

test("simulated pilot connects private signer, device identity and fixture preflight with a redacted receipt", async (t) => {
  const f = privateFixture(t);
  const p = protocol();
  const receipt = await runGitHubPilot(
    f.config,
    (prompt) => p.prompts.push(prompt),
    p.options,
  );
  assert.equal(receipt.kind, "github_read_only_pilot_receipt");
  assert.equal(receipt.observation.simulation, true);
  assert.equal(receipt.observation.operatorId, binding.operatorId);
  assert.equal(receipt.observation.headSha, sha);
  assert.equal(receipt.sessionTokensRetained, false);
  assert.equal(receipt.checkoutExecuted, false);
  assert.equal(receipt.installationTokenMinted, false);
  assert.equal(receipt.durableExecutionGrant, false);
  for (const secret of [userToken, refreshToken, deviceCode, pem.toString()])
    assert.equal(JSON.stringify(receipt).includes(secret), false);
  assert.equal(
    p.calls.filter((c) => c.url.hostname === "api.github.com").length,
    4,
  );
});
