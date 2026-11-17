import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DesktopClient } from "../src/desktop/bridge.js";

test("check bridge accepts only exact identifiers and rebuilds responses without private fields", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "argent-check-bridge-"));
  const workspaceId = randomUUID(),
    consent = randomUUID(),
    key = randomUUID(),
    id = randomUUID();
  writeFileSync(
    join(root, "service.json"),
    JSON.stringify({
      version: 1,
      port: 1234,
      token: "a".repeat(64),
      instanceId: randomUUID(),
      pid: 1,
    }),
  );
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
    rmSync(root, { recursive: true, force: true });
  });
  const requests: { url: string; init?: RequestInit }[] = [];
  let response: unknown = {
    kind: "local-check",
    workspaceId,
    id,
    headSha: "a".repeat(40),
    status: "queued",
    result: null,
    createdAt: 1,
    freshness: "unknown",
    leaseToken: "private",
  };
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), ...(init ? { init } : {}) });
    return Response.json(response);
  };
  const client = new DesktopClient(root);
  for (const [method, args] of [
    ["latestCheck", []],
    ["latestCheck", [workspaceId + "\n"]],
    ["runChecks", [workspaceId, consent]],
    ["runChecks", [workspaceId, consent, key, ["sh"]]],
    ["runChecks", [workspaceId, "HEAD", key]],
    ["cancelCheck", [workspaceId, { id }]],
  ] as const)
    assert.equal((await client.call(method, args)).ok, false);
  assert.equal(requests.length, 0);
  const reply = await client.call("runChecks", [workspaceId, consent, key]);
  assert.equal(reply.ok, true);
  assert.equal(JSON.stringify(reply).includes("leaseToken"), false);
  assert.equal(requests[0]!.init?.body, JSON.stringify({ consentId: consent }));
  assert.equal(
    (requests[0]!.init?.headers as Record<string, string>)["Idempotency-Key"],
    key,
  );
  assert.match(requests[0]!.url, /\/checks$/);
  await client.call("cancelCheck", [workspaceId, id]);
  assert.match(requests[1]!.url, /\/cancel$/);
  response = null;
  assert.deepEqual(await client.call("latestCheck", [workspaceId]), {
    ok: true,
    value: null,
  });
  assert.equal(
    (await client.call("runChecks", [workspaceId, consent, key])).ok,
    false,
  );
  response = { kind: "local-check", workspaceId: randomUUID() };
  assert.equal((await client.call("latestCheck", [workspaceId])).ok, false);
});

test("run bridge uses separate routes and rejects a check response", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "argent-run-bridge-"));
  const workspaceId = randomUUID(),
    consent = randomUUID(),
    key = randomUUID(),
    id = randomUUID();
  writeFileSync(
    join(root, "service.json"),
    JSON.stringify({
      version: 1,
      port: 1234,
      token: "a".repeat(64),
      instanceId: randomUUID(),
      pid: 1,
    }),
  );
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
    rmSync(root, { recursive: true, force: true });
  });
  const requests: { url: string; init?: RequestInit }[] = [];
  let kind = "local-run-action";
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), ...(init ? { init } : {}) });
    return Response.json({
      kind,
      workspaceId,
      id,
      headSha: "a".repeat(40),
      status: "queued",
      result: null,
      createdAt: 1,
      freshness: "unknown",
      leaseToken: "private",
    });
  };
  const client = new DesktopClient(root);
  for (const [method, args] of [
    ["latestRunAction", []],
    ["startRunAction", [workspaceId, consent, key, ["sh"]]],
    ["cancelRunAction", [workspaceId, "HEAD"]],
  ] as const)
    assert.equal((await client.call(method, args)).ok, false);
  assert.equal(requests.length, 0);
  const reply = await client.call("startRunAction", [
    workspaceId,
    consent,
    key,
  ]);
  assert.equal(reply.ok, true);
  assert.equal(JSON.stringify(reply).includes("leaseToken"), false);
  assert.match(requests[0]!.url, /\/run-actions$/);
  assert.equal(requests[0]!.init?.body, JSON.stringify({ consentId: consent }));
  await client.call("cancelRunAction", [workspaceId, id]);
  assert.match(requests[1]!.url, /\/run-actions\/[^/]+\/cancel$/);
  kind = "local-check";
  assert.equal((await client.call("latestRunAction", [workspaceId])).ok, false);
  kind = "local-run-action";
  assert.equal((await client.call("latestCheck", [workspaceId])).ok, false);
});
