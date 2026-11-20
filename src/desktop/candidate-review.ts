import { changedTestPaths } from "../judging-changes.js";
import { DomainError } from "../domain.js";
import { REVIEW_POLICY, REVIEW_LIMITS } from "../local-command-review.js";
import type { LocalCommandReviewFile } from "../local-command-review.js";
import type {
  CandidateReviewView,
  CandidateConsentReceiptView,
} from "./contracts.js";
import { validateWorkspaceChanges } from "./changes.js";
import {
  validateCommandConfiguration,
  WORKSPACE_ID,
  CANDIDATE_IDENTITY,
} from "./command-configuration.js";

const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const invalid = () =>
  new DomainError(
    502,
    "The service returned an invalid candidate review or consent. Refresh to try again.",
  );
function record(value: unknown, keys: string[]): Record<string, unknown> {
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
function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string" || pattern.exec(value)?.[0] !== value)
    throw invalid();
  return value;
}
function count(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  )
    throw invalid();
  return value;
}

/** Rebuild every field. Neither repository text nor unknown service fields gain authority. */
export function validateCandidateReview(
  value: unknown,
  workspaceId: string,
  runAction = false,
): CandidateReviewView {
  const row = record(value, [
    ...(runAction ? ["action"] : []),
    "kind",
    "workspaceId",
    "identity",
    "policyVersion",
    "baseSha",
    "headSha",
    "treeId",
    "configurationState",
    "configuration",
    "approvalId",
    "files",
    "summary",
    "judgingChanges",
    "consent",
    "executionAllowed",
    "tested",
  ]);
  if (
    row.kind !== "local-candidate-review" ||
    row.workspaceId !== workspaceId ||
    (runAction && row.action !== "setup-run") ||
    row.policyVersion !== REVIEW_POLICY ||
    row.executionAllowed !== false ||
    row.tested !== false ||
    typeof row.configurationState !== "string" ||
    !["unchanged", "changed", "removed"].includes(row.configurationState)
  )
    throw invalid();
  const baseSha = text(row.baseSha, SHA),
    headSha = text(row.headSha, SHA),
    treeId = text(row.treeId, SHA);
  if (baseSha.length !== headSha.length || treeId.length !== headSha.length)
    throw invalid();
  const configuration = validateCommandConfiguration(
    {
      kind: "local-command-configuration",
      workspaceId,
      configuration: row.configuration,
      approval: null,
      executionAllowed: false,
    },
    workspaceId,
  ).configuration;
  if (!configuration || configuration.source.baseSha !== baseSha)
    throw invalid();
  let changes;
  try {
    changes = validateWorkspaceChanges(
      {
        kind: "workspace-changes",
        workspaceId,
        baseSha,
        headSha,
        simulation: false,
        tested: false,
        consistency: "live",
        files: row.files,
      },
      workspaceId,
    );
  } catch {
    throw invalid();
  }
  let blobBytes = 0;
  const files = changes.files.map((file): LocalCommandReviewFile => {
    const entry = record(file, [
      "path",
      "previousPath",
      "status",
      "oldMode",
      "newMode",
      "binary",
      "diff",
      "oldBlobId",
      "newBlobId",
      "oldBytes",
      "newBytes",
      "configuration",
    ]);
    const side = (mode: unknown, blob: unknown, bytes: unknown) => {
      if (mode === null) {
        if (blob !== null || bytes !== null) throw invalid();
        return { blob: null, bytes: null };
      }
      const oid = text(blob, SHA);
      if (oid.length !== headSha.length) throw invalid();
      const size = count(bytes, REVIEW_LIMITS.fileBytes);
      return { blob: oid, bytes: size };
    };
    const old = side(entry.oldMode, entry.oldBlobId, entry.oldBytes);
    const next = side(entry.newMode, entry.newBlobId, entry.newBytes);
    // The service loads one blob for exact renames and mode-only changes.
    if (old.blob !== null && old.blob === next.blob && old.bytes !== next.bytes)
      throw invalid();
    blobBytes +=
      (old.bytes ?? 0) + (old.blob === next.blob ? 0 : (next.bytes ?? 0));
    if (
      blobBytes > REVIEW_LIMITS.totalBytes ||
      (file.status === "added") !== (file.oldMode === null) ||
      (file.status === "deleted") !== (file.newMode === null) ||
      entry.configuration !==
        (file.path === "argent.json" || file.previousPath === "argent.json")
    )
      throw invalid();
    return {
      path: file.path,
      previousPath: file.previousPath,
      status: file.status,
      oldMode: file.oldMode,
      newMode: file.newMode,
      binary: file.binary,
      diff: file.diff,
      oldBlobId: old.blob,
      newBlobId: next.blob,
      oldBytes: old.bytes,
      newBytes: next.bytes,
      configuration: entry.configuration as boolean,
    };
  });
  const report = record(row.judgingChanges, ["testPaths"]);
  const expected = changedTestPaths(files);
  const paths = report.testPaths;
  if (
    paths === null
      ? expected.length !== 0
      : !Array.isArray(paths) ||
        paths.length !== expected.length ||
        expected.some((index, position) => paths[position] !== index)
  )
    throw invalid();
  const summary = record(row.summary, ["files", "textFiles", "binaryFiles"]);
  const binaryFiles = files.filter((file) => file.binary).length;
  if (
    summary.files !== files.length ||
    summary.binaryFiles !== binaryFiles ||
    summary.textFiles !== files.length - binaryFiles
  )
    throw invalid();
  let consent: CandidateReviewView["consent"] = null;
  if (row.consent !== null) {
    const stored = record(row.consent, ["id", "createdAt"]);
    if (
      binaryFiles ||
      !configuration.config.commands[runAction ? "run" : "test"]
    )
      throw invalid();
    consent = {
      id: text(stored.id, WORKSPACE_ID),
      createdAt: count(stored.createdAt),
    };
  }
  return {
    kind: "local-candidate-review",
    ...(runAction ? { action: "setup-run" as const } : {}),
    workspaceId,
    identity: text(row.identity, CANDIDATE_IDENTITY),
    policyVersion: REVIEW_POLICY,
    baseSha,
    headSha,
    treeId,
    configurationState:
      row.configurationState as CandidateReviewView["configurationState"],
    configuration,
    approvalId: text(row.approvalId, WORKSPACE_ID),
    files,
    judgingChanges: { testPaths: paths === null ? null : expected },
    summary: {
      files: files.length,
      textFiles: files.length - binaryFiles,
      binaryFiles,
    },
    consent,
    executionAllowed: false,
    tested: false,
  };
}

export function validateCandidateConsentReceipt(
  value: unknown,
  workspaceId: string,
  reviewIdentity: string,
  runAction = false,
): CandidateConsentReceiptView {
  const row = record(value, [
    ...(runAction ? ["action"] : []),
    "kind",
    "workspaceId",
    "id",
    "reviewIdentity",
    "headSha",
    "createdAt",
    "historical",
    "executionAllowed",
    "tested",
  ]);
  if (
    row.kind !== "local-candidate-consent-receipt" ||
    row.workspaceId !== workspaceId ||
    (runAction && row.action !== "setup-run") ||
    row.reviewIdentity !== reviewIdentity ||
    row.historical !== true ||
    row.executionAllowed !== false ||
    row.tested !== false
  )
    throw invalid();
  return {
    kind: "local-candidate-consent-receipt",
    ...(runAction ? { action: "setup-run" as const } : {}),
    workspaceId,
    id: text(row.id, WORKSPACE_ID),
    reviewIdentity: text(row.reviewIdentity, CANDIDATE_IDENTITY),
    headSha: text(row.headSha, SHA),
    createdAt: count(row.createdAt),
    historical: true,
    executionAllowed: false,
    tested: false,
  };
}
