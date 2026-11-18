import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  readConnection,
  isServiceAlive,
  serviceRequest,
} from "../src/desktop/service-client.js";

// Keep independent walkthroughs within the same per-process deadline.
for (const suite of ["welcome", "workspace", "commands"] as const)
  await runSuite(suite);

async function runSuite(
  suite: "welcome" | "workspace" | "commands",
): Promise<void> {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "argent-native-")));
  // A throwaway repository and a fake Claude Code CLI for the local-workspace flow.
  const repository = join(directory, "repository");
  mkdirSync(repository);
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Argent Smoke",
        "-c",
        "user.email=smoke@example.invalid",
        ...args,
      ],
      { cwd: repository, stdio: "ignore" },
    );
  git("init", "--quiet", "--initial-branch=main");
  writeFileSync(join(repository, "README.md"), "# smoke\n");
  writeFileSync(join(repository, "delete-me.txt"), "to delete\n");
  // Harmless commands reviewed and executed through the desktop in fresh checkouts.
  writeFileSync(
    join(repository, "argent.json"),
    JSON.stringify({
      version: 1,
      commands: {
        setup: { argv: ["node", "-e", "process.exit(0)"] },
        run: { argv: ["node", "-e", "console.log('run fixture')"] },
        test: {
          argv: [
            "node",
            "-e",
            "process.exit(0)",
            "<img src=x onerror=window.untrustedCommand=true>",
          ],
        },
      },
    }),
  );
  git("add", "README.md", "delete-me.txt", "argent.json");
  git("commit", "--quiet", "-m", "initial");
  const claude = join(directory, "claude");
  writeFileSync(
    claude,
    `#!${process.execPath}
if (process.argv.includes('--version')) { console.log('2.1.259 (Claude Code)'); process.exit(0); }
const fs = require("node:fs");
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  const args = process.argv.slice(2);
  const session = args[args.indexOf("--session-id") + 1 || args.indexOf("--resume") + 1];
  const out = (event) => process.stdout.write(JSON.stringify(event) + "\\n");
  out({ type: "system", subtype: "init", session_id: session, model: "smoke" });
  out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: process.cwd() + "/notes.txt" } }] } });
  fs.writeFileSync("notes.txt", input + "\\n");
  out({ type: "assistant", message: { content: [{ type: "text", text: "Added notes.txt with the requested text." }] } });
  out({ type: "result", subtype: "success", is_error: false, num_turns: 2, duration_ms: 40, result: "done" });
});
`,
  );
  chmodSync(claude, 0o755);
  const screenshot = resolve(`.context/argent-desktop-${suite}.png`);
  mkdirSync(resolve(".context"), { recursive: true });
  const executable =
    process.env.ARGENT_PACKAGED_EXECUTABLE ??
    (createRequire(import.meta.url)("electron") as string);
  const args = process.env.ARGENT_PACKAGED_EXECUTABLE
    ? []
    : [fileURLToPath(new URL("../src/desktop/main.js", import.meta.url))];
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    ARGENT_DESKTOP_DATA_DIR: directory,
    ARGENT_DESKTOP_SMOKE: "1",
    ARGENT_DESKTOP_SMOKE_SUITE: suite,
    ARGENT_SCREENSHOT_PATH: screenshot,
    ARGENT_DESKTOP_SMOKE_REPOSITORY: repository,
    ARGENT_CLAUDE_PATH: claude,
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  let desktopExited = false;
  let failure: unknown;
  let observedService: ReturnType<typeof readConnection> = null;
  try {
    console.log(JSON.stringify({ suite, stage: "starting" }));
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, args, {
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let errors = "";
      let output = "";
      let timedOut = false;
      let exitTimer: ReturnType<typeof setTimeout> | undefined;
      const timeoutError = () =>
        new Error(`Desktop smoke timeout (${suite})\n${errors}\n${output}`);
      const timer = setTimeout(() => {
        timedOut = true;
        // Signalling the owned handle is not proof that the app has exited.
        exitTimer = setTimeout(() => reject(timeoutError()), 5000);
        child.kill("SIGKILL");
      }, 75000);
      child.stderr.on("data", (chunk: Buffer) => {
        errors = (errors + chunk.toString()).slice(-10000);
      });
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.once("error", (error) => {
        if (child.pid === undefined) desktopExited = true;
        clearTimeout(timer);
        clearTimeout(exitTimer);
        reject(error);
      });
      child.once("exit", (code) => {
        desktopExited = true;
        clearTimeout(timer);
        clearTimeout(exitTimer);
        if (timedOut) {
          reject(timeoutError());
          return;
        }
        const report = output
          .split("\n")
          .find((line) => line.startsWith("[ARGENT_SMOKE]"));
        if (code !== 0 || !report)
          reject(
            new Error(
              `Desktop smoke failed (${suite}, ${code})\n${errors}\n${output}`,
            ),
          );
        else {
          try {
            const result = JSON.parse(report.slice("[ARGENT_SMOKE]".length));
            assert.equal(result.passed, true);
            assert.equal(result.suite, suite, "the requested suite completed");
            console.log(JSON.stringify(result));
            resolve();
          } catch (error) {
            reject(error);
          }
        }
      });
    });
    observedService = readConnection(join(directory, "execution"));
    if (!observedService || !(await isServiceAlive(observedService)))
      throw new Error(
        "The execution service did not survive desktop process exit",
      );
    console.log(JSON.stringify({ suite, serviceAliveAfterDesktopExit: true }));
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      const connection =
        readConnection(join(directory, "execution")) ?? observedService;
      // A detached daemon may still be starting when the app fails before its
      // connection record appears. Missing identity cannot prove shutdown.
      if (!connection) throw new Error("Service identity was not observed");
      if (await isServiceAlive(connection))
        await serviceRequest(connection, "/service/stop", "POST", {});
      // Observe the authenticated fixture service's PID, never signal it. If a
      // PID is reused, preserving the fixture is safer than assuming shutdown.
      const serviceRunning = () => {
        try {
          process.kill(connection.pid, 0);
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
          throw error;
        }
      };
      const servicePending = () =>
        readConnection(join(directory, "execution")) !== null ||
        serviceRunning();
      const until = Date.now() + 5000;
      while (servicePending() && Date.now() < until)
        await new Promise((resolve) => setTimeout(resolve, 50));
      if (!desktopExited || servicePending())
        throw new Error("App or service exit was not confirmed");
      rmSync(directory, { recursive: true, force: true });
    } catch (error) {
      throw new Error(
        `Desktop smoke cleanup unconfirmed (${suite}); fixture retained at ${directory}`,
        {
          cause:
            failure === undefined
              ? error
              : new AggregateError([failure, error]),
        },
      );
    }
  }
}
