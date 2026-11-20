import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { deflateSync } from "node:zlib";
import { DomainError } from "../src/domain.js";
import { readLocalCommandConfig } from "../src/local-command-config.js";
import {
  REVIEW_LIMITS,
  REVIEW_POLICY,
  reviewLocalCommandCandidate,
} from "../src/local-command-review.js";
import { createLocalWorkspace } from "../src/local-worktree.js";
import { Store } from "../src/store.js";
import { inspectLocalCommandCandidate } from "../src/workspace-changes.js";

const CONFIG =
  '{"version":1,"commands":{"test":{"argv":["node","marker.js"]}}}\n';
function git(cwd: string, ...args: string[]) {
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
const rejected = (status: number) => (error: unknown) =>
  error instanceof DomainError && error.status === status;
async function fixture(
  t: TestContext,
  files: Record<string, string | Buffer> = {},
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "argent-review-")));
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "--quiet", "--initial-branch=main");
  for (const [name, bytes] of Object.entries({
    "argent.json": CONFIG,
    "file.txt": "before\n",
    "marker.js": 'require("node:fs").writeFileSync("executed", "bad");\n',
    ...files,
  })) {
    mkdirSync(join(repo, name, ".."), { recursive: true });
    writeFileSync(join(repo, name), bytes);
  }
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "initial");
  const database = join(root, "store.sqlite");
  const store = new Store(database);
  const worktrees = join(root, "worktrees");
  const workspace = await createLocalWorkspace(store, worktrees, repo);
  const directory = workspace.local!.worktreePath;
  const config = (await readLocalCommandConfig(
    store,
    worktrees,
    workspace.id,
  ))!;
  await store.localCommandApprovals.approve(
    worktrees,
    workspace.id,
    "operator",
    config.approvalCandidate.identity,
    "approve",
  );
  const db = new DatabaseSync(database);
  t.after(() => {
    db.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    repo,
    database,
    store,
    db,
    worktrees,
    workspace,
    directory,
    config,
    review: (operator = "operator", signal?: AbortSignal) =>
      reviewLocalCommandCandidate(
        store,
        worktrees,
        workspace.id,
        operator,
        signal,
      ),
    commit: () => {
      git(directory, "add", "--all", ".");
      git(directory, "commit", "--quiet", "--allow-empty", "-m", "candidate");
    },
  };
}

test("review lists the complete base-to-commit change set from pinned objects without mutating state", async (t) => {
  const f = await fixture(t, {
    "binary.dat": Buffer.from([0, 1, 2]),
    "gone.txt": "removed later\n",
    "mode.sh": "#!/bin/sh\n",
    "old-name.txt": "moved without edits\n",
  });
  writeFileSync(join(f.directory, "file.txt"), "after\n");
  writeFileSync(join(f.directory, "new.txt"), "added");
  writeFileSync(join(f.directory, "binary.dat"), Buffer.from([0, 1, 3, 4]));
  unlinkSync(join(f.directory, "gone.txt"));
  chmodSync(join(f.directory, "mode.sh"), 0o755);
  renameSync(
    join(f.directory, "old-name.txt"),
    join(f.directory, "new-name.txt"),
  );
  symlinkSync("file.txt", join(f.directory, "link"));
  f.commit();
  const indexPath = join(f.repo, ".git", "worktrees", f.workspace.id, "index");
  const index = readFileSync(indexPath);
  const counts = () =>
    [
      "runs",
      "events",
      "command_jobs",
      "local_command_approvals",
      "local_command_approval_events",
      "local_command_approval_receipts",
    ].map(
      (table) => f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n,
    );
  const before = counts();
  const status = git(f.directory, "status", "--porcelain");

  const review = await f.review();
  assert.equal(review.kind, "local-command-candidate-review");
  assert.equal(review.policyVersion, REVIEW_POLICY);
  assert.deepEqual(
    review.observation,
    await inspectLocalCommandCandidate(
      f.store,
      f.worktrees,
      f.workspace.id,
      "operator",
    ),
  );
  assert.equal(
    review.observation.headSha,
    git(f.directory, "rev-parse", "HEAD"),
  );
  assert.equal(review.commandSource, "approved-base-configuration");
  assert.equal(review.configuration, "unchanged");
  assert.equal(review.binaryContent, "identity-only");
  assert.equal(review.commandInputs, "not-identified");
  assert.equal(review.consent, "not-collected");
  assert.equal(review.execution, "forbidden");
  assert.equal(review.consistency, "pinned-objects");
  assert.equal(review.simulation, false);
  assert.equal(review.tested, false);
  assert.deepEqual(
    review.files.map((file) => [file.path, file.status, file.previousPath]),
    [
      ["binary.dat", "modified", null],
      ["file.txt", "modified", null],
      ["gone.txt", "deleted", null],
      ["link", "added", null],
      ["mode.sh", "modified", null],
      ["new-name.txt", "renamed", "old-name.txt"],
      ["new.txt", "added", null],
    ],
  );
  assert.deepEqual(review.summary, { files: 7, textFiles: 6, binaryFiles: 1 });
  const base = f.workspace.local!.baseSha;
  const blob = (revision: string, path: string) =>
    git(f.directory, "rev-parse", `${revision}:${path}`);
  const file = (path: string) =>
    review.files.find((candidate) => candidate.path === path)!;

  const binary = file("binary.dat");
  assert.equal(binary.binary, true);
  assert.equal(binary.diff, "");
  assert.equal(binary.oldBlobId, blob(base, "binary.dat"));
  assert.equal(binary.newBlobId, blob("HEAD", "binary.dat"));
  assert.deepEqual([binary.oldBytes, binary.newBytes], [3, 4]);

  const text = file("file.txt");
  assert.match(text.diff, /-before\n\+after\n/);
  assert.equal(text.oldBlobId, blob(base, "file.txt"));
  assert.equal(text.newBlobId, blob("HEAD", "file.txt"));
  assert.equal(text.configuration, false);

  const gone = file("gone.txt");
  assert.deepEqual(
    [gone.oldMode, gone.newMode, gone.newBlobId, gone.newBytes],
    ["100644", null, null, null],
  );
  assert.match(gone.diff, /deleted file mode 100644\n[\s\S]*-removed later\n/);

  const link = file("link");
  assert.equal(link.newMode, "120000");
  assert.match(link.diff, /\+file\.txt\n\\ No newline at end of file\n/);

  const mode = file("mode.sh");
  assert.deepEqual([mode.oldMode, mode.newMode], ["100644", "100755"]);
  assert.equal(mode.oldBlobId, mode.newBlobId);
  assert.match(mode.diff, /old mode 100644\nnew mode 100755\n$/);

  const renamed = file("new-name.txt");
  assert.equal(renamed.oldBlobId, renamed.newBlobId);
  assert.match(renamed.diff, /similarity index 100%/);

  const added = file("new.txt");
  assert.deepEqual(
    [added.oldBlobId, added.oldBytes, added.newBytes],
    [null, null, 5],
  );
  assert.match(added.diff, /\+added\n\\ No newline at end of file\n/);

  assert.ok(Object.isFrozen(review));
  assert.ok(Object.isFrozen(review.files));
  assert.ok(review.files.every((entry) => Object.isFrozen(entry)));
  assert.ok(Object.isFrozen(review.summary));
  assert.match(review.identity, /^[a-f0-9]{64}$/);
  assert.deepEqual(await f.review(), review);
  const reopened = new Store(f.database);
  try {
    assert.deepEqual(
      await reviewLocalCommandCandidate(
        reopened,
        f.worktrees,
        f.workspace.id,
        "operator",
      ),
      review,
    );
  } finally {
    reopened.close();
  }
  assert.deepEqual(counts(), before);
  assert.deepEqual(readFileSync(indexPath), index);
  assert.equal(git(f.directory, "status", "--porcelain"), status);
  assert.equal(f.store.claim(1000), null);
  assert.equal(f.store.claimCommandJob(1000), null);
  assert.equal(existsSync(join(f.directory, "executed")), false);
});

test("review identity follows the commit, the reviewed content and the consenting operator", async (t) => {
  const f = await fixture(t);
  const unchanged = await f.review();
  assert.deepEqual(unchanged.files, []);
  assert.deepEqual(unchanged.summary, {
    files: 0,
    textFiles: 0,
    binaryFiles: 0,
  });
  writeFileSync(join(f.directory, "file.txt"), "after\n");
  f.commit();
  const changed = await f.review();
  assert.notEqual(changed.identity, unchanged.identity);
  assert.equal(changed.files.length, 1);
  // The same tree under another commit is another candidate.
  git(f.directory, "commit", "--quiet", "--amend", "-m", "reworded");
  const reworded = await f.review();
  assert.equal(reworded.observation.treeId, changed.observation.treeId);
  assert.deepEqual(reworded.files, changed.files);
  assert.notEqual(reworded.identity, changed.identity);
  // Returning to the base content leaves nothing to review, at a new commit.
  writeFileSync(join(f.directory, "file.txt"), "before\n");
  f.commit();
  const reverted = await f.review();
  assert.deepEqual(reverted.files, []);
  assert.notEqual(reverted.identity, unchanged.identity);

  await assert.rejects(f.review("another"), rejected(409));
  await f.store.localCommandApprovals.approve(
    f.worktrees,
    f.workspace.id,
    "another",
    f.config.approvalCandidate.identity,
    "another",
  );
  const another = await f.review("another");
  assert.deepEqual(another.files, reverted.files);
  assert.notEqual(another.identity, reverted.identity);
});

test("a candidate's own configuration changes are flagged while commands stay bound to the approved base", async (t) => {
  const f = await fixture(t);
  const hostile =
    '{"version":1,"commands":{"test":{"argv":["node","-e","process.exit(0)"]}}}\n';
  writeFileSync(join(f.directory, "argent.json"), hostile);
  f.commit();
  const changed = await f.review();
  assert.equal(changed.configuration, "changed");
  assert.equal(changed.commandSource, "approved-base-configuration");
  assert.equal(
    changed.observation.configurationIdentity,
    f.config.approvalCandidate.identity,
  );
  assert.deepEqual(
    changed.files.map((file) => [file.path, file.status, file.configuration]),
    [["argent.json", "modified", true]],
  );
  assert.match(changed.files[0]!.diff, /\+.*process\.exit\(0\)/);
  // The base, not the candidate, still supplies the approved commands.
  assert.deepEqual(
    (await readLocalCommandConfig(f.store, f.worktrees, f.workspace.id))!.config
      .commands.test!.argv,
    ["node", "marker.js"],
  );

  writeFileSync(join(f.directory, "argent.json"), CONFIG);
  renameSync(
    join(f.directory, "argent.json"),
    join(f.directory, "renamed.json"),
  );
  f.commit();
  const removed = await f.review();
  assert.equal(removed.configuration, "removed");
  assert.deepEqual(
    removed.files.map((file) => [
      file.path,
      file.previousPath,
      file.status,
      file.configuration,
    ]),
    [["renamed.json", "argent.json", "renamed", true]],
  );

  symlinkSync("renamed.json", join(f.directory, "argent.json"));
  f.commit();
  const linked = await f.review();
  assert.equal(linked.configuration, "changed");
  assert.deepEqual(
    linked.files.map((file) => [file.path, file.status, file.configuration]),
    [
      ["argent.json", "typechanged", true],
      ["renamed.json", "added", false],
    ],
  );
  assert.equal(
    new Set([changed, removed, linked].map((r) => r.identity)).size,
    3,
  );
  assert.equal(existsSync(join(f.directory, "executed")), false);
});

test("dirty, unapproved, simulated and unknown workspaces have no review", async (t) => {
  const f = await fixture(t);
  writeFileSync(join(f.directory, "file.txt"), "uncommitted\n");
  await assert.rejects(f.review(), rejected(409));
  git(f.directory, "add", "file.txt");
  await assert.rejects(f.review(), rejected(409));
  f.commit();
  await f.review();
  writeFileSync(join(f.directory, "untracked.txt"), "new\n");
  await assert.rejects(f.review(), rejected(409));
  unlinkSync(join(f.directory, "untracked.txt"));
  await assert.rejects(f.review("stranger"), rejected(409));
  const simulation = f.store.createWorkspace(
    "https://github.com/example/repository",
  );
  for (const id of [
    simulation.id,
    "00000000-0000-4000-8000-000000000000",
    "../escape",
    "",
  ])
    await assert.rejects(
      reviewLocalCommandCandidate(f.store, f.worktrees, id, "operator"),
      (error: unknown) =>
        error instanceof DomainError && [404, 409].includes(error.status),
    );
  await assert.rejects(
    reviewLocalCommandCandidate(f.store, f.worktrees, f.workspace.id, ""),
    rejected(400),
  );
});

test("replacement refs and configured filters, textconv and external diff neither change nor run during review", async (t) => {
  const f = await fixture(t);
  writeFileSync(join(f.directory, "file.txt"), "after\n");
  f.commit();
  const expected = await f.review();
  const marker = join(f.root, "executed");
  const command = `touch '${marker}'`;
  for (const key of [
    "filter.hostile.clean",
    "filter.hostile.smudge",
    "filter.hostile.process",
    "diff.hostile.textconv",
    "diff.external",
    "core.fsmonitor",
  ])
    git(f.repo, "config", key, command);
  mkdirSync(join(f.repo, ".git", "info"), { recursive: true });
  writeFileSync(
    join(f.repo, ".git", "info", "attributes"),
    "* filter=hostile diff=hostile\n",
  );
  const base = f.workspace.local!.baseSha;
  const head = git(f.directory, "rev-parse", "HEAD");
  git(
    f.directory,
    "replace",
    git(f.directory, "rev-parse", `${base}:file.txt`),
    git(f.directory, "rev-parse", "HEAD:marker.js"),
  );
  git(
    f.directory,
    "replace",
    git(f.directory, "rev-parse", `${head}^{tree}`),
    git(f.directory, "rev-parse", `${base}^{tree}`),
  );
  const review = await f.review();
  assert.deepEqual(review, expected);
  assert.match(review.files[0]!.diff, /-before\n\+after\n/);
  assert.equal(existsSync(marker), false);
});

test("unusual file names and hostile text stay literal, untrusted display data", async (t) => {
  const f = await fixture(t);
  const name = 'odd "name"\n<b>.txt';
  const content = "<script>alert(1)</script>‮\u0007\n";
  writeFileSync(join(f.directory, name), content);
  mkdirSync(join(f.directory, "nested", "deeper"), { recursive: true });
  writeFileSync(join(f.directory, "nested", "deeper", "ü.txt"), "ü\n");
  f.commit();
  const review = await f.review();
  assert.deepEqual(
    review.files.map((file) => file.path),
    ["nested/deeper/ü.txt", name],
  );
  const odd = review.files[1]!;
  assert.equal(odd.binary, false);
  assert.ok(odd.diff.endsWith(`+${content}`));
  assert.ok(odd.diff.includes('"b/odd \\"name\\"\\012<b>.txt"'));
  assert.equal(odd.newBytes, Buffer.byteLength(content));
});

test("a missing or tampered object fails closed instead of producing a partial review", async (t) => {
  const f = await fixture(t);
  writeFileSync(join(f.directory, "file.txt"), "after\n");
  f.commit();
  await f.review();
  const oid = git(
    f.directory,
    "rev-parse",
    `${f.workspace.local!.baseSha}:file.txt`,
  );
  const object = join(f.repo, ".git", "objects", oid.slice(0, 2), oid.slice(2));
  const original = readFileSync(object);
  // Same length as the real blob, different bytes: only a hash check can tell.
  chmodSync(object, 0o644);
  writeFileSync(object, deflateSync(Buffer.from("blob 7\0forged\n")));
  await assert.rejects(f.review(), rejected(409));
  writeFileSync(object, original);
  await f.review();
  unlinkSync(object);
  await assert.rejects(f.review(), rejected(409));
});

test("review inputs, diff text and path count are bounded without partial success", async (t) => {
  await t.test("one oversized base blob", async (t) => {
    const f = await fixture(t, {
      large: Buffer.alloc(REVIEW_LIMITS.fileBytes + 1, 120),
    });
    unlinkSync(join(f.directory, "large"));
    f.commit();
    await assert.rejects(f.review(), rejected(413));
  });
  await t.test("total inspected bytes", async (t) => {
    const files: Record<string, Buffer> = {};
    // NUL-filled, so only the input allowance applies, never the diff text one.
    for (let index = 0; index < 9; index++) {
      files[`large-${index}`] = Buffer.alloc(REVIEW_LIMITS.fileBytes);
      files[`large-${index}`]![1] = index;
    }
    const f = await fixture(t, files);
    for (const name of Object.keys(files)) unlinkSync(join(f.directory, name));
    f.commit();
    await assert.rejects(f.review(), rejected(413));
  });
  await t.test("rendered diff text", async (t) => {
    const f = await fixture(t, {
      "lines.txt": "a\n".repeat(REVIEW_LIMITS.diffBytes / 4),
    });
    writeFileSync(
      join(f.directory, "lines.txt"),
      "b\n".repeat(REVIEW_LIMITS.diffBytes / 4),
    );
    f.commit();
    await assert.rejects(f.review(), rejected(413));
    // Binary content of the same size has an identity and no text allowance.
    writeFileSync(
      join(f.directory, "lines.txt"),
      Buffer.alloc(REVIEW_LIMITS.diffBytes, 0),
    );
    f.commit();
    const review = await f.review();
    assert.deepEqual(review.summary, {
      files: 1,
      textFiles: 0,
      binaryFiles: 1,
    });
  });
  await t.test("changed paths, not the size of the tree", async (t) => {
    const files: Record<string, string> = {};
    for (let index = 0; index < 600; index++) files[`old-${index}`] = "x";
    const f = await fixture(t, files);
    // More tracked files than the changed-path bound, with one small change.
    mkdirSync(join(f.directory, "many"));
    for (let index = 0; index < REVIEW_LIMITS.files + 200; index++)
      writeFileSync(join(f.directory, "many", `file-${index}`), `${index}`);
    f.commit();
    const base = git(f.directory, "rev-parse", "HEAD");
    f.db
      .prepare("UPDATE local_worktrees SET base_sha = ? WHERE workspace_id = ?")
      .run(base, f.workspace.id);
    writeFileSync(join(f.directory, "file.txt"), "after\n");
    f.commit();
    const review = await f.review();
    assert.equal(review.observation.files, 3 + 600 + REVIEW_LIMITS.files + 200);
    assert.deepEqual(
      review.files.map((file) => file.path),
      ["file.txt"],
    );
    // Too many changed paths for a person to read is still a refusal.
    for (let index = 0; index < 600; index++) {
      unlinkSync(join(f.directory, `old-${index}`));
      writeFileSync(join(f.directory, `new-${index}`), `${index}`);
    }
    f.commit();
    await assert.rejects(f.review(), rejected(413));
  });
});

test("cancellation at any stage and the review deadline never produce a review", async (t) => {
  const f = await fixture(t);
  writeFileSync(join(f.directory, "file.txt"), "after\n");
  f.commit();
  const aborted = new AbortController();
  aborted.abort(new Error("fixture abort"));
  await assert.rejects(f.review("operator", aborted.signal), /fixture abort/);

  // Count the store reads of one complete review, then cancel at the first
  // read after the observation and at the final binding recheck.
  const getWorkspace = f.store.getWorkspace.bind(f.store);
  let calls = 0;
  let abortAt = 0;
  let abort = new AbortController();
  t.mock.method(f.store, "getWorkspace", (id: string) => {
    if (++calls === abortAt) abort.abort(new Error("late fixture abort"));
    return getWorkspace(id);
  });
  await f.review();
  const total = calls;
  assert.ok(total >= 2);
  for (const target of [total - 1, total]) {
    calls = 0;
    abortAt = target;
    abort = new AbortController();
    await assert.rejects(
      f.review("operator", abort.signal),
      /late fixture abort/,
    );
    assert.equal(calls, target);
  }
  abortAt = 0;

  // The nested observation expires first; the review reports its own deadline.
  let reached!: () => void;
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  t.mock.method(f.store.localCommandApprovals, "lookup", async () => {
    reached();
    await held;
    return null;
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const failed = assert.rejects(
    f.review(),
    (error: unknown) =>
      error instanceof DomainError &&
      error.status === 408 &&
      error.message === "Candidate review timed out",
  );
  await ready;
  t.mock.timers.tick(REVIEW_LIMITS.timeoutMs);
  release();
  await failed;
});

test("review rejects forged nested trees even when Git serves them under the expected id", async (t) => {
  const f = await fixture(t, { "scripts/test.sh": "safe\n" });
  writeFileSync(join(f.directory, "scripts", "test.sh"), "changed\n");
  f.commit();
  const base = git(
    f.repo,
    "rev-parse",
    `${f.workspace.local!.baseSha}:scripts`,
  );
  const head = git(f.directory, "rev-parse", "HEAD:scripts");
  const bytes = execFileSync("git", ["cat-file", "tree", head], {
    cwd: f.repo,
  });
  const path = join(f.repo, ".git", "objects", base.slice(0, 2), base.slice(2));
  chmodSync(path, 0o644);
  writeFileSync(
    path,
    deflateSync(Buffer.concat([Buffer.from(`tree ${bytes.length}\0`), bytes])),
  );
  await assert.rejects(f.review(), rejected(409));
});

test("a Git-directory redirect after observation cannot hide changed test code", async (t) => {
  const f = await fixture(t, { "scripts/test.sh": "safe\n" });
  writeFileSync(join(f.directory, "scripts", "test.sh"), "changed\n");
  f.commit();
  const original = f.store.getWorkspace.bind(f.store);
  let calls = 0;
  let redirectAt = 0;
  const target = join(f.root, "alternate");
  mkdirSync(target);
  git(target, "init", "--quiet");
  writeFileSync(
    join(target, ".git", "objects", "info", "alternates"),
    join(f.repo, ".git", "objects") + "\n",
  );
  const base = git(
    f.repo,
    "rev-parse",
    `${f.workspace.local!.baseSha}:scripts`,
  );
  const head = git(f.directory, "rev-parse", "HEAD:scripts");
  const bytes = execFileSync("git", ["cat-file", "tree", base], {
    cwd: f.repo,
  });
  const folder = join(target, ".git", "objects", head.slice(0, 2));
  mkdirSync(folder);
  writeFileSync(
    join(folder, head.slice(2)),
    deflateSync(Buffer.concat([Buffer.from(`tree ${bytes.length}\0`), bytes])),
  );
  t.mock.method(f.store, "getWorkspace", (id: string) => {
    if (++calls === redirectAt)
      writeFileSync(
        join(f.directory, ".git"),
        `gitdir: ${join(target, ".git")}\n`,
      );
    return original(id);
  });
  await f.review();
  redirectAt = calls - 1; // first binding read after the observation
  calls = 0;
  await assert.rejects(f.review(), rejected(409));
});

test("judging changes distinguish recognised paths in both pinned trees from changed test paths", async (t) => {
  const f = await fixture(t, {
    "gone.test.ts": "removed\n",
    "old.spec.mts": "rename\n",
    "tests/unit/helper.cjs": "old\n",
    "source.js": "now a test\n",
  });
  assert.deepEqual((await f.review()).judgingChanges.testPaths, []);
  const at = (name: string) => join(f.directory, name);
  unlinkSync(at("gone.test.ts"));
  renameSync(at("old.spec.mts"), at("renamed.txt"));
  renameSync(at("source.js"), at("new.spec.tsx"));
  writeFileSync(at("tests/unit/helper.cjs"), "new\n");
  writeFileSync(at("not.test.js.txt"), "unrelated\n");
  symlinkSync("missing-target", at("link.test.jsx"));
  f.commit();
  const review = await f.review();
  assert.deepEqual(
    review.judgingChanges.testPaths?.map((i) => {
      const { status, previousPath, path } = review.files[i]!;
      return [status, previousPath, path];
    }),
    [
      ["deleted", null, "gone.test.ts"],
      ["added", null, "link.test.jsx"],
      ["renamed", "source.js", "new.spec.tsx"],
      ["renamed", "old.spec.mts", "renamed.txt"],
      ["modified", null, "tests/unit/helper.cjs"],
    ],
  );
  const withoutTests = await fixture(t);
  assert.equal((await withoutTests.review()).judgingChanges.testPaths, null);
});

test("recognised command configuration and workflow changes retain both paths of a rename", async (t) => {
  const f = await fixture(t, {
    ".github/workflows/ci.yml": "old workflow",
    "site/vitest.config.mts": "old config",
    "tsconfig.json": "{}",
  });
  assert.deepEqual((await f.review()).judgingChanges.commandPaths, []);
  const at = (name: string) => join(f.directory, name);
  renameSync(at(".github/workflows/ci.yml"), at("disabled"));
  renameSync(at("site/vitest.config.mts"), at("site/playwright.config.ts"));
  unlinkSync(at("tsconfig.json"));
  writeFileSync(at(".github/workflows/new.yaml"), "new workflow");
  mkdirSync(at("site/.github/workflows"), { recursive: true });
  writeFileSync(at("site/.github/workflows/other.yml"), "outside root");
  writeFileSync(at("site/argent.json"), "outside root");
  writeFileSync(at("argent.json"), CONFIG + "\n");
  f.commit();
  const review = await f.review();
  assert.deepEqual(
    review.judgingChanges.commandPaths.map((i) => {
      const { path, previousPath, status } = review.files[i]!;
      return [path, previousPath, status];
    }),
    [
      [".github/workflows/new.yaml", null, "added"],
      ["argent.json", null, "modified"],
      ["disabled", ".github/workflows/ci.yml", "renamed"],
      ["site/playwright.config.ts", "site/vitest.config.mts", "renamed"],
      ["tsconfig.json", null, "deleted"],
    ],
  );
});

test("npm script changes distinguish edited definitions, malformed and oversized manifests, and symbolic links", async (t) => {
  const f = await fixture(t, {
    "package.json":
      '{"scripts":{"edit":"old","gone":"remove","same":"keep","__proto__":"a"}}',
    "nested/package.json": "{}",
    "moved/package.json": '{"scripts":{"carried":"true"}}',
    "obsolete/package.json": '{"scripts":{"removed":"true"}}',
  });
  const at = (name: string) => join(f.directory, name);
  writeFileSync(
    at("package.json"),
    '{"scripts":{"new":"added","same":"keep","edit":"new","__proto__":"b"}}',
  );
  writeFileSync(at("nested/package.json"), '{"scripts":null}');
  mkdirSync(at("dest"));
  renameSync(at("moved/package.json"), at("dest/package.json"));
  renameSync(at("obsolete/package.json"), at("old.txt"));
  for (const dir of ["big", "link", "bad", "metadata"]) mkdirSync(at(dir));
  writeFileSync(
    at("big/package.json"),
    JSON.stringify({ description: "a".repeat(65536) }),
  );
  symlinkSync("../package.json", at("link/package.json"));
  writeFileSync(at("bad/package.json"), "{");
  writeFileSync(at("metadata/package.json"), '{"name":"fixture"}');
  f.commit();
  const review = await f.review();
  const result = review.judgingChanges.scripts?.map(({ file, entries }) => [
    review.files[file]!.path,
    entries?.map((e) => [e.name, e.change]) ?? null,
  ]);
  assert.deepEqual(result, [
    ["bad/package.json", null],
    ["big/package.json", null],
    ["dest/package.json", [["carried", "moved"]]],
    ["link/package.json", null],
    ["metadata/package.json", []],
    ["nested/package.json", null],
    ["old.txt", [["removed", "removed"]]],
    [
      "package.json",
      [
        ["__proto__", "modified"],
        ["edit", "modified"],
        ["gone", "removed"],
        ["new", "added"],
      ],
    ],
  ]);
});

test("script definition and report limits preserve a changed-file entry", async (t) => {
  const f = await fixture(t);
  const manifest = (n: number) =>
    JSON.stringify({
      scripts: Object.fromEntries(
        Array.from({ length: n }, (_, i) => [`script-${i}`, "true"]),
      ),
    });
  for (const [dir, size] of [
    ["a", 129],
    ["b", 128],
    ["c", 128],
    ["d", 1],
  ] as const) {
    mkdirSync(join(f.directory, dir));
    writeFileSync(join(f.directory, dir, "package.json"), manifest(size));
  }
  f.commit();
  const review = await f.review();
  assert.deepEqual(
    review.judgingChanges.scripts?.map((row) => row.entries?.length ?? null),
    [null, 128, 128, null],
  );
});

test("new textual skip markers preserve duplicate counts and distinct titles across both committed sides", async (t) => {
  const f = await fixture(t, {
    "unit.test.ts": 'test.skip("previous", fn);\nit.skip("keep", fn);\n',
    "old.spec.js": 'describe.skip("moved", fn);',
  });
  const at = (name: string) => join(f.directory, name);
  writeFileSync(
    at("unit.test.ts"),
    [
      'test("previous", fn);',
      '  it.skip("keep", fn);',
      'it.skip("keep", fn);',
      'test.skip("different", fn);',
      "  test.describe.skip('suite', fn);",
      '// xit("comment", fn);',
    ].join("\r\n"),
  );
  renameSync(at("old.spec.js"), at("new.spec.cjs"));
  writeFileSync(at("dynamic.test.js"), "test.skip(title, fn);");
  writeFileSync(at("binary.test.js"), Buffer.from([0, 1]));
  f.commit();
  const review = await f.review();
  assert.deepEqual(
    review.judgingChanges.skips?.map(({ file, entries }) => [
      review.files[file]!.path,
      entries,
    ]),
    [
      ["binary.test.js", null],
      ["dynamic.test.js", null],
      ["new.spec.cjs", []],
      [
        "unit.test.ts",
        [
          { marker: "it.skip", line: 3 },
          { marker: "test.skip", line: 4 },
          { marker: "test.describe.skip", line: 5 },
        ],
      ],
    ],
  );
});

test("npm lockfile changes compare versions by complete installation location and preserve unreadable files", async (t) => {
  const lock = (packages: Record<string, unknown>, lockfileVersion = 3) =>
    JSON.stringify({ lockfileVersion, packages: { "": {}, ...packages } });
  const f = await fixture(t, {
    "package-lock.json": lock(
      {
        "node_modules/@scope/a": { version: "1" },
        "node_modules/dep/node_modules/@scope/a": { version: "7" },
        "node_modules/gone": { version: "old" },
      },
      2,
    ),
    "bad/package-lock.json": "{}",
    "moved/package-lock.json": lock({
      "node_modules/fixture": { version: "1" },
    }),
  });
  const at = (name: string) => join(f.directory, name);
  writeFileSync(
    at("package-lock.json"),
    lock({
      "node_modules/@scope/a": { version: "2" },
      "node_modules/dep/node_modules/@scope/a": { version: "7" },
      "node_modules/added": { version: "3" },
      "node_modules/workspace": { link: true, resolved: "modules/workspace" },
      "modules/workspace": { version: "4" },
    }),
  );
  mkdirSync(at("new"));
  renameSync(at("moved/package-lock.json"), at("new/package-lock.json"));
  writeFileSync(at("bad/package-lock.json"), "{");
  for (const name of ["legacy", "oversize", "link", "malformed"])
    mkdirSync(at(name));
  writeFileSync(at("legacy/package-lock.json"), lock({}, 1));
  writeFileSync(
    at("oversize/package-lock.json"),
    lock({ comment: { padding: "x".repeat(65536) } }),
  );
  symlinkSync("../package-lock.json", at("link/package-lock.json"));
  writeFileSync(
    at("malformed/package-lock.json"),
    lock({ "node_modules/pkg": { version: 42 } }),
  );
  f.commit();
  const review = await f.review();
  assert.deepEqual(
    review.judgingChanges.packages?.map(({ file, entries }) => [
      review.files[file]!.path,
      entries?.map((e) => [e.location, e.change, e.before, e.after]) ?? null,
    ]),
    [
      ["bad/package-lock.json", null],
      ["legacy/package-lock.json", null],
      ["link/package-lock.json", null],
      ["malformed/package-lock.json", null],
      ["new/package-lock.json", [["node_modules/fixture", "moved", "1", "1"]]],
      ["oversize/package-lock.json", null],
      [
        "package-lock.json",
        [
          ["node_modules/@scope/a", "modified", "1", "2"],
          ["node_modules/added", "added", null, "3"],
          ["node_modules/gone", "removed", "old", null],
          ["node_modules/workspace", "added", null, "4"],
        ],
      ],
    ],
  );
});

test("a local link cannot mask changed or missing target version metadata", async (t) => {
  const lock = (target: unknown, link: unknown = true) =>
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": {},
        "node_modules/local": {
          link,
          resolved: "packages/local",
          version: "1",
        },
        ...(target ? { "packages/local": target } : {}),
      },
    });
  const f = await fixture(t, { "package-lock.json": lock({ version: "1" }) });
  for (const [target, link] of [
    [{ version: "2" }, true],
    [null, true],
    [{ version: "1", link: "true" }, true],
    [{ version: "1" }, "true"],
  ] as const) {
    writeFileSync(join(f.directory, "package-lock.json"), lock(target, link));
    f.commit();
    assert.deepEqual((await f.review()).judgingChanges.packages, [
      { file: 0, entries: null },
    ]);
  }
});

test("new install scripts are visible at unchanged versions and validated on linked targets", async (t) => {
  const lock = (packages: Record<string, unknown>) =>
    JSON.stringify({ lockfileVersion: 3, packages: { "": {}, ...packages } });
  const common = {
    "node_modules/keep": { version: "1", hasInstallScript: true },
    "node_modules/link": { link: true, resolved: "local" },
  };
  const f = await fixture(t, {
    "package-lock.json": lock({
      ...common,
      local: { version: "1" },
      "node_modules/edit": { version: "2", hasInstallScript: false },
      "node_modules/remove": { version: "1", hasInstallScript: true },
    }),
  });
  const after = {
    ...common,
    local: { version: "1", hasInstallScript: true },
    "node_modules/add": { version: "0", hasInstallScript: true },
    "node_modules/edit": { version: "2", hasInstallScript: true },
    "node_modules/remove": { version: "1" },
  };
  const path = join(f.directory, "package-lock.json");
  writeFileSync(path, lock(after));
  f.commit();
  assert.deepEqual(
    (await f.review()).judgingChanges.packages?.[0]?.entries?.map((p) => [
      p.location,
      p.before,
      p.after,
      p.newInstallScript,
    ]),
    [
      ["node_modules/add", null, "0", true],
      ["node_modules/edit", "2", "2", true],
      ["node_modules/link", "1", "1", true],
    ],
  );
  for (const override of [
    { local: { version: "1", hasInstallScript: "false" } },
    {
      "node_modules/link": {
        ...common["node_modules/link"],
        hasInstallScript: false,
      },
    },
    { "node_modules/other": { version: "1", hasInstallScript: 1 } },
  ]) {
    writeFileSync(path, lock({ ...after, ...override }));
    f.commit();
    assert.equal(
      (await f.review()).judgingChanges.packages?.[0]?.entries,
      null,
    );
  }
});

test("npm source changes are reported independently of versions without returning raw references", async (t) => {
  const lock = (sources: Record<string, unknown>) =>
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": {},
        ...Object.fromEntries(
          Object.entries(sources).map(([name, resolved]) => [
            "node_modules/" + name,
            { version: "1", resolved },
          ]),
        ),
      },
    });
  const registry = "https://registry.npmjs.org/sample/-/sample-1.tgz";
  const windowsPaths = {
    "win-current": ".\\private-source.tgz",
    "win-drive": "C:\\private-source.tgz",
    "win-parent": "..\\private-source.tgz",
    "win-root": "\\private-source.tgz",
    "win-unc": "\\\\example.invalid\\share\\private-source.tgz",
  };
  const f = await fixture(t, {
    "package-lock.json": lock({
      url: registry,
      git: registry,
      hosted: registry,
      path: registry,
      same: "https://example.invalid/old.tgz",
      untouched: registry,
    }),
  });
  const path = join(f.directory, "package-lock.json");
  writeFileSync(
    path,
    lock({
      url: "https://example.invalid/private-source.tgz",
      git: "git+ssh://example.invalid/private-source.git#ref",
      hosted: "fixture/private-source#feature/one",
      plain: "fixture/private-source",
      range: "fixture/private-source#semver:>=1 <2",
      scoped: "@fixture/private-source",
      nested: "fixture/nested/private-source",
      path: "file:../private-source",
      same: "https://example.invalid/new.tgz",
      untouched: registry,
      added: "./local.tgz",
      ...windowsPaths,
    }),
  );
  f.commit();
  const report = (await f.review()).judgingChanges;
  assert.deepEqual(
    report.packages?.[0]?.entries?.map((e) => [
      e.location,
      e.change,
      e.resolution,
    ]),
    [
      ["node_modules/added", "added", { before: null, after: "local path" }],
      [
        "node_modules/git",
        "modified",
        { before: "npm registry URL", after: "Git reference" },
      ],
      [
        "node_modules/hosted",
        "modified",
        { before: "npm registry URL", after: "Git reference" },
      ],
      [
        "node_modules/nested",
        "added",
        { before: null, after: "other reference" },
      ],
      [
        "node_modules/path",
        "modified",
        { before: "npm registry URL", after: "local path" },
      ],
      ["node_modules/plain", "added", { before: null, after: "Git reference" }],
      ["node_modules/range", "added", { before: null, after: "Git reference" }],
      [
        "node_modules/same",
        "modified",
        { before: "HTTP(S) URL", after: "HTTP(S) URL" },
      ],
      [
        "node_modules/scoped",
        "added",
        { before: null, after: "other reference" },
      ],
      [
        "node_modules/url",
        "modified",
        { before: "npm registry URL", after: "HTTP(S) URL" },
      ],
      ...Object.keys(windowsPaths)
        .sort()
        .map((name) => [
          "node_modules/" + name,
          "added",
          { before: null, after: "local path" },
        ]),
    ],
  );
  assert.doesNotMatch(
    JSON.stringify(report),
    /private-source|example\.invalid/,
  );
  for (const resolved of [
    42,
    "https://",
    "x".repeat(4097),
    "https://example.invalid/\nfixture",
    "https://example.invalid/\u0085fixture",
  ]) {
    writeFileSync(path, lock({ url: resolved }));
    f.commit();
    assert.equal(
      (await f.review()).judgingChanges.packages?.[0]?.entries,
      null,
    );
  }
});
