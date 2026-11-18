import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  DomainError,
  requireInteger,
  requireString,
  type Run,
} from "./domain.js";
import {
  consentBinding,
  commandPurpose,
  type CommandPurpose,
} from "./local-command-consent.js";
import { reviewLocalCommandCandidate } from "./local-command-review.js";
import type { Store } from "./store.js";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const DIGEST = /^[a-f0-9]{64}$/;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const invalid = () => new DomainError(409, "Invalid check record");
const busyError = () =>
  new DomainError(409, "Workspace has changed or has active or uncertain work");
export function checkId(value: unknown): string {
  if (typeof value !== "string" || UUID.exec(value)?.[0] !== value)
    throw new DomainError(400, "Expected an identifier");
  return value;
}
export interface CheckPhase {
  action: "setup" | "test" | "run";
  argv: readonly string[];
  outcome: "exited" | "signaled" | "timed_out" | "output_limit";
  exitCode: number | null;
  signal: string | null;
  startedAt: number;
  durationMs: number;
  stdout: { bytes: number; sha256: string };
  stderr: { bytes: number; sha256: string };
}
export interface CheckResult {
  policy: "argent-local-check-v1" | "argent-local-run-v1";
  headSha: string;
  treeId: string;
  baseSha: string;
  configurationIdentity: string;
  reviewIdentity: string;
  consentId: string;
  outcome: "passed" | "succeeded" | "failed";
  phases: CheckPhase[];
}
export interface LocalCheckView {
  kind: "local-check" | "local-run-action";
  workspaceId: string;
  id: string;
  headSha: string;
  status: Run["status"];
  createdAt: number;
  result: CheckResult | null;
  /** unknown means no fresh filesystem observation was made. */
  freshness: "current" | "stale" | "unknown";
}
export interface LocalCheckJob {
  run: Run;
  consentId: string;
  operatorId: string;
}

/** Validate bounded evidence on both the durable and desktop boundaries. */
export function validateCheckResult(value: unknown): CheckResult {
  const fail = () => {
    throw invalid();
  };
  if (!value || typeof value !== "object") return fail();
  const v = value as CheckResult;
  const runAction = v.policy === "argent-local-run-v1";
  const terminal = runAction ? "run" : "test";
  const success = runAction ? "succeeded" : "passed";
  if (
    (!runAction && v.policy !== "argent-local-check-v1") ||
    ![success, "failed"].includes(v.outcome) ||
    !Array.isArray(v.phases) ||
    v.phases.length < 1 ||
    v.phases.length > 2
  )
    return fail();
  for (const s of [v.headSha, v.baseSha, v.treeId])
    if (typeof s !== "string" || SHA.exec(s)?.[0] !== s) return fail();
  for (const s of [v.configurationIdentity, v.reviewIdentity])
    if (typeof s !== "string" || DIGEST.exec(s)?.[0] !== s) return fail();
  checkId(v.consentId);
  const phases = v.phases.map((p, i): CheckPhase => {
    if (
      !p ||
      (p.action !== "setup" && p.action !== terminal) ||
      (p.action === "setup" && i !== 0) ||
      (i === 1 && p.action !== terminal) ||
      !Array.isArray(p.argv) ||
      p.argv.length < 1 ||
      p.argv.length > 64 ||
      p.argv.some(
        (a) =>
          typeof a !== "string" ||
          a.includes("\0") ||
          /[\uD800-\uDFFF]/u.test(a) ||
          Buffer.byteLength(a) > 4096,
      ) ||
      !p.argv[0]?.trim() ||
      !["exited", "signaled", "timed_out", "output_limit"].includes(
        p.outcome,
      ) ||
      !Number.isSafeInteger(p.startedAt) ||
      p.startedAt < 0 ||
      !Number.isSafeInteger(p.durationMs) ||
      p.durationMs < 0 ||
      (p.outcome === "exited"
        ? !Number.isInteger(p.exitCode) ||
          p.exitCode! < 0 ||
          p.exitCode! > 255 ||
          p.signal !== null
        : p.exitCode !== null) ||
      (p.outcome === "signaled"
        ? typeof p.signal !== "string" || !/^SIG[A-Z0-9]+$/.test(p.signal)
        : p.signal !== null)
    )
      return fail();
    const stream = (s: CheckPhase["stdout"]) => {
      if (
        !s ||
        !Number.isSafeInteger(s.bytes) ||
        s.bytes < 0 ||
        typeof s.sha256 !== "string" ||
        DIGEST.exec(s.sha256)?.[0] !== s.sha256
      )
        return fail();
      return { bytes: s.bytes, sha256: s.sha256 };
    };
    return {
      action: p.action,
      argv: [...p.argv],
      outcome: p.outcome,
      exitCode: p.exitCode,
      signal: p.signal,
      startedAt: p.startedAt,
      durationMs: p.durationMs,
      stdout: stream(p.stdout),
      stderr: stream(p.stderr),
    };
  });
  if (
    (phases.length === 2 &&
      (phases[0]!.action !== "setup" || phases[0]!.exitCode !== 0)) ||
    (v.outcome === success &&
      (phases.at(-1)!.action !== terminal ||
        phases.some((p) => p.outcome !== "exited" || p.exitCode !== 0))) ||
    (v.outcome === "failed" &&
      phases.every((p) => p.outcome === "exited" && p.exitCode === 0))
  )
    return fail();
  return {
    policy: v.policy,
    headSha: v.headSha,
    treeId: v.treeId,
    baseSha: v.baseSha,
    configurationIdentity: v.configurationIdentity,
    reviewIdentity: v.reviewIdentity,
    consentId: v.consentId,
    outcome: v.outcome,
    phases,
  };
}

/** Executable checks have their own versioned detail; dormant jobs stay dormant. */
export class LocalCheckStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly store: Store,
  ) {
    const version = db
      .prepare(
        "SELECT version FROM schema_versions WHERE component = 'local-checks'",
      )
      .get();
    if (version && version.version !== 1)
      throw new Error("Unsupported local checks schema");
    migrateCheckClaims(db);
    db.exec(`CREATE TABLE IF NOT EXISTS local_checks (
      run_id TEXT PRIMARY KEY REFERENCES runs(id),
      version INTEGER NOT NULL CHECK(version = 1),
      consent_id TEXT NOT NULL REFERENCES local_command_consents(id),
      fingerprint TEXT NOT NULL,
      result TEXT,
      result_sha256 TEXT
    ) STRICT;`);
    db.prepare(
      "INSERT INTO schema_versions (component,version) VALUES ('local-checks',1) ON CONFLICT(component) DO NOTHING",
    ).run();
  }
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = work();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  /** Any active or uncertain writer of either kind in this workspace. */
  private busy(workspaceId: string): boolean {
    return !!this.db
      .prepare(
        "SELECT id FROM runs WHERE workspace_id = ? AND status IN ('queued','running','cancelling','needs_attention')",
      )
      .get(workspaceId);
  }
  private event(id: string, type: string, data: object, now: number) {
    this.db
      .prepare(
        "INSERT INTO events (run_id,type,data,created_at) VALUES (?,?,?,?)",
      )
      .run(id, type, JSON.stringify(data), now);
  }
  get(id: string): LocalCheckJob {
    checkId(id);
    const row = this.db
      .prepare("SELECT * FROM local_checks WHERE run_id = ?")
      .get(id);
    if (!row) throw new DomainError(404, "Check not found");
    const run = this.store.getRun(id);
    const consent = this.store.localCommandConsents.get(
      row.consent_id as string,
    );
    if (
      row.version !== 1 ||
      this.store.runKind(id) !== "command" ||
      run.simulation ||
      run.permissionMode !== "edits" ||
      run.task !==
        (consent.binding.action === "setup-run"
          ? "Approved setup and run"
          : "Approved setup and test") ||
      run.maxRuntimeMs !== 1800000 ||
      run.workspaceId !== consent.binding.workspaceId ||
      row.fingerprint !==
        hash(
          JSON.stringify([
            consent.binding.action === "setup-run"
              ? "local-run-v1"
              : "local-check-v1",
            run.workspaceId,
            consent.binding.operatorId,
            consent.id,
          ]),
        )
    )
      throw invalid();
    return {
      run,
      consentId: consent.id,
      operatorId: consent.binding.operatorId,
    };
  }
  private duplicate(key: string, fingerprint: string): LocalCheckJob | null {
    const row = this.db
      .prepare(
        "SELECT r.id,c.fingerprint FROM runs r LEFT JOIN local_checks c ON c.run_id = r.id WHERE r.request_key = ?",
      )
      .get(key);
    if (!row) return null;
    if (row.fingerprint !== fingerprint)
      throw new DomainError(
        409,
        "Idempotency key already used with a different payload",
      );
    return this.get(row.id as string);
  }
  async enqueue(
    root: string,
    workspaceId: string,
    operatorId: string,
    consentId: string,
    key: string,
    signal?: AbortSignal,
    action: CommandPurpose = "setup-test",
  ): Promise<LocalCheckJob> {
    commandPurpose(action);
    checkId(workspaceId);
    checkId(consentId);
    requireString(operatorId, "operator", 128);
    requireString(key, "Idempotency-Key", 128);
    const fingerprint = hash(
      JSON.stringify([
        action === "setup-run" ? "local-run-v1" : "local-check-v1",
        workspaceId,
        operatorId,
        consentId,
      ]),
    );
    const previous = this.duplicate(key, fingerprint);
    if (previous) return previous;
    const local = JSON.stringify(this.store.getWorkspace(workspaceId).local);
    let match;
    try {
      match = await this.store.localCommandConsents.lookup(
        root,
        workspaceId,
        operatorId,
        consentId,
        signal,
        action,
      );
    } catch (error) {
      // Another identical request can reserve ownership while this read is
      // awaiting Git. Its receipt wins over the now-busy inspection failure.
      const duplicate = this.duplicate(key, fingerprint);
      if (duplicate) return duplicate;
      // Name the actual refusal; the consent store's own idle check would
      // otherwise describe a busy workspace as a consent problem.
      if (error instanceof DomainError && this.busy(workspaceId))
        throw busyError();
      throw error;
    }
    if (!match) {
      const duplicate = this.duplicate(key, fingerprint);
      if (duplicate) return duplicate;
      throw new DomainError(
        409,
        action === "setup-run"
          ? "Run command requires setup/run consent matching the current commit"
          : "Checks require setup/test consent matching the current commit",
      );
    }
    return this.transaction(() => {
      const previous = this.duplicate(key, fingerprint);
      if (previous) return previous;
      signal?.throwIfAborted();
      const workspace = this.store.getWorkspace(workspaceId);
      if (
        workspace.state !== "running" ||
        workspace.provider !== "local-worktree" ||
        JSON.stringify(workspace.local) !== local ||
        this.busy(workspaceId) ||
        this.db
          .prepare(
            "SELECT workspace_id FROM lifecycle_workspaces WHERE workspace_id = ?",
          )
          .get(workspaceId) ||
        JSON.stringify(this.store.localCommandConsents.get(consentId)) !==
          JSON.stringify(match.receipt)
      )
        throw busyError();
      const id = randomUUID(),
        now = Date.now();
      this.db
        .prepare(
          `INSERT INTO runs (id,workspace_id,task,request_key,status,max_runtime_ms,created_at,simulation,permission_mode,kind)
        VALUES (?,?,?,?,'queued',1800000,?,0,'edits','command')`,
        )
        .run(
          id,
          workspaceId,
          action === "setup-run"
            ? "Approved setup and run"
            : "Approved setup and test",
          key,
          now,
        );
      this.db
        .prepare(
          "INSERT INTO local_checks (run_id,version,consent_id,fingerprint) VALUES (?,1,?,?)",
        )
        .run(id, consentId, fingerprint);
      this.event(
        id,
        action === "setup-run" ? "run-action.queued" : "check.queued",
        {
          consentId,
          headSha: match.receipt.binding.headSha,
          simulation: false,
        },
        now,
      );
      return this.get(id);
    });
  }
  claim(leaseMs: number): LocalCheckJob | null {
    requireInteger(leaseMs, "leaseMs", 100, 60000);
    return this.transaction(() => {
      const rows = this.db
        .prepare(
          `SELECT r.id FROM runs r JOIN local_checks c ON c.run_id = r.id JOIN workspaces w ON w.id = r.workspace_id
        WHERE r.status = 'queued' AND w.state = 'running'
        AND NOT EXISTS (SELECT 1 FROM runs u WHERE u.workspace_id = r.workspace_id AND u.status = 'needs_attention')
        AND NOT EXISTS (SELECT 1 FROM lifecycle_workspaces l WHERE l.workspace_id = r.workspace_id)
        ORDER BY r.created_at,r.id`,
        )
        .all();
      // An unreadable record fails closed for its own workspace only: it stays
      // queued, is never claimed and keeps that workspace blocked, while
      // other workspaces' checks proceed. Nothing about it is rewritten.
      let job: LocalCheckJob | undefined;
      for (const row of rows) {
        try {
          job = this.get(row.id as string);
          break;
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
        }
      }
      if (!job) return null;
      const now = Date.now();
      this.db
        .prepare(
          "UPDATE runs SET status = 'running',lease_token = ?,lease_expires_at = ?,deadline_at = ?,command_claim_version = 2 WHERE id = ?",
        )
        .run(
          randomUUID(),
          now + leaseMs,
          now + job.run.maxRuntimeMs,
          job.run.id,
        );
      this.event(
        job.run.id,
        this.store.localCommandConsents.get(job.consentId).binding.action ===
          "setup-run"
          ? "run-action.claimed"
          : "check.claimed",
        { simulation: false },
        now,
      );
      return this.get(job.run.id);
    });
  }
  assertOwned(id: string, token: string): LocalCheckJob {
    const job = this.get(id),
      now = Date.now();
    if (
      job.run.status !== "running" ||
      job.run.leaseToken !== token ||
      (job.run.leaseExpiresAt ?? 0) <= now ||
      (job.run.deadlineAt ?? 0) <= now
    )
      throw new DomainError(409, "Check ownership lost or stopping");
    return job;
  }
  async revalidate(
    root: string,
    id: string,
    token: string,
    signal: AbortSignal,
  ) {
    const job = this.assertOwned(id, token);
    const consent = this.store.localCommandConsents.get(job.consentId);
    const review = await reviewLocalCommandCandidate(
      this.store,
      root,
      job.run.workspaceId,
      job.operatorId,
      signal,
    );
    signal.throwIfAborted();
    this.assertOwned(id, token);
    if (
      JSON.stringify(consentBinding(review, consent.binding.action)) !==
        JSON.stringify(consent.binding) ||
      JSON.stringify(this.store.localCommandConsents.get(job.consentId)) !==
        JSON.stringify(consent)
    )
      throw new DomainError(409, "Candidate changed after consent");
    const approval = this.store.localCommandApprovals.get(
      consent.binding.approvalId,
    );
    if (
      !approval.descriptor.config.commands[
        consent.binding.action === "setup-run" ? "run" : "test"
      ]
    )
      throw invalid();
    return {
      binding: consent.binding,
      commands: approval.descriptor.config.commands,
    };
  }
  complete(id: string, token: string, input: CheckResult) {
    const result = validateCheckResult(input);
    return this.transaction(() => {
      const job = this.assertOwned(id, token),
        now = Date.now();
      const binding = this.store.localCommandConsents.get(
        job.consentId,
      ).binding;
      if (
        result.policy !==
          (binding.action === "setup-run"
            ? "argent-local-run-v1"
            : "argent-local-check-v1") ||
        result.consentId !== job.consentId ||
        result.headSha !== binding.headSha ||
        result.treeId !== binding.treeId ||
        result.baseSha !== binding.baseSha ||
        result.reviewIdentity !== binding.reviewIdentity ||
        result.configurationIdentity !== binding.configurationIdentity
      )
        throw invalid();
      const commands = this.store.localCommandApprovals.get(binding.approvalId)
        .descriptor.config.commands;
      if (
        (!!commands.setup && result.phases[0]?.action !== "setup") ||
        result.phases.some(
          (p) =>
            JSON.stringify(p.argv) !== JSON.stringify(commands[p.action]?.argv),
        )
      )
        throw invalid();
      const payload = JSON.stringify(result);
      this.db
        .prepare(
          "UPDATE local_checks SET result = ?,result_sha256 = ? WHERE run_id = ?",
        )
        .run(payload, hash(payload), id);
      this.db
        .prepare(
          "UPDATE runs SET status = ?,lease_token = NULL,lease_expires_at = NULL WHERE id = ?",
        )
        .run(result.outcome !== "failed" ? "completed" : "failed", id);
      this.event(
        id,
        binding.action === "setup-run" ? "run-action.result" : "check.result",
        { ...result, simulation: false },
        now,
      );
    });
  }
  view(
    id: string,
    workspaceId: string,
    operatorId: string,
    action: CommandPurpose = "setup-test",
  ): LocalCheckView {
    commandPurpose(action);
    const job = this.get(id);
    if (
      job.run.workspaceId !== workspaceId ||
      job.operatorId !== operatorId ||
      this.store.localCommandConsents.get(job.consentId).binding.action !==
        action
    )
      throw new DomainError(404, "Check not found");
    const row = this.db
      .prepare("SELECT result,result_sha256 FROM local_checks WHERE run_id = ?")
      .get(id)!;
    let result: CheckResult | null = null;
    if (row.result !== null) {
      if (
        typeof row.result !== "string" ||
        Buffer.byteLength(row.result) > 600000 ||
        hash(row.result) !== row.result_sha256
      )
        throw invalid();
      result = validateCheckResult(JSON.parse(row.result) as unknown);
      const binding = this.store.localCommandConsents.get(
        job.consentId,
      ).binding;
      if (
        result.policy !==
          (binding.action === "setup-run"
            ? "argent-local-run-v1"
            : "argent-local-check-v1") ||
        result.consentId !== job.consentId ||
        result.headSha !== binding.headSha ||
        result.treeId !== binding.treeId ||
        result.baseSha !== binding.baseSha ||
        result.configurationIdentity !== binding.configurationIdentity ||
        result.reviewIdentity !== binding.reviewIdentity ||
        job.run.status !==
          (result.outcome !== "failed" ? "completed" : "failed")
      )
        throw invalid();
    } else if (job.run.status === "completed") throw invalid();
    return {
      kind: action === "setup-run" ? "local-run-action" : "local-check",
      workspaceId,
      id,
      headSha: this.store.localCommandConsents.get(job.consentId).binding
        .headSha,
      status: job.run.status,
      createdAt: job.run.createdAt,
      result,
      freshness: "unknown",
    };
  }
  async latest(
    root: string,
    workspaceId: string,
    operatorId: string,
    signal?: AbortSignal,
    action: CommandPurpose = "setup-test",
  ): Promise<LocalCheckView | null> {
    commandPurpose(action);
    checkId(workspaceId);
    const row = this.db
      .prepare(
        "SELECT r.id FROM runs r JOIN local_checks c ON c.run_id = r.id WHERE r.workspace_id = ? AND r.task = ? ORDER BY r.created_at DESC,r.id DESC LIMIT 1",
      )
      .get(
        workspaceId,
        action === "setup-run"
          ? "Approved setup and run"
          : "Approved setup and test",
      );
    if (!row) return null;
    const view = this.view(row.id as string, workspaceId, operatorId, action);
    if (!view.result) return view;
    // An active/uncertain writer cannot leave a currently reusable result.
    if (this.busy(workspaceId)) return { ...view, freshness: "stale" };
    try {
      const review = await reviewLocalCommandCandidate(
        this.store,
        root,
        workspaceId,
        operatorId,
        signal,
      );
      const observation = review.observation;
      return {
        ...view,
        freshness:
          !this.busy(workspaceId) &&
          review.identity === view.result.reviewIdentity &&
          observation.headSha === view.result.headSha &&
          observation.treeId === view.result.treeId &&
          observation.configurationIdentity ===
            view.result.configurationIdentity
            ? "current"
            : "stale",
      };
    } catch {
      signal?.throwIfAborted();
      return { ...view, freshness: "stale" };
    }
  }
}

/** Rebuild only the claim CHECK; preserve every row, index and trigger atomically. */
function migrateCheckClaims(db: DatabaseSync): void {
  db.exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE");
  try {
    const schema = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='runs'",
      )
      .get()!.sql as string;
    if (schema.includes("command_claim_version IN (0,1)")) {
      const objects = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE tbl_name='runs' AND type IN ('index','trigger') AND sql IS NOT NULL",
        )
        .all();
      const replacement = schema
        .replace(
          /^CREATE TABLE (?:"runs"|runs)/,
          "CREATE TABLE check_runs_migration",
        )
        .replace(
          "command_claim_version IN (0,1)",
          "command_claim_version IN (0,1,2)",
        )
        .replace(
          "AND status <> 'completed'",
          "AND (status <> 'completed' OR command_claim_version = 2)",
        )
        .replace(
          "OR command_claim_version = 1)",
          "OR command_claim_version IN (1,2))",
        );
      if (
        replacement === schema ||
        replacement.includes("AND status <> 'completed'")
      )
        throw new Error("Unsupported run claim schema");
      db.exec(replacement);
      db.exec(
        "INSERT INTO check_runs_migration SELECT * FROM runs; DROP TABLE runs; ALTER TABLE check_runs_migration RENAME TO runs;",
      );
      for (const object of objects) db.exec(object.sql as string);
      if (db.prepare("PRAGMA foreign_key_check").all().length)
        throw new Error("Check claim migration broke a reference");
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}
