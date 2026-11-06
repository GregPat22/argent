import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export const DEMO_TOKEN = "local-conformance-test-token-not-for-deployment";

export async function startService(
  role: "api" | "worker",
  dataDir: string,
): Promise<{
  child: ChildProcess;
  url: string;
}> {
  const path = fileURLToPath(
    new URL(
      `../src/${role === "api" ? "api" : "worker-main"}.js`,
      import.meta.url,
    ),
  );
  const child = spawn(process.execPath, [path], {
    env: {
      ...process.env,
      PLATFORM_DATA_DIR: dataDir,
      PLATFORM_API_TOKEN: DEMO_TOKEN,
      PLATFORM_PORT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let errors = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    errors = (errors + chunk.toString()).slice(-8192);
  });
  const ready = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out starting ${role}: ${errors}`));
    }, 10000);
    let output = "";
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${role} exited (${code}): ${errors}`));
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const line = output.split("\n")[0];
      if (!line || !output.includes("\n")) return;
      try {
        const info = JSON.parse(line) as { port?: number };
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${info.port ?? 0}`);
      } catch (error) {
        clearTimeout(timer);
        child.kill();
        reject(error);
      }
    });
  });
  return { child, url: await ready };
}

export async function stopService(
  child: ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
  child.kill(signal);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}

export async function request(
  url: string,
  path: string,
  body?: unknown,
  key?: string,
): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${DEMO_TOKEN}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (key) headers["Idempotency-Key"] = key;
  const response = await fetch(url + path, {
    method: body !== undefined ? "POST" : "GET",
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

export async function waitForStatus(
  url: string,
  runId: string,
  status: string,
): Promise<Record<string, unknown>> {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    const result = await request(url, `/runs/${runId}`);
    if (result.body.status === status) return result.body;
    if (
      ["failed", "cancelled", "needs_attention"].includes(
        String(result.body.status),
      )
    ) {
      throw new Error(
        `Expected ${status}, received ${String(result.body.status)}`,
      );
    }
    await delay(25);
  }
  throw new Error(`Run did not reach ${status}`);
}
