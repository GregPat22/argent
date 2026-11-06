import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { DomainError, requireInteger, requireString } from "./domain.js";
import type {
  LifecycleEvent,
  LifecycleKind,
  LifecycleObservation,
  LifecycleOperation,
  LifecycleState,
  LifecycleWorkspace,
} from "./lifecycle.js";

type Row = Record<string, unknown>;
const initialState: Record<LifecycleKind, LifecycleState> = {
  create: "provisioning",
  pause: "quiescing",
  resume: "resuming",
  delete: "deleting",
};
const targetState: Record<LifecycleKind, LifecycleState> = {
  create: "ready",
  pause: "paused",
  resume: "ready",
  delete: "deleted",
};

function isObservation(value: unknown): value is LifecycleObservation {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Record<string, unknown>;
  return (
    data.state === "unknown" ||
    (["ready", "paused", "missing"].includes(data.state as string) &&
      typeof data.providerId === "string" &&
      /^[A-Za-z0-9_-]{1,128}$/.test(data.providerId))
  );
}

function readOperation(row: Row): LifecycleOperation {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    kind: row.kind as LifecycleKind,
    previousState: row.previous_state as LifecycleState | null,
    status: row.status as LifecycleOperation["status"],
    maxRuntimeMs: row.max_runtime_ms as number,
    createdAt: row.created_at as number,
    deadlineAt: row.deadline_at as number | null,
    leaseToken: row.lease_token as string | null,
    leaseExpiresAt: row.lease_expires_at as number | null,
    dispatchedAt: row.dispatched_at as number | null,
    quiescedAt: row.quiesced_at as number | null,
    simulation: true,
  };
}

export class LifecycleStore {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS lifecycle_workspaces (
        workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
        state TEXT NOT NULL CHECK(state IN ('provisioning','ready','quiescing',
          'pausing','paused','resuming','needs_attention','deleting','deleted')),
        provider_id TEXT UNIQUE, revision INTEGER NOT NULL DEFAULT 0
      ) STRICT;
      CREATE TABLE IF NOT EXISTS lifecycle_operations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES lifecycle_workspaces(workspace_id),
        kind TEXT NOT NULL CHECK(kind IN ('create','pause','resume','delete')),
        previous_state TEXT,
        status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','needs_attention')),
        request_key TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
        max_runtime_ms INTEGER NOT NULL, created_at INTEGER NOT NULL,
        deadline_at INTEGER, lease_token TEXT, lease_expires_at INTEGER,
        dispatched_at INTEGER, quiesced_at INTEGER
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS one_lifecycle_operation
        ON lifecycle_operations(workspace_id) WHERE status != 'succeeded';
      CREATE INDEX IF NOT EXISTS lifecycle_queue ON lifecycle_operations(status, created_at, id);
      CREATE TABLE IF NOT EXISTS lifecycle_events (
        cursor INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id TEXT NOT NULL REFERENCES lifecycle_operations(id),
        type TEXT NOT NULL, state TEXT NOT NULL, reason TEXT, created_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS lifecycle_event_cursor ON lifecycle_events(operation_id, cursor);
    `);
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
    id: string,
    type: string,
    now: number,
    reason: string | null = null,
  ): void {
    const op = this.operation(id);
    this.db
      .prepare(
        `INSERT INTO lifecycle_events
      (operation_id, type, state, reason, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, type, this.workspace(op.workspaceId).state, reason, now);
  }

  private transition(workspaceId: string, state: LifecycleState): void {
    this.db
      .prepare(
        `UPDATE lifecycle_workspaces SET state = ?, revision = revision + 1
      WHERE workspace_id = ?`,
      )
      .run(state, workspaceId);
  }

  workspace(workspaceId: string): LifecycleWorkspace {
    const row = this.db
      .prepare("SELECT * FROM lifecycle_workspaces WHERE workspace_id = ?")
      .get(workspaceId);
    if (!row) throw new DomainError(404, "Lifecycle workspace not found");
    return {
      workspaceId: row.workspace_id as string,
      state: row.state as LifecycleState,
      providerId: row.provider_id as string | null,
      revision: row.revision as number,
      simulation: true,
    };
  }

  operation(id: string): LifecycleOperation {
    const row = this.db
      .prepare("SELECT * FROM lifecycle_operations WHERE id = ?")
      .get(id);
    if (!row) throw new DomainError(404, "Lifecycle operation not found");
    return readOperation(row);
  }

  events(id: string, after = 0, limit = 100): LifecycleEvent[] {
    this.operation(id);
    requireInteger(after, "after", 0, Number.MAX_SAFE_INTEGER);
    requireInteger(limit, "limit", 1, 100);
    return this.db
      .prepare(
        `SELECT * FROM lifecycle_events WHERE operation_id = ?
      AND cursor > ? ORDER BY cursor LIMIT ?`,
      )
      .all(id, after, limit)
      .map((row) => ({
        cursor: row.cursor as number,
        operationId: row.operation_id as string,
        type: row.type as string,
        state: row.state as LifecycleState,
        reason: row.reason as string | null,
        createdAt: row.created_at as number,
        simulation: true,
      }));
  }

  request(
    workspaceId: string,
    kind: LifecycleKind,
    key: unknown,
    maxRuntimeMs: unknown = 30000,
    at?: number,
  ): LifecycleOperation {
    if (!["create", "pause", "resume", "delete"].includes(kind))
      throw new DomainError(400, "Invalid lifecycle operation");
    const requestKey = requireString(key, "Idempotency-Key", 128);
    const runtime = requireInteger(maxRuntimeMs, "maxRuntimeMs", 100, 300000);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([workspaceId, kind, runtime]))
      .digest("hex");
    return this.transaction(() => {
      const now = at ?? Date.now();
      const previous = this.db
        .prepare("SELECT * FROM lifecycle_operations WHERE request_key = ?")
        .get(requestKey);
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new DomainError(
            409,
            "Idempotency key already used with a different payload",
          );
        return readOperation(previous);
      }
      if (
        !this.db
          .prepare("SELECT id FROM workspaces WHERE id = ?")
          .get(workspaceId)
      )
        throw new DomainError(404, "Workspace not found");
      if (
        this.db
          .prepare(
            `SELECT id FROM runs WHERE workspace_id = ?
        AND status IN ('queued','running','cancelling','needs_attention')`,
          )
          .get(workspaceId)
      )
        throw new DomainError(409, "Workspace has active or uncertain work");
      if (
        this.db
          .prepare(
            `SELECT id FROM lifecycle_operations WHERE workspace_id = ?
        AND status != 'succeeded'`,
          )
          .get(workspaceId)
      )
        throw new DomainError(
          409,
          "Workspace has an active or uncertain lifecycle operation",
        );

      let from: LifecycleState | null = null;
      if (
        this.db
          .prepare(
            "SELECT id FROM repository_operations WHERE workspace_id = ? AND status != 'succeeded'",
          )
          .get(workspaceId)
      )
        throw new DomainError(
          409,
          "Workspace has active or uncertain repository bootstrap",
        );
      if (kind === "create") {
        if (
          this.db
            .prepare(
              "SELECT workspace_id FROM lifecycle_workspaces WHERE workspace_id = ?",
            )
            .get(workspaceId)
        )
          throw new DomainError(
            409,
            "Workspace is already enrolled in lifecycle simulation",
          );
        this.db
          .prepare(
            "INSERT INTO lifecycle_workspaces (workspace_id, state) VALUES (?, 'provisioning')",
          )
          .run(workspaceId);
      } else {
        from = this.workspace(workspaceId).state;
        if (!(
          (kind === "pause" && from === "ready") ||
          (kind === "resume" && from === "paused") ||
          (kind === "delete" && (from === "ready" || from === "paused"))
        ))
          throw new DomainError(409, "Invalid lifecycle transition");
        this.transition(workspaceId, initialState[kind]);
      }
      const id = randomUUID();
      this.db
        .prepare(
          `INSERT INTO lifecycle_operations
        (id, workspace_id, kind, previous_state, status, request_key, fingerprint, max_runtime_ms, created_at)
        VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
        )
        .run(
          id,
          workspaceId,
          kind,
          from,
          requestKey,
          fingerprint,
          runtime,
          now,
        );
      this.event(id, "lifecycle.requested", now);
      return this.operation(id);
    });
  }

  claim(leaseMs: number, at?: number): LifecycleOperation | null {
    requireInteger(leaseMs, "leaseMs", 100, 60000);
    return this.transaction(() => {
      const now = at ?? Date.now();
      const row = this.db
        .prepare(
          `SELECT * FROM lifecycle_operations WHERE status = 'queued'
        ORDER BY created_at, id LIMIT 1`,
        )
        .get();
      if (!row) return null;
      const op = readOperation(row);
      const deadline = now + op.maxRuntimeMs;
      this.db
        .prepare(
          `UPDATE lifecycle_operations SET status = 'running', lease_token = ?,
        lease_expires_at = ?, deadline_at = ? WHERE id = ?`,
        )
        .run(randomUUID(), Math.min(now + leaseMs, deadline), deadline, op.id);
      this.event(op.id, "lifecycle.claimed", now);
      return this.operation(op.id);
    });
  }

  private owned(id: string, token: string, now: number): LifecycleOperation {
    const op = this.operation(id);
    if (
      op.status !== "running" ||
      op.leaseToken !== token ||
      (op.leaseExpiresAt ?? 0) <= now ||
      (op.deadlineAt ?? 0) <= now
    )
      throw new DomainError(
        409,
        "Lifecycle worker lease lost; reconciliation required",
      );
    return op;
  }

  heartbeat(id: string, token: string, leaseMs: number, at?: number): void {
    requireInteger(leaseMs, "leaseMs", 100, 60000);
    this.transaction(() => {
      const now = at ?? Date.now();
      const op = this.owned(id, token, now);
      this.db
        .prepare(
          "UPDATE lifecycle_operations SET lease_expires_at = ? WHERE id = ?",
        )
        .run(Math.min(now + leaseMs, op.deadlineAt!), id);
    });
  }

  acknowledgeQuiescence(id: string, token: string, at?: number): void {
    this.transaction(() => {
      const now = at ?? Date.now();
      const op = this.owned(id, token, now);
      if (
        op.kind !== "pause" ||
        this.workspace(op.workspaceId).state !== "quiescing"
      )
        throw new DomainError(409, "Quiescence acknowledgment is not expected");
      this.db
        .prepare("UPDATE lifecycle_operations SET quiesced_at = ? WHERE id = ?")
        .run(now, id);
      this.transition(op.workspaceId, "pausing");
      this.event(id, "lifecycle.quiesced", now);
    });
  }

  dispatch(id: string, token: string, at?: number): void {
    this.transaction(() => {
      const now = at ?? Date.now();
      const op = this.owned(id, token, now);
      if (
        op.dispatchedAt !== null ||
        (op.kind === "pause" && op.quiescedAt === null)
      )
        throw new DomainError(
          409,
          "Dispatch is already recorded or quiescence is missing",
        );
      this.db
        .prepare(
          "UPDATE lifecycle_operations SET dispatched_at = ? WHERE id = ?",
        )
        .run(now, id);
      this.event(id, "lifecycle.dispatched", now);
    });
  }

  private settle(
    op: LifecycleOperation,
    observation: unknown,
    now: number,
    reconciled: boolean,
  ): void {
    const workspace = this.workspace(op.workspaceId);
    const expected =
      op.kind === "delete"
        ? "missing"
        : op.kind === "pause"
          ? "paused"
          : "ready";
    if (
      !isObservation(observation) ||
      op.dispatchedAt === null ||
      observation.state === "unknown" ||
      observation.state !== expected ||
      (op.kind === "create" && observation.creationMarker !== op.id) ||
      (op.kind !== "create" &&
        workspace.providerId !== observation.providerId) ||
      (op.kind === "pause" && op.quiescedAt === null)
    )
      throw new DomainError(
        409,
        "Provider observation does not establish the lifecycle outcome",
      );
    this.db
      .prepare(
        "UPDATE lifecycle_workspaces SET provider_id = ? WHERE workspace_id = ?",
      )
      .run(observation.providerId, op.workspaceId);
    this.transition(op.workspaceId, targetState[op.kind]);
    this.db
      .prepare(
        `UPDATE lifecycle_operations SET status = 'succeeded', lease_token = NULL,
      lease_expires_at = NULL WHERE id = ?`,
      )
      .run(op.id);
    this.event(
      op.id,
      reconciled ? "lifecycle.reconciled" : "lifecycle.succeeded",
      now,
    );
  }

  complete(id: string, token: string, observation: unknown, at?: number): void {
    this.transaction(() => {
      const now = at ?? Date.now();
      this.settle(this.owned(id, token, now), observation, now, false);
    });
  }

  acceptObservation(id: string, observation: unknown, at?: number): void {
    this.transaction(() => {
      const now = at ?? Date.now();
      const op = this.operation(id);
      if (op.status !== "needs_attention")
        throw new DomainError(
          409,
          "Only uncertain lifecycle operations can be reconciled",
        );
      this.settle(op, observation, now, true);
    });
  }

  private uncertain(op: LifecycleOperation, reason: string, now: number): void {
    this.db
      .prepare(
        `UPDATE lifecycle_operations SET status = 'needs_attention', lease_token = NULL,
      lease_expires_at = NULL WHERE id = ?`,
      )
      .run(op.id);
    this.transition(
      op.workspaceId,
      op.kind === "delete" ? "deleting" : "needs_attention",
    );
    this.event(op.id, "lifecycle.needs_attention", now, reason);
  }

  markUncertain(id: string, token: string, at?: number): void {
    this.transaction(() => {
      const now = at ?? Date.now();
      const op = this.operation(id);
      // Only a negative settlement is allowed after expiry. Never extend a lost
      // lease or accept a late success from an adapter that ignored cancellation.
      if (op.status !== "running" || op.leaseToken !== token)
        throw new DomainError(
          409,
          "Lifecycle worker lease lost; reconciliation required",
        );
      this.uncertain(op, "provider_outcome_unknown", now);
    });
  }

  reconcileExpired(at?: number): number {
    return this.transaction(() => {
      const now = at ?? Date.now();
      const rows = this.db
        .prepare(
          `SELECT * FROM lifecycle_operations WHERE status = 'running'
        AND (lease_expires_at <= ? OR deadline_at <= ?)`,
        )
        .all(now, now);
      for (const row of rows) {
        const op = readOperation(row);
        this.uncertain(
          op,
          (op.deadlineAt ?? 0) <= now
            ? "deadline_exceeded"
            : "worker_lease_expired",
          now,
        );
      }
      return rows.length;
    });
  }
}
