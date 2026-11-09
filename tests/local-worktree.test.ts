import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { test, type TestContext } from "node:test";
import { LocalWorkspace, ScriptedAgent } from "../src/adapters.js";
import { agentEnvironment, ClaudeCodeAgent } from "../src/claude-code.js";
import { DomainError, type WorktreeEvidence } from "../src/domain.js";
import { makeServer } from "../src/http.js";
import {
  createLocalWorkspace,
  LocalWorktreeWorkspace,
} from "../src/local-worktree.js";
import { Store } from "../src/store.js";
import { Worker } from "../src/worker.js";
import { untrackedManifest } from "../src/worktree-evidence.js";
import { git as trustedGit } from "../src/git.js";

const TOKEN = "local-worktree-test-token-0123456789abcdef";

function sh(cwd: string, ...args: string[]): string {
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

function repository(root: string, name = "repo"): string {
  const path = join(root, name);
  mkdirSync(path);
  sh(path, "init", "--quiet", "--initial-branch=main");
  writeFileSync(join(path, "README.md"), "# test\n");
  sh(path, "add", "README.md");
  sh(path, "commit", "--quiet", "-m", "initial");
  return realpathSync(path);
}

/**
 * Writes a fake `claude` CLI. It records its argv, stdin, cwd and environment
 * next to itself, then behaves according to `mode`.
 */
function fakeClaude(
  root: string,
  mode: "success" | "fail" | "hang" | "resistant",
): string {
  const path = join(root, `claude-${mode}`);
  const record = join(root, `record-${mode}.json`);
  const pidFile = join(root, `grandchild-${mode}.pid`);
  writeFileSync(
    path,
    `#!${process.execPath}
if (process.argv.includes('--version')) { console.log('2.1.259 (Claude Code)'); process.exit(0); }
const fs = require("node:fs");
const { spawn } = require("node:child_process");
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  const args = process.argv.slice(2);
  const index = args.indexOf("--session-id") + 1 || args.indexOf("--resume") + 1;
  const session = args[index];
  const records = fs.existsSync(${JSON.stringify(record)}) ? JSON.parse(fs.readFileSync(${JSON.stringify(record)}, "utf8")) : [];
  records.push({ pid: process.pid, args, input, cwd: process.cwd(), env: process.env });
  fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify(records));
  const out = (event) => process.stdout.write(JSON.stringify(event) + "\\n");
  out({ type: "system", subtype: "hook_started", session_id: session });
  out({ type: "system", subtype: "init", session_id: session, model: "fake-model" });
  if (["hang", "resistant"].includes(${JSON.stringify(mode)})) {
    const child = ${JSON.stringify(mode)} === "hang"
      ? spawn("sleep", ["30"], { stdio: "ignore" })
      : spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => require('node:fs').appendFileSync('child-writes', 'x'), 20)"], { stdio: "ignore" });
    fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
    out({ type: "assistant", message: { content: [{ type: "text", text: "Working for a long time" }] } });
    setInterval(() => {}, 1000);
    return;
  }
  out({ type: "assistant", message: { content: [
    { type: "text", text: "I will add a file." },
    { type: "tool_use", name: "Write", input: { file_path: process.cwd() + "/hello.txt" } },
  ] } });
  out({ type: "user", message: { content: [{ type: "tool_result", is_error: true, content: "denied once" }] } });
  if (${JSON.stringify(mode)} === "fail") {
    out({ type: "result", subtype: "error_during_execution", is_error: true, result: "Something broke" });
    process.exit(1);
  }
  fs.writeFileSync("hello.txt", "hi\\n");
  out({ type: "result", subtype: "success", is_error: false, num_turns: 2, duration_ms: 1500, result: "done" });
});
`,
  );
  chmodSync(path, 0o755);
  return path;
}

function records(root: string, mode: string) {
  return JSON.parse(
    readFileSync(join(root, `record-${mode}.json`), "utf8"),
  ) as {
    pid: number;
    args: string[];
    input: string;
    cwd: string;
    env: Record<string, string>;
  }[];
}

function fixture(
  t: TestContext,
  mode: "success" | "fail" | "hang" | "resistant" = "success",
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "argent-local-")));
  const store = new Store(join(root, "db.sqlite"));
  t.after(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const repo = repository(root);
  const worktrees = join(root, "data", "worktrees");
  const claude = fakeClaude(root, mode);
  const worker = new Worker(
    store,
    new LocalWorkspace(join(root, "sim")),
    new ScriptedAgent(1),
    200,
    {
      workspace: new LocalWorktreeWorkspace(store, worktrees),
      agent: new ClaudeCodeAgent(store, {
        executable: claude,
        killGraceMs: 200,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: "sk-ant-should-never-reach-the-agent",
          GITHUB_TOKEN: "ghp_should_never_reach_the_agent",
        },
      }),
    },
  );
  return { root, store, repo, worktrees, worker };
}

test("a local workspace is a new branch in a private worktree at HEAD", async (t) => {
  const f = fixture(t);
  const head = sh(f.repo, "rev-parse", "HEAD");
  const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  assert.equal(workspace.provider, "local-worktree");
  assert.equal(workspace.repository, f.repo);
  assert.match(workspace.local!.branch, /^argent\/[a-f0-9]{8}$/);
  assert.equal(workspace.local!.baseSha, head);
  assert.equal(
    workspace.local!.worktreePath,
    join(realpathSync(f.worktrees), workspace.id),
  );
  assert.equal(
    sh(workspace.local!.worktreePath, "symbolic-ref", "--short", "HEAD"),
    workspace.local!.branch,
  );
  // The developer's own checkout is untouched.
  assert.equal(sh(f.repo, "symbolic-ref", "--short", "HEAD"), "main");
  assert.deepEqual(f.store.getWorkspace(workspace.id), workspace);
  assert.equal(f.store.listWorkspaces().items[0]!.id, workspace.id);
});

test("repository paths are validated before any Git change", async (t) => {
  const f = fixture(t);
  const rejects = (path: unknown, message: RegExp) =>
    assert.rejects(
      () => createLocalWorkspace(f.store, f.worktrees, path),
      (error: unknown) =>
        error instanceof DomainError &&
        error.status === 400 &&
        message.test(error.message),
    );
  await rejects("relative/repo", /absolute/);
  await rejects(join(f.root, "missing"), /existing directory/);
  await rejects(join(f.repo, ".git"), /top-level|Git working tree/);
  mkdirSync(join(f.repo, "sub"));
  await rejects(join(f.repo, "sub"), /top-level/);
  mkdirSync(join(f.root, "plain"));
  await rejects(join(f.root, "plain"), /Git working tree/);
  const empty = join(f.root, "empty");
  mkdirSync(empty);
  sh(empty, "init", "--quiet");
  await rejects(empty, /no commits/);
  await rejects(`${f.repo}\0`, /string/);
  await rejects(f.root, /contain each other|top-level|Git working tree/);
  assert.equal(f.store.listWorkspaces().items.length, 0);
  assert.equal(sh(f.repo, "branch", "--list", "argent/*"), "");
});

test("Argent's Git commands do not run repository hooks", async (t) => {
  const f = fixture(t);
  const marker = join(f.root, "hook-ran");
  const hook = join(f.repo, ".git", "hooks", "post-checkout");
  writeFileSync(hook, `#!/bin/sh\ntouch ${JSON.stringify(marker)}\n`);
  chmodSync(hook, 0o755);
  await createLocalWorkspace(f.store, f.worktrees, f.repo);
  assert.equal(existsSync(marker), false);
});

test("a failed record removes the worktree and branch it created", async (t) => {
  const f = fixture(t);
  const original = f.store.createLocalWorkspace.bind(f.store);
  f.store.createLocalWorkspace = () => {
    throw new DomainError(500, "simulated database failure");
  };
  await assert.rejects(() =>
    createLocalWorkspace(f.store, f.worktrees, f.repo),
  );
  f.store.createLocalWorkspace = original;
  assert.equal(sh(f.repo, "branch", "--list", "argent/*"), "");
  assert.equal(sh(f.repo, "worktree", "list").split("\n").length, 1);
});

test("failed checkout rolls back its owned branch without deleting existing branches", async (t) => {
  const f = fixture(t);
  sh(f.repo, "branch", "argent/preexisting");
  const executable = execFileSync("which", ["git"], {
    encoding: "utf8",
  }).trim();
  const bin = join(f.root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "git"),
    `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('worktree') && args.includes('add')) process.exit(1);
const result = require('node:child_process').spawnSync(${JSON.stringify(executable)}, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`,
    { mode: 0o755 },
  );
  const oldPath = process.env.PATH;
  process.env.PATH = bin + ":" + oldPath;
  try {
    await assert.rejects(
      createLocalWorkspace(f.store, f.worktrees, f.repo),
      /Git worktree failed/,
    );
  } finally {
    process.env.PATH = oldPath;
  }
  assert.equal(
    sh(f.repo, "branch", "--list", "argent/*"),
    "argent/preexisting",
  );
  assert.equal(sh(f.repo, "worktree", "list").split("\n").length, 1);
  assert.equal(f.store.listWorkspaces().items.length, 0);
});

test("Claude Code runs in the worktree and completion is Argent's own record", async (t) => {
  const f = fixture(t);
  const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const run = f.store.createRun(workspace.id, "Add hello.txt", "key-1");
  assert.equal(run.simulation, false);
  assert.equal(run.permissionMode, "edits");
  assert.equal(run.maxRuntimeMs, 1800000);
  assert.equal(await f.worker.tick(), true);
  assert.equal(f.store.getRun(run.id).status, "completed");

  const [call] = records(f.root, "success");
  assert.equal(call!.cwd, workspace.local!.worktreePath);
  assert.equal(call!.input, "Add hello.txt");
  assert.ok(!call!.args.includes("Add hello.txt"), "task never on argv");
  const session = f.store.agentSession(workspace.id);
  assert.deepEqual(call!.args.slice(0, 8), [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "acceptEdits",
    "--permission-prompts",
    "none",
  ]);
  assert.deepEqual(call!.args.slice(8), ["--session-id", session.id]);
  assert.equal(session.started, true);
  assert.equal(call!.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(call!.env.GITHUB_TOKEN, undefined);
  assert.equal(call!.env.HOME, process.env.HOME);

  const events = f.store.events(run.id);
  const logs = events.filter((event) => event.type === "agent.log");
  assert.ok(logs.every((event) => event.data.simulation === false));
  assert.deepEqual(
    logs.map((event) => [event.data.kind, event.data.message]),
    [
      [
        "status",
        "Claude Code started: file edits allowed, other actions needing approval are denied.",
      ],
      ["status", "Session started (fake-model)."],
      ["text", "I will add a file."],
      ["tool", "Write: hello.txt"],
      ["tool_error", "Tool error: denied once"],
      ["status", "Claude Code finished after 2 turns in 2 s."],
    ],
  );
  const evidence = f.store.evidence(run.id) as WorktreeEvidence;
  assert.equal(evidence.kind, "worktree-record");
  assert.equal(evidence.tested, false);
  assert.equal(evidence.changedFiles, 1);
  assert.equal(evidence.baseSha, workspace.local!.baseSha);
  assert.equal(evidence.headSha, workspace.local!.baseSha);
  assert.equal(evidence.branch, workspace.local!.branch);
  assert.match(evidence.diffSha256, /^[a-f0-9]{64}$/);
  assert.equal(events.at(-1)!.data.outcome, "worktree_recorded");
  assert.equal(events.at(-1)!.data.simulation, false);
  // The developer's checkout never sees the agent's file.
  assert.equal(existsSync(join(f.repo, "hello.txt")), false);
});

test("follow-up runs resume the conversation; full access is explicit", async (t) => {
  const f = fixture(t);
  const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  f.store.createRun(workspace.id, "First", "key-1");
  await f.worker.tick();
  const second = f.store.createRun(
    workspace.id,
    "Second",
    "key-2",
    undefined,
    undefined,
    "full",
  );
  await f.worker.tick();
  assert.equal(f.store.getRun(second.id).status, "completed");
  const calls = records(f.root, "success");
  const session = f.store.agentSession(workspace.id).id;
  assert.deepEqual(calls[1]!.args.slice(-2), ["--resume", session]);
  assert.equal(calls[1]!.args[5], "bypassPermissions");
  assert.equal(
    f.store.events(second.id).find((event) => event.type === "run.queued")!.data
      .permissionMode,
    "full",
  );
});

test("an unsuccessful agent run fails without a verification record", async (t) => {
  const f = fixture(t, "fail");
  const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const run = f.store.createRun(workspace.id, "Break", "key");
  await f.worker.tick();
  assert.equal(f.store.getRun(run.id).status, "failed");
  const events = f.store.events(run.id);
  assert.equal(
    events.some((event) => event.type === "verification.recorded"),
    false,
  );
  assert.ok(events.some((event) => event.data.message === "Something broke"));
  assert.match(
    String(events.at(-1)!.data.reason),
    /did not finish successfully \(exit 1, error_during_execution\)/,
  );
});

test("cancel stops the agent's whole process group", async (t) => {
  const f = fixture(t, "hang");
  const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const run = f.store.createRun(workspace.id, "Hang", "key");
  const tick = f.worker.tick();
  const pidFile = join(f.root, "grandchild-hang.pid");
  for (let i = 0; i < 100 && !existsSync(pidFile); i++) await delay(50);
  const grandchild = Number(readFileSync(pidFile, "utf8"));
  f.store.cancel(run.id);
  await tick;
  assert.equal(f.store.getRun(run.id).status, "cancelled");
  await delay(300);
  assert.throws(() => process.kill(grandchild, 0), "grandchild was killed");
});

test("without configured local adapters a real run fails safely", async (t) => {
  const f = fixture(t);
  const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const run = f.store.createRun(workspace.id, "Task", "key");
  const worker = new Worker(
    f.store,
    new LocalWorkspace(join(f.root, "sim")),
    new ScriptedAgent(1),
    200,
  );
  await worker.tick();
  assert.equal(f.store.getRun(run.id).status, "failed");
  assert.equal(
    f.store.events(run.id).at(-1)!.data.reason,
    "local_execution_not_configured",
  );
  assert.equal(existsSync(join(f.root, "record-success.json")), false);
});

test("run limits and permission modes depend on the workspace kind", async (t) => {
  const f = fixture(t);
  const simulated = f.store.createWorkspace(
    "https://github.com/example/project",
  );
  assert.throws(
    () =>
      f.store.createRun(
        simulated.id,
        "Task",
        "a",
        undefined,
        undefined,
        "full",
      ),
    /no permission modes/,
  );
  assert.equal(f.store.createRun(simulated.id, "Task", "b").simulation, true);
  const local = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  assert.throws(
    () =>
      f.store.createRun(local.id, "Task", "c", undefined, undefined, "root"),
    /edits or full/,
  );
  assert.throws(
    () => f.store.createRun(local.id, "Task", "d", 7200001),
    /maxRuntimeMs/,
  );
  const run = f.store.createRun(local.id, "Task", "e", 7200000);
  // The same key with a different mode is a different request.
  assert.throws(
    () => f.store.createRun(local.id, "Task", "e", 7200000, undefined, "full"),
    /different payload/,
  );
  assert.equal(f.store.createRun(local.id, "Task", "e", 7200000).id, run.id);
});

test("the agent environment is an allowlist", () => {
  const env = agentEnvironment({
    PATH: "/usr/bin",
    HOME: "/home/dev",
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    ANTHROPIC_API_KEY: "secret",
    CLAUDE_CODE_OAUTH_TOKEN: "secret",
    OPENAI_API_KEY: "secret",
    AWS_SECRET_ACCESS_KEY: "secret",
    GH_TOKEN: "secret",
    SSH_AUTH_SOCK: "/tmp/agent",
  });
  assert.deepEqual(Object.keys(env).sort(), ["HOME", "LANG", "LC_ALL", "PATH"]);
  assert.ok(env.PATH!.startsWith("/usr/bin"));
  assert.ok(env.PATH!.includes("/home/dev/.local/bin"));
});

test("the API creates local workspaces only when enabled", async (t) => {
  const f = fixture(t);
  const call = async (server: ReturnType<typeof makeServer>, body: object) => {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    t.after(() => server.close());
    const address = server.address() as { port: number };
    const response = await fetch(
      `http://127.0.0.1:${address.port}/workspaces`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(body),
      },
    );
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  };
  const disabled = await call(makeServer(f.store, TOKEN), {
    source: "local",
    path: f.repo,
  });
  assert.equal(disabled.status, 409);
  const enabled = await call(
    makeServer(f.store, TOKEN, { worktreeRoot: f.worktrees }),
    { source: "local", path: f.repo },
  );
  assert.equal(enabled.status, 201);
  assert.equal(enabled.body.provider, "local-worktree");
});

test("an existing database gains the local execution columns", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "argent-migrate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "db.sqlite");
  const old = new DatabaseSync(path);
  old.exec(`
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY, repository TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('running', 'stopped')), created_at INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE runs (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      task TEXT NOT NULL, request_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN
        ('queued','running','cancelling','completed','failed','cancelled','needs_attention')),
      max_runtime_ms INTEGER NOT NULL, created_at INTEGER NOT NULL,
      deadline_at INTEGER, lease_token TEXT, lease_expires_at INTEGER
    ) STRICT;
    INSERT INTO workspaces VALUES ('00000000-0000-4000-8000-000000000000', 'https://github.com/example/old', 'running', 1);
    INSERT INTO runs (id, workspace_id, task, request_key, status, max_runtime_ms, created_at)
      VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000000', 'Old', 'k', 'completed', 30000, 1);
  `);
  old.close();
  const store = new Store(path);
  t.after(() => store.close());
  const workspace = store.getWorkspace("00000000-0000-4000-8000-000000000000");
  assert.equal(workspace.provider, "local-simulation");
  assert.equal(workspace.local, undefined);
  const run = store.getRun("00000000-0000-4000-8000-000000000001");
  assert.equal(run.simulation, true);
  assert.equal(run.permissionMode, "edits");
});

test("cancel waits for a SIGTERM-resistant descendant after the CLI exits", async (t) => {
  const f = fixture(t, "resistant");
  const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const run = f.store.createRun(workspace.id, "Hang", "key");
  const tick = f.worker.tick();
  const written = join(workspace.local!.worktreePath, "child-writes");
  for (let i = 0; i < 100 && !existsSync(written); i++) await delay(25);
  assert.ok(
    existsSync(written),
    "descendant must start writing before cancellation",
  );
  f.store.cancel(run.id);
  await tick;
  assert.equal(f.store.getRun(run.id).status, "cancelled");
  const content = readFileSync(written, "utf8");
  await delay(300);
  assert.equal(
    readFileSync(written, "utf8"),
    content,
    "no writes after acknowledged cancellation",
  );
});

test("closing the iterator at its first status cleans up the running CLI", async (t) => {
  const f = fixture(t, "hang");
  const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const run = f.store.createRun(workspace.id, "Hang", "key");
  const agent = new ClaudeCodeAgent(f.store, {
    executable: join(f.root, "claude-hang"),
    killGraceMs: 50,
  });
  const iterator = agent
    .execute(run, workspace.local!.worktreePath, new AbortController().signal)
    [Symbol.asyncIterator]();
  await iterator.next();
  const record = join(f.root, "record-hang.json");
  for (let i = 0; i < 100 && !existsSync(record); i++) await delay(25);
  const pid = records(f.root, "hang")[0]!.pid;
  await iterator.return?.();
  assert.throws(() => process.kill(pid, 0));
});

for (const filter of ["clean", "smudge", "process"] as const) {
  test(`trusted Git never executes a configured ${filter} filter`, async (t) => {
    const f = fixture(t);
    writeFileSync(join(f.repo, ".gitattributes"), "*.txt filter=probe\n");
    writeFileSync(join(f.repo, "filtered.txt"), "base\n");
    sh(f.repo, "add", ".");
    sh(f.repo, "commit", "-qm", "filter fixture");
    const marker = join(f.root, "filter-ran");
    const command = join(f.root, "filter-command");
    writeFileSync(
      command,
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); process.exit(42);\n`,
      { mode: 0o755 },
    );
    const included = join(f.root, "included-config");
    writeFileSync(
      included,
      `[filter "probe"]\n  ${filter} = ${command}\n  required = true\n`,
    );
    sh(f.repo, "config", "include.path", included);
    const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
    writeFileSync(
      join(workspace.local!.worktreePath, "filtered.txt"),
      "changed\n",
    );
    const run = f.store.createRun(workspace.id, "verify", "key");
    await new LocalWorktreeWorkspace(f.store, f.worktrees).verify(
      workspace.local!.worktreePath,
      run,
    );
    assert.equal(existsSync(marker), false);
  });
}

/** An initialized child repository whose own filter config is not in its parent. */
function hostileSubmodule(
  root: string,
  parent: string,
  state: "index" | "HEAD" | "base",
): { marker: string; gitlinkCommit: string | undefined } {
  const source = repository(root, "submodule-source");
  writeFileSync(join(source, ".gitattributes"), "*.txt filter=child\n");
  writeFileSync(join(source, "child.txt"), "initial\n");
  sh(source, "add", ".");
  sh(source, "commit", "-qm", "submodule fixture");
  sh(
    parent,
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    "--quiet",
    source,
    "child",
  );
  let gitlinkCommit: string | undefined;
  if (state !== "index") {
    sh(parent, "commit", "-qm", "record submodule");
    gitlinkCommit = sh(parent, "rev-parse", "HEAD");
    // Leave the initialized child on disk, but remove its link from the index.
    sh(parent, "rm", "--cached", "child");
    if (state === "base") sh(parent, "commit", "-qm", "remove submodule");
  }
  sh(parent, "config", "diff.submodule", "diff");
  sh(parent, "config", "submodule.recurse", "true");
  sh(parent, "config", "submodule.child.ignore", "none");
  const marker = join(root, "child-filter-ran");
  const command = join(root, "child-filter");
  writeFileSync(
    command,
    `#!${process.execPath}
require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');
process.stdin.pipe(process.stdout);
`,
    { mode: 0o755 },
  );
  sh(join(parent, "child"), "config", "filter.child.clean", command);
  writeFileSync(join(parent, "child", "child.txt"), "dirty\n");
  return { marker, gitlinkCommit };
}

for (const state of ["HEAD", "index"] as const) {
  test(`submodules in the source ${state} are rejected before creating a worktree`, async (t) => {
    const f = fixture(t);
    const { marker } = hostileSubmodule(f.root, f.repo, state);
    await assert.rejects(
      createLocalWorkspace(f.store, f.worktrees, f.repo),
      /Submodules are not supported/,
    );
    assert.equal(existsSync(marker), false);
    assert.equal(f.store.listWorkspaces().items.length, 0);
    assert.equal(sh(f.repo, "branch", "--list", "argent/*"), "");
    assert.equal(sh(f.repo, "worktree", "list").split("\n").length, 1);
  });
}

for (const state of ["index", "HEAD", "base"] as const) {
  test(`gitlinks introduced in ${state} cannot produce evidence or run child filters`, async (t) => {
    const f = fixture(t);
    const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
    const directory = workspace.local!.worktreePath;
    const { marker, gitlinkCommit } = hostileSubmodule(
      f.root,
      directory,
      state,
    );
    if (state === "base") {
      // Model an existing persisted workspace whose base predates this guard.
      const database = new DatabaseSync(join(f.root, "db.sqlite"));
      try {
        database
          .prepare(
            "UPDATE local_worktrees SET base_sha = ? WHERE workspace_id = ?",
          )
          .run(gitlinkCommit!, workspace.id);
      } finally {
        database.close();
      }
    }
    const run = f.store.createRun(workspace.id, "verify", "submodule");
    const adapter = new LocalWorktreeWorkspace(f.store, f.worktrees);
    await assert.rejects(
      adapter.prepare(f.store.getWorkspace(workspace.id)),
      /Submodules are not supported/,
    );
    await assert.rejects(
      adapter.verify(directory, run),
      /Submodules are not supported/,
    );
    // Defense in depth: even accidental dirty probing must not invoke child Git
    // filters. Evidence still fails above instead of silently excluding them.
    await trustedGit(directory, [
      "diff",
      "--binary",
      "--no-ext-diff",
      "--no-textconv",
      "HEAD",
    ]);
    assert.equal(existsSync(marker), false);
    assert.equal(
      f.store
        .events(run.id)
        .some((event) => event.type === "verification.recorded"),
      false,
    );
  });
}

test("worktree evidence binds untracked contents, mode and symlink target", async (t) => {
  const f = fixture(t);
  const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const directory = workspace.local!.worktreePath;
  const run = f.store.createRun(workspace.id, "verify", "key");
  const adapter = new LocalWorktreeWorkspace(f.store, f.worktrees);
  const file = join(directory, "new.txt");
  writeFileSync(file, "one");
  const first = await adapter.verify(directory, run);
  writeFileSync(file, "two");
  const second = await adapter.verify(directory, run);
  assert.notEqual(second.diffSha256, first.diffSha256);
  chmodSync(file, 0o755);
  const executable = await adapter.verify(directory, run);
  assert.notEqual(executable.diffSha256, second.diffSha256);
  unlinkSync(file);
  symlinkSync("outside-one", file);
  const link = await adapter.verify(directory, run);
  unlinkSync(file);
  symlinkSync("outside-two", file);
  assert.notEqual(
    (await adapter.verify(directory, run)).diffSha256,
    link.diffSha256,
  );
  assert.equal(first.contentHashVersion, 2);
  assert.equal(first.changedFiles, 1);
});

test("oversized or special untracked files cannot become complete evidence", async (t) => {
  const f = fixture(t);
  const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const directory = workspace.local!.worktreePath;
  const run = f.store.createRun(workspace.id, "verify", "key");
  const adapter = new LocalWorktreeWorkspace(f.store, f.worktrees);
  writeFileSync(join(directory, "large"), Buffer.alloc((16 << 20) + 1));
  await assert.rejects(adapter.verify(directory, run), /exceeds its limits/);
  unlinkSync(join(directory, "large"));
  execFileSync("mkfifo", [join(directory, "pipe")]);
  await assert.rejects(
    untrackedManifest(directory, Buffer.from("pipe\0")),
    /unsafe/,
  );
});

test("slow Git verification keeps the service responsive and the lease alive", async (t) => {
  const f = fixture(t);
  const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const executable = execFileSync("which", ["git"], {
    encoding: "utf8",
  }).trim();
  const bin = join(f.root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "git"),
    `#!${process.execPath}
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
setTimeout(() => { const r = spawnSync(${JSON.stringify(executable)}, args, { stdio: 'inherit' }); process.exit(r.status ?? 1); }, args.includes('diff') ? 700 : 0);
`,
    { mode: 0o755 },
  );
  const oldPath = process.env.PATH;
  process.env.PATH = bin + ":" + oldPath;
  t.after(() => {
    process.env.PATH = oldPath;
  });
  const server = makeServer(f.store, TOKEN);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const run = f.store.createRun(workspace.id, "Task", "slow");
  let completed = false;
  const tick = f.worker.tick().then(() => {
    completed = true;
  });
  await delay(500);
  const response = await fetch(
    `http://127.0.0.1:${(server.address() as { port: number }).port}/health`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  assert.equal(response.status, 200);
  assert.equal(
    completed,
    false,
    "health responds while slow Git is still in flight",
  );
  assert.equal(f.store.getRun(run.id).status, "running");
  assert.ok(f.store.getRun(run.id).leaseExpiresAt! > Date.now());
  await tick;
  assert.equal(f.store.getRun(run.id).status, "completed");
});

test("unsupported CLI versions fail before starting a task", async (t) => {
  const f = fixture(t);
  const executable = join(f.root, "claude-success");
  writeFileSync(
    executable,
    readFileSync(executable, "utf8").replace(
      "2.1.259 (Claude Code)",
      "2.1.258 (Claude Code)",
    ),
  );
  const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
  const run = f.store.createRun(workspace.id, "Task", "old-version");
  await f.worker.tick();
  assert.equal(f.store.getRun(run.id).status, "failed");
  assert.match(
    String(f.store.events(run.id).at(-1)!.data.reason),
    /2.1.259 or newer/,
  );
  assert.equal(existsSync(join(f.root, "record-success.json")), false);
});

for (const mode of ["oversized", "invalid-result"] as const) {
  test(`invalid CLI output (${mode}) fails without evidence and cleans up`, async (t) => {
    const f = fixture(t);
    const executable = join(f.root, "claude-success");
    const pidFile = join(f.root, "stream.pid");
    writeFileSync(
      executable,
      `#!${process.execPath}
if (process.argv.includes('--version')) { console.log('2.1.259 (Claude Code)'); process.exit(0); }
require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
process.stdout.write(${JSON.stringify(mode)} === 'oversized' ? Buffer.alloc((1 << 20) + 1, 120) : JSON.stringify({type:'result',subtype:'success',is_error:'false'}) + '\\n');
setInterval(() => {}, 1000);
`,
    );
    const workspace = await createLocalWorkspace(f.store, f.worktrees, f.repo);
    const run = f.store.createRun(workspace.id, "Task", "stream");
    await f.worker.tick();
    assert.equal(f.store.getRun(run.id).status, "failed");
    assert.equal(
      f.store
        .events(run.id)
        .some((event) => event.type === "verification.recorded"),
      false,
    );
    assert.throws(() => process.kill(Number(readFileSync(pidFile, "utf8")), 0));
  });
}
