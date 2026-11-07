import { randomUUID } from "node:crypto";
import { lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DomainError, type RunStatus } from "./domain.js";
import { checkDirectory, readHistoryFile } from "./continuity-files.js";
import {
  CONTINUITY_LIMITS,
  CONTINUITY_OMISSIONS,
  digest,
  encodeHistory,
  isHistoryDigest,
  isHistoryId,
  safeEventType,
  validateArtifactContent,
  type ContinuityPayload,
  type HistoricalArtifact,
  type HistoricalEvent,
} from "./continuity.js";

function artifactFor(
  root: string,
  workspaceId: string,
  runId: string,
  task: string | null,
  sha256: string,
  includeText: boolean,
): HistoricalArtifact {
  const artifact: HistoricalArtifact = {
    sha256,
    availability: "excluded",
    content: null,
  };
  if (!includeText) return artifact;
  const path = join(root, workspaceId, `${runId}.json`);
  try {
    checkDirectory(root);
    const info = lstatSync(path);
    if (!info.isFile() || info.nlink !== 1) {
      artifact.availability = "unsafe";
      return artifact;
    }
    const bytes = readHistoryFile(path, CONTINUITY_LIMITS.artifactBytes);
    if (digest(bytes) !== sha256) {
      artifact.availability = "changed";
      return artifact;
    }
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    validateArtifactContent(content, runId, task, sha256);
    return { sha256, availability: "included", content };
  } catch (error) {
    artifact.availability =
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
        ? "missing"
        : "unsafe";
    return artifact;
  }
}

export function exportHistory(
  database: string,
  workspaceRoot: string,
  workspaceId: string,
  includeText = false,
): string {
  if (!isHistoryId(workspaceId) || typeof includeText !== "boolean")
    throw new DomainError(400, "Select one valid history workspace");
  let db: DatabaseSync | undefined;
  try {
    const source = resolve(database);
    checkDirectory(dirname(source));
    const info = lstatSync(source);
    if (!info.isFile() || info.nlink !== 1)
      throw new DomainError(400, "History source must be a regular database");
    db = new DatabaseSync(source, { readOnly: true });
    db.exec("PRAGMA query_only = ON; PRAGMA busy_timeout = 5000; BEGIN;");
    const workspace = db
      .prepare(
        "SELECT id, repository, state, created_at FROM workspaces WHERE id = ?",
      )
      .get(workspaceId);
    if (!workspace) throw new DomainError(404, "History workspace not found");
    // Never present a partial cloud/cleanup export as portable execution state.
    // Real local runs are not simulated history either.
    for (const table of [
      "lifecycle_workspaces",
      "repository_operations",
      "local_worktrees",
    ]) {
      const exists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .get(table);
      if (
        exists &&
        db
          .prepare(`SELECT 1 FROM ${table} WHERE workspace_id = ? LIMIT 1`)
          .get(workspaceId)
      )
        throw new DomainError(
          409,
          "Cloud lifecycle history is not supported by this format",
        );
    }
    const counts = db
      .prepare(
        "SELECT COUNT(*) AS total, COALESCE(SUM(length(CAST(task AS BLOB))), 0) AS bytes FROM runs WHERE workspace_id = ?",
      )
      .get(workspaceId)!;
    const eventCounts = db
      .prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(length(CAST(e.data AS BLOB))), 0) AS bytes
        FROM events e JOIN runs r ON r.id = e.run_id WHERE r.workspace_id = ?`,
      )
      .get(workspaceId)!;
    if (
      (counts.total as number) > CONTINUITY_LIMITS.runs ||
      (eventCounts.total as number) > CONTINUITY_LIMITS.events ||
      (counts.bytes as number) + (eventCounts.bytes as number) >
        CONTINUITY_LIMITS.bytes
    )
      throw new DomainError(
        409,
        "History exceeds export limits; no partial export was written",
      );
    const rows = db
      .prepare(
        `SELECT id, task, status, max_runtime_ms, created_at, deadline_at
        FROM runs WHERE workspace_id = ? ORDER BY created_at, id`,
      )
      .all(workspaceId);
    const payload: ContinuityPayload = {
      exportId: randomUUID(),
      exportedAt: Date.now(),
      simulation: true,
      textIncluded: includeText,
      workspace: {
        id: workspace.id as string,
        repository: workspace.repository as string,
        state: workspace.state as "running" | "stopped",
        createdAt: workspace.created_at as number,
      },
      runs: [],
      omissions: [...CONTINUITY_OMISSIONS],
    };
    for (const row of rows) {
      const runId = row.id as string;
      // Validate identities before deriving any filesystem path.
      if (!isHistoryId(runId))
        throw new DomainError(400, "Invalid history source identity");
      const events: HistoricalEvent[] = [];
      let artifact: HistoricalArtifact | null = null;
      for (const event of db
        .prepare(
          "SELECT cursor, type, data, created_at FROM events WHERE run_id = ? ORDER BY cursor",
        )
        .all(runId)) {
        const type = safeEventType(event.type as string);
        let text: string | null = null;
        if (
          type === "verification.recorded" ||
          (includeText && ["agent.log", "run.resolved"].includes(type))
        ) {
          const data = JSON.parse(event.data as string) as Record<
            string,
            unknown
          >;
          if (data === null || typeof data !== "object" || Array.isArray(data))
            throw new DomainError(400, "Invalid history source event");
          if (type === "verification.recorded") {
            if (
              data.kind !== "simulation-artifact-check" ||
              data.passed !== true ||
              data.simulation !== true ||
              data.artifact !== `${runId}.json` ||
              !isHistoryDigest(data.sha256)
            )
              throw new DomainError(400, "Unsupported history source evidence");
            artifact = artifactFor(
              resolve(workspaceRoot),
              workspaceId,
              runId,
              includeText ? (row.task as string) : null,
              data.sha256,
              includeText,
            );
          } else {
            const selected = type === "agent.log" ? data.message : data.note;
            if (typeof selected !== "string")
              throw new DomainError(400, "Invalid history source text");
            text = selected;
          }
        }
        events.push({
          cursor: event.cursor as number,
          type,
          createdAt: event.created_at as number,
          text,
        });
      }
      payload.runs.push({
        id: runId,
        task: includeText ? (row.task as string) : null,
        status: row.status as RunStatus,
        maxRuntimeMs: row.max_runtime_ms as number,
        createdAt: row.created_at as number,
        deadlineAt: row.deadline_at as number | null,
        events,
        artifact,
      });
    }
    const encoded = encodeHistory(payload);
    db.exec("COMMIT");
    return encoded;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError(400, "History source is unavailable or unsupported");
  } finally {
    // Closing also rolls back a failed read transaction; no source writes occur.
    db?.close();
  }
}
