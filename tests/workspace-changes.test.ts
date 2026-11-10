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
import { test, type TestContext } from "node:test";
import { DomainError, type WorkspaceChanges } from "../src/domain.js";
import { createLocalWorkspace } from "../src/local-worktree.js";
import { makeServer } from "../src/http.js";
import { Store } from "../src/store.js";
import {
  CHANGES_LIMITS,
  inspectWorkspaceChanges,
} from "../src/workspace-changes.js";

const TOKEN = "changes-test-operator-token-0123456789abcdef";
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
async function fixture(
  t: TestContext,
  initial: Record<string, string | Buffer> = { "file.txt": "before\n" },
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "argent-changes-")));
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "--quiet", "--initial-branch=main");
  for (const [name, content] of Object.entries(initial)) {
    mkdirSync(join(repo, name, ".."), { recursive: true });
    writeFileSync(join(repo, name), content);
  }
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "initial");
  const store = new Store(join(root, "store.sqlite"));
  const worktrees = join(root, "worktrees");
  const workspace = await createLocalWorkspace(store, worktrees, repo);
  const directory = workspace.local!.worktreePath;
  t.after(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    repo,
    store,
    worktrees,
    workspace,
    directory,
    inspect: (signal?: AbortSignal) =>
      inspectWorkspaceChanges(store, worktrees, workspace.id, signal),
  };
}

test("changes combine committed, staged, unstaged and untracked content against the recorded base without writing state", async (t) => {
  const f = await fixture(t, {
    "committed.txt": "base\n",
    "staged.txt": "base\n",
    "unstaged.txt": "base\n",
    ".gitignore": "ignored.txt\n",
  });
  writeFileSync(join(f.directory, "committed.txt"), "committed\n");
  git(f.directory, "add", "committed.txt");
  git(f.directory, "commit", "--quiet", "-m", "change");
  writeFileSync(join(f.directory, "staged.txt"), "staged\n");
  git(f.directory, "add", "staged.txt");
  writeFileSync(join(f.directory, "unstaged.txt"), "unstaged\n");
  writeFileSync(join(f.directory, "untracked.txt"), "new without newline");
  writeFileSync(join(f.directory, "ignored.txt"), "private ignored content");
  const index = readFileSync(
    join(f.repo, ".git", "worktrees", f.workspace.id, "index"),
  );
  const status = git(f.directory, "status", "--porcelain=v1");
  const changes = await f.inspect();
  assert.equal(changes.baseSha, f.workspace.local!.baseSha);
  assert.equal(changes.headSha, git(f.directory, "rev-parse", "HEAD"));
  assert.equal(changes.tested, false);
  assert.equal(changes.consistency, "live");
  assert.deepEqual(
    changes.files.map((file) => file.path),
    ["committed.txt", "staged.txt", "unstaged.txt", "untracked.txt"],
  );
  assert.match(changes.files[0]!.diff, /-base\n\+committed\n/);
  assert.match(changes.files[3]!.diff, /new file mode 100644/);
  assert.match(changes.files[3]!.diff, /\\ No newline at end of file/);
  assert.deepEqual(
    readFileSync(join(f.repo, ".git", "worktrees", f.workspace.id, "index")),
    index,
  );
  assert.equal(git(f.directory, "status", "--porcelain=v1"), status);
  assert.equal(f.store.listRuns(f.workspace.id).items.length, 0);
});

test("changes report deletion, exact rename, edited rename as add/delete, binary, empty, mode and symlink types", async (t) => {
  const f = await fixture(t, {
    "deleted.txt": "gone\n",
    "rename.txt": "exact\n",
    "edited.txt": "original\n",
    "mode.txt": "executable\n",
    "type.txt": "regular\n",
    "binary.dat": Buffer.from([0, 1]),
  });
  unlinkSync(join(f.directory, "deleted.txt"));
  renameSync(join(f.directory, "rename.txt"), join(f.directory, "renamed.txt"));
  renameSync(
    join(f.directory, "edited.txt"),
    join(f.directory, "edited-new.txt"),
  );
  writeFileSync(join(f.directory, "edited-new.txt"), "edited\n");
  chmodSync(join(f.directory, "mode.txt"), 0o755);
  unlinkSync(join(f.directory, "type.txt"));
  const secret = join(f.root, "secret");
  writeFileSync(secret, "outside secret must not be read");
  symlinkSync(secret, join(f.directory, "type.txt"));
  symlinkSync("missing-target", join(f.directory, "broken-link"));
  writeFileSync(join(f.directory, "binary.dat"), Buffer.from([0, 2]));
  writeFileSync(join(f.directory, "empty.txt"), "");
  const result = await f.inspect();
  const files = new Map(result.files.map((file) => [file.path, file]));
  assert.equal(files.get("deleted.txt")!.status, "deleted");
  assert.equal(files.get("renamed.txt")!.status, "renamed");
  assert.equal(files.get("renamed.txt")!.previousPath, "rename.txt");
  assert.equal(files.has("rename.txt"), false);
  assert.equal(files.get("edited.txt")!.status, "deleted");
  assert.equal(files.get("edited-new.txt")!.status, "added");
  assert.match(files.get("mode.txt")!.diff, /old mode 100644\nnew mode 100755/);
  assert.equal(files.get("type.txt")!.status, "typechanged");
  assert.equal(files.get("type.txt")!.newMode, "120000");
  assert.match(files.get("broken-link")!.diff, /\+missing-target/);
  assert.equal(files.get("binary.dat")!.binary, true);
  assert.equal(files.get("binary.dat")!.diff, "");
  assert.match(files.get("empty.txt")!.diff, /new file mode 100644/);
  assert.equal(
    JSON.stringify(result).includes("outside secret must not be read"),
    false,
  );
});

test("whole-file hunks and unusual filenames remain literal display data", async (t) => {
  const f = await fixture(t, { "file.txt": "same\nbefore\nsame\n" });
  writeFileSync(join(f.directory, "file.txt"), "same\nafter\nsame\n");
  for (const name of [
    ":(glob)*",
    "--output=escape",
    "tab\tand\nnewline.txt",
    "unicode-λ.txt",
  ])
    writeFileSync(join(f.directory, name), "literal\n");
  const result = await f.inspect();
  assert.equal(result.files.length, 5);
  assert.match(
    result.files.find((file) => file.path === "file.txt")!.diff,
    /@@ -1,3 \+1,3 @@\n-same\n-before\n-same\n\+same\n\+after\n\+same\n/,
  );
  assert.equal(
    result.files.find((file) => file.path === ":(glob)*")!.status,
    "added",
  );
  execFileSync("git", ["apply", "--check", "-"], {
    cwd: f.repo,
    input: result.files.map((file) => file.diff).join(""),
    stdio: ["pipe", "pipe", "pipe"],
  });
});

test("configured filters, textconv, external diff, hooks and fsmonitor never execute", async (t) => {
  const f = await fixture(t);
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
  git(f.repo, "config", "filter.hostile.required", "true");
  writeFileSync(
    join(f.directory, ".gitattributes"),
    "* filter=hostile diff=hostile\n",
  );
  writeFileSync(
    join(f.repo, ".git", "hooks", "post-index-change"),
    `#!/bin/sh\n${command}\n`,
    { mode: 0o755 },
  );
  writeFileSync(join(f.directory, "file.txt"), "after\n");
  const result = await f.inspect();
  assert.match(
    result.files.find((file) => file.path === "file.txt")!.diff,
    /\+after/,
  );
  assert.equal(existsSync(marker), false);
});

test("replaced roots, parent symlinks, hardlinks and special files are rejected", async (t) => {
  await t.test("root symlink", async (t) => {
    const f = await fixture(t);
    const moved = join(f.root, "moved");
    renameSync(f.directory, moved);
    symlinkSync(moved, f.directory);
    await assert.rejects(f.inspect(), /unsafe/);
  });
  await t.test("parent symlink", async (t) => {
    const f = await fixture(t, { "nested/file.txt": "base\n" });
    renameSync(join(f.directory, "nested"), join(f.root, "nested"));
    symlinkSync(join(f.root, "nested"), join(f.directory, "nested"));
    await assert.rejects(f.inspect(), /unsafe/);
  });
  await t.test("hardlink", async (t) => {
    const f = await fixture(t);
    linkSync(join(f.directory, "file.txt"), join(f.root, "linked"));
    await assert.rejects(f.inspect(), /unsafe/);
  });
  await t.test("fifo", async (t) => {
    const f = await fixture(t);
    unlinkSync(join(f.directory, "file.txt"));
    execFileSync("mkfifo", [join(f.directory, "file.txt")]);
    await assert.rejects(f.inspect(), /unsafe/);
  });
});

test("submodules, changed branches and unowned repository replacements are rejected", async (t) => {
  await t.test("gitlink", async (t) => {
    const f = await fixture(t);
    git(
      f.directory,
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${f.workspace.local!.baseSha},nested`,
    );
    await assert.rejects(f.inspect(), /Submodules are not supported/);
  });
  await t.test("branch", async (t) => {
    const f = await fixture(t);
    git(f.directory, "checkout", "--quiet", "-b", "unexpected");
    await assert.rejects(f.inspect(), /expected/);
  });
  await t.test("replacement", async (t) => {
    const f = await fixture(t);
    renameSync(f.directory, join(f.root, "original"));
    mkdirSync(f.directory);
    git(
      f.directory,
      "init",
      "--quiet",
      `--initial-branch=${f.workspace.local!.branch}`,
    );
    writeFileSync(join(f.directory, "file.txt"), "before\n");
    git(f.directory, "add", ".");
    git(f.directory, "commit", "--quiet", "-m", "initial");
    await assert.rejects(f.inspect(), DomainError);
  });
});

test("file, total diff and enumeration bounds fail closed; cancellation interrupts inspection", async (t) => {
  await t.test("file bytes", async (t) => {
    const f = await fixture(t);
    writeFileSync(
      join(f.directory, "large"),
      Buffer.alloc(CHANGES_LIMITS.fileBytes + 1),
    );
    await assert.rejects(
      f.inspect(),
      (error: unknown) => error instanceof DomainError && error.status === 413,
    );
  });
  await t.test("diff bytes", async (t) => {
    const f = await fixture(t);
    writeFileSync(
      join(f.directory, "large"),
      "a\n".repeat(CHANGES_LIMITS.diffBytes / 2),
    );
    await assert.rejects(
      f.inspect(),
      (error: unknown) => error instanceof DomainError && error.status === 413,
    );
  });
  await t.test("file count", async (t) => {
    const f = await fixture(t);
    for (let i = 0; i < CHANGES_LIMITS.files; i++)
      writeFileSync(join(f.directory, `new-${i}`), "");
    await assert.rejects(
      f.inspect(),
      (error: unknown) => error instanceof DomainError && error.status === 413,
    );
  });
  await t.test("aborted before spawn", async (t) => {
    const f = await fixture(t);
    const controller = new AbortController();
    controller.abort(new Error("cancel inspection"));
    await assert.rejects(f.inspect(controller.signal), /cancel inspection/);
  });
  await t.test("in flight", async (t) => {
    const f = await fixture(t);
    const controller = new AbortController();
    const promise = f.inspect(controller.signal);
    controller.abort(new Error("cancel inspection"));
    await assert.rejects(promise, /cancel inspection/);
    assert.deepEqual((await f.inspect()).files, []);
  });
});

async function serverFixture(
  t: TestContext,
  f: Awaited<ReturnType<typeof fixture>>,
  enabled = true,
) {
  const server = makeServer(
    f.store,
    TOKEN,
    enabled ? { worktreeRoot: f.worktrees } : {},
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return (
    path: string,
    headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` },
  ) => fetch(`http://127.0.0.1:${address.port}${path}`, { headers });
}

test("HTTP changes require authentication, enabled local service, no origin and no caller path or revision", async (t) => {
  const f = await fixture(t);
  const request = await serverFixture(t, f);
  const path = `/workspaces/${f.workspace.id}/changes`;
  assert.equal((await request(path, {})).status, 401);
  assert.equal(
    (
      await request(path, {
        Authorization: `Bearer ${TOKEN}`,
        Origin: "https://example.invalid",
      })
    ).status,
    403,
  );
  for (const query of [
    "path=../secret",
    "path=:(glob)*",
    "base=HEAD",
    "root=/",
    "limit=1",
  ])
    assert.equal((await request(`${path}?${query}`)).status, 400);
  assert.equal((await request("/workspaces/unknown/changes")).status, 404);
  const simulation = f.store.createWorkspace(
    "https://github.com/example/example",
  );
  assert.equal(
    (await request(`/workspaces/${simulation.id}/changes`)).status,
    409,
  );
  const response = await request(path);
  assert.equal(response.status, 200);
  const data = (await response.json()) as WorkspaceChanges;
  assert.equal(data.kind, "workspace-changes");
  assert.deepEqual(data.files, []);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const disabled = await serverFixture(t, f, false);
  assert.equal((await disabled(path)).status, 409);
  writeFileSync(
    join(f.directory, "large"),
    Buffer.alloc(CHANGES_LIMITS.fileBytes + 1),
  );
  assert.equal((await request(path)).status, 413);
});

test("one global deadline cancels the entire changes operation", async (t) => {
  const f = await fixture(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = f.inspect();
  t.mock.timers.tick(CHANGES_LIMITS.timeoutMs);
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof DomainError && error.status === 408,
  );
  t.mock.timers.reset();
});

test("HTTP disconnect aborts an active changes read", async (t) => {
  const f = await fixture(t);
  const server = makeServer(f.store, TOKEN, { worktreeRoot: f.worktrees });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  let started!: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const getWorkspace = f.store.getWorkspace.bind(f.store);
  t.mock.method(f.store, "getWorkspace", (id: string) => {
    started();
    return getWorkspace(id);
  });
  let disconnected!: () => void;
  const cancelled = new Promise<void>((resolve) => {
    disconnected = resolve;
  });
  const abort = AbortController.prototype.abort;
  t.mock.method(
    AbortController.prototype,
    "abort",
    function (this: AbortController, reason: unknown) {
      if (
        reason instanceof DomainError &&
        reason.message === "Changes request disconnected"
      )
        disconnected();
      return abort.call(this, reason);
    },
  );
  const controller = new AbortController();
  const pending = fetch(
    `http://127.0.0.1:${address.port}/workspaces/${f.workspace.id}/changes`,
    {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: controller.signal,
    },
  );
  await reading;
  controller.abort();
  await assert.rejects(pending);
  await cancelled;
});

test("replacement refs cannot change the recorded base tree or blob contents", async (t) => {
  const f = await fixture(t);
  const base = f.workspace.local!.baseSha;
  const oldBlob = git(f.directory, "rev-parse", `${base}:file.txt`);
  writeFileSync(join(f.directory, "file.txt"), "after\n");
  git(f.directory, "add", "file.txt");
  git(f.directory, "commit", "--quiet", "-m", "after");
  const head = git(f.directory, "rev-parse", "HEAD");
  const newBlob = git(f.directory, "rev-parse", "HEAD:file.txt");
  git(f.directory, "replace", oldBlob, newBlob);
  assert.match((await f.inspect()).files[0]!.diff, /-before\n\+after\n/);
  git(f.directory, "replace", base, head);
  assert.match((await f.inspect()).files[0]!.diff, /-before\n\+after\n/);
});

test("newline-heavy text is bounded before rendering while large binary files have metadata only", async (t) => {
  const f = await fixture(t);
  writeFileSync(
    join(f.directory, "lines"),
    "\n".repeat(CHANGES_LIMITS.diffBytes / 2),
  );
  await assert.rejects(
    f.inspect(),
    (error: unknown) => error instanceof DomainError && error.status === 413,
  );
  unlinkSync(join(f.directory, "lines"));
  writeFileSync(
    join(f.directory, "binary"),
    Buffer.alloc(CHANGES_LIMITS.fileBytes),
  );
  const binary = (await f.inspect()).files[0]!;
  assert.equal(binary.binary, true);
  assert.equal(binary.diff, "");
  unlinkSync(join(f.directory, "binary"));
  writeFileSync(join(f.directory, "file.txt"), "\uFEFFafter\n");
  assert.match((await f.inspect()).files[0]!.diff, /\+\uFEFFafter/);
});

test("total inspected content is bounded independently of the diff response", async (t) => {
  const f = await fixture(t);
  for (
    let i = 0;
    i < CHANGES_LIMITS.totalBytes / CHANGES_LIMITS.fileBytes + 1;
    i++
  )
    writeFileSync(
      join(f.directory, `binary-${i}`),
      Buffer.alloc(CHANGES_LIMITS.fileBytes),
    );
  await assert.rejects(
    f.inspect(),
    (error: unknown) => error instanceof DomainError && error.status === 413,
  );
});
