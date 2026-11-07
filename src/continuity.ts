import { createHash } from "node:crypto";
import { DomainError, type RunStatus } from "./domain.js";

export const CONTINUITY_LIMITS = {
  bytes: 16 * 1024 * 1024,
  artifactBytes: 32768,
  runs: 500,
  events: 20000,
} as const;

export const CONTINUITY_OMISSIONS = [
  "credentials-and-lease-authority",
  "raw-event-fields",
  "repository-files-and-git-state",
  "provider-operations-and-approvals",
  "real-agent-transcripts-and-processes",
] as const;

const statuses: RunStatus[] = [
  "queued",
  "running",
  "cancelling",
  "completed",
  "failed",
  "cancelled",
  "needs_attention",
];
const eventTypes = [
  ...statuses.map((status) => `run.${status}`),
  "run.started",
  "run.resolved",
  "agent.log",
  "verification.recorded",
  "source.unknown",
];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;

export function isHistoryId(value: unknown): value is string {
  return typeof value === "string" && value.length === 36 && UUID.test(value);
}

export function isHistoryDigest(value: unknown): value is string {
  return typeof value === "string" && value.length === 64 && SHA.test(value);
}

export interface HistoricalEvent {
  cursor: number;
  type: string;
  createdAt: number;
  text: string | null;
}

export interface HistoricalArtifact {
  sha256: string;
  availability: "included" | "excluded" | "missing" | "changed" | "unsafe";
  content: string | null;
}

export interface HistoricalRun {
  id: string;
  task: string | null;
  status: RunStatus;
  maxRuntimeMs: number;
  createdAt: number;
  deadlineAt: number | null;
  events: HistoricalEvent[];
  artifact: HistoricalArtifact | null;
}

export interface ContinuityPayload {
  exportId: string;
  exportedAt: number;
  simulation: true;
  textIncluded: boolean;
  workspace: {
    id: string;
    repository: string;
    state: "running" | "stopped";
    createdAt: number;
  };
  runs: HistoricalRun[];
  omissions: string[];
}

export interface ContinuityBundle {
  format: "argent-history";
  version: 1;
  sha256: string;
  payload: ContinuityPayload;
}

function continuityError(): never {
  throw new DomainError(400, "Invalid or unsupported Argent history bundle");
}

export function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    continuityError();
  const object = value as Record<string, unknown>;
  if (
    Object.keys(object).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(object, key))
  )
    continuityError();
  return object;
}

function timestamp(value: unknown): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0) continuityError();
}

function identity(value: unknown): void {
  if (!isHistoryId(value)) continuityError();
}

function text(value: unknown, max: number): void {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    continuityError();
  // This rejects common credentials, not every secret a user might paste in prose.
  if (
    /(?:gh[pousr]_[A-Za-z0-9_.-]{8,}|github_pat_[A-Za-z0-9_]{8,}|sk-[A-Za-z0-9_-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S+)/i.test(
      value,
    )
  )
    throw new DomainError(
      400,
      "Selected history text contains a credential marker",
    );
}

export function safeEventType(value: string): string {
  return eventTypes.includes(value) ? value : "source.unknown";
}

export function validateArtifactContent(
  content: string,
  runId: string,
  task: string | null,
  sha256: string,
): void {
  if (
    Buffer.byteLength(content) > CONTINUITY_LIMITS.artifactBytes ||
    digest(content) !== sha256
  )
    continuityError();
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    continuityError();
  }
  const artifact = record(parsed, ["runId", "task", "simulation"]);
  if (
    artifact.runId !== runId ||
    artifact.task !== task ||
    artifact.simulation !== true ||
    content !== JSON.stringify({ runId, task, simulation: true })
  )
    continuityError();
}

function validatePayload(value: unknown): asserts value is ContinuityPayload {
  const payload = record(value, [
    "exportId",
    "exportedAt",
    "simulation",
    "textIncluded",
    "workspace",
    "runs",
    "omissions",
  ]);
  identity(payload.exportId);
  timestamp(payload.exportedAt);
  if (payload.simulation !== true || typeof payload.textIncluded !== "boolean")
    continuityError();
  const workspace = record(payload.workspace, [
    "id",
    "repository",
    "state",
    "createdAt",
  ]);
  identity(workspace.id);
  timestamp(workspace.createdAt);
  if (
    typeof workspace.repository !== "string" ||
    workspace.repository.length > 250 ||
    workspace.repository.trim() !== workspace.repository ||
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
      workspace.repository,
    ) ||
    workspace.repository
      .split("/")
      .slice(-2)
      .some((part) => part === "." || part === "..") ||
    !["running", "stopped"].includes(workspace.state as string)
  )
    continuityError();
  const omissions = payload.omissions;
  if (
    !Array.isArray(omissions) ||
    omissions.length !== CONTINUITY_OMISSIONS.length ||
    !CONTINUITY_OMISSIONS.every((item, index) => omissions[index] === item)
  )
    continuityError();
  if (
    !Array.isArray(payload.runs) ||
    payload.runs.length > CONTINUITY_LIMITS.runs
  )
    continuityError();
  const runIds = new Set<string>();
  const eventCursors = new Set<number>();
  for (const value of payload.runs) {
    const run = record(value, [
      "id",
      "task",
      "status",
      "maxRuntimeMs",
      "createdAt",
      "deadlineAt",
      "events",
      "artifact",
    ]);
    identity(run.id);
    if (runIds.has(run.id as string)) continuityError();
    runIds.add(run.id as string);
    if (!statuses.includes(run.status as RunStatus)) continuityError();
    timestamp(run.createdAt);
    if (run.deadlineAt !== null) timestamp(run.deadlineAt);
    if (
      !Number.isSafeInteger(run.maxRuntimeMs) ||
      (run.maxRuntimeMs as number) < 100 ||
      (run.maxRuntimeMs as number) > 300000
    )
      continuityError();
    if (payload.textIncluded) text(run.task, 4000);
    else if (run.task !== null) continuityError();
    if (!Array.isArray(run.events) || run.events.length === 0)
      continuityError();
    let previous = 0;
    for (const value of run.events) {
      const event = record(value, ["cursor", "type", "createdAt", "text"]);
      timestamp(event.cursor);
      timestamp(event.createdAt);
      const cursor = event.cursor as number;
      if (
        cursor <= previous ||
        eventCursors.has(cursor) ||
        typeof event.type !== "string" ||
        !eventTypes.includes(event.type)
      )
        continuityError();
      previous = cursor;
      eventCursors.add(cursor);
      if (eventCursors.size > CONTINUITY_LIMITS.events) continuityError();
      if (event.text !== null) {
        if (
          !payload.textIncluded ||
          !["agent.log", "run.resolved"].includes(event.type)
        )
          continuityError();
        text(event.text, 2048);
      }
    }
    if (run.artifact === null) {
      if (run.status === "completed") continuityError();
      continue;
    }
    const artifact = record(run.artifact, [
      "sha256",
      "availability",
      "content",
    ]);
    if (
      !isHistoryDigest(artifact.sha256) ||
      !["included", "excluded", "missing", "changed", "unsafe"].includes(
        artifact.availability as string,
      )
    )
      continuityError();
    if (artifact.availability === "included") {
      if (!payload.textIncluded || typeof artifact.content !== "string")
        continuityError();
      validateArtifactContent(
        artifact.content,
        run.id as string,
        run.task as string,
        artifact.sha256,
      );
    } else if (artifact.content !== null) continuityError();
    if (!payload.textIncluded && artifact.availability !== "excluded")
      continuityError();
  }
}

export function encodeHistory(payload: ContinuityPayload): string {
  validatePayload(payload);
  const serialized = JSON.stringify(payload);
  const encoded = JSON.stringify({
    format: "argent-history",
    version: 1,
    sha256: digest(serialized),
    payload,
  } satisfies ContinuityBundle);
  if (Buffer.byteLength(encoded) > CONTINUITY_LIMITS.bytes) continuityError();
  return encoded;
}

export function decodeHistory(bytes: Uint8Array): ContinuityBundle {
  if (bytes.byteLength === 0 || bytes.byteLength > CONTINUITY_LIMITS.bytes)
    continuityError();
  try {
    const bundle = record(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      ["format", "version", "sha256", "payload"],
    );
    if (
      bundle.format !== "argent-history" ||
      bundle.version !== 1 ||
      !isHistoryDigest(bundle.sha256) ||
      digest(JSON.stringify(bundle.payload)) !== bundle.sha256
    )
      continuityError();
    validatePayload(bundle.payload);
    return bundle as unknown as ContinuityBundle;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    continuityError();
  }
}

export function historicalView(bundle: ContinuityBundle) {
  return {
    ...bundle.payload,
    readOnly: true,
    trust: "historical-untrusted",
    executionAllowed: false,
    verification: "historical-simulation-only",
    runs: bundle.payload.runs.map((run) => ({
      ...run,
      originalStatus: run.status,
      status: ["queued", "running", "cancelling", "needs_attention"].includes(
        run.status,
      )
        ? ("needs_attention" as const)
        : run.status,
    })),
  } as const;
}
