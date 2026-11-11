import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  watch,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { DomainError } from "../src/domain.js";
import {
  COMMAND_CONFIG_LIMITS,
  COMMAND_CONFIG_POLICY,
  commandConfigCandidateIdentity,
  parseLocalCommandConfig,
  readLocalCommandConfig,
} from "../src/local-command-config.js";
import { createLocalWorkspace } from "../src/local-worktree.js";
import { Store } from "../src/store.js";

const CONFIG = '{"version":1,"commands":{"test":{"argv":["npm","test"]}}}\n';
const CHANGED =
  '{"version":1,"commands":{"test":{"argv":["npm","run","other"]}}}\n';
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
function rejected(status: number) {
  return (error: unknown) =>
    error instanceof DomainError && error.status === status;
}
async function fixture(t: TestContext, bytes: string | Buffer | null = CONFIG) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "argent-commands-")));
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "--quiet", "--initial-branch=main");
  writeFileSync(join(repo, "file.txt"), "base\n");
  if (bytes !== null) writeFileSync(join(repo, "argent.json"), bytes);
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "initial");
  const store = new Store(join(root, "store.sqlite"));
  t.after(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const worktrees = join(root, "worktrees");
  const workspace = await createLocalWorkspace(store, worktrees, repo);
  return {
    root,
    repo,
    store,
    worktrees,
    workspace,
    directory: workspace.local!.worktreePath,
    read: (signal?: AbortSignal) =>
      readLocalCommandConfig(store, worktrees, workspace.id, signal),
  };
}

test("configuration parser preserves literal argv and deeply freezes its result", () => {
  const config = parseLocalCommandConfig(
    Buffer.from(
      JSON.stringify({
        version: 1,
        commands: {
          setup: { argv: ["npm", "ci"] },
          run: {
            argv: ["node", "a;$(touch marker)", "", "λ😀", "line\nvalue"],
          },
          test: { argv: ["npm", "test"] },
        },
      }),
    ),
  );
  assert.deepEqual(config.commands.run!.argv, [
    "node",
    "a;$(touch marker)",
    "",
    "λ😀",
    "line\nvalue",
  ]);
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.commands));
  assert.ok(Object.isFrozen(config.commands.test));
  assert.ok(Object.isFrozen(config.commands.test!.argv));
  assert.throws(
    () => (config.commands.test!.argv as string[]).push("changed"),
    TypeError,
  );
});

test("configuration parser rejects unsupported shapes, overrides and nonliteral arguments", () => {
  const action = (argv: unknown) => ({
    version: 1,
    commands: { test: { argv } },
  });
  const cases: unknown[] = [
    null,
    [],
    1,
    "shell command",
    {},
    { version: 2, commands: { test: { argv: ["npm"] } } },
    { version: "1", commands: { test: { argv: ["npm"] } } },
    { version: 1, commands: {} },
    { version: 1, commands: [] },
    { version: 1, commands: null },
    { version: 1, commands: { other: { argv: ["npm"] } } },
    { version: 1, commands: { test: "npm test" } },
    { version: 1, commands: { test: ["npm", "test"] } },
    { version: 1, commands: { test: { argv: ["npm"], cwd: "/" } } },
    { version: 1, commands: { test: { argv: ["npm"], env: {} } } },
    { version: 1, commands: { test: { argv: ["npm"], timeoutMs: 10 } } },
    { version: 1, commands: { test: { argv: ["npm"] } }, extra: true },
    action([]),
    action("npm test"),
    action([""]),
    action(["   "]),
    action([42]),
    action(["npm", true]),
    action(["npm", null]),
    action(["npm", {}]),
    action(["npm", []]),
    action(["npm", "nul\0byte"]),
    action(["npm", "\ud800"]),
    action(["npm", "\udc00"]),
  ];
  for (const value of cases)
    assert.throws(
      () => parseLocalCommandConfig(Buffer.from(JSON.stringify(value))),
      rejected(409),
      JSON.stringify(value),
    );
  for (const bytes of [
    Buffer.from("{"),
    Buffer.from(CONFIG + "trailing"),
    Buffer.from("\uFEFF" + CONFIG),
    Buffer.concat([
      Buffer.from('{"version":1,"commands":{"test":{"argv":["'),
      Buffer.from([0xc0, 0xaf]),
      Buffer.from('"]}}}'),
    ]),
    Buffer.from('{"version":1,"commands":{"__proto__":{"argv":["npm"]}}}'),
  ])
    assert.throws(() => parseLocalCommandConfig(bytes), rejected(409));
});

test("configuration limits bound exact bytes, argv count and UTF-8 argument size", () => {
  const action = (argv: string[]) =>
    Buffer.from(JSON.stringify({ version: 1, commands: { test: { argv } } }));
  const exact = Buffer.from(CONFIG.padEnd(COMMAND_CONFIG_LIMITS.bytes, " "));
  assert.equal(parseLocalCommandConfig(exact).version, 1);
  assert.throws(
    () => parseLocalCommandConfig(Buffer.concat([exact, Buffer.from(" ")])),
    rejected(413),
  );
  assert.equal(
    parseLocalCommandConfig(
      action(Array(COMMAND_CONFIG_LIMITS.arguments).fill("x")),
    ).commands.test!.argv.length,
    COMMAND_CONFIG_LIMITS.arguments,
  );
  assert.throws(
    () =>
      parseLocalCommandConfig(
        action(Array(COMMAND_CONFIG_LIMITS.arguments + 1).fill("x")),
      ),
    rejected(413),
  );
  parseLocalCommandConfig(
    action(["npm", "λ".repeat(COMMAND_CONFIG_LIMITS.argumentBytes / 2)]),
  );
  assert.throws(
    () =>
      parseLocalCommandConfig(
        action([
          "npm",
          "λ".repeat(COMMAND_CONFIG_LIMITS.argumentBytes / 2) + "x",
        ]),
      ),
    rejected(413),
  );
});

test("reader uses only the stored base across unstaged, staged, committed and missing candidate configuration", async (t) => {
  const f = await fixture(t);
  const first = await f.read();
  assert.ok(first);
  assert.deepEqual(first.config.commands.test!.argv, ["npm", "test"]);
  assert.equal(first.source.baseSha, f.workspace.local!.baseSha);
  assert.equal(first.source.path, "argent.json");
  assert.equal(
    first.source.blobId,
    git(f.repo, "rev-parse", "HEAD:argent.json"),
  );
  assert.equal(
    first.source.sha256,
    createHash("sha256").update(CONFIG).digest("hex"),
  );
  assert.equal(first.approvalCandidate.policyVersion, COMMAND_CONFIG_POLICY);
  for (const value of [first, first.source, first.approvalCandidate])
    assert.ok(Object.isFrozen(value));
  writeFileSync(join(f.directory, "argent.json"), CHANGED);
  assert.deepEqual(await f.read(), first);
  git(f.directory, "add", "argent.json");
  assert.deepEqual(await f.read(), first);
  git(f.directory, "commit", "--quiet", "-m", "candidate config");
  assert.deepEqual(await f.read(), first);
  unlinkSync(join(f.directory, "argent.json"));
  symlinkSync(join(f.root, "missing"), join(f.directory, "argent.json"));
  assert.deepEqual(await f.read(), first);
  unlinkSync(join(f.directory, "argent.json"));
  assert.deepEqual(await f.read(), first);
});

test("missing base config does not fall back to current files, index or HEAD", async (t) => {
  const f = await fixture(t, null);
  assert.equal(await f.read(), null);
  writeFileSync(join(f.directory, "argent.json"), CONFIG);
  assert.equal(await f.read(), null);
  git(f.directory, "add", ".");
  assert.equal(await f.read(), null);
  git(f.directory, "commit", "--quiet", "-m", "candidate config");
  assert.equal(await f.read(), null);
});

test("review identity survives sibling workspaces and new base commits but binds exact bytes and repository", async (t) => {
  const f = await fixture(t);
  const first = (await f.read())!;
  const sibling = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const siblingRead = (await readLocalCommandConfig(
    f.store,
    f.worktrees,
    sibling.id,
  ))!;
  assert.equal(
    siblingRead.approvalCandidate.identity,
    first.approvalCandidate.identity,
  );
  git(f.repo, "commit", "--allow-empty", "--quiet", "-m", "new base");
  const newer = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const newerRead = (await readLocalCommandConfig(
    f.store,
    f.worktrees,
    newer.id,
  ))!;
  assert.notEqual(newerRead.source.baseSha, first.source.baseSha);
  assert.equal(
    newerRead.approvalCandidate.identity,
    first.approvalCandidate.identity,
  );
  const linked = join(f.root, "linked-source");
  git(f.repo, "worktree", "add", "--quiet", "-b", "linked-source", linked);
  const fromLinked = await createLocalWorkspace(f.store, f.worktrees, linked);
  assert.equal(
    (await readLocalCommandConfig(f.store, f.worktrees, fromLinked.id))!
      .approvalCandidate.identity,
    first.approvalCandidate.identity,
  );
  writeFileSync(join(f.repo, "argent.json"), CONFIG + " ");
  git(f.repo, "add", ".");
  git(f.repo, "commit", "--quiet", "-m", "config bytes");
  const changed = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const changedRead = (await readLocalCommandConfig(
    f.store,
    f.worktrees,
    changed.id,
  ))!;
  assert.deepEqual(changedRead.config, first.config);
  assert.notEqual(
    changedRead.approvalCandidate.identity,
    first.approvalCandidate.identity,
  );
  const other = await fixture(t);
  const otherRead = (await other.read())!;
  assert.equal(otherRead.source.sha256, first.source.sha256);
  assert.notEqual(
    otherRead.approvalCandidate.identity,
    first.approvalCandidate.identity,
  );
});

test("review identity binds canonical common directory, filesystem identity and policy version", async (t) => {
  const f = await fixture(t);
  const descriptor = (await f.read())!;
  const path = join(f.repo, ".git");
  const stat = lstatSync(path, { bigint: true });
  const repository = {
    path,
    device: String(stat.dev),
    inode: String(stat.ino),
  };
  const identity = commandConfigCandidateIdentity(
    repository,
    descriptor.source.sha256,
    COMMAND_CONFIG_POLICY,
  );
  assert.equal(identity, descriptor.approvalCandidate.identity);
  assert.notEqual(
    commandConfigCandidateIdentity(
      repository,
      descriptor.source.sha256,
      "argent-local-commands-v2",
    ),
    identity,
  );
  assert.notEqual(
    commandConfigCandidateIdentity(
      { ...repository, device: repository.device + "1" },
      descriptor.source.sha256,
      COMMAND_CONFIG_POLICY,
    ),
    identity,
  );
  renameSync(path, join(f.repo, ".git-old"));
  cpSync(join(f.repo, ".git-old"), path, { recursive: true });
  const replaced = (await f.read())!;
  assert.equal(replaced.source.sha256, descriptor.source.sha256);
  assert.notEqual(replaced.approvalCandidate.identity, identity);
});

test("malformed and oversized base blobs fail closed even when current config is valid", async (t) => {
  for (const bytes of [
    "invalid",
    Buffer.from([0xff]),
    Buffer.alloc(COMMAND_CONFIG_LIMITS.bytes + 1, 32),
  ]) {
    const f = await fixture(t, bytes);
    writeFileSync(join(f.directory, "argent.json"), CONFIG);
    await assert.rejects(
      f.read(),
      rejected(bytes.length > COMMAND_CONFIG_LIMITS.bytes ? 413 : 409),
    );
  }
  const f = await fixture(t, CONFIG.padEnd(COMMAND_CONFIG_LIMITS.bytes, " "));
  assert.ok(await f.read());
});

test("base directories, symlinks and gitlinks are not command configurations", async (t) => {
  for (const mode of ["directory", "symlink", "gitlink"] as const) {
    const f = await fixture(t, null);
    if (mode === "directory") {
      mkdirSync(join(f.repo, "argent.json"));
      writeFileSync(join(f.repo, "argent.json", "nested"), CONFIG);
      git(f.repo, "add", ".");
    } else if (mode === "symlink") {
      symlinkSync("file.txt", join(f.repo, "argent.json"));
      git(f.repo, "add", ".");
    } else {
      git(
        f.repo,
        "update-index",
        "--add",
        "--cacheinfo",
        `160000,${f.workspace.local!.baseSha},argent.json`,
      );
    }
    git(f.repo, "commit", "--quiet", "-m", "unsafe mode");
    // Preserve the real owned worktree while testing a stored base with a mode
    // that normal workspace creation already refuses for gitlinks.
    const get = f.store.getWorkspace.bind(f.store);
    const baseSha = git(f.repo, "rev-parse", "HEAD");
    t.mock.method(f.store, "getWorkspace", (id: string) => {
      const original = get(id);
      return { ...original, local: { ...original.local!, baseSha } };
    });
    await assert.rejects(f.read(), rejected(409));
  }
});

test("reader rejects unowned paths, branch changes, foreign repositories and invalid stored bases", async (t) => {
  const f = await fixture(t);
  const simulation = f.store.createWorkspace(
    "https://github.com/example/example",
  );
  await assert.rejects(
    readLocalCommandConfig(f.store, f.worktrees, simulation.id),
    rejected(409),
  );
  await assert.rejects(
    readLocalCommandConfig(f.store, f.worktrees, "unknown"),
    rejected(404),
  );
  const get = f.store.getWorkspace.bind(f.store);
  for (const fields of [
    { worktreePath: f.repo },
    { worktreePath: join(f.worktrees, "..", "repo") },
    { baseSha: "HEAD" },
    { baseSha: "0".repeat(40) },
    { baseSha: git(f.repo, "rev-parse", "HEAD:argent.json") },
    { branch: "main" },
    { repositoryPath: join(f.repo, "subfolder") },
  ]) {
    const mock = t.mock.method(f.store, "getWorkspace", (id: string) => {
      const workspace = get(id);
      return { ...workspace, local: { ...workspace.local!, ...fields } };
    });
    await assert.rejects(f.read(), rejected(409));
    mock.mock.restore();
  }
  const other = await fixture(t);
  const mock = t.mock.method(f.store, "getWorkspace", (id: string) => {
    const workspace = get(id);
    return {
      ...workspace,
      local: { ...workspace.local!, repositoryPath: other.repo },
    };
  });
  await assert.rejects(f.read(), rejected(409));
  mock.mock.restore();
  git(f.directory, "checkout", "--detach", "--quiet");
  await assert.rejects(f.read(), rejected(409));
});

test("reader refuses observed worktree symlinks and replacement by a different Git checkout", async (t) => {
  const f = await fixture(t);
  const moved = join(f.root, "moved");
  renameSync(f.directory, moved);
  symlinkSync(moved, f.directory);
  await assert.rejects(f.read(), rejected(409));
  unlinkSync(f.directory);
  mkdirSync(f.directory);
  git(
    f.directory,
    "init",
    "--quiet",
    `--initial-branch=${f.workspace.local!.branch}`,
  );
  writeFileSync(join(f.directory, "argent.json"), CONFIG);
  git(f.directory, "add", ".");
  git(f.directory, "commit", "--quiet", "-m", "replacement");
  await assert.rejects(f.read(), rejected(409));
});

test("trusted reads ignore replacement refs, hooks, filters, fsmonitor and external diff", async (t) => {
  const f = await fixture(t);
  const first = (await f.read())!;
  writeFileSync(join(f.directory, "argent.json"), CHANGED);
  git(f.directory, "add", ".");
  git(f.directory, "commit", "--quiet", "-m", "changed");
  const blob = git(f.directory, "rev-parse", "HEAD:argent.json");
  git(f.repo, "replace", first.source.blobId, blob);
  git(
    f.repo,
    "replace",
    first.source.baseSha,
    git(f.directory, "rev-parse", "HEAD"),
  );
  const marker = join(f.root, "executed");
  const script = join(f.root, "hostile");
  writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`);
  chmodSync(script, 0o755);
  const hooks = join(f.root, "hooks");
  mkdirSync(hooks);
  for (const hook of ["post-checkout", "pre-commit", "post-index-change"])
    cpSync(script, join(hooks, hook));
  git(f.repo, "config", "core.hooksPath", hooks);
  git(f.repo, "config", "core.fsmonitor", script);
  git(f.repo, "config", "diff.external", script);
  for (const key of ["clean", "smudge", "process"])
    git(f.repo, "config", `filter.hostile.${key}`, script);
  git(f.repo, "config", "filter.hostile.required", "true");
  git(f.repo, "config", "diff.hostile.textconv", script);
  writeFileSync(
    join(f.directory, ".gitattributes"),
    "* filter=hostile diff=hostile\n",
  );
  assert.deepEqual(await f.read(), first);
  assert.equal(existsSync(marker), false);
});

test("reads do not execute configured argv or mutate files, index, store, events or agent sessions", async (t) => {
  const f = await fixture(
    t,
    JSON.stringify({
      version: 1,
      commands: { test: { argv: ["touch", "must-not-exist"] } },
    }),
  );
  const run = f.store.createRun(
    f.workspace.id,
    "keep history",
    "config-read-history",
  );
  const snapshot = () => ({
    workspace: f.store.getWorkspace(f.workspace.id),
    runs: f.store.listRuns(f.workspace.id),
    events: f.store.events(run.id),
    session: f.store.agentSession(f.workspace.id),
    index: readFileSync(
      join(f.repo, ".git", "worktrees", f.workspace.id, "index"),
    ),
    config: readFileSync(join(f.directory, "argent.json")),
    status: git(f.directory, "status", "--porcelain=v1"),
    head: git(f.directory, "rev-parse", "HEAD"),
  });
  const before = snapshot();
  assert.ok(await f.read());
  assert.deepEqual(snapshot(), before);
  assert.equal(existsSync(join(f.directory, "must-not-exist")), false);
  assert.equal(existsSync(join(f.repo, "must-not-exist")), false);
});

test("one deadline and external cancellation cover the complete read", async (t) => {
  const f = await fixture(t);
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));
  await assert.rejects(f.read(controller.signal), /cancelled/);
  const during = new AbortController();
  const get = f.store.getWorkspace.bind(f.store);
  const mock = t.mock.method(f.store, "getWorkspace", (id: string) => {
    during.abort(new Error("cancelled during read"));
    return get(id);
  });
  await assert.rejects(f.read(during.signal), /cancelled during read/);
  mock.mock.restore();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = f.read();
  t.mock.timers.tick(COMMAND_CONFIG_LIMITS.timeoutMs);
  await assert.rejects(pending, rejected(408));
  t.mock.timers.reset();
});

test("cancellation waits for active Git cleanup and leaves no successful descriptor", async (t) => {
  const f = await fixture(t);
  const realGit = execFileSync("which", ["git"]).toString().trim();
  const bin = join(f.root, "bin");
  const marker = join(f.root, "git-reading");
  mkdirSync(bin);
  // Pause only the blob read. All validation still uses real Git, and the
  // wrapper runs under the production process-group supervisor.
  writeFileSync(
    join(bin, "git"),
    `#!${process.execPath}
const { spawnSync } = require("node:child_process");
const { writeFileSync, renameSync } = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("cat-file") && args.includes("blob")) {
  writeFileSync(${JSON.stringify(marker + ".tmp")}, String(process.pid));
  renameSync(${JSON.stringify(marker + ".tmp")}, ${JSON.stringify(marker)});
  setInterval(() => {}, 1000);
} else {
  const result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: "inherit" });
  process.exit(result.status ?? 1);
}
`,
  );
  chmodSync(join(bin, "git"), 0o755);
  const oldPath = process.env.PATH;
  const controller = new AbortController();
  const watcher = watch(f.root, (_event, file) => {
    if (file === "git-reading")
      controller.abort(new Error("cancel active Git"));
  });
  try {
    process.env.PATH = `${bin}:${oldPath ?? "/usr/bin:/bin"}`;
    await assert.rejects(f.read(controller.signal), /cancel active Git/);
    const pid = Number(readFileSync(marker, "utf8"));
    assert.ok(Number.isSafeInteger(pid) && pid > 0);
    assert.throws(() => process.kill(-pid, 0), { code: "ESRCH" });
  } finally {
    watcher.close();
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
  }
});
