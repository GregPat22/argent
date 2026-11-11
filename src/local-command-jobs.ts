import { createHash } from "node:crypto";
import {
  DomainError,
  requireInteger,
  requireString,
  type Run,
} from "./domain.js";
import {
  COMMAND_CONFIG_PATH,
  COMMAND_CONFIG_POLICY,
  parseLocalCommandConfig,
  type LocalCommandConfigDescriptor,
} from "./local-command-config.js";

export type CommandAction = "setup" | "run" | "test";
export interface CommandJobRequest {
  workspaceId: string;
  operatorId: string;
  approvalId: string;
  candidateIdentity: string;
  action: CommandAction;
  requestKey: string;
  maxRuntimeMs?: number;
}
export type DormantCommandPlan = Readonly<{
  kind: "dormant-command-plan";
  version: 1;
  execution: "forbidden";
  action: CommandAction;
  approvalId: string;
  operatorId: string;
  candidate: LocalCommandConfigDescriptor;
}>;
/** Ownership metadata only. This payload can never be passed to an executor. */
export type CommandJob = Readonly<{
  kind: "dormant-command-job";
  run: Readonly<Run>;
  plan: DormantCommandPlan;
}>;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const invalid = () => new DomainError(409, "Invalid dormant command job");

function identity(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || pattern.exec(value)?.[0] !== value)
    throw invalid();
  return value;
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(row, key))
  )
    throw invalid();
  return row;
}
function action(value: unknown): CommandAction {
  if (value !== "setup" && value !== "run" && value !== "test") throw invalid();
  return value;
}

export function commandRequest(
  input: CommandJobRequest,
): Required<CommandJobRequest> {
  if (!input || typeof input !== "object") throw invalid();
  const row = object(input, [
    "workspaceId",
    "operatorId",
    "approvalId",
    "candidateIdentity",
    "action",
    "requestKey",
    ...(Object.hasOwn(input, "maxRuntimeMs") ? ["maxRuntimeMs"] : []),
  ]);
  return Object.freeze({
    workspaceId: identity(row.workspaceId, UUID),
    operatorId: requireString(row.operatorId, "operatorId", 128),
    approvalId: identity(row.approvalId, UUID),
    candidateIdentity: identity(row.candidateIdentity, DIGEST),
    action: action(row.action),
    requestKey: requireString(row.requestKey, "Idempotency-Key", 128),
    maxRuntimeMs: requireInteger(
      row.maxRuntimeMs ?? 1800000,
      "maxRuntimeMs",
      1000,
      7200000,
    ),
  });
}

export function commandFingerprint(
  request: Required<CommandJobRequest>,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "dormant-command-request-v1",
        request.workspaceId,
        request.operatorId,
        request.approvalId,
        request.candidateIdentity,
        request.action,
        request.maxRuntimeMs,
      ]),
    )
    .digest("hex");
}

/** Validates persisted bytes without consulting or executing repository files. */
export function readCommandPlan(text: unknown): DormantCommandPlan {
  try {
    if (typeof text !== "string" || Buffer.byteLength(text) > 68 << 10)
      throw invalid();
    const row = object(JSON.parse(text) as unknown, [
      "kind",
      "version",
      "execution",
      "action",
      "approvalId",
      "operatorId",
      "candidate",
    ]);
    if (
      row.kind !== "dormant-command-plan" ||
      row.version !== 1 ||
      row.execution !== "forbidden"
    )
      throw invalid();
    const candidate = object(row.candidate, [
      "kind",
      "config",
      "source",
      "approvalCandidate",
    ]);
    const source = object(candidate.source, [
      "path",
      "baseSha",
      "blobId",
      "sha256",
    ]);
    const approvalCandidate = object(candidate.approvalCandidate, [
      "identity",
      "policyVersion",
    ]);
    if (
      candidate.kind !== "local-command-config" ||
      source.path !== COMMAND_CONFIG_PATH ||
      approvalCandidate.policyVersion !== COMMAND_CONFIG_POLICY
    )
      throw invalid();
    const config = parseLocalCommandConfig(
      Buffer.from(JSON.stringify(candidate.config)),
    );
    const selected = action(row.action);
    if (!config.commands[selected]) throw invalid();
    return Object.freeze({
      kind: "dormant-command-plan",
      version: 1,
      execution: "forbidden",
      action: selected,
      approvalId: identity(row.approvalId, UUID),
      operatorId: requireString(row.operatorId, "operatorId", 128),
      candidate: Object.freeze({
        kind: "local-command-config",
        config,
        source: Object.freeze({
          path: COMMAND_CONFIG_PATH,
          baseSha: identity(source.baseSha, SHA),
          blobId: identity(source.blobId, SHA),
          sha256: identity(source.sha256, DIGEST),
        }),
        approvalCandidate: Object.freeze({
          identity: identity(approvalCandidate.identity, DIGEST),
          policyVersion: COMMAND_CONFIG_POLICY,
        }),
      }),
    });
  } catch {
    throw invalid();
  }
}
