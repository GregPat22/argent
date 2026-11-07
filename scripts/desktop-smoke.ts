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
git("add", "README.md");
git("commit", "--quiet", "-m", "initial");
const claude = join(directory, "claude");
writeFileSync(
  claude,
  `#!${process.execPath}
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
const screenshot = resolve(".context/argent-desktop.png");
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
  ARGENT_SCREENSHOT_PATH: screenshot,
  ARGENT_DESKTOP_SMOKE_REPOSITORY: repository,
  ARGENT_CLAUDE_PATH: claude,
};
delete environment.ELECTRON_RUN_AS_NODE;
try {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let errors = "";
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Desktop smoke timeout\n${errors}\n${output}`));
    }, 75000);
    child.stderr.on("data", (chunk: Buffer) => {
      errors = (errors + chunk.toString()).slice(-10000);
    });
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      const report = output
        .split("\n")
        .find((line) => line.startsWith("[ARGENT_SMOKE]"));
      if (code !== 0 || !report)
        reject(
          new Error(`Desktop smoke failed (${code})\n${errors}\n${output}`),
        );
      else {
        console.log(report.slice("[ARGENT_SMOKE]".length));
        resolve();
      }
    });
  });
  const surviving = readConnection(join(directory, "execution"));
  if (!surviving || !(await isServiceAlive(surviving)))
    throw new Error(
      "The execution service did not survive desktop process exit",
    );
  console.log(JSON.stringify({ serviceAliveAfterDesktopExit: true }));
} finally {
  const connection = readConnection(join(directory, "execution"));
  if (connection && (await isServiceAlive(connection)))
    await serviceRequest(connection, "/service/stop", "POST", {});
  const until = Date.now() + 5000;
  while (readConnection(join(directory, "execution")) && Date.now() < until)
    await new Promise((resolve) => setTimeout(resolve, 50));
  rmSync(directory, { recursive: true, force: true });
}
