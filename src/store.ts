import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  DomainError,
  requireInteger,
  requireString,
  type Evidence,
  type Run,
  type RunEvent,
  type Workspace,
} from "./domain.js";

type Row = Record<string, unknown>;
const ACTIVE = "('queued', 'running', 'cancelling')";
const MAX_LOG_EVENTS = 100;

function readRun(row: Row): Run {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    task: row.task as string,
    status: row.status as Run["status"],
    simulation: true,
    maxRuntimeMs: row.max_runtime_ms as number,
    createdAt: row.created_at as number,
    deadlineAt: row.deadline_at as number | null,
    leaseToken: row.lease_token as string | null,
    leaseExpiresAt: row.lease_expires_at as number | null,
  };
}

function readWorkspace(row: Row): Workspace {
  return {
    id: row.id as string,
    repository: row.repository as string,
    provider: "local-simulation",
    state: row.state as Workspace["state"],
    createdAt: row.created_at as number,
  };
}

export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY, repository TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('running', 'stopped')), created_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        task TEXT NOT NULL, request_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK(status IN
          ('queued','running','cancelling','completed','failed','cancelled','needs_attention')),
        max_runtime_ms INTEGER NOT NULL, created_at INTEGER NOT NULL,
        deadline_at INTEGER, lease_token TEXT, lease_expires_at INTEGER
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_run ON runs(workspace_id)
        WHERE status IN ${ACTIVE};
      CREATE INDEX IF NOT EXISTS queued_runs ON runs(status, created_at);
      CREATE TABLE IF NOT EXISTS events (
        cursor INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id), type TEXT NOT NULL,
        data TEXT NOT NULL, created_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS run_events ON events(run_id, cursor);
    `);
  }

  close(): void {
    this.db.close();
  }

  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private event(
    runId: string,
    type: string,
    data: Record<string, unknown>,
    now: number,
  ): void {
    this.db
      .prepare(
        "INSERT INTO events (run_id, type, data, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(runId, type, JSON.stringify(data), now);
  }

  createWorkspace(repository: unknown, now = Date.now()): Workspace {
    const url = requireString(repository, "repository", 250);
    if (
      !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url) ||
      url
        .split("/")
        .slice(-2)
        .some((part) => part === "." || part === "..")
    ) {
      throw new DomainError(
        400,
        "repository must be https://github.com/owner/repository without credentials or query",
      );
    }
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO workspaces VALUES (?, ?, ?, ?)")
      .run(id, url, "running", now);
    return this.getWorkspace(id);
  }

  getWorkspace(id: string): Workspace {
    const row = this.db
      .prepare("SELECT * FROM workspaces WHERE id = ?")
      .get(id);
    if (!row) throw new DomainError(404, "Workspace not found");
    return readWorkspace(row);
  }

  setWorkspaceState(id: string, state: Workspace["state"]): Workspace {
    if (state !== "running" && state !== "stopped")
      throw new DomainError(400, "Invalid workspace state");
    return this.transaction(() => {
      this.getWorkspace(id);
      const busy = this.db
        .prepare(
          `SELECT id FROM runs WHERE workspace_id = ? AND
        (status IN ${ACTIVE} OR status = 'needs_attention')`,
        )
        .get(id);
      if (busy)
        throw new DomainError(409, "Workspace has active or uncertain work");
      this.db
        .prepare("UPDATE workspaces SET state = ? WHERE id = ?")
        .run(state, id);
      return this.getWorkspace(id);
    });
  }

  createRun(
    workspaceId: string,
    task: unknown,
    key: unknown,
    maxRuntimeMs: unknown = 30000,
    at?: number,
  ): Run {
    const text = requireString(task, "task");
    const requestKey = requireString(key, "Idempotency-Key", 128);
    const runtime = requireInteger(maxRuntimeMs, "maxRuntimeMs", 100, 300000);
    return this.transaction(() => {
      const now = at ?? Date.now();
      const previous = this.db
        .prepare("SELECT * FROM runs WHERE request_key = ?")
        .get(requestKey);
      if (previous) {
        const run = readRun(previous);
        if (
          run.workspaceId !== workspaceId ||
          run.task !== text ||
          run.maxRuntimeMs !== runtime
        ) {
          throw new DomainError(
            409,
            "Idempotency key already used with a different payload",
          );
        }
        return run;
      }
      if (this.getWorkspace(workspaceId).state !== "running")
        throw new DomainError(409, "Workspace is stopped");
      if (
        this.db
          .prepare(
            `SELECT id FROM runs WHERE workspace_id = ? AND
        (status IN ${ACTIVE} OR status = 'needs_attention')`,
          )
          .get(workspaceId)
      ) {
        throw new DomainError(409, "Workspace has active or uncertain work");
      }
      const id = randomUUID();
      this.db
        .prepare(
          `INSERT INTO runs
        (id, workspace_id, task, request_key, status, max_runtime_ms, created_at)
        VALUES (?, ?, ?, ?, 'queued', ?, ?)`,
        )
        .run(id, workspaceId, text, requestKey, runtime, now);
      this.event(id, "run.queued", { simulation: true }, now);
      return this.getRun(id);
    });
  }

  getRun(id: string): Run {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
    if (!row) throw new DomainError(404, "Run not found");
    return readRun(row);
  }

  events(id: string, after = 0, limit = 100): RunEvent[] {
    this.getRun(id);
    requireInteger(after, "after", 0, Number.MAX_SAFE_INTEGER);
    requireInteger(limit, "limit", 1, 100);
    return this.db
      .prepare(
        "SELECT * FROM events WHERE run_id = ? AND cursor > ? ORDER BY cursor LIMIT ?",
      )
      .all(id, after, limit)
      .map((row) => ({
        cursor: row.cursor as number,
        runId: row.run_id as string,
        type: row.type as string,
        data: JSON.parse(row.data as string) as Record<string, unknown>,
        createdAt: row.created_at as number,
      }));
  }

  claim(leaseMs: number, at?: number): Run | null {
    requireInteger(leaseMs, "leaseMs", 100, 60000);
    return this.transaction(() => {
      const now = at ?? Date.now();
      const row = this.db
        .prepare(
          `SELECT r.* FROM runs r JOIN workspaces w ON w.id = r.workspace_id
        WHERE r.status = 'queued' AND w.state = 'running' ORDER BY r.created_at, r.id LIMIT 1`,
        )
        .get();
      if (!row) return null;
      const run = readRun(row);
      this.db
        .prepare(
          `UPDATE runs SET status = 'running', lease_token = ?, lease_expires_at = ?,
        deadline_at = ? WHERE id = ?`,
        )
        .run(randomUUID(), now + leaseMs, now + run.maxRuntimeMs, run.id);
      this.event(run.id, "run.started", { simulation: true }, now);
      return this.getRun(run.id);
    });
  }

  private owned(id: string, token: string, now: number): Run {
    const run = this.getRun(id);
    if (
      !["running", "cancelling"].includes(run.status) ||
      run.leaseToken !== token ||
      run.leaseExpiresAt === null ||
      run.leaseExpiresAt <= now
    ) {
      throw new DomainError(409, "Worker lease lost; reconciliation required");
    }
    return run;
  }

  heartbeat(id: string, token: string, leaseMs: number, at?: number): Run {
    requireInteger(leaseMs, "leaseMs", 100, 60000);
    return this.transaction(() => {
      // Read the clock after acquiring the lock: contention may outlast the lease.
      const now = at ?? Date.now();
      this.owned(id, token, now);
      this.db
        .prepare("UPDATE runs SET lease_expires_at = ? WHERE id = ?")
        .run(now + leaseMs, id);
      return this.getRun(id);
    });
  }

  appendLog(id: string, token: string, message: string, at?: number): void {
    requireString(message, "message", 2048);
    this.transaction(() => {
      const now = at ?? Date.now();
      const run = this.owned(id, token, now);
      if (run.status !== "running" || (run.deadlineAt ?? 0) <= now) {
        throw new DomainError(409, "Run is stopping");
      }
      const row = this.db
        .prepare(
          "SELECT COUNT(*) AS total FROM events WHERE run_id = ? AND type = 'agent.log'",
        )
        .get(id)!;
      if ((row.total as number) >= MAX_LOG_EVENTS)
        throw new DomainError(409, "Run log limit exceeded");
      this.event(id, "agent.log", { message, simulation: true }, now);
    });
  }

  cancel(id: string, at?: number): Run {
    return this.transaction(() => {
      const now = at ?? Date.now();
      const run = this.getRun(id);
      if (run.status === "queued" || run.status === "running") {
        const state = run.status === "queued" ? "cancelled" : "cancelling";
        this.db
          .prepare("UPDATE runs SET status = ? WHERE id = ?")
          .run(state, id);
        this.event(id, `run.${state}`, {}, now);
      }
      return this.getRun(id);
    });
  }

  finish(
    id: string,
    token: string,
    status: "completed" | "failed" | "cancelled" | "needs_attention",
    detail: Record<string, unknown>,
    evidence?: Evidence,
    at?: number,
  ): Run {
    return this.transaction(() => {
      const now = at ?? Date.now();
      const run = this.owned(id, token, now);
      if (status === "completed") {
        if (
          run.status !== "running" ||
          (run.deadlineAt ?? 0) <= now ||
          !evidence ||
          evidence.kind !== "simulation-artifact-check" ||
          evidence.passed !== true ||
          evidence.simulation !== true ||
          !/^[a-f0-9]{64}$/.test(evidence.sha256)
        ) {
          throw new DomainError(
            409,
            "Completion requires a live run and independent simulation evidence",
          );
        }
        this.event(id, "verification.recorded", { ...evidence }, now);
      }
      this.db
        .prepare(
          `UPDATE runs SET status = ?, lease_token = NULL, lease_expires_at = NULL WHERE id = ?`,
        )
        .run(status, id);
      this.event(id, `run.${status}`, { ...detail, simulation: true }, now);
      return this.getRun(id);
    });
  }

  reconcile(at?: number): number {
    return this.transaction(() => {
      const now = at ?? Date.now();
      const rows = this.db
        .prepare(
          `SELECT id FROM runs WHERE status IN ('running','cancelling')
        AND lease_expires_at <= ?`,
        )
        .all(now);
      for (const row of rows) {
        this.db
          .prepare(
            `UPDATE runs SET status = 'needs_attention', lease_token = NULL,
          lease_expires_at = NULL WHERE id = ?`,
          )
          .run(row.id as string);
        this.event(
          row.id as string,
          "run.needs_attention",
          { reason: "worker_lease_expired", replayed: false },
          now,
        );
      }
      return rows.length;
    });
  }
}
