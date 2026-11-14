import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { DomainError, requireString } from "./domain.js";
import {
  REVIEW_POLICY,
  reviewLocalCommandCandidate,
  type LocalCommandCandidateReview,
} from "./local-command-review.js";
import type { Store } from "./store.js";

export const CONSENT_POLICY = "argent-local-command-consent-full-display-v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const invalid = () => new DomainError(409, "Invalid stored candidate consent");
const changed = () =>
  new DomainError(409, "Candidate no longer matches the reviewed changes");

/** Compact audit binding; deliberately stores no repository text or diff. */
export type LocalCommandConsentBinding = Readonly<{
  policyVersion: typeof CONSENT_POLICY;
  action: "setup-test";
  workspaceId: string;
  operatorId: string;
  reviewIdentity: string;
  reviewPolicyVersion: typeof REVIEW_POLICY;
  observationIdentity: string;
  approvalId: string;
  configurationIdentity: string;
  baseSha: string;
  headSha: string;
  treeId: string;
}>;

/** Historical acknowledgement only. Never a runnable job or current grant. */
export type LocalCommandConsentReceipt = Readonly<{
  kind: "local-command-consent-receipt";
  id: string;
  binding: LocalCommandConsentBinding;
  createdAt: number;
  event: Readonly<{
    cursor: number;
    type: "candidate.consented";
    createdAt: number;
  }>;
  historical: true;
  executionAllowed: false;
  tested: false;
}>;

function identity(value: unknown, pattern: RegExp, name: string): string {
  if (typeof value !== "string" || pattern.exec(value)?.[0] !== value)
    throw new DomainError(400, `Invalid ${name}`);
  return value;
}

function fingerprint(
  workspaceId: string,
  operatorId: string,
  reviewIdentity: string,
) {
  return hash(
    JSON.stringify([CONSENT_POLICY, workspaceId, operatorId, reviewIdentity]),
  );
}

function binding(
  review: LocalCommandCandidateReview,
): LocalCommandConsentBinding {
  if (review.files.some((file) => file.binary))
    throw new DomainError(
      409,
      "Consent requires fully displayed text changes; binary changes are not supported",
    );
  const observed = review.observation;
  return Object.freeze({
    policyVersion: CONSENT_POLICY,
    action: "setup-test",
    workspaceId: observed.workspaceId,
    operatorId: observed.operatorId,
    reviewIdentity: review.identity,
    reviewPolicyVersion: review.policyVersion,
    observationIdentity: observed.identity,
    approvalId: observed.approvalId,
    configurationIdentity: observed.configurationIdentity,
    baseSha: observed.baseSha,
    headSha: observed.headSha,
    treeId: observed.treeId,
  });
}

function readBinding(
  payload: unknown,
  digest: unknown,
): LocalCommandConsentBinding {
  try {
    if (
      typeof payload !== "string" ||
      Buffer.byteLength(payload) > 8192 ||
      hash(payload) !== digest
    )
      throw invalid();
    const value = JSON.parse(payload) as LocalCommandConsentBinding;
    const keys = [
      "policyVersion",
      "action",
      "workspaceId",
      "operatorId",
      "reviewIdentity",
      "reviewPolicyVersion",
      "observationIdentity",
      "approvalId",
      "configurationIdentity",
      "baseSha",
      "headSha",
      "treeId",
    ];
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(value, key)) ||
      value.policyVersion !== CONSENT_POLICY ||
      value.action !== "setup-test" ||
      value.reviewPolicyVersion !== REVIEW_POLICY
    )
      throw invalid();
    identity(value.workspaceId, UUID, "stored workspace");
    identity(value.approvalId, UUID, "stored approval");
    requireString(value.operatorId, "stored operator", 128);
    for (const field of [
      value.reviewIdentity,
      value.observationIdentity,
      value.configurationIdentity,
    ])
      identity(field, DIGEST, "stored identity");
    for (const field of [value.baseSha, value.headSha, value.treeId])
      identity(field, SHA, "stored object");
    if (
      value.baseSha.length !== value.headSha.length ||
      value.treeId.length !== value.headSha.length
    )
      throw invalid();
    return Object.freeze(value);
  } catch {
    throw invalid();
  }
}

/** Internal only. No API, desktop control, queue or worker consumes this store. */
export class LocalCommandConsentStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly store: Store,
  ) {
    this.transaction(() => {
      const version = db
        .prepare(
          "SELECT version FROM schema_versions WHERE component = 'local-command-consent'",
        )
        .get();
      if (version && version.version !== 1)
        throw new Error("Unsupported local command consent schema");
      db.exec(`
        CREATE TABLE IF NOT EXISTS local_command_consents (
          id TEXT PRIMARY KEY,
          request_key TEXT NOT NULL UNIQUE,
          fingerprint TEXT NOT NULL,
          workspace_id TEXT NOT NULL REFERENCES local_worktrees(workspace_id),
          approval_id TEXT NOT NULL REFERENCES local_command_approvals(id),
          payload TEXT NOT NULL,
          payload_sha256 TEXT NOT NULL,
          created_at INTEGER NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS local_command_consent_events (
          cursor INTEGER PRIMARY KEY AUTOINCREMENT,
          consent_id TEXT NOT NULL UNIQUE REFERENCES local_command_consents(id),
          type TEXT NOT NULL CHECK(type = 'candidate.consented'),
          created_at INTEGER NOT NULL
        ) STRICT;
      `);
      db.prepare(
        "INSERT INTO schema_versions (component,version) VALUES ('local-command-consent',1) ON CONFLICT(component) DO NOTHING",
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

  /** Reject work already known to be active or uncertain; this acquires no lease. */
  private idle(workspaceId: string): void {
    const workspace = this.store.getWorkspace(workspaceId);
    if (
      workspace.provider !== "local-worktree" ||
      workspace.state !== "running" ||
      !workspace.local ||
      this.db
        .prepare(
          "SELECT id FROM runs WHERE workspace_id = ? AND status IN ('queued','running','cancelling','needs_attention')",
        )
        .get(workspaceId)
    )
      throw new DomainError(409, "Consent requires an idle local workspace");
  }

  private approval(value: LocalCommandConsentBinding): void {
    const approved = this.store.localCommandApprovals.get(value.approvalId);
    if (
      approved.operatorId !== value.operatorId ||
      approved.descriptor.approvalCandidate.identity !==
        value.configurationIdentity ||
      !approved.descriptor.config.commands.test
    )
      throw changed();
  }

  get(id: string): LocalCommandConsentReceipt {
    identity(id, UUID, "consent");
    const row = this.db
      .prepare(
        `SELECT c.*, e.cursor, e.type, e.created_at AS event_at
      FROM local_command_consents c LEFT JOIN local_command_consent_events e ON e.consent_id = c.id WHERE c.id = ?`,
      )
      .get(id);
    if (!row) throw new DomainError(404, "Candidate consent not found");
    const value = readBinding(row.payload, row.payload_sha256);
    if (
      row.workspace_id !== value.workspaceId ||
      row.approval_id !== value.approvalId ||
      row.fingerprint !==
        fingerprint(
          value.workspaceId,
          value.operatorId,
          value.reviewIdentity,
        ) ||
      row.type !== "candidate.consented" ||
      !Number.isSafeInteger(row.cursor) ||
      (row.cursor as number) < 1 ||
      !Number.isSafeInteger(row.created_at) ||
      (row.created_at as number) < 0 ||
      row.event_at !== row.created_at
    )
      throw invalid();
    return Object.freeze({
      kind: "local-command-consent-receipt",
      id,
      binding: value,
      createdAt: row.created_at as number,
      event: Object.freeze({
        cursor: row.cursor as number,
        type: "candidate.consented",
        createdAt: row.event_at as number,
      }),
      historical: true,
      executionAllowed: false,
      tested: false,
    });
  }

  private duplicate(
    key: string,
    expected: string,
  ): LocalCommandConsentReceipt | null {
    const row = this.db
      .prepare(
        "SELECT id,fingerprint FROM local_command_consents WHERE request_key = ?",
      )
      .get(key);
    if (!row) return null;
    if (row.fingerprint !== expected)
      throw new DomainError(
        409,
        "Idempotency key already used with a different payload",
      );
    return this.get(row.id as string);
  }

  /** Trusted caller supplies actor/root; request supplies only the displayed identity and key. */
  async consent(
    worktreeRoot: string,
    workspaceId: string,
    operatorId: string,
    expectedReviewIdentity: string,
    requestKey: string,
    signal?: AbortSignal,
  ): Promise<LocalCommandConsentReceipt> {
    identity(workspaceId, UUID, "workspace");
    requireString(operatorId, "operatorId", 128);
    identity(expectedReviewIdentity, DIGEST, "expected review");
    requireString(requestKey, "Idempotency-Key", 128);
    const expected = fingerprint(
      workspaceId,
      operatorId,
      expectedReviewIdentity,
    );
    const previous = this.duplicate(requestKey, expected);
    if (previous) return previous;
    signal?.throwIfAborted();
    this.idle(workspaceId);
    const local = JSON.stringify(this.store.getWorkspace(workspaceId).local);
    const review = await reviewLocalCommandCandidate(
      this.store,
      worktreeRoot,
      workspaceId,
      operatorId,
      signal,
    );
    if (review.identity !== expectedReviewIdentity) throw changed();
    const value = binding(review);
    return this.transaction(() => {
      const duplicate = this.duplicate(requestKey, expected);
      if (duplicate) return duplicate;
      signal?.throwIfAborted();
      this.idle(workspaceId);
      if (JSON.stringify(this.store.getWorkspace(workspaceId).local) !== local)
        throw changed();
      this.approval(value);
      const id = randomUUID(),
        now = Date.now(),
        payload = JSON.stringify(value);
      this.db
        .prepare(
          "INSERT INTO local_command_consents (id,request_key,fingerprint,workspace_id,approval_id,payload,payload_sha256,created_at) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          requestKey,
          expected,
          workspaceId,
          value.approvalId,
          payload,
          hash(payload),
          now,
        );
      this.db
        .prepare(
          "INSERT INTO local_command_consent_events (consent_id,type,created_at) VALUES (?,'candidate.consented',?)",
        )
        .run(id, now);
      return this.get(id);
    });
  }

  /** Fresh match only; future dispatch must revalidate under exclusive ownership. */
  async lookup(
    worktreeRoot: string,
    workspaceId: string,
    operatorId: string,
    consentId: string,
    signal?: AbortSignal,
  ): Promise<Readonly<{
    kind: "local-command-consent-match";
    receipt: LocalCommandConsentReceipt;
    review: LocalCommandCandidateReview;
    executionAllowed: false;
  }> | null> {
    identity(workspaceId, UUID, "workspace");
    requireString(operatorId, "operatorId", 128);
    const receipt = this.get(consentId);
    if (
      receipt.binding.workspaceId !== workspaceId ||
      receipt.binding.operatorId !== operatorId
    )
      return null;
    signal?.throwIfAborted();
    this.idle(workspaceId);
    const review = await reviewLocalCommandCandidate(
      this.store,
      worktreeRoot,
      workspaceId,
      operatorId,
      signal,
    );
    const value = binding(review);
    this.idle(workspaceId);
    this.approval(value);
    signal?.throwIfAborted();
    if (JSON.stringify(value) !== JSON.stringify(receipt.binding)) return null;
    // Recheck durable bytes after the asynchronous repository inspection.
    if (JSON.stringify(this.get(consentId)) !== JSON.stringify(receipt))
      throw invalid();
    return Object.freeze({
      kind: "local-command-consent-match",
      receipt,
      review,
      executionAllowed: false,
    });
  }
}
