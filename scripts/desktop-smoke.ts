import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  readConnection,
  isServiceAlive,
  serviceRequest,
} from "../src/desktop/service-client.js";

const directory = mkdtempSync(join(tmpdir(), "argent-native-"));
const screenshot = resolve(".data/screenshots/argent-desktop.png");
mkdirSync(resolve(".data/screenshots"), { recursive: true });
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
    }, 45000);
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
