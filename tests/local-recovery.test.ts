import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import {
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
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import {
  readConnection,
  serviceRequest,
  type ServiceConnection,
} from "../src/desktop/service-client.js";
import type { RunView, Workspace } from "../src/domain.js";

async function until(check: () => boolean | Promise<boolean>) {
  const end = Date.now() + 10000;
  while (!(await check())) {
    assert.ok(Date.now() < end, "fixture timed out");
    await delay(25);
  }
}

test(
  "local workspaces execute concurrently and remain blocked after a service crash",
  { timeout: 25000 },
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "argent-recovery-")));
    const repo = join(root, "repo");
    const data = join(root, "data");
    mkdirSync(repo);
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        [
          "-c",
          "user.name=Test",
          "-c",
          "user.email=test@example.invalid",
          ...args,
        ],
        { cwd: repo, stdio: "pipe" },
      );
    git("init", "--quiet");
    writeFileSync(join(repo, "README"), "fixture");
    git("add", ".");
    git("commit", "-qm", "initial");
    const cli = join(root, "fake-claude");
    const pidFile = join(root, "agent.pid");
    writeFileSync(
      cli,
      `#!${process.execPath}
if (process.argv.includes('--version')) { console.log('2.1.259 (Claude Code)'); process.exit(0); }
const fs = require('node:fs');
process.stdout.on('error', () => {});
process.stdin.resume();
process.stdin.on('end', () => {
  fs.appendFileSync(${JSON.stringify(pidFile)}, String(process.pid) + "\\n");
  setInterval(() => fs.appendFileSync('writes', 'x'), 20);
});
`,
      { mode: 0o755 },
    );
    let service: ChildProcess | undefined;
    let connection: ServiceConnection;
    async function start() {
      service = spawn(
        process.execPath,
        [
          fileURLToPath(
            new URL("../src/desktop/service-main.js", import.meta.url),
          ),
        ],
        {
          env: {
            ...process.env,
            PLATFORM_DATA_DIR: data,
            ARGENT_CLAUDE_PATH: cli,
          },
          stdio: "ignore",
        },
      );
      await until(() => {
        const value = readConnection(data);
        if (!value || value.pid !== service!.pid) return false;
        connection = value;
        return true;
      });
    }
    try {
      await start();
      const workspace = (await serviceRequest(
        connection!,
        "/workspaces",
        "POST",
        { source: "local", path: repo },
      )) as Workspace;
      const run = (await serviceRequest(
        connection!,
        "/runs",
        "POST",
        { workspaceId: workspace.id, task: "wait" },
        "first",
      )) as RunView;
      await until(
        () =>
          existsSync(pidFile) &&
          existsSync(join(workspace.local!.worktreePath, "writes")),
      );
      const other = (await serviceRequest(connection!, "/workspaces", "POST", {
        source: "local",
        path: repo,
      })) as Workspace;
      const second = (await serviceRequest(
        connection!,
        "/runs",
        "POST",
        { workspaceId: other.id, task: "parallel" },
        "parallel",
      )) as RunView;
      await until(
        () => readFileSync(pidFile, "utf8").trim().split("\n").length === 2,
      );
      assert.equal(
        ((await serviceRequest(connection!, `/runs/${run.id}`)) as RunView)
          .status,
        "running",
      );
      assert.equal(
        ((await serviceRequest(connection!, `/runs/${second.id}`)) as RunView)
          .status,
        "running",
      );
      await assert.rejects(
        serviceRequest(
          connection!,
          "/runs",
          "POST",
          { workspaceId: workspace.id, task: "overlap" },
          "overlap",
        ),
        /active or uncertain/,
      );
      const gone = once(service!, "exit");
      service!.kill("SIGKILL");
      await gone;
      await start();
      await until(
        async () =>
          ((await serviceRequest(connection!, `/runs/${run.id}`)) as RunView)
            .status === "needs_attention",
      );
      process.kill(
        Number(readFileSync(pidFile, "utf8").trim().split("\n")[0]),
        0,
      );
      await assert.rejects(
        serviceRequest(connection!, `/runs/${run.id}/resolve`, "POST", {
          note: "Inspected files",
        }),
        /process reconciliation/,
      );
      await assert.rejects(
        serviceRequest(
          connection!,
          "/runs",
          "POST",
          { workspaceId: workspace.id, task: "replacement" },
          "second",
        ),
        /uncertain work/,
      );
      assert.equal(
        ((await serviceRequest(connection!, `/runs/${run.id}`)) as RunView)
          .status,
        "needs_attention",
      );
    } finally {
      if (existsSync(pidFile)) {
        for (const pid of readFileSync(pidFile, "utf8")
          .trim()
          .split("\n")
          .map(Number)) {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            /* fixture already stopped */
          }
        }
      }
      if (service && service.exitCode === null && service.signalCode === null) {
        const gone = once(service, "exit");
        service.kill("SIGTERM");
        await gone;
      }
      rmSync(root, { recursive: true, force: true });
    }
  },
);
