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

test("a local workspace is a new branch in a private worktree at HEAD", (t) => {
  const f = fixture(t);
  const head = sh(f.repo, "rev-parse", "HEAD");
  const workspace = createLocalWorkspace(f.store, f.worktrees, f.repo);
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

test("repository paths are validated before any Git change", (t) => {
  const f = fixture(t);
  const rejects = (path: unknown, message: RegExp) =>
    assert.throws(
      () => createLocalWorkspace(f.store, f.worktrees, path),
      (error: unknown) =>
        error instanceof DomainError &&
        error.status === 400 &&
        message.test(error.message),
    );
  rejects("relative/repo", /absolute/);
  rejects(join(f.root, "missing"), /existing directory/);
  rejects(join(f.repo, ".git"), /top-level|Git working tree/);
  mkdirSync(join(f.repo, "sub"));
  rejects(join(f.repo, "sub"), /top-level/);
  mkdirSync(join(f.root, "plain"));
  rejects(join(f.root, "plain"), /Git working tree/);
  const empty = join(f.root, "empty");
  mkdirSync(empty);
  sh(empty, "init", "--quiet");
  rejects(empty, /no commits/);
  rejects(`${f.repo}\0`, /string/);
  rejects(f.root, /contain each other|top-level|Git working tree/);
  assert.equal(f.store.listWorkspaces().items.length, 0);
  assert.equal(sh(f.repo, "branch", "--list", "argent/*"), "");
});

test("Argent's Git commands do not run repository hooks", (t) => {
  const f = fixture(t);
  const marker = join(f.root, "hook-ran");
  const hook = join(f.repo, ".git", "hooks", "post-checkout");
  writeFileSync(hook, `#!/bin/sh\ntouch ${JSON.stringify(marker)}\n`);
  chmodSync(hook, 0o755);
  createLocalWorkspace(f.store, f.worktrees, f.repo);
  assert.equal(existsSync(marker), false);
});

test("a failed record removes the worktree and branch it created", (t) => {
  const f = fixture(t);
  const original = f.store.createLocalWorkspace.bind(f.store);
  f.store.createLocalWorkspace = () => {
    throw new DomainError(500, "simulated database failure");
  };
  assert.throws(() => createLocalWorkspace(f.store, f.worktrees, f.repo));
  f.store.createLocalWorkspace = original;
  assert.equal(sh(f.repo, "branch", "--list", "argent/*"), "");
  assert.equal(sh(f.repo, "worktree", "list").split("\n").length, 1);
});

test("Claude Code runs in the worktree and completion is Argent's own record", async (t) => {
  const f = fixture(t);
  const workspace = createLocalWorkspace(f.store, f.worktrees, f.repo);
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
  const workspace = createLocalWorkspace(f.store, f.worktrees, f.repo);
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
  const workspace = createLocalWorkspace(f.store, f.worktrees, f.repo);
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
  const workspace = createLocalWorkspace(f.store, f.worktrees, f.repo);
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
  const workspace = createLocalWorkspace(f.store, f.worktrees, f.repo);
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

test("run limits and permission modes depend on the workspace kind", (t) => {
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
  const local = createLocalWorkspace(f.store, f.worktrees, f.repo);
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

test("an existing database gains the local execution columns", (t) => {
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
  const workspace = createLocalWorkspace(f.store, f.worktrees, f.repo);
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
  const workspace = createLocalWorkspace(f.store, f.worktrees, f.repo);
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
