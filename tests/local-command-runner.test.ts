import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { DomainError } from "../src/domain.js";
import { COMMAND_CONFIG_LIMITS } from "../src/local-command-config.js";
import {
  COMMAND_RUN_LIMITS,
  runBoundedCommand,
} from "../src/local-command-runner.js";

const node = process.execPath;
const rejected = (status: number) => (error: unknown) =>
  error instanceof DomainError && error.status === status;
function directory(t: TestContext): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "argent-runner-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const run = (
  cwd: string,
  argv: string[],
  options: {
    maxRuntimeMs?: number;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
  } = {},
) => runBoundedCommand(argv, { cwd, maxRuntimeMs: 30000, ...options });
/** A reaped process, or one that only awaits reaping, can no longer run. */
async function gone(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt++) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
      throw error;
    }
    await delay(25);
  }
  assert.fail(`process ${pid} is still present`);
}
async function file(path: string): Promise<string> {
  for (let attempt = 0; attempt < 400 && !existsSync(path); attempt++)
    await delay(25);
  return readFileSync(path, "utf8");
}

test("a command runs once, without a shell, and its exit and output are recorded as observed", async (t) => {
  const cwd = directory(t);
  const hostile =
    "$(touch marker); `touch marker` && echo * > marker; 'q' \"q\"";
  const result = await run(cwd, [
    node,
    "-e",
    "process.stdout.write(process.argv[1]); process.stderr.write(process.cwd())",
    hostile,
  ]);
  assert.equal(result.kind, "bounded-command-result");
  assert.equal(result.outcome, "exited");
  assert.equal(result.exitCode, 0);
  assert.equal(result.signal, null);
  assert.equal(result.executable, node);
  assert.equal(result.cwd, cwd);
  assert.equal(result.argv[3], hostile);
  assert.equal(result.stdout.tail.toString(), hostile);
  assert.equal(result.stdout.bytes, Buffer.byteLength(hostile));
  assert.equal(
    result.stdout.sha256,
    createHash("sha256").update(hostile).digest("hex"),
  );
  assert.equal(result.stdout.truncated, false);
  assert.equal(result.stderr.tail.toString(), cwd);
  assert.equal(existsSync(join(cwd, "marker")), false);
  assert.equal(result.simulation, false);
  assert.equal(result.tested, false);
  assert.equal(result.evidence, "not-recorded");
  assert.ok(result.durationMs >= 0 && result.startedAt <= Date.now());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.argv));
  assert.ok(Object.isFrozen(result.stdout));

  const failed = await run(cwd, [node, "-e", "process.exit(3)"]);
  assert.deepEqual(
    [failed.outcome, failed.exitCode, failed.signal],
    ["exited", 3, null],
  );
  const killed = await run(cwd, [
    node,
    "-e",
    "process.kill(process.pid, 'SIGKILL')",
  ]);
  assert.deepEqual(
    [killed.outcome, killed.exitCode, killed.signal],
    ["signaled", null, "SIGKILL"],
  );
  // Standard input is closed, so a command that reads it sees its end.
  const input = await run(cwd, [
    node,
    "-e",
    "let n = 0; process.stdin.on('data', (c) => (n += c.length)).on('end', () => console.log(n))",
  ]);
  assert.equal(input.stdout.tail.toString(), "0\n");
});

test("the command receives only the allowlisted environment", async (t) => {
  const cwd = directory(t);
  const result = await run(
    cwd,
    [node, "-e", "console.log(JSON.stringify(process.env))"],
    {
      env: {
        PATH: "/usr/bin:/bin",
        HOME: cwd,
        USER: "developer",
        LANG: "C",
        LC_ALL: "C",
        TMPDIR: cwd,
        ANTHROPIC_API_KEY: "secret-key",
        OPENAI_API_KEY: "secret-key",
        GITHUB_TOKEN: "secret-token",
        GH_TOKEN: "secret-token",
        ARGENT_API_TOKEN: "secret-token",
        CLAUDE_CONFIG_DIR: cwd,
        NODE_OPTIONS: "--require=/nonexistent",
        npm_config_token: "secret-token",
      },
    },
  );
  assert.equal(result.exitCode, 0);
  const seen = JSON.parse(result.stdout.tail.toString()) as Record<
    string,
    string
  >;
  for (const name of ["HOME", "USER", "LANG", "LC_ALL", "TMPDIR"])
    assert.ok(name in seen, name);
  assert.ok(seen.PATH!.split(":").includes("/usr/bin"));
  for (const name of [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "ARGENT_API_TOKEN",
    "CLAUDE_CONFIG_DIR",
    "NODE_OPTIONS",
    "npm_config_token",
  ])
    assert.equal(name in seen, false, name);
  assert.equal(JSON.stringify(seen).includes("secret"), false);
});

test("executables resolve by name, absolute path or a path that stays inside the directory", async (t) => {
  const root = directory(t);
  const cwd = join(root, "checkout");
  const bin = join(root, "bin");
  mkdirSync(join(cwd, "scripts"), { recursive: true });
  mkdirSync(bin);
  const script = (path: string, word: string, mode = 0o755) => {
    writeFileSync(path, `#!/bin/sh\necho ${word}\n`);
    chmodSync(path, mode);
  };
  script(join(cwd, "scripts", "inside.sh"), "inside");
  script(join(cwd, "scripts", "plain.sh"), "plain", 0o644);
  script(join(root, "outside.sh"), "outside");
  script(join(bin, "named-tool"), "named");
  symlinkSync(join(root, "outside.sh"), join(cwd, "scripts", "escape.sh"));
  symlinkSync(
    join(cwd, "scripts", "inside.sh"),
    join(cwd, "scripts", "alias.sh"),
  );
  writeFileSync(join(cwd, "unstartable"), "#!/nonexistent/interpreter\n");
  chmodSync(join(cwd, "unstartable"), 0o755);
  const env = { PATH: `${bin}:/usr/bin:/bin`, HOME: root };
  const word = async (argv: string[]) => {
    const result = await run(cwd, argv, { env });
    assert.equal(result.exitCode, 0);
    return [result.stdout.tail.toString().trim(), result.executable];
  };
  assert.deepEqual(await word(["./scripts/inside.sh"]), [
    "inside",
    join(cwd, "scripts", "inside.sh"),
  ]);
  assert.deepEqual(await word(["scripts/alias.sh"]), [
    "inside",
    join(cwd, "scripts", "inside.sh"),
  ]);
  assert.deepEqual(await word(["named-tool"]), [
    "named",
    join(bin, "named-tool"),
  ]);
  assert.deepEqual(await word([join(root, "outside.sh")]), [
    "outside",
    join(root, "outside.sh"),
  ]);
  for (const name of [
    "../outside.sh",
    "scripts/../../outside.sh",
    "scripts/escape.sh",
    "scripts/plain.sh",
    "scripts/missing.sh",
    "scripts",
    "./",
    "missing-tool",
    "named tool",
    join(root, "missing"),
    // Found and executable, but the system cannot start it.
    "./unstartable",
  ])
    await assert.rejects(run(cwd, [name], { env }), rejected(409), name);
});

test("unbounded or malformed commands, directories and deadlines are refused before anything starts", async (t) => {
  const cwd = directory(t);
  const marker = join(cwd, "started");
  const touch = [
    "-e",
    `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "")`,
  ];
  const argvs: unknown[] = [
    [],
    [" "],
    [node, ...touch, "nul\0byte"],
    [node, ...touch, "\ud800"],
    [node, ...touch, "x".repeat(COMMAND_CONFIG_LIMITS.argumentBytes + 1)],
    [
      node,
      ...touch,
      ...Array<string>(COMMAND_CONFIG_LIMITS.arguments).fill("x"),
    ],
    [node, ...touch, 7],
    `${node} -e 1`,
  ];
  for (const argv of argvs)
    await assert.rejects(run(cwd, argv as string[]), rejected(400));
  const link = join(cwd, "link");
  symlinkSync(cwd, link);
  for (const bad of ["relative", link, join(cwd, "missing"), `${cwd}/`, ""])
    await assert.rejects(
      runBoundedCommand([node, ...touch], { cwd: bad, maxRuntimeMs: 30000 }),
      rejected(400),
    );
  for (const maxRuntimeMs of [
    COMMAND_RUN_LIMITS.minRuntimeMs - 1,
    COMMAND_RUN_LIMITS.maxRuntimeMs + 1,
    1500.5,
    Number.NaN,
  ])
    await assert.rejects(
      run(cwd, [node, ...touch], { maxRuntimeMs }),
      rejected(400),
    );
  const aborted = new AbortController();
  aborted.abort(new Error("fixture abort"));
  await assert.rejects(
    run(cwd, [node, ...touch], { signal: aborted.signal }),
    /fixture abort/,
  );
  assert.equal(existsSync(marker), false);
});

test("every output byte is counted and hashed while only the end of each stream is retained", async (t) => {
  const cwd = directory(t);
  const size = COMMAND_RUN_LIMITS.tailBytes + 70001;
  const result = await run(cwd, [
    node,
    "-e",
    `const b = Buffer.alloc(${size}); for (let i = 0; i < b.length; i++) b[i] = 97 + (i % 26);
     process.stdout.write(b); process.stderr.write("short\\n");`,
  ]);
  const expected = Buffer.alloc(size);
  for (let index = 0; index < size; index++)
    expected[index] = 97 + (index % 26);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.bytes, size);
  assert.equal(result.stdout.truncated, true);
  assert.equal(result.stdout.tail.length, COMMAND_RUN_LIMITS.tailBytes);
  assert.ok(
    result.stdout.tail.equals(
      expected.subarray(size - COMMAND_RUN_LIMITS.tailBytes),
    ),
  );
  assert.equal(
    result.stdout.sha256,
    createHash("sha256").update(expected).digest("hex"),
  );
  assert.deepEqual(
    [
      result.stderr.bytes,
      result.stderr.truncated,
      result.stderr.tail.toString(),
    ],
    [6, false, "short\n"],
  );
});

test("a command that floods its output is stopped at the total output limit", async (t) => {
  const cwd = directory(t);
  const result = await run(cwd, [
    node,
    "-e",
    `const b = Buffer.alloc(1 << 20, 120);
     const write = () => { while (process.stdout.write(b)); process.stdout.once("drain", write); };
     require("node:fs").writeFileSync("pid", String(process.pid)); write();`,
  ]);
  assert.equal(result.outcome, "output_limit");
  assert.equal(result.exitCode, null);
  assert.equal(result.signal, null);
  assert.ok(
    result.stdout.bytes + result.stderr.bytes > COMMAND_RUN_LIMITS.outputBytes,
  );
  assert.ok(result.stdout.tail.length <= COMMAND_RUN_LIMITS.tailBytes);
  await gone(Number(readFileSync(join(cwd, "pid"), "utf8")));
});

const FAMILY = `const { spawn } = require("node:child_process");
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  require("node:fs").writeFileSync("pids", process.pid + " " + child.pid);
  console.log("partial output"); setInterval(() => {}, 1000);`;

test("the deadline ends the command's whole process group and is reported as a timeout", async (t) => {
  const cwd = directory(t);
  const result = await run(cwd, [node, "-e", FAMILY], {
    maxRuntimeMs: COMMAND_RUN_LIMITS.minRuntimeMs,
  });
  assert.equal(result.outcome, "timed_out");
  assert.equal(result.exitCode, null);
  assert.equal(result.signal, null);
  assert.equal(result.stdout.tail.toString(), "partial output\n");
  assert.ok(result.durationMs >= COMMAND_RUN_LIMITS.minRuntimeMs);
  for (const pid of readFileSync(join(cwd, "pids"), "utf8").split(" "))
    await gone(Number(pid));
});

test("cancellation ends the whole process group and never returns a result", async (t) => {
  const cwd = directory(t);
  const controller = new AbortController();
  const running = run(cwd, [node, "-e", FAMILY], { signal: controller.signal });
  const failed = assert.rejects(running, /fixture cancel/);
  const pids = (await file(join(cwd, "pids"))).split(" ").map(Number);
  assert.equal(pids.length, 2);
  controller.abort(new Error("fixture cancel"));
  await failed;
  for (const pid of pids) await gone(pid);
});
