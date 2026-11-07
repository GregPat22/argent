import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { LocalWorkspace, ScriptedAgent } from "../adapters.js";
import { ClaudeCodeAgent } from "../claude-code.js";
import { LocalWorktreeWorkspace } from "../local-worktree.js";
import { dataPaths } from "../config.js";
import { makeServer } from "../http.js";
import { Store } from "../store.js";
import { Worker } from "../worker.js";
import { DatabaseSync } from "node:sqlite";
import type { ServiceConnection } from "./service-client.js";

const paths = dataPaths();
const directory = dirname(paths.database);
const instanceId = randomUUID();
const recordPath = join(directory, "service.json");

// An OS-backed database lock releases on process death, independently of PID reuse.
const ownership = new DatabaseSync(join(directory, "service-owner.sqlite"));
try {
  ownership.exec("PRAGMA busy_timeout = 1000; BEGIN EXCLUSIVE");
} catch (error) {
  ownership.close();
  throw error;
}

function removeOwned(path: string): void {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as {
      instanceId?: string;
    };
    if (value.instanceId === instanceId) unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

try {
  const store = new Store(paths.database);
  const shutdown = new AbortController();
  const token = randomBytes(32).toString("hex");
  const worktreeRoot = join(directory, "worktrees");
  const server = makeServer(store, token, {
    artifactRoot: paths.workspaces,
    worktreeRoot,
    instanceId,
    onStop: () => shutdown.abort(),
  });
  const worker = new Worker(
    store,
    new LocalWorkspace(paths.workspaces),
    new ScriptedAgent(1200),
    5000,
    {
      workspace: new LocalWorktreeWorkspace(store, worktreeRoot),
      agent: new ClaudeCodeAgent(store),
    },
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => shutdown.abort());
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Invalid local service address");
    const record: ServiceConnection = {
      version: 1,
      port: address.port,
      token,
      instanceId,
      pid: process.pid,
    };
    const temp = join(directory, `service-${instanceId}.tmp`);
    writeFileSync(temp, JSON.stringify(record), { mode: 0o600, flag: "wx" });
    renameSync(temp, recordPath);
    while (!shutdown.signal.aborted) {
      const worked = await worker.tick(shutdown.signal);
      if (!worked && !shutdown.signal.aborted) await delay(100);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
} finally {
  removeOwned(recordPath);
  ownership.exec("ROLLBACK");
  ownership.close();
}
