import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { LifecycleStore } from "./lifecycle-store.js";
import { RepositoryStore } from "./repository-store.js";
import { LocalCommandApprovalStore } from "./local-command-approvals.js";
import {
  commandRequest,
  commandFingerprint,
  readCommandPlan,
  type CommandJob,
  type CommandJobRequest,
} from "./local-command-jobs.js";
import {
  DomainError,
  requireInteger,
  requireString,
  type Evidence,
  type LocalWorktree,
  type PermissionMode,
  type Run,
  type RunEvent,
  type Workspace,
  type Page,
} from "./domain.js";

type Row = Record<string, unknown>;
const ACTIVE = "('queued', 'running', 'cancelling')";
const MAX_LOG_EVENTS = 100;
// A real agent narrates far more than the scripted fixture; still bounded.
const MAX_REAL_LOG_EVENTS = 2000;
const SIMULATION_RUNTIME = { min: 100, max: 300000, fallback: 30000 };
const LOCAL_RUNTIME = { min: 1000, max: 7200000, fallback: 1800000 };
const LOG_KINDS = new Set(["text", "tool", "tool_error", "status"]);

export type LogKind = "text" | "tool" | "tool_error" | "status";

function permissionMode(value: unknown): PermissionMode {
  if (value === undefined) return "edits";
  if (value !== "edits" && value !== "full")
    throw new DomainError(400, "permissionMode must be edits or full");
  return value;
}

function validEvidence(run: Run, evidence: Evidence | undefined): boolean {
  if (!evidence || evidence.passed !== true) return false;
  if (run.simulation)
    return (
      evidence.kind === "simulation-artifact-check" &&
      evidence.simulation === true &&
      /^[a-f0-9]{64}$/.test(evidence.sha256)
    );
  return (
    evidence.kind === "worktree-record" &&
    evidence.simulation === false &&
    evidence.tested === false &&
    /^[a-f0-9]{40,64}$/.test(evidence.headSha) &&
    /^[a-f0-9]{40,64}$/.test(evidence.baseSha) &&
    /^[a-f0-9]{64}$/.test(evidence.diffSha256) &&
    Number.isSafeInteger(evidence.changedFiles) &&
    evidence.changedFiles >= 0
  );
}

function readRun(row: Row): Run {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    task: row.task as string,
    status: row.status as Run["status"],
    simulation: row.simulation === 1,
    permissionMode: row.permission_mode as PermissionMode,
    maxRuntimeMs: row.max_runtime_ms as number,
    createdAt: row.created_at as number,
    deadlineAt: row.deadline_at as number | null,
    leaseToken: row.lease_token as string | null,
    leaseExpiresAt: row.lease_expires_at as number | null,
  };
}

function readWorkspace(row: Row): Workspace {
  const workspace: Workspace = {
    id: row.id as string,
    repository: row.repository as string,
    provider: row.provider as Workspace["provider"],
    state: row.state as Workspace["state"],
    createdAt: row.created_at as number,
  };
  if (workspace.provider === "local-worktree") {
    workspace.local = {
      repositoryPath: row.repository_path as string,
      branch: row.branch as string,
      baseSha: row.base_sha as string,
      worktreePath: row.worktree_path as string,
    };
  }
  return workspace;
}

const WORKSPACE_SELECT = `SELECT w.*, l.repository_path, l.branch, l.base_sha, l.worktree_path
  FROM workspaces w LEFT JOIN local_worktrees l ON l.workspace_id = w.id`;

// Additive migrations for databases created before local execution existed.
function addColumn(db: DatabaseSync, table: string, definition: string): void {
  const name = definition.split(" ")[0]!;
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((column) => column.name === name))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

export class Store {
  private readonly db: DatabaseSync;
  readonly lifecycle: LifecycleStore;
  readonly repositories: RepositoryStore;
  readonly localCommandApprovals: LocalCommandApprovalStore;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    try {
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
      addColumn(
        this.db,
        "workspaces",
        "provider TEXT NOT NULL DEFAULT 'local-simulation' CHECK(provider IN ('local-simulation','local-worktree'))",
      );
      addColumn(
        this.db,
        "runs",
        "simulation INTEGER NOT NULL DEFAULT 1 CHECK(simulation IN (0, 1))",
      );
      addColumn(
        this.db,
        "runs",
        "permission_mode TEXT NOT NULL DEFAULT 'edits' CHECK(permission_mode IN ('edits','full'))",
      );
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS local_worktrees (
        workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),
        repository_path TEXT NOT NULL, branch TEXT NOT NULL UNIQUE,
        base_sha TEXT NOT NULL, worktree_path TEXT NOT NULL UNIQUE,
        agent_session_id TEXT NOT NULL UNIQUE,
        agent_session_started INTEGER NOT NULL DEFAULT 0 CHECK(agent_session_started IN (0, 1))
      ) STRICT;
    `);
      this.lifecycle = new LifecycleStore(this.db);
      this.repositories = new RepositoryStore(this.db);
      this.localCommandApprovals = new LocalCommandApprovalStore(this.db, this);
      this.transaction(() => {
        const version = this.db
          .prepare(
            "SELECT version FROM schema_versions WHERE component = 'command-jobs'",
          )
          .get();
        if (version && version.version !== 1)
          throw new Error("Unsupported command job schema");
        addColumn(
          this.db,
          "runs",
          "kind TEXT NOT NULL DEFAULT 'agent' CHECK(kind IN ('agent','command'))",
        );
        // Enforced even for an older worker's already-prepared claim statement.
        // An ownership protocol marker is not permission to execute a command.
        addColumn(
          this.db,
          "runs",
          `command_claim_version INTEGER NOT NULL DEFAULT 0
          CHECK(command_claim_version IN (0,1)
          AND (kind = 'command' OR command_claim_version = 0)
          AND (kind <> 'command' OR (simulation = 0 AND permission_mode = 'edits'
            AND status <> 'completed'
            AND (status <> 'queued' OR command_claim_version = 0)
            AND (status NOT IN ('running','cancelling','needs_attention') OR command_claim_version = 1))))`,
        );
        this.db.exec(`CREATE TABLE IF NOT EXISTS command_jobs (
          run_id TEXT PRIMARY KEY REFERENCES runs(id),
          approval_id TEXT NOT NULL REFERENCES local_command_approvals(id),
          fingerprint TEXT NOT NULL, payload TEXT NOT NULL, payload_sha256 TEXT NOT NULL
        ) STRICT;`);
        this.db
          .prepare(
            "INSERT INTO schema_versions (component,version) VALUES ('command-jobs',1) ON CONFLICT(component) DO NOTHING",
          )
          .run();
      });
    } catch (error) {
      // An open handle would keep the WAL database locked after a failed start.
      this.db.close();
      throw error;
    }
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
      .prepare(
        "INSERT INTO workspaces (id, repository, state, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(id, url, "running", now);
    return this.getWorkspace(id);
  }

  /** Records a worktree that the caller has already created on disk. */
  createLocalWorkspace(
    id: string,
    local: LocalWorktree,
    agentSessionId: string,
    now = Date.now(),
  ): Workspace {
    return this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO workspaces (id, repository, state, created_at, provider)
          VALUES (?, ?, 'running', ?, 'local-worktree')`,
        )
        .run(id, local.repositoryPath, now);
      this.db
        .prepare(
          `INSERT INTO local_worktrees (workspace_id, repository_path, branch,
          base_sha, worktree_path, agent_session_id) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          local.repositoryPath,
          local.branch,
          local.baseSha,
          local.worktreePath,
          agentSessionId,
        );
      return this.getWorkspace(id);
    });
  }

  /** The agent conversation for a local workspace; not durable process state. */
  agentSession(workspaceId: string): { id: string; started: boolean } {
    const row = this.db
      .prepare(
        "SELECT agent_session_id, agent_session_started FROM local_worktrees WHERE workspace_id = ?",
      )
      .get(workspaceId);
    if (!row) throw new DomainError(409, "Workspace has no local worktree");
    return {
      id: row.agent_session_id as string,
      started: row.agent_session_started === 1,
    };
  }

  markAgentSessionStarted(workspaceId: string): void {
    this.db
      .prepare(
        "UPDATE local_worktrees SET agent_session_started = 1 WHERE workspace_id = ?",
      )
      .run(workspaceId);
  }

  getWorkspace(id: string): Workspace {
    const row = this.db.prepare(`${WORKSPACE_SELECT} WHERE w.id = ?`).get(id);
    if (!row) throw new DomainError(404, "Workspace not found");
    return readWorkspace(row);
  }

  listWorkspaces(limit = 50, before?: string): Page<Workspace> {
    requireInteger(limit, "limit", 1, 100);
    const cursor = before ? this.getWorkspace(before) : null;
    const rows = cursor
      ? this.db
          .prepare(
            `${WORKSPACE_SELECT} WHERE w.created_at < ? OR
          (w.created_at = ? AND w.id < ?) ORDER BY w.created_at DESC, w.id DESC LIMIT ?`,
          )
          .all(cursor.createdAt, cursor.createdAt, cursor.id, limit + 1)
      : this.db
          .prepare(
            `${WORKSPACE_SELECT} ORDER BY w.created_at DESC, w.id DESC LIMIT ?`,
          )
          .all(limit + 1);
    const items = rows.slice(0, limit).map(readWorkspace);
    return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
  }

  setWorkspaceState(id: string, state: Workspace["state"]): Workspace {
    if (state !== "running" && state !== "stopped")
      throw new DomainError(400, "Invalid workspace state");
    return this.transaction(() => {
      this.getWorkspace(id);
      this.requireLocalWorkspace(id);
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
    maxRuntimeMs?: unknown,
    at?: number,
    mode?: unknown,
  ): Run {
    const text = requireString(task, "task");
    const requestKey = requireString(key, "Idempotency-Key", 128);
    const permission = permissionMode(mode);
    const real = this.getWorkspace(workspaceId).provider === "local-worktree";
    const bounds = real ? LOCAL_RUNTIME : SIMULATION_RUNTIME;
    const runtime = requireInteger(
      maxRuntimeMs ?? bounds.fallback,
      "maxRuntimeMs",
      bounds.min,
      bounds.max,
    );
    if (!real && permission !== "edits")
      throw new DomainError(400, "Simulated runs have no permission modes");
    return this.transaction(() => {
      const now = at ?? Date.now();
      const previous = this.db
        .prepare("SELECT * FROM runs WHERE request_key = ?")
        .get(requestKey);
      if (previous) {
        const run = readRun(previous);
        if (
          previous.kind !== "agent" ||
          run.workspaceId !== workspaceId ||
          run.task !== text ||
          run.maxRuntimeMs !== runtime ||
          run.permissionMode !== permission
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
      this.requireLocalWorkspace(workspaceId);
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
        (id, workspace_id, task, request_key, status, max_runtime_ms, created_at,
        simulation, permission_mode)
        VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
        )
        .run(
          id,
          workspaceId,
          text,
          requestKey,
          runtime,
          now,
          real ? 0 : 1,
          permission,
        );
      this.event(
        id,
        "run.queued",
        real
          ? { simulation: false, permissionMode: permission }
          : { simulation: true },
        now,
      );
      return this.getRun(id);
    });
  }

  getRun(id: string): Run {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
    if (!row) throw new DomainError(404, "Run not found");
    return readRun(row);
  }

  runKind(id: string): "agent" | "command" {
    const row = this.db.prepare("SELECT kind FROM runs WHERE id = ?").get(id);
    if (!row) throw new DomainError(404, "Run not found");
    if (row.kind !== "agent" && row.kind !== "command")
      throw new DomainError(409, "Invalid run kind");
    return row.kind;
  }

  /** Existing public/agent operations must never interpret command ownership. */
  requireAgentRun(id: string): Run {
    if (this.runKind(id) !== "agent")
      throw new DomainError(
        409,
        "Command jobs are internal and cannot execute",
      );
    return this.getRun(id);
  }

  getCommandJob(id: string): CommandJob {
    if (this.runKind(id) !== "command")
      throw new DomainError(409, "Run is not a command job");
    const row = this.db
      .prepare("SELECT * FROM command_jobs WHERE run_id = ?")
      .get(id);
    const invalid = () => new DomainError(409, "Invalid dormant command job");
    if (
      !row ||
      typeof row.payload !== "string" ||
      createHash("sha256").update(row.payload).digest("hex") !==
        row.payload_sha256
    )
      throw invalid();
    const plan = readCommandPlan(row.payload);
    const run = this.getRun(id);
    const workspace = this.getWorkspace(run.workspaceId);
    const approved = this.localCommandApprovals.get(plan.approvalId);
    const candidate = plan.candidate;
    if (
      row.approval_id !== approved.id ||
      approved.operatorId !== plan.operatorId ||
      approved.descriptor.approvalCandidate.identity !==
        candidate.approvalCandidate.identity ||
      approved.descriptor.source.blobId !== candidate.source.blobId ||
      approved.descriptor.source.sha256 !== candidate.source.sha256 ||
      JSON.stringify(approved.descriptor.config) !==
        JSON.stringify(candidate.config) ||
      workspace.provider !== "local-worktree" ||
      workspace.local?.baseSha !== candidate.source.baseSha ||
      run.simulation ||
      run.permissionMode !== "edits" ||
      run.task !== `Dormant ${plan.action} command` ||
      row.fingerprint !==
        commandFingerprint(
          commandRequest({
            workspaceId: run.workspaceId,
            operatorId: plan.operatorId,
            approvalId: plan.approvalId,
            candidateIdentity: candidate.approvalCandidate.identity,
            action: plan.action,
            requestKey: "stored",
            maxRuntimeMs: run.maxRuntimeMs,
          }),
        )
    )
      throw invalid();
    return Object.freeze({
      kind: "dormant-command-job",
      run: Object.freeze(run),
      plan,
    });
  }

  private commandDuplicate(
    key: string,
    fingerprint: string,
  ): CommandJob | null {
    const row = this.db
      .prepare(
        `SELECT r.id,r.kind,c.fingerprint FROM runs r
      LEFT JOIN command_jobs c ON c.run_id = r.id WHERE r.request_key = ?`,
      )
      .get(key);
    if (!row) return null;
    if (row.kind !== "command" || row.fingerprint !== fingerprint)
      throw new DomainError(
        409,
        "Idempotency key already used with a different payload",
      );
    return this.getCommandJob(row.id as string);
  }

  /** Internal only. Fresh approval binding queues ownership, never execution. */
  async createCommandJob(
    worktreeRoot: string,
    input: CommandJobRequest,
    signal?: AbortSignal,
  ): Promise<CommandJob> {
    const request = commandRequest(input);
    const fingerprint = commandFingerprint(request);
    const previous = this.commandDuplicate(request.requestKey, fingerprint);
    if (previous) return previous;
    signal?.throwIfAborted();
    const workspace = this.getWorkspace(request.workspaceId);
    const match = await this.localCommandApprovals.lookup(
      worktreeRoot,
      request.workspaceId,
      request.operatorId,
      signal,
    );
    if (
      !match ||
      match.approval.id !== request.approvalId ||
      match.candidate.approvalCandidate.identity !== request.candidateIdentity
    )
      throw new DomainError(
        409,
        "Command approval does not match the current configuration",
      );
    const plan = readCommandPlan(
      JSON.stringify({
        kind: "dormant-command-plan",
        version: 1,
        execution: "forbidden",
        action: request.action,
        approvalId: request.approvalId,
        operatorId: request.operatorId,
        candidate: match.candidate,
      }),
    );
    return this.transaction(() => {
      const duplicate = this.commandDuplicate(request.requestKey, fingerprint);
      if (duplicate) return duplicate;
      signal?.throwIfAborted();
      const current = this.getWorkspace(request.workspaceId);
      if (
        JSON.stringify(current.local) !== JSON.stringify(workspace.local) ||
        current.provider !== "local-worktree"
      )
        throw new DomainError(409, "Command workspace changed");
      if (current.state !== "running")
        throw new DomainError(409, "Workspace is stopped");
      this.requireLocalWorkspace(current.id);
      if (
        this.db
          .prepare(
            `SELECT id FROM runs WHERE workspace_id = ? AND (status IN ${ACTIVE} OR status = 'needs_attention')`,
          )
          .get(current.id)
      )
        throw new DomainError(409, "Workspace has active or uncertain work");
      if (
        JSON.stringify(this.localCommandApprovals.get(request.approvalId)) !==
        JSON.stringify(match.approval)
      )
        throw new DomainError(409, "Command approval changed");
      const id = randomUUID(),
        now = Date.now();
      this.db
        .prepare(
          `INSERT INTO runs (id,workspace_id,task,request_key,status,max_runtime_ms,created_at,simulation,permission_mode,kind)
        VALUES (?,?,?,?,'queued',?,?,0,'edits','command')`,
        )
        .run(
          id,
          current.id,
          `Dormant ${request.action} command`,
          request.requestKey,
          request.maxRuntimeMs,
          now,
        );
      const payload = JSON.stringify(plan);
      this.db
        .prepare(
          "INSERT INTO command_jobs (run_id,approval_id,fingerprint,payload,payload_sha256) VALUES (?,?,?,?,?)",
        )
        .run(
          id,
          request.approvalId,
          fingerprint,
          payload,
          createHash("sha256").update(payload).digest("hex"),
        );
      this.event(
        id,
        "command.queued",
        {
          simulation: false,
          execution: "forbidden",
          action: request.action,
          approvalId: request.approvalId,
        },
        now,
      );
      return this.getCommandJob(id);
    });
  }

  private requireLocalWorkspace(id: string): void {
    if (
      this.db
        .prepare(
          "SELECT workspace_id FROM lifecycle_workspaces WHERE workspace_id = ?",
        )
        .get(id)
    )
      throw new DomainError(
        409,
        "Workspace belongs to lifecycle simulation; local execution is disabled",
      );
  }

  listRuns(workspaceId: string, limit = 50, before?: string): Page<Run> {
    requireInteger(limit, "limit", 1, 100);
    this.getWorkspace(workspaceId);
    const cursor = before ? this.requireAgentRun(before) : null;
    if (cursor && cursor.workspaceId !== workspaceId)
      throw new DomainError(400, "Run cursor belongs to another workspace");
    const rows = cursor
      ? this.db
          .prepare(
            `SELECT * FROM runs WHERE kind = 'agent' AND workspace_id = ? AND
          (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?`,
          )
          .all(
            workspaceId,
            cursor.createdAt,
            cursor.createdAt,
            cursor.id,
            limit + 1,
          )
      : this.db
          .prepare(
            "SELECT * FROM runs WHERE kind = 'agent' AND workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
          )
          .all(workspaceId, limit + 1);
    const items = rows.slice(0, limit).map(readRun);
    return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null };
  }

  evidence(id: string): Evidence {
    this.requireAgentRun(id);
    if (this.getRun(id).status !== "completed")
      throw new DomainError(409, "Run has no completed verification");
    const row = this.db
      .prepare(
        "SELECT data FROM events WHERE run_id = ? AND type = 'verification.recorded' ORDER BY cursor DESC LIMIT 1",
      )
      .get(id);
    if (!row) throw new DomainError(409, "Verification evidence is missing");
    return JSON.parse(row.data as string) as Evidence;
  }

  resolveSimulation(id: string, note: unknown): Run {
    this.requireAgentRun(id);
    const explanation = requireString(note, "Resolution note", 1000);
    return this.transaction(() => {
      const run = this.getRun(id);
      if (run.status !== "needs_attention")
        throw new DomainError(409, "Only uncertain runs can be resolved");
      if (!run.simulation)
        throw new DomainError(
          409,
          "Interrupted local execution requires process reconciliation; this workspace remains blocked",
        );
      const now = Date.now();
      this.db.prepare("UPDATE runs SET status = 'failed' WHERE id = ?").run(id);
      this.event(
        id,
        "run.resolved",
        {
          note: explanation,
          action: run.simulation ? "abandon_simulation" : "abandon_run",
          replayed: false,
          simulation: run.simulation,
        },
        now,
      );
      this.event(
        id,
        "run.failed",
        {
          reason: run.simulation
            ? "operator_abandoned_simulation"
            : "operator_abandoned_run",
          simulation: run.simulation,
        },
        now,
      );
      return this.getRun(id);
    });
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
    return this.claimKind("agent", leaseMs, at);
  }

  /** Acquires dormant ownership only; there is no command dispatcher. */
  claimCommandJob(leaseMs: number, at?: number): CommandJob | null {
    const run = this.claimKind("command", leaseMs, at);
    return run ? this.getCommandJob(run.id) : null;
  }

  private claimKind(
    kind: "agent" | "command",
    leaseMs: number,
    at?: number,
  ): Run | null {
    requireInteger(leaseMs, "leaseMs", 100, 60000);
    return this.transaction(() => {
      const now = at ?? Date.now();
      const row = this.db
        .prepare(
          `SELECT r.* FROM runs r JOIN workspaces w ON w.id = r.workspace_id
        WHERE r.status = 'queued' AND r.kind = ? AND w.state = 'running'
        AND NOT EXISTS (SELECT 1 FROM runs uncertain WHERE uncertain.workspace_id = r.workspace_id AND uncertain.status = 'needs_attention')
        AND NOT EXISTS (SELECT 1 FROM lifecycle_workspaces l WHERE l.workspace_id = r.workspace_id)
        ORDER BY r.created_at, r.id LIMIT 1`,
        )
        .get(kind);
      if (!row) return null;
      const run = readRun(row);
      if (kind === "command") this.getCommandJob(run.id);
      this.db
        .prepare(
          `UPDATE runs SET status = 'running', lease_token = ?, lease_expires_at = ?,
        deadline_at = ?, command_claim_version = ? WHERE id = ?`,
        )
        .run(
          randomUUID(),
          now + leaseMs,
          now + run.maxRuntimeMs,
          kind === "command" ? 1 : 0,
          run.id,
        );
      this.event(
        run.id,
        kind === "command" ? "command.claimed" : "run.started",
        { simulation: run.simulation },
        now,
      );
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

  appendLog(
    id: string,
    token: string,
    message: string,
    at?: number,
    kind: LogKind = "text",
  ): void {
    this.requireAgentRun(id);
    requireString(message, "message", 2048);
    if (!LOG_KINDS.has(kind)) throw new DomainError(400, "Invalid log kind");
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
      if (
        (row.total as number) >=
        (run.simulation ? MAX_LOG_EVENTS : MAX_REAL_LOG_EVENTS)
      )
        throw new DomainError(409, "Run log limit exceeded");
      this.event(
        id,
        "agent.log",
        run.simulation
          ? { message, simulation: true }
          : { message, kind, simulation: false },
        now,
      );
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
        this.event(
          id,
          `${this.runKind(id) === "command" ? "command" : "run"}.${state}`,
          {},
          now,
        );
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
      if (
        this.runKind(id) === "command" &&
        (status === "completed" || evidence !== undefined)
      )
        throw new DomainError(
          409,
          "Dormant command jobs cannot complete or record evidence",
        );
      if (status === "completed") {
        if (
          run.status !== "running" ||
          (run.deadlineAt ?? 0) <= now ||
          !validEvidence(run, evidence)
        ) {
          throw new DomainError(
            409,
            run.simulation
              ? "Completion requires a live run and independent simulation evidence"
              : "Completion requires a live run and an independent worktree record",
          );
        }
        this.event(id, "verification.recorded", { ...evidence }, now);
      }
      this.db
        .prepare(
          `UPDATE runs SET status = ?, lease_token = NULL, lease_expires_at = NULL WHERE id = ?`,
        )
        .run(status, id);
      this.event(
        id,
        `${this.runKind(id) === "command" ? "command" : "run"}.${status}`,
        { ...detail, simulation: run.simulation },
        now,
      );
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
          `${this.runKind(row.id as string) === "command" ? "command" : "run"}.needs_attention`,
          { reason: "worker_lease_expired", replayed: false },
          now,
        );
      }
      return rows.length;
    });
  }
}
