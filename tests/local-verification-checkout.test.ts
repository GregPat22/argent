import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { DomainError, type Workspace } from "../src/domain.js";
import {
  CHECKOUT_LIMITS,
  createVerificationCheckout,
  removeVerificationCheckout,
} from "../src/local-verification-checkout.js";
import { createLocalWorkspace } from "../src/local-worktree.js";
import { Store } from "../src/store.js";

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
async function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "argent-checkout-")));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "nested", "deeper"), { recursive: true });
  git(repo, "init", "--quiet", "--initial-branch=main");
  writeFileSync(join(repo, ".gitignore"), "ignored/\n");
  writeFileSync(join(repo, "file.txt"), "before\n");
  writeFileSync(join(repo, "nested", "deeper", "tool.sh"), "#!/bin/sh\n");
  chmodSync(join(repo, "nested", "deeper", "tool.sh"), 0o755);
  writeFileSync(join(repo, "binary.dat"), Buffer.from([0, 1, 2, 255]));
  symlinkSync("file.txt", join(repo, "link"));
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "initial");
  const database = join(root, "store.sqlite");
  const store = new Store(database);
  const worktreeRoot = join(root, "worktrees");
  const verificationRoot = join(root, "verification");
  const workspace = await createLocalWorkspace(store, worktreeRoot, repo);
  const directory = workspace.local!.worktreePath;
  // Ignored and uncommitted content in the agent's worktree must not travel.
  mkdirSync(join(directory, "ignored"));
  writeFileSync(join(directory, "ignored", "poison.js"), "poison\n");
  writeFileSync(join(directory, "file.txt"), "after\n");
  git(directory, "add", ".");
  git(directory, "commit", "--quiet", "-m", "candidate");
  const db = new DatabaseSync(database);
  t.after(() => {
    db.close();
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const roots = { worktreeRoot, verificationRoot };
  const commit = (cwd = directory) => ({
    headSha: git(cwd, "rev-parse", "HEAD"),
    treeId: git(cwd, "rev-parse", "HEAD^{tree}"),
  });
  return {
    root,
    repo,
    store,
    db,
    roots,
    workspace,
    directory,
    commit,
    create: (
      request: Partial<{
        id: string;
        workspaceId: string;
        headSha: string;
        treeId: string;
      }> = {},
      signal?: AbortSignal,
    ) =>
      createVerificationCheckout(
        store,
        roots,
        {
          id: randomUUID(),
          workspaceId: workspace.id,
          ...commit(),
          ...request,
        },
        signal,
      ),
    worktrees: () =>
      git(repo, "worktree", "list", "--porcelain")
        .split("\n")
        .filter((line) => line.startsWith("worktree ")).length,
    checkouts: () =>
      existsSync(verificationRoot) ? readdirSync(verificationRoot) : [],
  };
}

test("a checkout holds exactly one commit in a detached worktree and leaves the workspace and store alone", async (t) => {
  const f = await fixture(t);
  const marker = join(f.root, "executed");
  const command = `touch '${marker}'`;
  const keys = [
    "filter.hostile.clean",
    "filter.hostile.smudge",
    "filter.hostile.process",
    "core.fsmonitor",
  ];
  const attributes = join(f.repo, ".git", "info", "attributes");
  const hooks = ["post-checkout", "post-index-change"].map((hook) =>
    join(f.repo, ".git", "hooks", hook),
  );
  // The fixture's own Git calls are not trusted Git: hostile settings are
  // present only while Argent works, and absent while the fixture looks.
  const hostile = (present: boolean) => {
    for (const key of keys)
      if (present) git(f.repo, "config", key, command);
      else git(f.repo, "config", "--unset", key);
    if (present) {
      mkdirSync(join(f.repo, ".git", "info"), { recursive: true });
      writeFileSync(attributes, "* filter=hostile\n");
      for (const hook of hooks)
        writeFileSync(hook, `#!/bin/sh\n${command}\n`, { mode: 0o755 });
    } else for (const path of [attributes, ...hooks]) rmSync(path);
  };
  const counts = () =>
    ["workspaces", "local_worktrees", "runs", "events", "command_jobs"].map(
      (table) => f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n,
    );
  const before = counts();
  const branches = git(f.repo, "for-each-ref", "refs/heads");
  const status = git(f.directory, "status", "--porcelain", "--ignored");
  const id = randomUUID();
  const { headSha, treeId } = f.commit();

  hostile(true);
  const checkout = await f.create({ id });
  assert.equal(existsSync(marker), false);
  hostile(false);
  assert.equal(checkout.kind, "verification-checkout");
  assert.equal(
    checkout.directory,
    join(realpathSync(f.roots.verificationRoot), id),
  );
  assert.deepEqual(
    [checkout.id, checkout.workspaceId, checkout.headSha, checkout.treeId],
    [id, f.workspace.id, headSha, treeId],
  );
  assert.equal(checkout.files, 5);
  assert.equal(checkout.contents, "git-visible-bytes-match-commit");
  assert.equal(checkout.otherContent, "none-at-creation");
  assert.equal(checkout.head, "detached");
  assert.equal(checkout.isolation, "none");
  assert.equal(checkout.consistency, "point-in-time");
  assert.equal(checkout.tested, false);
  assert.ok(Object.isFrozen(checkout));

  const inside = checkout.directory;
  assert.equal(git(inside, "rev-parse", "HEAD"), headSha);
  assert.equal(git(inside, "rev-parse", "--abbrev-ref", "HEAD"), "HEAD");
  assert.equal(git(inside, "status", "--porcelain", "--ignored"), "");
  assert.equal(readFileSync(join(inside, "file.txt"), "utf8"), "after\n");
  assert.deepEqual(
    readFileSync(join(inside, "binary.dat")),
    Buffer.from([0, 1, 2, 255]),
  );
  assert.equal(readlinkSync(join(inside, "link")), "file.txt");
  assert.ok(
    lstatSync(join(inside, "nested", "deeper", "tool.sh")).mode & 0o100,
  );
  assert.equal(existsSync(join(inside, "ignored")), false);
  assert.equal(lstatSync(inside).mode & 0o777, 0o700);
  assert.deepEqual(f.checkouts(), [id]);
  assert.equal(f.worktrees(), 3);

  assert.deepEqual(counts(), before);
  assert.equal(git(f.repo, "for-each-ref", "refs/heads"), branches);
  assert.equal(git(f.directory, "status", "--porcelain", "--ignored"), status);

  hostile(true);
  await removeVerificationCheckout(checkout);
  assert.equal(existsSync(marker), false);
  hostile(false);
  assert.equal(existsSync(inside), false);
  assert.deepEqual(f.checkouts(), []);
  assert.equal(f.worktrees(), 2);
  assert.equal(git(f.repo, "for-each-ref", "refs/heads"), branches);
  assert.equal(git(f.directory, "status", "--porcelain", "--ignored"), status);
  assert.equal(
    readFileSync(join(f.directory, "ignored", "poison.js"), "utf8"),
    "poison\n",
  );
  await assert.rejects(removeVerificationCheckout(checkout), rejected(409));
});

test("removal discards whatever a command left behind without following links out of the checkout", async (t) => {
  const f = await fixture(t);
  const checkout = await f.create();
  const inside = checkout.directory;
  const outside = join(f.root, "outside.txt");
  writeFileSync(outside, "keep me\n");
  mkdirSync(join(f.root, "outside-directory"));
  writeFileSync(join(f.root, "outside-directory", "kept"), "keep me\n");
  writeFileSync(join(inside, "file.txt"), "changed by a command\n");
  writeFileSync(join(inside, "untracked.log"), "output\n");
  mkdirSync(join(inside, "ignored", "node_modules", "package"), {
    recursive: true,
  });
  writeFileSync(
    join(inside, "ignored", "node_modules", "package", "index.js"),
    "",
  );
  symlinkSync(outside, join(inside, "escape-file"));
  symlinkSync(join(f.root, "outside-directory"), join(inside, "escape-dir"));
  git(inside, "add", "untracked.log");
  await removeVerificationCheckout(checkout);
  assert.equal(existsSync(inside), false);
  assert.equal(f.worktrees(), 2);
  assert.equal(readFileSync(outside, "utf8"), "keep me\n");
  assert.equal(
    readFileSync(join(f.root, "outside-directory", "kept"), "utf8"),
    "keep me\n",
  );
  // A later checkout of the same commit is unaffected by the discarded one.
  const again = await f.create();
  assert.equal(
    readFileSync(join(again.directory, "file.txt"), "utf8"),
    "after\n",
  );
  await removeVerificationCheckout(again);
});

test("only a commit on the workspace's own branch, with the named tree, can be checked out", async (t) => {
  const f = await fixture(t);
  const { headSha, treeId } = f.commit();
  const base = f.workspace.local!.baseSha;
  // The base is an ancestor of the branch, so it is allowed with its own tree.
  const atBase = await f.create({
    headSha: base,
    treeId: git(f.repo, "rev-parse", `${base}^{tree}`),
  });
  assert.equal(
    readFileSync(join(atBase.directory, "file.txt"), "utf8"),
    "before\n",
  );
  await removeVerificationCheckout(atBase);

  writeFileSync(join(f.repo, "elsewhere.txt"), "main moved on\n");
  git(f.repo, "add", ".");
  git(f.repo, "commit", "--quiet", "-m", "unrelated");
  const elsewhere = f.commit(f.repo);
  git(f.directory, "commit", "--quiet", "--amend", "-m", "rewritten");
  const simulation = f.store.createWorkspace(
    "https://github.com/example/repository",
  );
  const refusals: [Parameters<typeof f.create>[0], number][] = [
    [elsewhere, 409],
    // The commit that was amended away is no longer on the branch.
    [{ headSha, treeId }, 409],
    [{ treeId: git(f.repo, "rev-parse", `${base}^{tree}`) }, 409],
    [{ headSha: "a".repeat(40), treeId }, 409],
    [{ workspaceId: simulation.id }, 409],
    [{ workspaceId: randomUUID() }, 404],
    [{ workspaceId: "../escape" }, 400],
    [{ id: "not-a-uuid" }, 400],
    [{ id: "../../escape" }, 400],
    [{ headSha: "HEAD" }, 400],
    [{ headSha: "--upload-pack=x" }, 400],
    [{ treeId: "main" }, 400],
  ];
  for (const [request, status] of refusals)
    await assert.rejects(f.create(request), rejected(status));
  assert.deepEqual(f.checkouts(), []);
  assert.equal(f.worktrees(), 2);
  const current = await f.create();
  assert.equal(current.headSha, git(f.directory, "rev-parse", "HEAD"));
  await removeVerificationCheckout(current);
});

test("the verification folder is separate from the repository and the workspaces, and a taken name is never reused", async (t) => {
  const f = await fixture(t);
  const request = {
    id: randomUUID(),
    workspaceId: f.workspace.id,
    ...f.commit(),
  };
  for (const verificationRoot of [
    join(f.repo, "verification"),
    f.repo,
    f.root,
    f.roots.worktreeRoot,
    join(f.roots.worktreeRoot, "verification"),
  ])
    await assert.rejects(
      createVerificationCheckout(
        f.store,
        { ...f.roots, verificationRoot },
        request,
      ),
      rejected(409),
    );
  await assert.rejects(
    createVerificationCheckout(
      f.store,
      { ...f.roots, worktreeRoot: join(f.root, "other") },
      request,
    ),
    rejected(409),
  );
  assert.equal(existsSync(join(f.repo, "verification")), false);
  assert.equal(f.worktrees(), 2);

  const first = await f.create(request);
  writeFileSync(join(first.directory, "evidence-of-first"), "");
  await assert.rejects(f.create(request), rejected(409));
  assert.equal(existsSync(join(first.directory, "evidence-of-first")), true);
  assert.equal(f.worktrees(), 3);
  // A folder that already exists under the name is not Argent's to use.
  const taken = randomUUID();
  mkdirSync(join(f.roots.verificationRoot, taken));
  writeFileSync(join(f.roots.verificationRoot, taken, "theirs"), "");
  await assert.rejects(f.create({ id: taken }), rejected(409));
  assert.equal(
    existsSync(join(f.roots.verificationRoot, taken, "theirs")),
    true,
  );
  await removeVerificationCheckout(first);
  assert.deepEqual(f.checkouts(), [taken]);
});

test("a checkout whose bytes differ from the commit is refused and removed", async (t) => {
  await t.test(
    "line-ending conversion from the commit's own attributes",
    async (t) => {
      const f = await fixture(t);
      writeFileSync(
        join(f.directory, ".gitattributes"),
        "*.txt text eol=crlf\n",
      );
      git(f.directory, "add", ".");
      git(f.directory, "commit", "--quiet", "-m", "attributes");
      await assert.rejects(f.create(), rejected(409));
      assert.deepEqual(f.checkouts(), []);
      assert.equal(f.worktrees(), 2);
    },
  );
  await t.test("a submodule entry", async (t) => {
    const f = await fixture(t);
    git(
      f.directory,
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${git(f.directory, "rev-parse", "HEAD")},submodule`,
    );
    git(f.directory, "commit", "--quiet", "-m", "gitlink");
    await assert.rejects(f.create(), rejected(409));
    assert.deepEqual(f.checkouts(), []);
    assert.equal(f.worktrees(), 2);
  });
  await t.test("a workspace record that changes during creation", async (t) => {
    const f = await fixture(t);
    const getWorkspace = f.store.getWorkspace.bind(f.store);
    let calls = 0;
    t.mock.method(f.store, "getWorkspace", (id: string): Workspace => {
      const workspace = getWorkspace(id);
      return ++calls === 2
        ? {
            ...workspace,
            local: { ...workspace.local!, baseSha: "b".repeat(40) },
          }
        : workspace;
    });
    await assert.rejects(f.create(), rejected(409));
    assert.equal(calls, 2);
    assert.deepEqual(f.checkouts(), []);
    assert.equal(f.worktrees(), 2);
  });
});

test("a description of a checkout, or a folder that replaced it, removes nothing", async (t) => {
  const f = await fixture(t);
  const checkout = await f.create();
  await assert.rejects(
    removeVerificationCheckout(Object.freeze({ ...checkout })),
    rejected(409),
  );
  assert.equal(existsSync(join(checkout.directory, "file.txt")), true);

  const moved = join(f.root, "moved-away");
  renameSync(checkout.directory, moved);
  mkdirSync(checkout.directory);
  writeFileSync(join(checkout.directory, "not-argents"), "keep me\n");
  await assert.rejects(removeVerificationCheckout(checkout), rejected(409));
  assert.equal(
    readFileSync(join(checkout.directory, "not-argents"), "utf8"),
    "keep me\n",
  );
  assert.equal(existsSync(join(moved, "file.txt")), true);
  rmSync(checkout.directory, { recursive: true });
  // Even an empty folder under the same name is somebody else's.
  mkdirSync(checkout.directory);
  await assert.rejects(removeVerificationCheckout(checkout), rejected(409));
  assert.equal(existsSync(checkout.directory), true);
  rmSync(checkout.directory, { recursive: true });
  symlinkSync(moved, checkout.directory);
  await assert.rejects(removeVerificationCheckout(checkout), rejected(409));
  assert.equal(existsSync(join(moved, "file.txt")), true);
  rmSync(checkout.directory);
  renameSync(moved, checkout.directory);
  await removeVerificationCheckout(checkout);
  assert.equal(existsSync(checkout.directory), false);
  assert.equal(f.worktrees(), 2);
});

test("cancellation and the deadline leave no checkout behind", async (t) => {
  const f = await fixture(t);
  const aborted = new AbortController();
  aborted.abort(new Error("fixture abort"));
  await assert.rejects(f.create({}, aborted.signal), /fixture abort/);
  assert.deepEqual(f.checkouts(), []);

  // Cancel at the final recheck, after the worktree exists and was verified.
  const getWorkspace = f.store.getWorkspace.bind(f.store);
  const late = new AbortController();
  let calls = 0;
  const mock = t.mock.method(f.store, "getWorkspace", (id: string) => {
    if (++calls === 2) late.abort(new Error("late fixture abort"));
    return getWorkspace(id);
  });
  await assert.rejects(f.create({}, late.signal), /late fixture abort/);
  assert.equal(calls, 2);
  assert.deepEqual(f.checkouts(), []);
  assert.equal(f.worktrees(), 2);
  mock.mock.restore();

  // Expire the deadline at the first store read, before any Git process.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(f.store, "getWorkspace", (id: string) => {
    t.mock.timers.tick(CHECKOUT_LIMITS.timeoutMs);
    return getWorkspace(id);
  });
  await assert.rejects(f.create(), rejected(408));
  assert.deepEqual(f.checkouts(), []);
  assert.equal(f.worktrees(), 2);
});
