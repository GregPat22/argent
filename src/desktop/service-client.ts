import { spawn, type ChildProcess } from "node:child_process";
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
  timeoutMs = 7000,
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
      signal: AbortSignal.timeout(timeoutMs),
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

// Keep ownership of the actual launch handle until it is either the selected
// daemon or confirmed exited. A connection record never authorizes a signal.
function ownStartup(child: ChildProcess) {
  let exited = false;
  let startupError: Error | null = null;
  let resolveExit!: () => void;
  const exit = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });
  child.once("exit", () => {
    exited = true;
    resolveExit();
  });
  child.on("error", (error) => {
    startupError = error;
    // Failed spawn has no process to reap. A later signaling error does not
    // establish that a successfully spawned process has terminated.
    if (child.pid === undefined) {
      exited = true;
      resolveExit();
    }
  });
  async function waitForExit(milliseconds: number): Promise<void> {
    if (exited) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        exit,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, milliseconds);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  let disposal: Promise<void> | undefined;
  return {
    get exited() {
      return exited;
    },
    get error() {
      return startupError;
    },
    dispose(): Promise<void> {
      return (disposal ??= (async () => {
        for (const signal of ["SIGTERM", "SIGKILL"] as const) {
          if (exited) return;
          try {
            child.kill(signal);
          } catch {
            // Only the observed exit confirms cleanup, including signal errors.
          }
          // Allow the service to finish agent termination (three-second grace
          // plus two-second confirmation) before escalating the leader.
          await waitForExit(signal === "SIGTERM" ? 6000 : 2000);
        }
        if (!exited)
          throw new Error(
            "Local service startup cleanup could not be confirmed",
          );
      })());
    },
  };
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
  const startup = ownStartup(child);
  let transferred = false;
  try {
    const until = Date.now() + 12000;
    while (Date.now() < until) {
      if (startup.error)
        throw new Error("Could not launch the local execution service");
      const connection = readConnection(directory);
      if (connection && (await isServiceAlive(connection))) {
        if (connection.pid === child.pid && !startup.exited) {
          transferred = true;
          child.unref();
          return connection;
        }
        // A concurrent launcher won. Dispose our own contender even if it has
        // not reached SQLite yet, then ensure the selected owner is still live.
        await startup.dispose();
        if (await isServiceAlive(connection)) return connection;
        throw new Error("The local service stopped during startup");
      }
      await delay(100);
    }
    throw new Error(
      "The local service did not start. Another service may hold its data directory.",
    );
  } finally {
    if (!transferred) await startup.dispose();
  }
}
