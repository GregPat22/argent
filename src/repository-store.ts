import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { DomainError, requireInteger, requireString } from "./domain.js";
import { fullSha } from "./repository-access.js";

export interface RepositoryOperation {
  id: string;
  workspaceId: string;
  operatorId: string;
  repository: string;
  ref: string;
  providerId: string;
  repositoryId: number | null;
  installationId: number | null;
  headSha: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "needs_attention";
  phase: "authorizing" | "minting" | "resolving" | "checkout" | "cleaning";
  credential: "none" | "unknown" | "issued" | "revoked";
  channel: "none" | "unknown" | "cleared";
  tokenExpiresAt: number | null;
  maxRuntimeMs: number;
  leaseToken: string | null;
  leaseExpiresAt: number | null;
  deadlineAt: number | null;
  simulation: true;
}

function operation(row: Record<string, unknown>): RepositoryOperation {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    operatorId: row.operator_id as string,
    repository: row.repository as string,
    ref: row.ref as string,
    providerId: row.provider_id as string,
    repositoryId: row.repository_id as number | null,
    installationId: row.installation_id as number | null,
    headSha: row.head_sha as string | null,
    status: row.status as RepositoryOperation["status"],
    phase: row.phase as RepositoryOperation["phase"],
    credential: row.credential as RepositoryOperation["credential"],
    channel: row.channel as RepositoryOperation["channel"],
    tokenExpiresAt: row.token_expires_at as number | null,
    maxRuntimeMs: row.max_runtime_ms as number,
    leaseToken: row.lease_token as string | null,
    leaseExpiresAt: row.lease_expires_at as number | null,
    deadlineAt: row.deadline_at as number | null,
    simulation: true,
  };
}

export class RepositoryStore {
  constructor(private readonly db: DatabaseSync) {
    this.transaction(() => {
      // The first schema allowed one attempt per workspace and had no failed
      // status. Only simulation tests write these rows, so rebuild it when empty.
      const existing = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'repository_operations'",
        )
        .get();
      if (existing && !(existing.sql as string).includes("'failed'")) {
        if (db.prepare("SELECT 1 FROM repository_operations LIMIT 1").get())
          throw new Error("Repository operations need a manual migration");
        db.exec(
          "DROP TABLE IF EXISTS repository_events; DROP TABLE repository_operations;",
        );
      }
      db.exec(`
      CREATE TABLE IF NOT EXISTS repository_operations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES lifecycle_workspaces(workspace_id),
        operator_id TEXT NOT NULL, repository TEXT NOT NULL, ref TEXT NOT NULL,
        provider_id TEXT NOT NULL, repository_id INTEGER, installation_id INTEGER,
        head_sha TEXT, request_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed','needs_attention')),
        phase TEXT NOT NULL CHECK(phase IN ('authorizing','minting','resolving','checkout','cleaning')),
        credential TEXT NOT NULL CHECK(credential IN ('none','unknown','issued','revoked')),
        channel TEXT NOT NULL CHECK(channel IN ('none','unknown','cleared')),
        token_expires_at INTEGER, max_runtime_ms INTEGER NOT NULL,
        created_at INTEGER NOT NULL, lease_token TEXT, lease_expires_at INTEGER, deadline_at INTEGER
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS one_repository_bootstrap
        ON repository_operations(workspace_id) WHERE status != 'failed';
      CREATE TABLE IF NOT EXISTS repository_events (
        cursor INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id TEXT NOT NULL REFERENCES repository_operations(id),
        type TEXT NOT NULL, created_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS repository_event_cursor ON repository_events(operation_id, cursor);
    `);
    });
  }

  private transaction<T>(work: (now: number) => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work(Date.now());
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private event(id: string, type: string, now: number): void {
    this.db
      .prepare(
        "INSERT INTO repository_events (operation_id,type,created_at) VALUES (?,?,?)",
      )
      .run(id, type, now);
  }

  operation(id: string): RepositoryOperation {
    const row = this.db
      .prepare("SELECT * FROM repository_operations WHERE id = ?")
      .get(id);
    if (!row) throw new DomainError(404, "Repository operation not found");
    return operation(row);
  }

  events(id: string, after = 0) {
    this.operation(id);
    requireInteger(after, "after", 0, Number.MAX_SAFE_INTEGER);
    return this.db
      .prepare(
        "SELECT cursor,type,created_at FROM repository_events WHERE operation_id = ? AND cursor > ? ORDER BY cursor LIMIT 100",
      )
      .all(id, after)
      .map((row) => ({
        cursor: row.cursor as number,
        type: row.type as string,
        createdAt: row.created_at as number,
        simulation: true as const,
      }));
  }

  // operatorId comes from a trusted authenticated caller, never request JSON.
  request(
    workspaceId: string,
    operatorId: string,
    ref: unknown,
    key: unknown,
    maxRuntimeMs: unknown = 30000,
  ): RepositoryOperation {
    requireString(operatorId, "operatorId", 128);
    const allowedRef = requireString(ref, "ref", 250);
    // Dots are allowed where Git allows them: not leading, doubled or ".lock".
    if (
      !/^refs\/heads\/[A-Za-z0-9_-][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/.test(
        allowedRef,
      ) ||
      /\.\.|\.(?:\/|$)|\.lock(?:\/|$)/.test(allowedRef)
    )
      throw new DomainError(400, "Expected an explicit branch ref");
    const requestKey = requireString(key, "Idempotency-Key", 128);
    const runtime = requireInteger(maxRuntimeMs, "maxRuntimeMs", 100, 300000);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([workspaceId, operatorId, allowedRef, runtime]))
      .digest("hex");
    return this.transaction((now) => {
      const previous = this.db
        .prepare("SELECT * FROM repository_operations WHERE request_key = ?")
        .get(requestKey);
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new DomainError(
            409,
            "Idempotency key already used with a different payload",
          );
        return operation(previous);
      }
      const workspace = this.db
        .prepare(
          `SELECT w.repository,l.provider_id,l.state FROM workspaces w
        JOIN lifecycle_workspaces l ON w.id = l.workspace_id WHERE w.id = ?`,
        )
        .get(workspaceId);
      if (!workspace || workspace.state !== "ready" || !workspace.provider_id)
        throw new DomainError(
          409,
          "Repository bootstrap requires a ready lifecycle workspace",
        );
      if (
        this.db
          .prepare(
            "SELECT id FROM lifecycle_operations WHERE workspace_id = ? AND status != 'succeeded'",
          )
          .get(workspaceId) ||
        this.db
          .prepare(
            "SELECT id FROM repository_operations WHERE workspace_id = ? AND status != 'failed'",
          )
          .get(workspaceId)
      )
        throw new DomainError(
          409,
          "Workspace already has repository or lifecycle work",
        );
      const id = randomUUID();
      this.db
        .prepare(
          `INSERT INTO repository_operations
        (id,workspace_id,operator_id,repository,ref,provider_id,request_key,fingerprint,
        status,phase,credential,channel,max_runtime_ms,created_at)
        VALUES (?,?,?,?,?,?,?,?,'queued','authorizing','none','none',?,?)`,
        )
        .run(
          id,
          workspaceId,
          operatorId,
          workspace.repository as string,
          allowedRef,
          workspace.provider_id as string,
          requestKey,
          fingerprint,
          runtime,
          now,
        );
      this.event(id, "repository.requested", now);
      return this.operation(id);
    });
  }

  claim(leaseMs: number): RepositoryOperation | null {
    requireInteger(leaseMs, "leaseMs", 100, 60000);
    return this.transaction((now) => {
      const row = this.db
        .prepare(
          "SELECT * FROM repository_operations WHERE status = 'queued' ORDER BY created_at,id LIMIT 1",
        )
        .get();
      if (!row) return null;
      const op = operation(row);
      const deadline = now + op.maxRuntimeMs;
      this.db
        .prepare(
          "UPDATE repository_operations SET status = 'running',lease_token = ?,lease_expires_at = ?,deadline_at = ? WHERE id = ?",
        )
        .run(randomUUID(), Math.min(now + leaseMs, deadline), deadline, op.id);
      this.event(op.id, "repository.claimed", now);
      return this.operation(op.id);
    });
  }

  private owned(id: string, token: string, now: number): RepositoryOperation {
    const op = this.operation(id);
    if (
      op.status !== "running" ||
      op.leaseToken !== token ||
      (op.leaseExpiresAt ?? 0) <= now ||
      (op.deadlineAt ?? 0) <= now
    )
      throw new DomainError(409, "Repository worker ownership lost");
    return op;
  }

  heartbeat(id: string, token: string, leaseMs: number): void {
    requireInteger(leaseMs, "leaseMs", 100, 60000);
    this.transaction((now) => {
      const op = this.owned(id, token, now);
      this.db
        .prepare(
          "UPDATE repository_operations SET lease_expires_at = ? WHERE id = ?",
        )
        .run(Math.min(now + leaseMs, op.deadlineAt!), id);
    });
  }

  private step(
    id: string,
    token: string,
    phase: RepositoryOperation["phase"],
    type: string,
    work: () => void,
  ): void {
    this.transaction((now) => {
      if (this.owned(id, token, now).phase !== phase)
        throw new DomainError(409, "Invalid repository transition");
      work();
      this.event(id, type, now);
    });
  }

  authorize(
    id: string,
    token: string,
    repositoryId: number,
    installationId: number,
  ): void {
    requireInteger(repositoryId, "repositoryId", 1, Number.MAX_SAFE_INTEGER);
    requireInteger(
      installationId,
      "installationId",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    this.step(id, token, "authorizing", "repository.mint_intent", () => {
      this.db
        .prepare(
          "UPDATE repository_operations SET repository_id = ?,installation_id = ?,phase = 'minting',credential = 'unknown' WHERE id = ?",
        )
        .run(repositoryId, installationId, id);
    });
  }

  minted(id: string, token: string, expiresAt: number): void {
    requireInteger(expiresAt, "expiresAt", 1, Number.MAX_SAFE_INTEGER);
    this.step(id, token, "minting", "repository.token_accepted", () => {
      this.db
        .prepare(
          "UPDATE repository_operations SET phase = 'resolving',credential = 'issued',token_expires_at = ? WHERE id = ?",
        )
        .run(expiresAt, id);
    });
  }

  checkout(id: string, token: string, sha: string): void {
    fullSha(sha);
    this.step(id, token, "resolving", "repository.checkout_intent", () => {
      this.db
        .prepare(
          "UPDATE repository_operations SET phase = 'checkout',head_sha = ?,channel = 'unknown' WHERE id = ?",
        )
        .run(sha, id);
    });
  }

  verified(id: string, token: string): void {
    this.step(id, token, "checkout", "repository.checkout_verified", () => {
      this.db
        .prepare(
          "UPDATE repository_operations SET phase = 'cleaning' WHERE id = ?",
        )
        .run(id);
    });
  }

  cleanup(id: string, token: string, kind: "credential" | "channel"): void {
    this.transaction((now) => {
      const op = this.owned(id, token, now);
      if (kind === "credential") {
        if (op.credential !== "unknown" && op.credential !== "issued")
          throw new DomainError(409, "Token cleanup is not pending");
        this.db
          .prepare(
            "UPDATE repository_operations SET credential = 'revoked' WHERE id = ?",
          )
          .run(id);
        this.event(id, "repository.token_revoked", now);
      } else if (kind === "channel") {
        if (op.channel !== "unknown")
          throw new DomainError(409, "Channel cleanup is not pending");
        this.db
          .prepare(
            "UPDATE repository_operations SET channel = 'cleared' WHERE id = ?",
          )
          .run(id);
        this.event(id, "repository.channel_cleared", now);
      } else throw new DomainError(400, "Invalid cleanup kind");
    });
  }

  complete(id: string, token: string): void {
    this.step(id, token, "cleaning", "repository.succeeded", () => {
      const op = this.operation(id);
      if (op.credential !== "revoked" || op.channel !== "cleared")
        throw new DomainError(
          409,
          "Repository credential cleanup is incomplete",
        );
      this.db
        .prepare(
          "UPDATE repository_operations SET status = 'succeeded',lease_token = NULL,lease_expires_at = NULL WHERE id = ?",
        )
        .run(id);
    });
  }

  // Only valid before mint intent: no token or channel can exist, so a new
  // request may retry instead of blocking the workspace.
  fail(id: string, token: string): void {
    this.transaction((now) => {
      const op = this.operation(id);
      if (op.status !== "running" || op.leaseToken !== token)
        throw new DomainError(409, "Repository worker ownership lost");
      if (op.phase !== "authorizing" || op.credential !== "none")
        throw new DomainError(409, "Repository work passed mint intent");
      this.failed(id, now);
    });
  }

  private failed(id: string, now: number): void {
    this.db
      .prepare(
        "UPDATE repository_operations SET status = 'failed',lease_token = NULL,lease_expires_at = NULL WHERE id = ?",
      )
      .run(id);
    this.event(id, "repository.failed", now);
  }

  markUncertain(id: string, token: string): void {
    this.transaction((now) => {
      const op = this.operation(id);
      if (op.status !== "running" || op.leaseToken !== token)
        throw new DomainError(409, "Repository worker ownership lost");
      this.uncertain(id, now);
    });
  }

  private uncertain(id: string, now: number): void {
    this.db
      .prepare(
        "UPDATE repository_operations SET status = 'needs_attention',lease_token = NULL,lease_expires_at = NULL WHERE id = ?",
      )
      .run(id);
    this.event(id, "repository.needs_attention", now);
  }

  reconcileExpired(): number {
    return this.transaction((now) => {
      const rows = this.db
        .prepare(
          "SELECT id,phase,credential FROM repository_operations WHERE status = 'running' AND (lease_expires_at <= ? OR deadline_at <= ?)",
        )
        .all(now, now);
      for (const row of rows)
        if (row.phase === "authorizing" && row.credential === "none")
          this.failed(row.id as string, now);
        else this.uncertain(row.id as string, now);
      return rows.length;
    });
  }
}
