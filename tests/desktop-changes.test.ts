import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DesktopClient } from "../src/desktop/bridge.js";
import { validateWorkspaceChanges } from "../src/desktop/changes.js";
import type { WorkspaceChanges } from "../src/domain.js";
const id = "00000000-0000-4000-8000-000000000001";
const value = (): WorkspaceChanges => ({
  kind: "workspace-changes",
  workspaceId: id,
  baseSha: "a".repeat(40),
  headSha: "b".repeat(40),
  simulation: false,
  tested: false,
  consistency: "live",
  files: [
    {
      path: "file",
      previousPath: null,
      status: "added",
      oldMode: null,
      newMode: "100644",
      binary: false,
      diff: "+text\n",
    },
  ],
});

test("changes bridge rejects extra arguments and paths; scopes its timeout and validates service responses", async () => {
  const directory = mkdtempSync(join(tmpdir(), "argent-changes-bridge-"));
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
  let response: unknown = value();
  const timeouts: number[] = [];
  const routes: string[] = [];
  globalThis.fetch = async (input, init) => {
    routes.push(String(input));
    assert.equal(init?.method, "GET");
    return Response.json(response);
  };
  AbortSignal.timeout = (milliseconds: number) => {
    timeouts.push(milliseconds);
    return new AbortController().signal;
  };
  try {
    const client = new DesktopClient(directory);
    for (const args of [[], ["../file"], [id, "HEAD"], [id, undefined], [42]])
      assert.equal((await client.call("workspaceChanges", args)).ok, false);
    assert.equal(routes.length, 0);
    assert.equal((await client.call("workspaceChanges", [id])).ok, true);
    assert.match(routes[0]!, new RegExp(`/workspaces/${id}/changes$`));
    assert.deepEqual(timeouts, [20000]);
    response = { ...value(), workspaceId: "other" };
    assert.equal((await client.call("workspaceChanges", [id])).ok, false);
    await client.call("getWorkspace", [id]);
    assert.equal(
      timeouts.at(-1),
      7000,
      "ordinary operations retain their timeout",
    );
  } finally {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("changes response validation bounds content and rejects malformed identities and file shapes", () => {
  assert.deepEqual(validateWorkspaceChanges(value(), id), value());
  const invalid = [
    null,
    {},
    { ...value(), tested: true },
    { ...value(), simulation: true },
    { ...value(), consistency: "snapshot" },
    { ...value(), baseSha: "HEAD" },
    { ...value(), headSha: "a".repeat(64) },
    { ...value(), files: Array(1001).fill(value().files[0]) },
  ];
  for (const change of [
    { path: "../escape" },
    { path: "\0" },
    { previousPath: 12 },
    { binary: "false" },
    { binary: true },
    { status: "renamed" },
    { status: ["added"] },
    { oldMode: "160000" },
    { diff: 42 },
    { diff: "x".repeat(1024 * 1024 + 1) },
  ])
    invalid.push({ ...value(), files: [{ ...value().files[0], ...change }] });
  for (const candidate of invalid)
    assert.throws(
      () => validateWorkspaceChanges(candidate, id),
      /invalid workspace changes/,
    );
  assert.throws(() =>
    validateWorkspaceChanges(
      { ...value(), files: [value().files[0], value().files[0]] },
      id,
    ),
  );
  assert.equal(
    validateWorkspaceChanges(
      { ...value(), baseSha: "a".repeat(64), headSha: "b".repeat(64) },
      id,
    ).headSha.length,
    64,
  );
});
