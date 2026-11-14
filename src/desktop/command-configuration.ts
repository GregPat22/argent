import { DomainError } from "../domain.js";
import {
  COMMAND_CONFIG_PATH,
  COMMAND_CONFIG_POLICY,
  parseLocalCommandConfig,
  type LocalCommandConfigDescriptor,
} from "../local-command-config.js";
import type {
  CommandApprovalReceiptView,
  CommandConfigurationView,
} from "./contracts.js";

export const WORKSPACE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const CANDIDATE_IDENTITY = /^[a-f0-9]{64}$/;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

type Row = Record<string, unknown>;
type Fail = () => DomainError;

/** Exactly these keys: an unknown field is refused, never passed on. */
function record(value: unknown, keys: readonly string[], fail: Fail): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw fail();
  const row = value as Row;
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(row, key))
  )
    throw fail();
  return row;
}

function text(value: unknown, pattern: RegExp, fail: Fail): string {
  if (typeof value !== "string" || !pattern.test(value)) throw fail();
  return value;
}

function time(value: unknown, fail: Fail): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw fail();
  return value;
}

/** Rebuilds the descriptor from validated fields with the service's own schema. */
function descriptor(value: unknown, fail: Fail): LocalCommandConfigDescriptor {
  const row = record(
    value,
    ["kind", "config", "source", "approvalCandidate"],
    fail,
  );
  const source = record(
    row.source,
    ["path", "baseSha", "blobId", "sha256"],
    fail,
  );
  const candidate = record(
    row.approvalCandidate,
    ["identity", "policyVersion"],
    fail,
  );
  if (
    row.kind !== "local-command-config" ||
    source.path !== COMMAND_CONFIG_PATH ||
    candidate.policyVersion !== COMMAND_CONFIG_POLICY
  )
    throw fail();
  let config: LocalCommandConfigDescriptor["config"];
  try {
    config = parseLocalCommandConfig(Buffer.from(JSON.stringify(row.config)));
  } catch {
    throw fail();
  }
  const baseSha = text(source.baseSha, SHA, fail);
  const blobId = text(source.blobId, SHA, fail);
  if (baseSha.length !== blobId.length) throw fail();
  return {
    kind: "local-command-config",
    config,
    source: {
      path: COMMAND_CONFIG_PATH,
      baseSha,
      blobId,
      sha256: text(source.sha256, CANDIDATE_IDENTITY, fail),
    },
    approvalCandidate: {
      identity: text(candidate.identity, CANDIDATE_IDENTITY, fail),
      policyVersion: COMMAND_CONFIG_POLICY,
    },
  };
}

/** Service content is display data. It never becomes permission to run. */
export function validateCommandConfiguration(
  value: unknown,
  workspaceId: string,
): CommandConfigurationView {
  const fail = () =>
    new DomainError(
      502,
      "The service returned an invalid command configuration. Refresh to try again.",
    );
  const row = record(
    value,
    ["kind", "workspaceId", "configuration", "approval", "executionAllowed"],
    fail,
  );
  if (
    row.kind !== "local-command-configuration" ||
    row.workspaceId !== workspaceId ||
    row.executionAllowed !== false
  )
    throw fail();
  const configuration =
    row.configuration === null ? null : descriptor(row.configuration, fail);
  let approval: CommandConfigurationView["approval"] = null;
  if (row.approval !== null) {
    // An approval always belongs to a configuration read in the same request.
    if (!configuration) throw fail();
    const stored = record(row.approval, ["id", "approvedAt"], fail);
    approval = {
      id: text(stored.id, WORKSPACE_ID, fail),
      approvedAt: time(stored.approvedAt, fail),
    };
  }
  return {
    kind: "local-command-configuration",
    workspaceId,
    configuration,
    approval,
    executionAllowed: false,
  };
}

/** A receipt is history for the reviewed identity, not the current state. */
export function validateCommandApprovalReceipt(
  value: unknown,
  workspaceId: string,
  expectedCandidateIdentity: string,
): CommandApprovalReceiptView {
  const fail = () =>
    new DomainError(
      502,
      "The service returned an invalid approval receipt. Refresh to read the current state.",
    );
  const row = record(
    value,
    [
      "kind",
      "workspaceId",
      "approval",
      "event",
      "historical",
      "executionAllowed",
    ],
    fail,
  );
  if (
    row.kind !== "local-command-approval-receipt" ||
    row.workspaceId !== workspaceId ||
    row.historical !== true ||
    row.executionAllowed !== false
  )
    throw fail();
  const approval = record(
    row.approval,
    ["id", "workspaceId", "descriptor", "approvedAt"],
    fail,
  );
  const approved = descriptor(approval.descriptor, fail);
  if (approved.approvalCandidate.identity !== expectedCandidateIdentity)
    throw fail();
  const event = record(row.event, ["cursor", "type", "createdAt"], fail);
  if (
    typeof event.cursor !== "number" ||
    !Number.isSafeInteger(event.cursor) ||
    event.cursor < 1 ||
    (event.type !== "configuration.approved" &&
      event.type !== "configuration.reused")
  )
    throw fail();
  return {
    kind: "local-command-approval-receipt",
    workspaceId,
    approval: {
      id: text(approval.id, WORKSPACE_ID, fail),
      // The workspace that first approved these bytes; a sibling may reuse it.
      workspaceId: text(approval.workspaceId, WORKSPACE_ID, fail),
      descriptor: approved,
      approvedAt: time(approval.approvedAt, fail),
    },
    event: {
      cursor: event.cursor,
      type: event.type,
      createdAt: time(event.createdAt, fail),
    },
    historical: true,
    executionAllowed: false,
  };
}
