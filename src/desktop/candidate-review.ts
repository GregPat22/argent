import {
  judgingChangeCount,
  validJudgingChangeCount,
  isManifest,
  isLockfile,
  isNpmrc,
  isRegistrySetting,
  validInstallation,
  type PackageChange,
  PACKAGE_SOURCES,
  validFindingText,
  type FileFindings,
  type NamedChange,
  DETAIL_LIMIT,
  FILE_DETAIL_LIMIT,
  changedPaths,
  isTestPath,
  SKIP_MARKERS,
  type SkipMarker,
  isCommandPath,
} from "../judging-changes.js";
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

function validateFindings<T>(
  input: unknown,
  files: readonly LocalCommandReviewFile[],
  matches: (path: string) => boolean,
  readEntries: (
    items: unknown[],
    change: LocalCommandReviewFile,
    oldSide: boolean,
    newSide: boolean,
  ) => T[],
): FileFindings<T>[] | null {
  const expected = changedPaths(files, matches);
  if (input === null && !expected.length) return null;
  if (!Array.isArray(input) || input.length !== expected.length)
    throw invalid();
  let remaining = DETAIL_LIMIT;
  return expected.map((file, index) => {
    const row = record(input[index], ["file", "entries"]);
    if (row.file !== file) throw invalid();
    if (row.entries === null) return { file, entries: null };
    const change = files[file]!;
    const oldSide =
      change.oldMode !== null && matches(change.previousPath ?? change.path);
    const newSide = change.newMode !== null && matches(change.path);
    if (
      !Array.isArray(row.entries) ||
      row.entries.length > remaining ||
      change.binary ||
      (oldSide &&
        (change.oldMode === "120000" || change.oldBytes! > 64 * 1024)) ||
      (newSide && (change.newMode === "120000" || change.newBytes! > 64 * 1024))
    )
      throw invalid();
    remaining -= row.entries.length;
    return {
      file,
      entries: readEntries(row.entries, change, oldSide, newSide),
    };
  });
}

function namedEntries(
  items: unknown[],
  change: LocalCommandReviewFile,
  oldSide: boolean,
  newSide: boolean,
  validName: (value: unknown) => value is string = validFindingText,
): NamedChange[] {
  const moved = !!change.previousPath && oldSide && newSide;
  let oldCount = 0,
    newCount = 0;
  let previous = "";
  return items.map((item): NamedChange => {
    const pair = record(item, ["name", "change"]);
    if (!validName(pair.name) || pair.name <= previous) throw invalid();
    previous = pair.name;
    const kind = pair.change;
    if (
      kind !== "added" &&
      kind !== "removed" &&
      kind !== "modified" &&
      kind !== "moved"
    )
      throw invalid();
    if ((kind === "moved") !== moved) throw invalid();
    if (kind !== "added" && (!oldSide || ++oldCount > FILE_DETAIL_LIMIT))
      throw invalid();
    if (kind !== "removed" && (!newSide || ++newCount > FILE_DETAIL_LIMIT))
      throw invalid();
    if (oldSide && newSide && !moved && change.oldBlobId === change.newBlobId)
      throw invalid();
    return { name: pair.name, change: kind };
  });
}

function skipEntries(
  items: unknown[],
  change: LocalCommandReviewFile,
  oldSide: boolean,
  newSide: boolean,
): SkipMarker[] {
  if (
    items.length > FILE_DETAIL_LIMIT ||
    (items.length &&
      (!newSide || (oldSide && change.oldBlobId === change.newBlobId)))
  )
    throw invalid();
  let previous = 0;
  return items.map((item) => {
    const row = record(item, ["marker", "line"]);
    const marker = SKIP_MARKERS.find((value) => value === row.marker);
    const line = count(row.line, change.newBytes ?? 0);
    if (!marker || line <= previous) throw invalid();
    previous = line;
    return { marker, line };
  });
}

function packageEntries(
  items: unknown[],
  change: LocalCommandReviewFile,
  oldSide: boolean,
  newSide: boolean,
): PackageChange[] {
  const moved = oldSide && newSide && !!change.previousPath;
  let previous = "";
  return items.map((item) => {
    const row = record(item, [
      "location",
      "change",
      "before",
      "after",
      "newInstallScript",
      "resolution",
    ]);
    const { location, before, after, newInstallScript } = row;
    if (
      typeof newInstallScript !== "boolean" ||
      (newInstallScript && (after === null || moved)) ||
      !validInstallation(location) ||
      location <= previous ||
      !(before === null || (oldSide && validFindingText(before))) ||
      !(after === null || (newSide && validFindingText(after))) ||
      (before === null && after === null)
    )
      throw invalid();
    let resolution: PackageChange["resolution"] = null;
    if (row.resolution !== null) {
      const source = record(row.resolution, ["before", "after"]);
      const oldSource = PACKAGE_SOURCES.find((kind) => kind === source.before);
      const newSource = PACKAGE_SOURCES.find((kind) => kind === source.after);
      if (
        !newSource ||
        !newSide ||
        after === null ||
        moved ||
        (before === null
          ? source.before !== null || newSource === "not recorded"
          : !oldSource ||
            (oldSource === "not recorded" && newSource === "not recorded"))
      )
        throw invalid();
      resolution = { before: oldSource ?? null, after: newSource };
    }
    previous = location;
    const kind =
      before === null
        ? "added"
        : after === null
          ? "removed"
          : moved
            ? "moved"
            : "modified";
    if (
      row.change !== kind ||
      (moved && (kind !== "moved" || before !== after)) ||
      (kind === "modified" &&
        before === after &&
        !newInstallScript &&
        !resolution) ||
      (oldSide && newSide && !moved && change.oldBlobId === change.newBlobId)
    )
      throw invalid();
    return {
      location,
      change: kind,
      before,
      after,
      newInstallScript,
      resolution,
    };
  });
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
  const destinations = new Set(changes.files.map((file) => file.path));
  const renameSources = new Set<string>();
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
    if (file.previousPath !== null) {
      if (
        destinations.has(file.previousPath) ||
        renameSources.has(file.previousPath) ||
        old.blob !== next.blob ||
        file.oldMode !== file.newMode
      )
        throw invalid();
      renameSources.add(file.previousPath);
    }
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
  const report = record(row.judgingChanges, [
    "testPaths",
    "commandPaths",
    "scripts",
    "skips",
    "packages",
    "registrySettings",
  ]);
  const validateIndices = (value: unknown, expected: number[]): number[] => {
    if (
      !Array.isArray(value) ||
      value.length !== expected.length ||
      expected.some((index, position) => value[position] !== index)
    )
      throw invalid();
    return expected;
  };
  const commandPaths = validateIndices(
    report.commandPaths,
    changedPaths(files, isCommandPath),
  );
  const expected = changedPaths(files, isTestPath);
  const paths = report.testPaths;
  if (paths === null && expected.length) throw invalid();
  const testPaths = paths === null ? null : validateIndices(paths, expected);
  const scripts = validateFindings(
    report.scripts,
    files,
    isManifest,
    namedEntries,
  );
  const skips = validateFindings(report.skips, files, isTestPath, skipEntries);
  if ((testPaths === null) !== (skips === null)) throw invalid();
  const packages = validateFindings(
    report.packages,
    files,
    isLockfile,
    packageEntries,
  );
  const registrySettings = validateFindings(
    report.registrySettings,
    files,
    isNpmrc,
    (items, change, oldSide, newSide) =>
      namedEntries(items, change, oldSide, newSide, isRegistrySetting),
  );
  const judgingChanges = {
    testPaths,
    commandPaths,
    scripts,
    skips,
    packages,
    registrySettings,
  };
  if (!validJudgingChangeCount(judgingChangeCount(judgingChanges)))
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
    judgingChanges,
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
