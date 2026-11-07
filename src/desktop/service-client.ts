import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { DomainError } from "../domain.js";

export interface ServiceConnection {
  version: 1;
  port: number;
  token: string;
  instanceId: string;
  pid: number;
}

export function readConnection(directory: string): ServiceConnection | null {
  try {
    const value = JSON.parse(
      readFileSync(join(directory, "service.json"), "utf8"),
    ) as Partial<ServiceConnection>;
    if (
      value.version !== 1 ||
      !Number.isInteger(value.port) ||
      value.port! < 1 ||
      value.port! > 65535 ||
      typeof value.token !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.token) ||
      typeof value.instanceId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(value.instanceId) ||
      !Number.isInteger(value.pid) ||
      value.pid! < 1
    )
      return null;
    return value as ServiceConnection;
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT" ||
      error instanceof SyntaxError
    )
      return null;
    throw error;
  }
}

export async function serviceRequest(
  connection: ServiceConnection,
  route: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${connection.token}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (key) headers["Idempotency-Key"] = key;
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${connection.port}${route}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(7000),
      redirect: "error",
    });
  } catch {
    throw new DomainError(
      503,
      "The local execution service is disconnected. Reconnect to continue.",
    );
  }
  const value = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new DomainError(
      response.status,
      typeof value.error === "string" ? value.error : "Service request failed",
    );
  return value;
}

export async function isServiceAlive(
  connection: ServiceConnection,
): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${connection.port}/health`, {
      headers: { Authorization: `Bearer ${connection.token}` },
      signal: AbortSignal.timeout(700),
      redirect: "error",
    });
    if (!response.ok) return false;
    const health = (await response.json()) as { instanceId?: unknown };
    return health.instanceId === connection.instanceId;
  } catch {
    return false;
  }
}

function pick(names: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of names) {
    const value = process.env[name];
    if (value) result[name] = value;
  }
  return result;
}

export async function ensureService(
  directory: string,
): Promise<ServiceConnection> {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const current = readConnection(directory);
  if (current && (await isServiceAlive(current))) return current;
  const script = fileURLToPath(new URL("./service-main.js", import.meta.url));
  // The bundled Electron executable supplies Node; no global Node installation is required.
  const child = spawn(process.execPath, [script], {
    detached: true,
    stdio: "ignore",
    env: {
      PATH: process.env.PATH ?? "",
      // The service passes these on to local agents through its own allowlist
      // (src/claude-code.ts); provider credentials are never forwarded.
      ...pick([
        "HOME",
        "TMPDIR",
        "USER",
        "LOGNAME",
        "SHELL",
        "LANG",
        "LC_ALL",
        "LC_CTYPE",
        "TERM",
        "CLAUDE_CONFIG_DIR",
        "ARGENT_CLAUDE_PATH",
      ]),
      ELECTRON_RUN_AS_NODE: "1",
      PLATFORM_DATA_DIR: directory,
    },
  });
  let startupError: Error | null = null;
  child.once("error", (error) => {
    startupError = error;
  });
  child.unref();
  const until = Date.now() + 12000;
  while (Date.now() < until) {
    if (startupError)
      throw new Error("Could not launch the local execution service");
    const connection = readConnection(directory);
    if (connection && (await isServiceAlive(connection))) return connection;
    await delay(100);
  }
  throw new Error(
    "The local service did not start. Another service may hold its data directory.",
  );
}
