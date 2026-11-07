import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { DomainError } from "../src/domain.js";
import {
  inspectGitHubRepository,
  type GitHubRepositoryBinding,
} from "../src/github-preflight.js";

const token = "ghu_simulationUserSecret1234567890";
const jwt = "simulationHeader.simulationPayload.simulationSignature";
const canary = "simulationResponseSecret1234567890";
const sha = "a".repeat(40);
const base: GitHubRepositoryBinding = {
  operatorId: "operator",
  githubUserId: 11,
  appId: 22,
  installationId: 33,
  repositoryId: 44,
  repository: "https://github.com/example/fixture",
  ref: "refs/heads/main",
};

function fixture() {
  const binding = { ...base };
  const credentials = { userAccessToken: token, appJwt: jwt };
  const calls: { url: URL; init: RequestInit }[] = [];
  const data: Record<string, unknown>[] = [
    { id: 11, private_note: canary },
    {
      id: 44,
      archived: false,
      disabled: false,
      permissions: { pull: true },
      temp_clone_token: canary,
    },
    {
      id: 33,
      app_id: 22,
      suspended_at: null,
      repository_selection: "selected",
      permissions: { contents: "read", metadata: "read" },
    },
    {
      ref: "refs/heads/main",
      object: { type: "commit", sha, url: `https://evil.invalid/${canary}` },
    },
  ];
  let onCall: (index: number) => Promise<Response | void> = async () => {};
  return {
    binding,
    credentials,
    calls,
    data,
    set onCall(value: (index: number) => Promise<Response | void>) {
      onCall = value;
    },
    inspect(
      options: { signal?: AbortSignal; timeoutMs?: number } = {},
      operatorId = "operator",
    ) {
      return inspectGitHubRepository(binding, operatorId, credentials, {
        ...options,
        async transport(url, init) {
          const index = calls.length;
          calls.push({ url, init });
          const response = await onCall(index);
          return response ?? Response.json(data[index]);
        },
      });
    },
  };
}

test("GitHub preflight fixture uses fixed GET routes, separates credentials and returns only selected labeled metadata", async () => {
  const f = fixture();
  const observed = await f.inspect();
  assert.deepEqual(observed, {
    ...base,
    kind: "read_only_preflight",
    headSha: sha,
    observedAt: observed.observedAt,
    source: "injected_transport",
    simulation: true,
    apiVersion: "2026-03-10",
  });
  assert.ok(Object.isFrozen(observed));
  assert.deepEqual(
    f.calls.map((c) => c.url.href),
    [
      "https://api.github.com/user",
      "https://api.github.com/repos/example/fixture",
      "https://api.github.com/repos/example/fixture/installation",
      "https://api.github.com/repos/example/fixture/git/ref/heads/main",
    ],
  );
  for (const [index, { url, init }] of f.calls.entries()) {
    assert.equal(url.origin, "https://api.github.com");
    assert.equal(url.username, "");
    assert.equal(url.password, "");
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    assert.equal(init.credentials, "omit");
    assert.equal(init.cache, "no-store");
    assert.equal(init.body, undefined);
    const headers = new Headers(init.headers);
    assert.equal(
      headers.get("Authorization"),
      `Bearer ${index === 2 ? jwt : token}`,
    );
    assert.equal(headers.get("X-GitHub-Api-Version"), "2026-03-10");
    assert.equal(init.signal?.aborted, true);
  }
  for (const secret of [token, jwt, canary])
    assert.equal(JSON.stringify(observed).includes(secret), false);
});

const rejects: [string, number, Record<string, unknown>][] = [
  ["linked GitHub user", 0, { id: 99 }],
  ["repository ID", 1, { id: 99 }],
  ["archived repository", 1, { archived: true }],
  ["disabled repository", 1, { disabled: true }],
  ["missing pull access", 1, { permissions: { pull: false } }],
  ["installation ID", 2, { id: 99 }],
  ["App ID", 2, { app_id: 99 }],
  ["suspended installation", 2, { suspended_at: "2026-11-07" }],
  ["missing suspension evidence", 2, { suspended_at: undefined }],
  ["all repositories selection", 2, { repository_selection: "all" }],
  ["Contents write", 2, { permissions: { contents: "write" } }],
  [
    "extra permission",
    2,
    { permissions: { contents: "read", actions: "read" } },
  ],
  [
    "Metadata write",
    2,
    { permissions: { contents: "read", metadata: "write" } },
  ],
  ["missing Contents", 2, { permissions: { metadata: "read" } }],
  ["different ref", 3, { ref: "refs/heads/other" }],
  ["tag object", 3, { object: { type: "tag", sha } }],
  ["short SHA", 3, { object: { type: "commit", sha: "abcd123" } }],
];
for (const [label, index, patch] of rejects) {
  test(`GitHub preflight fixture rejects ${label} without further HTTP`, async () => {
    const f = fixture();
    Object.assign(f.data[index]!, patch);
    await assert.rejects(
      f.inspect(),
      (e) => e instanceof DomainError && [403, 502].includes(e.status),
    );
    assert.equal(f.calls.length, index + 1);
  });
}

for (const repository of [
  "https://github.com.evil.invalid/example/fixture",
  "http://github.com/example/fixture",
  "https://user:secret@github.com/example/fixture",
  "https://github.com/example/fixture?token=secret",
  "https://github.com/example/fixture#secret",
  "https://github.com/example/..",
  "https://github.com/example/fixture.git",
  "https://github.com/example/a%2fb",
]) {
  test(`GitHub preflight rejects invalid repository input ${repository} before HTTP`, async () => {
    const f = fixture();
    f.binding.repository = repository;
    await assert.rejects(f.inspect(), /canonical GitHub/);
    assert.deepEqual(f.calls, []);
  });
}

for (const ref of [
  "main",
  "refs/tags/main",
  "refs/heads/a..b",
  "refs/heads/a.lock",
  "refs/heads/a/../b",
  "refs/heads/main?token=secret",
  "refs/heads/a%2fb",
]) {
  test(`GitHub preflight rejects invalid ref ${ref} before HTTP`, async () => {
    const f = fixture();
    f.binding.ref = ref;
    await assert.rejects(f.inspect(), /explicit branch/);
    assert.deepEqual(f.calls, []);
  });
}

test("GitHub preflight snapshots inputs and retains safe dotted/nested branch paths", async () => {
  const f = fixture();
  f.binding.ref = "refs/heads/release-1.2/feature";
  f.data[3]!.ref = f.binding.ref;
  f.onCall = async (index) => {
    if (index === 0) {
      f.binding.repository = "https://evil.invalid/secret";
      f.binding.repositoryId = 99;
      f.binding.ref = "refs/heads/other";
      f.credentials.userAccessToken = "replacement";
      f.credentials.appJwt = "replacement";
    }
  };
  const result = await f.inspect();
  assert.equal(result.repository, base.repository);
  assert.equal(result.repositoryId, 44);
  assert.equal(result.ref, "refs/heads/release-1.2/feature");
  assert.equal(
    f.calls[3]!.url.pathname,
    "/repos/example/fixture/git/ref/heads/release-1.2/feature",
  );
  assert.equal(
    new Headers(f.calls[2]!.init.headers).get("Authorization"),
    `Bearer ${jwt}`,
  );
});

test("GitHub preflight rejects actor, IDs, deadlines and credential formats before HTTP", async () => {
  const f = fixture();
  await assert.rejects(f.inspect({}, "other"), /identity or policy/);
  for (const field of [
    "githubUserId",
    "appId",
    "installationId",
    "repositoryId",
  ] as const) {
    const before = f.binding[field];
    f.binding[field] = 0;
    await assert.rejects(f.inspect(), /integer/);
    f.binding[field] = before;
  }
  await assert.rejects(f.inspect({ timeoutMs: 0 }), /integer/);
  await assert.rejects(f.inspect({ timeoutMs: 5001 }), /integer/);
  for (const userAccessToken of [
    "ghp_personalToken12345",
    `${token}\r\nHost: evil.invalid`,
    "",
  ]) {
    f.credentials.userAccessToken = userAccessToken;
    await assert.rejects(f.inspect(), /credential format|userAccessToken/);
  }
  f.credentials.userAccessToken = token;
  f.credentials.appJwt = `${jwt}\n${canary}`;
  await assert.rejects(f.inspect(), /credential format/);
  assert.deepEqual(f.calls, []);
});

for (const status of [301, 302, 304, 401, 403, 404, 410, 429, 500]) {
  test(`GitHub preflight fixture rejects HTTP ${status}, never retries or follows Location`, async () => {
    const f = fixture();
    f.onCall = async () =>
      new Response(status === 304 ? null : canary, {
        status,
        headers: {
          Location: "https://evil.invalid/secret",
          "Retry-After": "0",
        },
      });
    await assert.rejects(f.inspect(), /identity or policy rejected/);
    assert.equal(f.calls.length, 1);
  });
}

test("GitHub preflight never returns transport exception fields or secret response bodies", async () => {
  const f = fixture();
  f.onCall = async () => {
    throw new Error(`${token} ${jwt} ${canary}`);
  };
  await assert.rejects(f.inspect(), (e) => {
    assert.ok(e instanceof DomainError);
    assert.equal(e.status, 502);
    assert.equal(e.message, "GitHub preflight request failed");
    for (const secret of [token, jwt, canary])
      assert.equal(String(e.stack).includes(secret), false);
    return true;
  });
  const g = fixture();
  g.onCall = async () => {
    const error = new DomainError(
      200,
      "GitHub preflight identity or policy rejected",
    );
    Object.assign(error, { secret: token });
    throw error;
  };
  await assert.rejects(
    g.inspect(),
    (e) =>
      e instanceof DomainError &&
      e.status === 403 &&
      !Object.hasOwn(e, "secret"),
  );
});

for (const body of ["not JSON", "null", "[]", `{"secret":"${canary}"}`]) {
  test(`GitHub preflight fixture rejects malformed/unusable JSON ${body.slice(0, 12)}`, async () => {
    const f = fixture();
    f.onCall = async () =>
      new Response(body, { headers: { "Content-Type": "application/json" } });
    await assert.rejects(
      f.inspect(),
      (e) => e instanceof DomainError && !String(e.stack).includes(canary),
    );
    assert.equal(f.calls.length, 1);
  });
}

test("GitHub preflight rejects unexpected response URL, followed redirects, MIME and declared size", async () => {
  const cases: [string, unknown][] = [
    ["url", "https://evil.invalid/secret"],
    ["redirected", true],
  ];
  for (const [field, value] of cases) {
    const f = fixture();
    f.onCall = async () => {
      const response = Response.json({ id: 11 });
      Object.defineProperty(response, field, { value });
      return response;
    };
    await assert.rejects(f.inspect(), /identity or policy/);
  }
  for (const headers of [
    { "Content-Type": "text/html" },
    { "Content-Type": "application/jsonp" },
    { "Content-Type": "application/json", "Content-Length": "131073" },
    { "Content-Type": "application/json", "Content-Length": "invalid" },
  ]) {
    const f = fixture();
    f.onCall = async () => new Response('{"id":11}', { headers });
    await assert.rejects(f.inspect(), /identity or policy/);
    assert.equal(f.calls.length, 1);
  }
});

test("GitHub preflight bounds streamed body size and cancels without recording the body", async () => {
  const f = fixture();
  let cancelled = false;
  f.onCall = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(`{"secret":"${canary}","padding":"`),
          );
          controller.enqueue(new Uint8Array(128 * 1024));
        },
        cancel() {
          cancelled = true;
        },
      }),
      {
        headers: { "Content-Type": "application/json", "Content-Length": "1" },
      },
    );
  await assert.rejects(
    f.inspect(),
    (e) =>
      e instanceof DomainError &&
      e.status === 403 &&
      !String(e.stack).includes(canary),
  );
  assert.equal(cancelled, true);
  assert.equal(f.calls.length, 1);
});

test("GitHub preflight bounds hung headers and ignores late responses without later requests", async () => {
  const f = fixture();
  let release!: (response: Response) => void;
  f.onCall = async () =>
    new Promise<Response>((r) => {
      release = r;
    });
  await assert.rejects(f.inspect({ timeoutMs: 100 }), /interrupted/);
  release(Response.json({ id: 11 }));
  await delay(0);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]!.init.signal?.aborted, true);
});

test("GitHub preflight bounds hung response streams and caller cancellation", async () => {
  const f = fixture();
  let cancelled = false;
  f.onCall = async () =>
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  await assert.rejects(f.inspect({ timeoutMs: 100 }), /interrupted/);
  assert.equal(cancelled, true);
  const g = fixture();
  const controller = new AbortController();
  g.onCall = async () => {
    controller.abort(new Error(token));
    return Response.json({ id: 11 });
  };
  await assert.rejects(
    g.inspect({ signal: controller.signal }),
    (e) =>
      e instanceof DomainError &&
      e.status === 408 &&
      !String(e.stack).includes(token),
  );
  assert.equal(g.calls.length, 1);
  const h = fixture();
  await assert.rejects(h.inspect({ signal: controller.signal }), /interrupted/);
  assert.deepEqual(h.calls, []);
});
