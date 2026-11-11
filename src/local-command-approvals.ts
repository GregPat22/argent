import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { DomainError, requireString } from "./domain.js";
import {
  COMMAND_CONFIG_PATH,
  COMMAND_CONFIG_POLICY,
  parseLocalCommandConfig,
  readLocalCommandConfig,
  type LocalCommandConfigDescriptor,
} from "./local-command-config.js";
import type { Store } from "./store.js";

type Row = Record<string, unknown>;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const corrupt = () => new DomainError(409, "Invalid stored command approval");
const changed = () =>
  new DomainError(409, "Command configuration changed or is not configured");

export type LocalCommandApproval = Readonly<{
  id: string;
  operatorId: string;
  workspaceId: string;
  descriptor: LocalCommandConfigDescriptor;
  approvedAt: number;
}>;

/** An audit receipt, never a current authorization or instruction to execute. */
export type LocalCommandApprovalReceipt = Readonly<{
  kind: "local-command-approval-receipt";
  approval: LocalCommandApproval;
  workspaceId: string;
  event: Readonly<{
    cursor: number;
    type: "configuration.approved" | "configuration.reused";
    createdAt: number;
  }>;
}>;

/** A point-in-time match only. Future dispatch must independently revalidate. */
export type LocalCommandApprovalMatch = Readonly<{
  kind: "local-command-approval-match";
  approval: LocalCommandApproval;
  candidate: LocalCommandConfigDescriptor;
}>;

function identity(value: unknown, pattern: RegExp, name: string): string {
  if (typeof value !== "string" || pattern.exec(value)?.[0] !== value)
    throw new DomainError(400, `Invalid ${name}`);
  return value;
}

function object(value: unknown, keys: string[]): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw corrupt();
  const row = value as Row;
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(row, key))
  )
    throw corrupt();
  return row;
}

function timestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw corrupt();
  return value;
}

function descriptor(value: unknown): LocalCommandConfigDescriptor {
  try {
    if (typeof value !== "string" || Buffer.byteLength(value) > 66 << 10)
      throw corrupt();
    const row = object(JSON.parse(value) as unknown, [
      "kind",
      "config",
      "source",
      "approvalCandidate",
    ]);
    const source = object(row.source, ["path", "baseSha", "blobId", "sha256"]);
    const candidate = object(row.approvalCandidate, [
      "identity",
      "policyVersion",
    ]);
    if (
      row.kind !== "local-command-config" ||
      source.path !== COMMAND_CONFIG_PATH ||
      candidate.policyVersion !== COMMAND_CONFIG_POLICY
    )
      throw corrupt();
    return Object.freeze({
      kind: "local-command-config",
      config: parseLocalCommandConfig(Buffer.from(JSON.stringify(row.config))),
      source: Object.freeze({
        path: COMMAND_CONFIG_PATH,
        baseSha: identity(source.baseSha, SHA, "stored base"),
        blobId: identity(source.blobId, SHA, "stored blob"),
        sha256: identity(source.sha256, DIGEST, "stored digest"),
      }),
      approvalCandidate: Object.freeze({
        identity: identity(candidate.identity, DIGEST, "stored candidate"),
        policyVersion: COMMAND_CONFIG_POLICY,
      }),
    });
  } catch {
    throw corrupt();
  }
}

function approval(row: Row): LocalCommandApproval {
  try {
    const snapshot = descriptor(row.descriptor);
    if (
      createHash("sha256")
        .update(row.descriptor as string)
        .digest("hex") !== row.descriptor_sha256
    )
      throw corrupt();
    if (snapshot.approvalCandidate.identity !== row.candidate_identity)
      throw corrupt();
    return Object.freeze({
      id: identity(row.id, UUID, "stored approval"),
      operatorId: requireString(row.operator_id, "stored operator", 128),
      workspaceId: identity(row.workspace_id, UUID, "stored workspace"),
      descriptor: snapshot,
      approvedAt: timestamp(row.created_at),
    });
  } catch {
    throw corrupt();
  }
}

function matches(
  approved: LocalCommandApproval,
  candidate: LocalCommandConfigDescriptor,
): void {
  const previous = approved.descriptor;
  // Base and workspace IDs deliberately differ for repository-wide reuse.
  if (
    previous.approvalCandidate.identity !==
      candidate.approvalCandidate.identity ||
    previous.approvalCandidate.policyVersion !==
      candidate.approvalCandidate.policyVersion ||
    previous.source.sha256 !== candidate.source.sha256 ||
    previous.source.blobId !== candidate.source.blobId ||
    JSON.stringify(previous.config) !== JSON.stringify(candidate.config)
  )
    throw corrupt();
}

/** Internal only: this component has no API, worker dispatch or portable grant. */
export class LocalCommandApprovalStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly store: Store,
  ) {
    this.transaction(() => {
      const version = db
        .prepare(
          "SELECT version FROM schema_versions WHERE component = 'local-command-approvals'",
        )
        .get();
      if (version && version.version !== 1)
        throw new Error("Unsupported local command approval schema");
      db.exec(`
        CREATE TABLE IF NOT EXISTS local_command_approvals (
          id TEXT PRIMARY KEY,
          operator_id TEXT NOT NULL,
          candidate_identity TEXT NOT NULL,
          workspace_id TEXT NOT NULL REFERENCES local_worktrees(workspace_id),
          descriptor TEXT NOT NULL,
          descriptor_sha256 TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(operator_id, candidate_identity)
        ) STRICT;
        CREATE TABLE IF NOT EXISTS local_command_approval_events (
          cursor INTEGER PRIMARY KEY AUTOINCREMENT,
          approval_id TEXT NOT NULL REFERENCES local_command_approvals(id),
          operator_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL REFERENCES local_worktrees(workspace_id),
          type TEXT NOT NULL CHECK(type IN ('configuration.approved','configuration.reused')),
          created_at INTEGER NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS local_command_approval_receipts (
          request_key TEXT PRIMARY KEY,
          fingerprint TEXT NOT NULL,
          approval_id TEXT NOT NULL REFERENCES local_command_approvals(id),
          workspace_id TEXT NOT NULL REFERENCES local_worktrees(workspace_id),
          event_cursor INTEGER NOT NULL UNIQUE REFERENCES local_command_approval_events(cursor)
        ) STRICT;
      `);
      db.prepare(
        "INSERT INTO schema_versions (component,version) VALUES ('local-command-approvals',1) ON CONFLICT(component) DO NOTHING",
      ).run();
    });
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

  private receipt(
    key: string,
    fingerprint: string,
  ): LocalCommandApprovalReceipt | null {
    const row = this.db
      .prepare(
        `SELECT r.*, e.type, e.created_at AS event_at,
      e.operator_id AS event_operator, e.workspace_id AS event_workspace,
      e.approval_id AS event_approval
      FROM local_command_approval_receipts r
      LEFT JOIN local_command_approval_events e ON e.cursor = r.event_cursor WHERE r.request_key = ?`,
      )
      .get(key);
    if (!row) return null;
    if (row.fingerprint !== fingerprint)
      throw new DomainError(
        409,
        "Idempotency key already used with a different payload",
      );
    const stored = this.db
      .prepare("SELECT * FROM local_command_approvals WHERE id = ?")
      .get(row.approval_id as string);
    if (!stored) throw corrupt();
    const approved = approval(stored);
    const boundFingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          row.workspace_id,
          approved.operatorId,
          approved.descriptor.approvalCandidate.identity,
        ]),
      )
      .digest("hex");
    if (
      row.fingerprint !== boundFingerprint ||
      row.event_operator !== approved.operatorId ||
      row.event_workspace !== row.workspace_id ||
      row.event_approval !== approved.id ||
      !["configuration.approved", "configuration.reused"].includes(
        row.type as string,
      ) ||
      !Number.isSafeInteger(row.event_cursor) ||
      (row.event_cursor as number) < 1
    )
      throw corrupt();
    return Object.freeze({
      kind: "local-command-approval-receipt",
      approval: approved,
      workspaceId: identity(row.workspace_id, UUID, "stored workspace"),
      event: Object.freeze({
        cursor: row.event_cursor as number,
        type: row.type as LocalCommandApprovalReceipt["event"]["type"],
        createdAt: timestamp(row.event_at),
      }),
    });
  }

  private find(
    operatorId: string,
    candidate: LocalCommandConfigDescriptor,
  ): LocalCommandApproval | null {
    const row = this.db
      .prepare(
        "SELECT * FROM local_command_approvals WHERE operator_id = ? AND candidate_identity = ?",
      )
      .get(operatorId, candidate.approvalCandidate.identity);
    if (!row) return null;
    const approved = approval(row);
    matches(approved, candidate);
    return approved;
  }

  /** operatorId and worktreeRoot come from the trusted service, never request JSON. */
  async approve(
    worktreeRoot: string,
    workspaceId: string,
    operatorId: string,
    expectedCandidateIdentity: string,
    requestKey: string,
    signal?: AbortSignal,
  ): Promise<LocalCommandApprovalReceipt> {
    identity(workspaceId, UUID, "workspace");
    requireString(operatorId, "operatorId", 128);
    identity(expectedCandidateIdentity, DIGEST, "expected candidate");
    requireString(requestKey, "Idempotency-Key", 128);
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([workspaceId, operatorId, expectedCandidateIdentity]),
      )
      .digest("hex");
    const previous = this.receipt(requestKey, fingerprint);
    if (previous) return previous;
    signal?.throwIfAborted();
    const workspace = this.store.getWorkspace(workspaceId);
    const candidate = await readLocalCommandConfig(
      this.store,
      worktreeRoot,
      workspaceId,
      signal,
    );
    if (
      !candidate ||
      candidate.approvalCandidate.identity !== expectedCandidateIdentity
    )
      throw changed();
    return this.transaction(() => {
      // Another process may have recorded this request while Git was read.
      const duplicate = this.receipt(requestKey, fingerprint);
      if (duplicate) return duplicate;
      signal?.throwIfAborted();
      if (
        JSON.stringify(this.store.getWorkspace(workspaceId).local) !==
        JSON.stringify(workspace.local)
      )
        throw changed();
      let approved = this.find(operatorId, candidate);
      const type = approved ? "configuration.reused" : "configuration.approved";
      const now = Date.now();
      if (!approved) {
        const id = randomUUID();
        this.db
          .prepare(
            `INSERT INTO local_command_approvals
          (id,operator_id,candidate_identity,workspace_id,descriptor,descriptor_sha256,created_at) VALUES (?,?,?,?,?,?,?)`,
          )
          .run(
            id,
            operatorId,
            expectedCandidateIdentity,
            workspaceId,
            JSON.stringify(candidate),
            createHash("sha256")
              .update(JSON.stringify(candidate))
              .digest("hex"),
            now,
          );
        approved = approval(
          this.db
            .prepare("SELECT * FROM local_command_approvals WHERE id = ?")
            .get(id)!,
        );
      }
      const event = this.db
        .prepare(
          `INSERT INTO local_command_approval_events
        (approval_id,operator_id,workspace_id,type,created_at) VALUES (?,?,?,?,?)`,
        )
        .run(approved.id, operatorId, workspaceId, type, now);
      this.db
        .prepare(
          `INSERT INTO local_command_approval_receipts
        (request_key,fingerprint,approval_id,workspace_id,event_cursor) VALUES (?,?,?,?,?)`,
        )
        .run(
          requestKey,
          fingerprint,
          approved.id,
          workspaceId,
          Number(event.lastInsertRowid),
        );
      return this.receipt(requestKey, fingerprint)!;
    });
  }

  /** Always rereads the service-owned base; a receipt alone cannot supply a match. */
  async lookup(
    worktreeRoot: string,
    workspaceId: string,
    operatorId: string,
    signal?: AbortSignal,
  ): Promise<LocalCommandApprovalMatch | null> {
    identity(workspaceId, UUID, "workspace");
    requireString(operatorId, "operatorId", 128);
    const workspace = this.store.getWorkspace(workspaceId);
    const candidate = await readLocalCommandConfig(
      this.store,
      worktreeRoot,
      workspaceId,
      signal,
    );
    if (!candidate) return null;
    if (
      JSON.stringify(this.store.getWorkspace(workspaceId).local) !==
      JSON.stringify(workspace.local)
    )
      throw changed();
    const approved = this.find(operatorId, candidate);
    return approved
      ? Object.freeze({
          kind: "local-command-approval-match",
          approval: approved,
          candidate,
        })
      : null;
  }
}
