import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  linkSync,
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
import { DomainError } from "../src/domain.js";
import { readLocalCommandConfig } from "../src/local-command-config.js";
import { createLocalWorkspace } from "../src/local-worktree.js";
import { Store } from "../src/store.js";
import {
  CHANGES_LIMITS,
  CLEAN_COMMIT_LIMITS,
  inspectLocalCommandCandidate,
  inspectWorkspaceChanges,
  readCleanCommit,
  type CleanCommitLimits,
} from "../src/workspace-changes.js";

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
  const root = realpathSync(mkdtempSync(join(tmpdir(), "argent-candidate-")));
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
  const receipt = await store.localCommandApprovals.approve(
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
    receipt,
    inspect: (operator = "operator", signal?: AbortSignal) =>
      inspectLocalCommandCandidate(
        store,
        worktrees,
        workspace.id,
        operator,
        signal,
      ),
    commit: () => {
      git(directory, "add", ".");
      git(directory, "commit", "--quiet", "-m", "candidate");
    },
  };
}

test("candidate binds exact commit, tree, base and operator approval without mutating state or index", async (t) => {
  const f = await fixture(t);
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
  const observed = await f.inspect();
  assert.equal(observed.kind, "local-command-candidate-observation");
  assert.equal(observed.headSha, git(f.directory, "rev-parse", "HEAD"));
  assert.equal(observed.treeId, git(f.directory, "rev-parse", "HEAD^{tree}"));
  assert.equal(observed.baseSha, f.workspace.local!.baseSha);
  assert.equal(observed.approvalId, f.receipt.approval.id);
  assert.equal(
    observed.configurationIdentity,
    f.config.approvalCandidate.identity,
  );
  assert.equal(observed.operatorId, "operator");
  assert.equal(observed.cleanliness, "index-and-git-visible-bytes-match");
  assert.equal(observed.review, "not-collected");
  assert.equal(observed.execution, "forbidden");
  assert.equal(observed.ignoredContent, "excluded");
  assert.equal(observed.consistency, "point-in-time");
  assert.equal(observed.tested, false);
  assert.equal(observed.files, 3);
  assert.ok(Object.isFrozen(observed));
  assert.deepEqual(await f.inspect(), observed);
  const reopened = new Store(f.database);
  try {
    assert.deepEqual(
      await inspectLocalCommandCandidate(
        reopened,
        f.worktrees,
        f.workspace.id,
        "operator",
      ),
      observed,
    );
  } finally {
    reopened.close();
  }
  assert.deepEqual(counts(), before);
  assert.deepEqual(readFileSync(indexPath), index);
  assert.equal(f.store.claim(1000), null);
  assert.equal(existsSync(join(f.directory, "executed")), false);
});

test("commit and actor changes alter observations while configuration approval remains explicit", async (t) => {
  const f = await fixture(t);
  const first = await f.inspect();
  writeFileSync(join(f.directory, "file.txt"), "committed\n");
  f.commit();
  const next = await f.inspect();
  assert.notEqual(next.identity, first.identity);
  assert.notEqual(next.headSha, first.headSha);
  assert.equal(next.approvalId, first.approvalId);
  assert.equal(next.baseSha, first.baseSha);
  await assert.rejects(f.inspect("another"), rejected(409));
  await f.store.localCommandApprovals.approve(
    f.worktrees,
    f.workspace.id,
    "another",
    f.config.approvalCandidate.identity,
    "another",
  );
  const another = await f.inspect("another");
  assert.notEqual(another.identity, next.identity);
  assert.notEqual(another.approvalId, next.approvalId);
  assert.equal(another.headSha, next.headSha);
  const sibling = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const other = await inspectLocalCommandCandidate(
    f.store,
    f.worktrees,
    sibling.id,
    "operator",
  );
  assert.equal(other.approvalId, first.approvalId);
  assert.notEqual(other.identity, first.identity);
});

test("staged, index-only, unstaged, deleted and untracked bytes cannot produce a clean candidate", async (t) => {
  const f = await fixture(t);
  const path = join(f.directory, "file.txt");
  writeFileSync(path, "changed\n");
  await assert.rejects(f.inspect(), rejected(409));
  git(f.directory, "add", "file.txt");
  await assert.rejects(f.inspect(), rejected(409));
  writeFileSync(path, "before\n");
  await assert.rejects(f.inspect(), rejected(409));
  git(f.directory, "reset", "--quiet", "HEAD", "--", "file.txt");
  unlinkSync(path);
  await assert.rejects(f.inspect(), rejected(409));
  writeFileSync(path, "before\n");
  writeFileSync(join(f.directory, "new.txt"), "untracked\n");
  await assert.rejects(f.inspect(), rejected(409));
  unlinkSync(join(f.directory, "new.txt"));
  await f.inspect();
});

test("a newer base with changed configuration needs its own operator approval", async (t) => {
  const f = await fixture(t);
  const original = await f.inspect();
  writeFileSync(join(f.repo, "argent.json"), CONFIG + " ");
  git(f.repo, "add", "argent.json");
  git(f.repo, "commit", "--quiet", "-m", "new configuration");
  const next = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  await assert.rejects(
    inspectLocalCommandCandidate(f.store, f.worktrees, next.id, "operator"),
    rejected(409),
  );
  const candidate = (await readLocalCommandConfig(
    f.store,
    f.worktrees,
    next.id,
  ))!;
  await f.store.localCommandApprovals.approve(
    f.worktrees,
    next.id,
    "operator",
    candidate.approvalCandidate.identity,
    "new-configuration",
  );
  const observation = await inspectLocalCommandCandidate(
    f.store,
    f.worktrees,
    next.id,
    "operator",
  );
  assert.notEqual(
    observation.configurationIdentity,
    original.configurationIdentity,
  );
  assert.notEqual(observation.approvalId, original.approvalId);
  assert.notEqual(observation.baseSha, original.baseSha);
});

test("assume-unchanged and skip-worktree flags do not hide byte or mode changes", async (t) => {
  const f = await fixture(t);
  const path = join(f.directory, "file.txt");
  for (const flag of ["assume-unchanged", "skip-worktree"]) {
    git(f.directory, "update-index", `--${flag}`, "file.txt");
    writeFileSync(path, "hidden\n");
    assert.equal(git(f.directory, "status", "--porcelain"), "");
    await assert.rejects(f.inspect(), rejected(409));
    writeFileSync(path, "before\n");
    git(f.directory, "update-index", `--no-${flag}`, "file.txt");
  }
  chmodSync(path, 0o755);
  await assert.rejects(f.inspect(), rejected(409));
  chmodSync(path, 0o644);
  await f.inspect();
});

test("binary bytes and symlink targets have identity without becoming human-reviewed; ignored poison is excluded", async (t) => {
  const f = await fixture(t, {
    "binary.dat": Buffer.from([0, 1, 2]),
    ".gitignore": "ignored/\n",
  });
  const secret = join(f.root, "outside");
  writeFileSync(secret, "outside content\n");
  symlinkSync(secret, join(f.directory, "link"));
  f.commit();
  const first = await f.inspect();
  mkdirSync(join(f.directory, "ignored"));
  writeFileSync(
    join(f.directory, "ignored", "marker.js"),
    'throw new Error("must not run");\n',
  );
  assert.deepEqual(await f.inspect(), first);
  assert.equal(first.review, "not-collected");
  assert.equal(first.ignoredContent, "excluded");
  writeFileSync(join(f.directory, "binary.dat"), Buffer.from([0, 1, 3]));
  await assert.rejects(f.inspect(), rejected(409));
  writeFileSync(join(f.directory, "binary.dat"), Buffer.from([0, 1, 2]));
  unlinkSync(join(f.directory, "link"));
  symlinkSync("different", join(f.directory, "link"));
  await assert.rejects(f.inspect(), rejected(409));
  assert.equal(readFileSync(secret, "utf8"), "outside content\n");
});

test("Git executable mode follows owner execute for both candidates and live changes", async (t) => {
  const f = await fixture(t);
  const path = join(f.directory, "file.txt");
  chmodSync(path, 0o654);
  assert.equal(git(f.directory, "status", "--porcelain"), "");
  await f.inspect();
  assert.deepEqual(
    (await inspectWorkspaceChanges(f.store, f.worktrees, f.workspace.id)).files,
    [],
  );
  chmodSync(path, 0o755);
  f.commit();
  await f.inspect();
  const changed = await inspectWorkspaceChanges(
    f.store,
    f.worktrees,
    f.workspace.id,
  );
  assert.equal(changed.files[0]!.oldMode, "100644");
  assert.equal(changed.files[0]!.newMode, "100755");
  chmodSync(path, 0o654);
  assert.match(git(f.directory, "diff", "--raw"), /:100755 100644/);
  await assert.rejects(f.inspect(), rejected(409));
  // The live panel compares against the original non-executable base.
  assert.deepEqual(
    (await inspectWorkspaceChanges(f.store, f.worktrees, f.workspace.id)).files,
    [],
  );
});

test("an early-read file changed after traversal is caught by the final per-file recheck", async (t) => {
  const f = await fixture(t, { "z-later.txt": "later\n" });
  const lookup = f.store.localCommandApprovals.lookup.bind(
    f.store.localCommandApprovals,
  );
  let calls = 0;
  t.mock.method(
    f.store.localCommandApprovals,
    "lookup",
    async (...args: Parameters<typeof lookup>) => {
      if (++calls === 2)
        writeFileSync(join(f.directory, "file.txt"), "after!\n");
      return lookup(...args);
    },
  );
  await assert.rejects(f.inspect(), rejected(409));
  assert.equal(calls, 2);
});

for (const change of ["head", "index", "binding", "directory"] as const) {
  test(`candidate rejects a changed ${change} during inspection`, async (t) => {
    const f = await fixture(t);
    const lookup = f.store.localCommandApprovals.lookup.bind(
      f.store.localCommandApprovals,
    );
    let calls = 0;
    t.mock.method(
      f.store.localCommandApprovals,
      "lookup",
      async (...args: Parameters<typeof lookup>) => {
        const result = await lookup(...args);
        if (++calls === 2) {
          if (change === "head")
            git(
              f.directory,
              "commit",
              "--quiet",
              "--allow-empty",
              "-m",
              "changed",
            );
          else if (change === "index")
            git(f.directory, "update-index", "--chmod=+x", "file.txt");
          else if (change === "binding")
            f.db
              .prepare(
                "UPDATE local_worktrees SET base_sha = ? WHERE workspace_id = ?",
              )
              .run("b".repeat(40), f.workspace.id);
          else renameSync(f.directory, join(f.root, "moved"));
        }
        return result;
      },
    );
    await assert.rejects(f.inspect(), rejected(409));
  });
}

test("unsafe parent links, hardlinks and special files are refused without following them", async (t) => {
  const f = await fixture(t, { "nested/file.txt": "nested\n" });
  const directory = join(f.directory, "nested");
  renameSync(directory, join(f.root, "nested"));
  symlinkSync(join(f.root, "nested"), directory);
  await assert.rejects(f.inspect(), rejected(409));
  unlinkSync(directory);
  renameSync(join(f.root, "nested"), directory);
  linkSync(join(f.directory, "file.txt"), join(f.root, "hardlink"));
  await assert.rejects(f.inspect(), rejected(409));
  unlinkSync(join(f.root, "hardlink"));
  unlinkSync(join(f.directory, "file.txt"));
  execFileSync("mkfifo", [join(f.directory, "file.txt")]);
  await assert.rejects(f.inspect(), rejected(409));
});

test("submodule and unresolved index entries cannot count as clean committed bytes", async (t) => {
  const f = await fixture(t);
  git(
    f.directory,
    "update-index",
    "--add",
    "--cacheinfo",
    `160000,${git(f.directory, "rev-parse", "HEAD")},submodule`,
  );
  await assert.rejects(f.inspect(), rejected(409));
  git(f.directory, "update-index", "--force-remove", "submodule");
  const oid = git(f.directory, "rev-parse", "HEAD:file.txt");
  execFileSync("git", ["update-index", "--index-info"], {
    cwd: f.directory,
    input: `0 ${"0".repeat(40)}\tfile.txt\n100644 ${oid} 1\tfile.txt\n100644 ${oid} 2\tfile.txt\n100644 ${oid} 3\tfile.txt\n`,
  });
  await assert.rejects(f.inspect(), rejected(409));
});

test("a commit larger than the display limits is observed by hashing content as it is read", async (t) => {
  const f = await fixture(t);
  // Sizes around the read chunk, an empty file and one beyond the display limit.
  const sizes = [
    0,
    1,
    65535,
    65536,
    65537,
    200000,
    CHANGES_LIMITS.fileBytes + 1,
  ];
  for (const size of sizes) {
    const bytes = Buffer.alloc(size);
    for (let index = 0; index < size; index += 4093) bytes[index] = index % 251;
    writeFileSync(join(f.directory, `size-${size}`), bytes);
  }
  mkdirSync(join(f.directory, "many"));
  for (let index = 0; index < CHANGES_LIMITS.files + 200; index++)
    writeFileSync(join(f.directory, "many", `file-${index}`), `${index}`);
  f.commit();
  const observed = await f.inspect();
  assert.equal(observed.files, 3 + sizes.length + CHANGES_LIMITS.files + 200);
  assert.equal(observed.headSha, git(f.directory, "rev-parse", "HEAD"));
  // One changed byte deep inside the large file is still noticed.
  const large = join(f.directory, `size-${CHANGES_LIMITS.fileBytes + 1}`);
  const bytes = readFileSync(large);
  bytes[bytes.length - 2] = 1;
  writeFileSync(large, bytes);
  await assert.rejects(f.inspect(), rejected(409));
});

test("the clean-commit check enforces its file-count, total-byte and listing bounds without partial success", async (t) => {
  const f = await fixture(t);
  const changed = () => new DomainError(409, "changed");
  const check = (limits: Partial<CleanCommitLimits>) =>
    readCleanCommit(f.directory, new AbortController().signal, changed, {
      ...CLEAN_COMMIT_LIMITS,
      ...limits,
    });
  const bytes = ["argent.json", "file.txt", "marker.js"]
    .map((name) => readFileSync(join(f.directory, name)).length)
    .reduce((sum, size) => sum + size, 0);
  assert.equal((await check({})).files, 3);
  assert.equal((await check({ files: 3, totalBytes: bytes })).files, 3);
  await assert.rejects(check({ files: 2 }), rejected(413));
  await assert.rejects(check({ totalBytes: bytes - 1 }), rejected(413));
  await assert.rejects(check({ totalBytes: 0 }), rejected(413));
  // A listing that does not fit is a refusal, never a truncated tree. The
  // tree listing is the longer of the two, so one byte short refuses it alone.
  const listing = execFileSync(
    "git",
    ["ls-tree", "-r", "-z", "--full-tree", "HEAD"],
    { cwd: f.directory },
  ).length;
  assert.equal((await check({ listingBytes: listing })).files, 3);
  await assert.rejects(check({ listingBytes: listing - 1 }), rejected(409));
  await assert.rejects(check({ listingBytes: 64 }), rejected(409));
  assert.ok(CLEAN_COMMIT_LIMITS.files > CHANGES_LIMITS.files);
  assert.ok(CLEAN_COMMIT_LIMITS.totalBytes > CHANGES_LIMITS.totalBytes);
});

test("one candidate deadline covers approval lookup and abort never produces an observation", async (t) => {
  const f = await fixture(t);
  const aborted = new AbortController();
  aborted.abort(new Error("fixture abort"));
  await assert.rejects(f.inspect("operator", aborted.signal), /fixture abort/);
  let reached!: () => void;
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  t.mock.method(
    f.store.localCommandApprovals,
    "lookup",
    async (
      _root: string,
      _workspace: string,
      _operator: string,
      signal: AbortSignal,
    ) => {
      reached();
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    },
  );
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const inspecting = f.inspect();
  const failed = assert.rejects(inspecting, rejected(408));
  await ready;
  t.mock.timers.tick(CLEAN_COMMIT_LIMITS.timeoutMs);
  await failed;
});

test("abort during final approval revalidation cannot return the previously read candidate", async (t) => {
  const f = await fixture(t);
  const abort = new AbortController();
  const lookup = f.store.localCommandApprovals.lookup.bind(
    f.store.localCommandApprovals,
  );
  let calls = 0;
  t.mock.method(
    f.store.localCommandApprovals,
    "lookup",
    async (...args: Parameters<typeof lookup>) => {
      const result = await lookup(...args);
      if (++calls === 2) abort.abort(new Error("late fixture abort"));
      return result;
    },
  );
  await assert.rejects(
    f.inspect("operator", abort.signal),
    /late fixture abort/,
  );
  assert.equal(calls, 2);
});
