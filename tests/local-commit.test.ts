import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { DesktopClient } from "../src/desktop/bridge.js";
import { makeServer } from "../src/http.js";
import {
  commitStagedChanges,
  reviewStagedCommit,
  removeOwnedIndex,
  type StagedReview,
  type CommitReceipt,
} from "../src/local-commit.js";
import { directoryIdentity } from "../src/local-worktree-identity.js";
import { createLocalWorkspace } from "../src/local-worktree.js";
import { Store } from "../src/store.js";
import { archiveLocalWorkspace } from "../src/local-archive.js";
import { buildIdentity } from "../src/desktop/build-identity.js";

const author = {
  author: "Argent Fixture",
  email: "fixture@example.invalid",
  message: "Record the reviewed change",
};
function git(cwd: string, ...args: string[]) {
  return execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}
async function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "argent-commit-test-"))),
    repo = join(root, "repo"),
    worktrees = join(root, "worktrees"),
    database = join(root, "state.sqlite");
  mkdirSync(repo);
  git(repo, "init", "--quiet", "--initial-branch=main");
  writeFileSync(join(repo, "text"), "original\n");
  git(repo, "add", "text");
  git(repo, "commit", "--quiet", "-m", "base");
  const store = new Store(database);
  t.after(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const workspace = await createLocalWorkspace(store, worktrees, repo),
    id = workspace.id,
    cwd = workspace.local!.worktreePath;
  const stage = (content: string) => {
    writeFileSync(join(cwd, "text"), content);
    git(cwd, "add", "text");
  };
  return {
    root,
    repo,
    database,
    store,
    workspace,
    id,
    cwd,
    worktrees,
    stage,
    review: () => reviewStagedCommit(store, worktrees, id, author),
  };
}
test("desktop reviews the copied index, commits its pinned tree and retains a durable receipt", async (t) => {
  const f = await fixture(t);
  const token = randomBytes(32).toString("hex"),
    instanceId = randomUUID();
  const server = makeServer(f.store, token, {
    worktreeRoot: f.worktrees,
    build: buildIdentity(),
    instanceId,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  t.after(async () => {
    const close = once(server, "close");
    server.close();
    server.closeAllConnections();
    await close;
  });
  writeFileSync(
    join(f.root, "service.json"),
    JSON.stringify({ version: 1, port, token, instanceId, pid: process.pid }),
  );
  const client = new DesktopClient(f.root);
  const call = async <T>(method: string, ...args: unknown[]) => {
    const response = await client.call(method, args);
    assert.ok(response.ok, response.ok ? undefined : response.error);
    return response.value as T;
  };
  git(f.cwd, "config", "author.name", "Repository Author");
  git(f.cwd, "config", "author.email", "other-author@example.invalid");
  git(f.cwd, "config", "committer.name", "Repository Committer");
  git(f.cwd, "config", "committer.email", "other-committer@example.invalid");
  const parent = git(f.cwd, "rev-parse", "HEAD");
  f.stage("staged text\n");
  writeFileSync(join(f.cwd, "picture"), Buffer.from([0, 1, 2]));
  git(f.cwd, "add", "picture");
  const indexPath = join(
      git(f.cwd, "rev-parse", "--absolute-git-dir"),
      "index",
    ),
    index = readFileSync(indexPath);
  writeFileSync(join(f.cwd, "text"), "future edit\n");
  writeFileSync(join(f.cwd, "local"), "keep me");
  const review = await call<StagedReview>("reviewStagedCommit", f.id, author);
  assert.equal(review.parentSha, parent);
  assert.equal(review.branch, f.workspace.local!.branch);
  await assert.rejects(
    commitStagedChanges(
      f.store,
      f.worktrees,
      f.id,
      { ...author, message: "Different message" },
      review.identity,
    ),
    /changed/,
  );
  assert.match(
    review.files.find((x) => x.path === "text")!.diff,
    /\+staged text/,
  );
  const picture = review.files.find((x) => x.path === "picture")!;
  assert.equal(picture.binary, true);
  assert.equal(picture.newBlobId, git(f.cwd, "rev-parse", ":picture"));
  assert.deepEqual(readFileSync(indexPath), index);
  const receipt = await call<CommitReceipt>(
    "commitStagedChanges",
    f.id,
    author,
    review.identity,
  );
  assert.equal(git(f.cwd, "rev-parse", "HEAD"), receipt.commitSha);
  assert.equal(git(f.cwd, "rev-parse", "HEAD^"), parent);
  assert.equal(git(f.cwd, "rev-parse", "HEAD^{tree}"), review.treeId);
  assert.equal(git(f.cwd, "show", "HEAD:text"), "staged text");
  assert.equal(
    git(f.cwd, "log", "-1", "--format=%an <%ae> %s"),
    "Argent Fixture <fixture@example.invalid> Record the reviewed change",
  );
  assert.deepEqual(readFileSync(indexPath), index);
  assert.equal(readFileSync(join(f.cwd, "text"), "utf8"), "future edit\n");
  assert.equal(readFileSync(join(f.cwd, "local"), "utf8"), "keep me");
  assert.equal(git(f.repo, "rev-parse", "HEAD"), parent);
  const restarted = new Store(f.database);
  try {
    assert.deepEqual(
      await commitStagedChanges(
        restarted,
        f.worktrees,
        f.id,
        author,
        review.identity,
      ),
      receipt,
    );
  } finally {
    restarted.close();
  }
});
test("empty staging, a changed index, another parent and active Git operations prevent committing", async (t) => {
  const f = await fixture(t);
  let review = await f.review();
  assert.deepEqual(review.files, []);
  await assert.rejects(
    commitStagedChanges(f.store, f.worktrees, f.id, author, review.identity),
  );
  f.stage("first");
  review = await f.review();
  f.stage("second");
  await assert.rejects(
    commitStagedChanges(f.store, f.worktrees, f.id, author, review.identity),
    /changed/,
  );
  review = await f.review();
  git(f.cwd, "commit", "-qm", "separate commit");
  await assert.rejects(
    commitStagedChanges(f.store, f.worktrees, f.id, author, review.identity),
  );
  f.stage("third");
  const admin = git(f.cwd, "rev-parse", "--absolute-git-dir");
  writeFileSync(join(admin, "MERGE_HEAD"), review.parentSha + "\n");
  await assert.rejects(f.review(), /Git operation/);
  assert.equal(f.store.getWorkspace(f.id).commitNeedsAttention, undefined);
});
test("a commit intent survives restart, blocks archive and forbids replay", async (t) => {
  const f = await fixture(t);
  f.stage("staged");
  const review = await f.review();
  const run = f.store.createRun(f.id, "fixture", "fixture-commit-request");
  await assert.rejects(f.review(), /active or uncertain/);
  f.store.cancel(run.id);
  const now = await f.review();
  assert.notEqual(now.identity, review.identity);
  // Model a service interruption after the intent and before branch dispatch.
  const original = f.store.beginLocalCommit.bind(f.store);
  f.store.beginLocalCommit = (...args) => {
    original(...args);
    throw new Error("service stopped");
  };
  await assert.rejects(
    commitStagedChanges(f.store, f.worktrees, f.id, author, now.identity),
    /needs attention/,
  );
  const restarted = new Store(f.database);
  try {
    assert.equal(restarted.getWorkspace(f.id).commitNeedsAttention, true);
    await assert.rejects(
      commitStagedChanges(restarted, f.worktrees, f.id, author, now.identity),
      /needs attention/,
    );
    await assert.rejects(
      archiveLocalWorkspace(restarted, f.worktrees, f.id, true),
      /needs attention/,
    );
    assert.throws(
      () => restarted.createRun(f.id, "next task", "after-uncertain-commit"),
      /stopped/,
    );
    assert.throws(
      () => restarted.setWorkspaceState(f.id, "running"),
      /needs attention/,
    );
    assert.equal(git(f.cwd, "rev-parse", "HEAD"), now.parentSha);
  } finally {
    restarted.close();
  }
});

test("special stage entries are refused before review or ref mutation", async (t) => {
  const f = await fixture(t);
  f.stage("staged");
  git(f.cwd, "update-index", "--skip-worktree", "text");
  await assert.rejects(f.review(), /stage-zero/);
  git(f.cwd, "update-index", "--no-skip-worktree", "text");
  writeFileSync(join(f.cwd, "planned"), "later");
  git(f.cwd, "add", "--intent-to-add", "planned");
  await assert.rejects(f.review());
  assert.equal(git(f.cwd, "rev-parse", "HEAD"), f.workspace.local!.baseSha);
  assert.equal(f.store.getWorkspace(f.id).commitNeedsAttention, undefined);
});

test("a concurrent branch advance survives the commit compare-and-swap", async (t) => {
  const f = await fixture(t);
  f.stage("staged");
  const review = await f.review();
  const separate = git(
    f.cwd,
    "commit-tree",
    review.treeId,
    "-p",
    review.parentSha,
    "-m",
    "Independently created commit",
  );
  const reserve = f.store.beginLocalCommit.bind(f.store);
  f.store.beginLocalCommit = (...args) => {
    const previous = reserve(...args);
    git(
      f.cwd,
      "update-ref",
      "--no-deref",
      `refs/heads/${review.branch}`,
      separate,
      review.parentSha,
    );
    return previous;
  };
  await assert.rejects(
    commitStagedChanges(f.store, f.worktrees, f.id, author, review.identity),
    /needs attention/,
  );
  assert.equal(git(f.cwd, "rev-parse", "HEAD"), separate);
  assert.equal(f.store.getWorkspace(f.id).commitNeedsAttention, true);
});

test("overlapping confirmations of one staged review record a single branch advance", async (t) => {
  const f = await fixture(t);
  f.stage("shared change");
  const review = await f.review();
  const confirm = () =>
    commitStagedChanges(f.store, f.worktrees, f.id, author, review.identity);
  const attempts = await Promise.allSettled([confirm(), confirm()]);
  const tip = git(f.cwd, "rev-parse", "HEAD");
  assert.equal(git(f.cwd, "rev-parse", "HEAD^"), review.parentSha);
  assert.ok(attempts.some((result) => result.status === "fulfilled"));
  for (const result of attempts) {
    if (result.status === "fulfilled")
      assert.equal(result.value.commitSha, tip);
    else assert.match(String(result.reason), /needs attention/);
  }
  assert.equal((await confirm()).commitSha, tip);
});

test("temporary index cleanup preserves occupied and replaced files", async (t) => {
  const scratch = realpathSync(
    mkdtempSync(join(tmpdir(), "argent-index-owner-")),
  );
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const id = await directoryIdentity(scratch);
  const index = join(scratch, "index");
  writeFileSync(index, "occupied");
  await assert.rejects(removeOwnedIndex(scratch, id));
  assert.equal(readFileSync(index, "utf8"), "occupied");

  const held = await open(index, "r");
  try {
    renameSync(index, join(scratch, "previous"));
    writeFileSync(index, "replacement");
    await assert.rejects(
      removeOwnedIndex(scratch, id, held),
      /ownership changed/,
    );
    assert.equal(readFileSync(index, "utf8"), "replacement");
  } finally {
    await held.close();
  }
});
