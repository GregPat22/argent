import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Workspace } from "../src/domain.js";
import { DesktopClient } from "../src/desktop/bridge.js";
import { buildIdentity } from "../src/desktop/build-identity.js";
import type {
  CommandConfigurationView,
  CandidateReviewView,
  PublicationReview,
  PublicationStatus,
} from "../src/desktop/contracts.js";
import { makeServer } from "../src/http.js";
import { LocalPublications } from "../src/local-publication.js";
import { Store } from "../src/store.js";
import {
  fixtureGit,
  publicationUpstream,
} from "./publication-upstream-fixture.js";

async function desktop(
  root: string,
  repo: string,
  upstream: Awaited<ReturnType<typeof publicationUpstream>>,
) {
  const store = new Store(join(root, "store.sqlite")),
    stop = new AbortController();
  const publications = new LocalPublications(upstream.publisher, stop.signal);
  const token = randomBytes(32).toString("hex"),
    instanceId = randomUUID();
  const server = makeServer(store, token, {
    worktreeRoot: join(root, "worktrees"),
    localCommandOperatorId: "fixture-desktop",
    localChecks: true,
    publisher: publications,
    instanceId,
    build: buildIdentity(),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  writeFileSync(
    join(root, "service.json"),
    JSON.stringify({
      version: 1,
      port: address.port,
      token,
      instanceId,
      pid: process.pid,
    }),
  );
  const client = new DesktopClient(root, async () => repo);
  let closed = false;
  return {
    async call<T>(method: string, ...args: unknown[]): Promise<T> {
      const reply = await client.call(method, args);
      assert.ok(reply.ok, reply.ok ? undefined : reply.error);
      return reply.value as T;
    },
    async close() {
      if (closed) return;
      closed = true;
      stop.abort();
      const stopped = once(server, "close");
      server.close();
      server.closeAllConnections();
      await stopped;
      await publications.drain();
      store.close();
    },
  };
}

test("desktop publishes the exact reviewed Markdown and Git branch to a local receiver and reads the verified draft after a service restart", async (t) => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "argent-desktop-publish-")),
  );
  const repo = join(root, "your-test-repo");
  mkdirSync(repo);
  fixtureGit(repo, "init", "--quiet", "--initial-branch=main");
  writeFileSync(
    join(repo, "argent.json"),
    JSON.stringify({
      version: 1,
      commands: { test: { argv: ["node", "--version"] } },
    }),
  );
  fixtureGit(repo, "add", "argent.json");
  fixtureGit(repo, "commit", "--quiet", "-m", "Fixture base");
  const upstream = await publicationUpstream(root, repo);
  let service: Awaited<ReturnType<typeof desktop>> | undefined;
  t.after(async () => {
    try {
      await service?.close();
    } finally {
      await upstream.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
  service = await desktop(root, repo, upstream);
  const workspace = await service.call<Workspace>("createLocalWorkspace");
  assert.ok(workspace.local);
  const {
    id,
    local: { worktreePath, branch, baseSha },
  } = workspace;
  const config = await service.call<CommandConfigurationView>(
    "commandConfiguration",
    id,
  );
  assert.ok(config.configuration);
  await service.call(
    "approveCommandConfiguration",
    id,
    config.configuration.approvalCandidate.identity,
    randomUUID(),
  );
  for (const [path, contents, message] of [
    ["notes.txt", "one\n", "First change"],
    ["notes.test.js", 'test.skip("test", () => {});\n', "Record test change"],
  ] as const) {
    writeFileSync(join(worktreePath, path), contents);
    fixtureGit(worktreePath, "add", "--", path);
    fixtureGit(worktreePath, "commit", "--quiet", "-m", message);
  }
  const candidate = await service.call<CandidateReviewView>(
    "candidateReview",
    id,
  );
  const preview = await service.call<{ body: string }>(
    "draftEvidence",
    id,
    candidate.identity,
  );
  const input = {
    reviewIdentity: candidate.identity,
    repository: "example/project",
    baseBranch: "main",
    title: "Review fixture changes",
  };
  const plan = await service.call<PublicationReview>(
    "reviewPublication",
    id,
    input,
  );
  assert.equal(plan.commitCount, 2);
  assert.equal(plan.headSha, fixtureGit(worktreePath, "rev-parse", "HEAD"));
  assert.equal(plan.baseSha, baseSha);
  assert.equal(plan.body, preview.body);
  assert.match(plan.body, /notes\.test\.js/);
  assert.match(plan.body, /test\.skip, line 1/);
  assert.equal(await service.call("publicationStatus", id), null);
  assert.deepEqual(upstream.effects, []);
  const receipt = await service.call<PublicationStatus>(
    "publishDraft",
    id,
    input,
    plan.identity,
  );
  assert.equal(receipt.status, "published", JSON.stringify(upstream.effects));
  assert.deepEqual(receipt, {
    workspaceId: id,
    identity: plan.identity,
    repository: input.repository,
    branch,
    headSha: plan.headSha,
    baseBranch: "main",
    baseSha,
    status: "published",
    phase: "complete",
    url: upstream.url,
  });
  assert.deepEqual(upstream.drafts, [
    { head: branch, base: "main", title: input.title, body: plan.body },
  ]);
  assert.deepEqual(
    fixtureGit(
      upstream.receiver,
      "for-each-ref",
      "--format=%(refname) %(objectname)",
      "refs",
    )
      .split("\n")
      .sort(),
    [
      "refs/heads/main " + baseSha,
      "refs/heads/" + branch + " " + plan.headSha,
    ].sort(),
  );
  await service.close();
  service = await desktop(root, repo, upstream);
  assert.deepEqual(await service.call("publicationStatus", id), receipt);
  assert.deepEqual(upstream.effects, [
    "refs",
    "refs",
    "push",
    "refs",
    "refs",
    "create draft",
    "read draft",
  ]);
});
