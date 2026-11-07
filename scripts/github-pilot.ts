import { randomUUID } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { readGitHubPilotConfig, runGitHubPilot } from "../src/github-pilot.js";

export async function main(args: string[]): Promise<void> {
  if (args.length !== 2 || args[0] !== "--config" || !args[1])
    throw new Error("Expected --config /absolute/private/config.json");
  const path = args[1];
  const config = await readGitHubPilotConfig(path);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const receipt = await runGitHubPilot(
      config,
      (prompt) => {
        console.log(
          `Open ${prompt.verificationUri} and enter ${prompt.userCode}.`,
        );
        console.log(
          "Approve only the expected Argent pilot App. Session credentials stay in this process.",
        );
      },
      { signal: controller.signal },
    );
    const id = randomUUID();
    const temporary = join(dirname(path), `.preflight-${id}.tmp`);
    const destination = join(dirname(path), `preflight-${id}.json`);
    await writeFile(temporary, JSON.stringify(receipt, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, destination);
    console.log(JSON.stringify(receipt));
    console.log(`Redacted pilot receipt: ${destination}`);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch(() => {
    console.error(
      "GitHub pilot did not complete. Check the private config, App device-flow setting, consent and network; no credentials were logged.",
    );
    process.exitCode = 1;
  });
}
