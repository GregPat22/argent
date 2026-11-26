import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { LocalWorkspace, ScriptedAgent } from "../adapters.js";
import { recoveryOwner } from "../local-agent-recovery.js";
import { ClaudeCodeAgent } from "../claude-code.js";
import { LocalWorktreeWorkspace } from "../local-worktree.js";
import { dataPaths } from "../config.js";
import { LocalPublications } from "../local-publication.js";
import { GitHubPublisher } from "../github-publisher.js";
import { makeServer } from "../http.js";
import { Store } from "../store.js";
import { Worker } from "../worker.js";
import { LocalCheckWorker } from "../local-check-worker.js";
import { runWorkers } from "../worker-pool.js";
import { DatabaseSync } from "node:sqlite";
import type { ServiceConnection } from "./service-client.js";
import { buildIdentity } from "./build-identity.js";

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
  const owner = await recoveryOwner(instanceId);
  const store = new Store(paths.database);
  const shutdown = new AbortController();
  const token = randomBytes(32).toString("hex");
  const worktreeRoot = join(directory, "worktrees");
  const publisher = new LocalPublications(
    new GitHubPublisher(),
    shutdown.signal,
  );
  const server = makeServer(store, token, {
    artifactRoot: paths.workspaces,
    worktreeRoot,
    // This private single-user store retains the same actor across token rotation.
    localCommandOperatorId: "local-desktop",
    localChecks: true,
    publisher,
    recoveryOwner: owner,
    instanceId,
    build: buildIdentity(),
    onStop: () => shutdown.abort(),
  });
  const worker = new Worker(
    store,
    new LocalWorkspace(paths.workspaces),
    new ScriptedAgent(1200),
    5000,
    {
      workspace: new LocalWorktreeWorkspace(store, worktreeRoot),
      agent: new ClaudeCodeAgent(store, { recoveryOwner: owner }),
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
    const checks = new LocalCheckWorker(store, {
      worktreeRoot,
      verificationRoot: join(directory, "verification"),
    });
    await runWorkers(
      {
        tick: async (signal) =>
          (await checks.tick(signal)) || worker.tick(signal),
      },
      shutdown.signal,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await publisher.drain();
    store.close();
  }
} finally {
  removeOwned(recordPath);
  ownership.exec("ROLLBACK");
  ownership.close();
}
