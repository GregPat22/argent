import { createHash } from "node:crypto";
import { DomainError, type ObservedAgentContext } from "./domain.js";
import { judgingChangeCount, type FileFindings } from "./judging-changes.js";
import type { LocalCheckView } from "./local-checks.js";
import type { LocalCommandCandidateReview } from "./local-command-review.js";
import type { Store } from "./store.js";

export interface DraftEvidencePreview {
  kind: "draft-evidence-preview";
  workspaceId: string;
  reviewIdentity: string;
  headSha: string;
  body: string;
}
export const DRAFT_EVIDENCE_BYTES = 60_000;
const oversized = () =>
  new DomainError(413, "The full draft evidence exceeds the preview limit.");

// Repository-controlled fields occur only inside indented Markdown code.
// Keep control characters, including newlines and bidi marks, visible.
function literal(value: string): string {
  if (value.length > DRAFT_EVIDENCE_BYTES) throw oversized();
  return JSON.stringify(value).replace(
    /[^ -~]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

function publicName(name: string): string {
  // Refuse embedded locations and known credential forms even in labels.
  // Only repository-relative names are needed in this record.
  if (
    /(?:^|[\s=:(])(?:[/~\\]|[a-z]:[\\/])|:\/\/|(?:github_pat_|gh[pousr]_|sk-(?:proj-|ant-|[A-Za-z0-9]{12})|-----BEGIN [A-Z ]*PRIVATE KEY)/i.test(
      name,
    )
  )
    throw new DomainError(
      409,
      "A finding contains a private reference. The draft evidence preview is unavailable.",
    );
  return literal(name);
}
function version(value: string | null): string {
  if (value === null) return "absent";
  // Lockfile versions can be source addresses or local paths instead of versions.
  if (!/^v?[0-9]+\.[0-9]+\.[0-9]+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(value))
    return "version not shareable";
  return publicName(value);
}

export function draftEvidenceBody(
  review: LocalCommandCandidateReview,
  check: LocalCheckView | null,
  consentId: string | null,
  agent: ObservedAgentContext | null = null,
): string {
  const { observation: o, files, judgingChanges: report } = review;
  const diffHash = createHash("sha256")
    .update(
      JSON.stringify([
        "argent-committed-changes-v1",
        files.map((f) => [
          f.path,
          f.previousPath,
          f.oldMode,
          f.oldBlobId,
          f.newMode,
          f.newBlobId,
        ]),
      ]),
    )
    .digest("hex");
  const body = [
    "## Argent evidence",
    "",
    `Workspace base: \`${o.baseSha}\``,
    "",
    `Reviewed commit: \`${o.headSha}\``,
    "",
    `Git tree: \`${o.treeId}\``,
    "",
    `Committed change manifest (SHA-256): \`${diffHash}\``,
    "",
    "The manifest covers changed paths, modes and Git blob IDs between these commits.",
    "",
    agent
      ? `The latest completed Claude Code run observed this branch and commit at exit. Permission mode: ${agent.permissionMode === "full" ? "full access" : "edits only"}. Model reported by the CLI: ${agent.reportedModel ? publicName(agent.reportedModel) : "unavailable"}.`
      : "Workspace agent: Claude Code, using its CLI default model. No matching agent run is recorded. The actual model and permission mode are unavailable.",
    "",
    "### Latest setup/test check",
    "",
  ];
  const result = check?.result;
  if (!check) body.push("No setup/test check has been recorded.");
  else if (!result)
    body.push(
      `Latest check: ${check.status}. No test result recorded for this check.`,
    );
  else if (
    check.kind === "local-check" &&
    check.workspaceId === o.workspaceId &&
    result.policy === "argent-local-check-v1" &&
    result.consentId === consentId &&
    result.headSha === o.headSha &&
    result.baseSha === o.baseSha &&
    result.treeId === o.treeId &&
    result.configurationIdentity === o.configurationIdentity &&
    result.reviewIdentity === review.identity &&
    result.judgingChangeCount === judgingChangeCount(report)
  ) {
    body.push(`Checks ${result.outcome} for the reviewed commit.`, "");
    for (const phase of result.phases) {
      const outcome =
        phase.exitCode === null
          ? (phase.signal ?? phase.outcome)
          : `exit ${phase.exitCode}`;
      body.push(`- ${phase.action}: ${outcome} (${phase.durationMs} ms)`);
    }
    if (!result.phases.some((p) => p.action === "test"))
      body.push("- test: did not run");
  } else
    body.push(
      "The latest result does not match the reviewed evidence. No matching result is reported.",
    );

  body.push(
    "",
    "### Judging changes",
    "",
    `${judgingChangeCount(report)} reported changes under the recognisers below.`,
  );
  function path(index: number) {
    const f = files[index]!;
    return (
      (f.previousPath ? publicName(f.previousPath) + " -> " : "") +
      publicName(f.path) +
      (f.oldMode === "120000" || f.newMode === "120000"
        ? " (symbolic link)"
        : "")
    );
  }
  let bytes = Buffer.byteLength(body.join("\n"));
  function add(line: string) {
    bytes += 1 + Buffer.byteLength(line);
    if (bytes > DRAFT_EVIDENCE_BYTES) throw oversized();
    body.push(line);
  }
  function section(label: string) {
    add("");
    add(label);
    add("");
  }
  function paths(label: string, indices: readonly number[] | null) {
    section(label);
    if (!indices?.length) {
      add(indices === null ? "Not checkable." : "No recognised changes.");
      return;
    }
    for (const index of indices)
      add("    " + files[index]!.status + " " + path(index));
  }
  function findings<T>(
    label: string,
    group: readonly FileFindings<T>[] | null,
    line: (e: T) => string,
  ) {
    section(label);
    if (!group) {
      add("Not checkable.");
      return;
    }
    let any = false;
    for (const { file, entries } of group) {
      if (entries?.length === 0) continue;
      any = true;
      const filePrefix = "    " + path(file) + ": ";
      if (!entries) add(filePrefix + "changed and not summarised");
      else for (const entry of entries) add(filePrefix + line(entry));
    }
    if (!any) add("No recognised changes.");
  }
  paths("JavaScript and TypeScript test paths", report.testPaths);
  findings(
    "Recognised new skip markers",
    report.skips,
    (e) => `${e.marker}, line ${e.line}`,
  );
  paths(
    "Approved command configuration, check configurations and GitHub workflows",
    report.commandPaths,
  );
  findings(
    "npm script definitions",
    report.scripts,
    (e) => `${e.change} ${publicName(e.name)}`,
  );
  findings(
    "npm lockfile packages",
    report.packages,
    (e) =>
      `${e.change} ${publicName(e.location)}, ${version(e.before)} -> ${version(e.after)}` +
      (e.newInstallScript ? ", newly declares an install script" : "") +
      (e.resolution
        ? `, source: ${e.resolution.before ?? "absent"} -> ${e.resolution.after}`
        : ""),
  );
  findings(
    "Committed npm registry settings",
    report.registrySettings,
    (e) => `${e.change} ${publicName(e.name)}`,
  );
  return body.join("\n");
}

export async function readDraftEvidence(
  store: Store,
  root: string,
  workspaceId: string,
  operator: string,
  expected: string,
  signal: AbortSignal,
): Promise<DraftEvidencePreview> {
  if (!/^[a-f0-9]{64}$/.test(expected) || expected.length !== 64)
    throw new DomainError(
      400,
      "Expected the displayed candidate review identity",
    );
  const { review, receipt } = await store.localCommandConsents.inspect(
    root,
    workspaceId,
    operator,
    signal,
    "setup-test",
  );
  if (review.identity !== expected)
    throw new DomainError(
      409,
      "The reviewed candidate changed. Refresh the candidate review.",
    );
  const check = store.localChecks.latestRecorded(workspaceId, operator);
  return {
    kind: "draft-evidence-preview",
    workspaceId,
    reviewIdentity: expected,
    headSha: review.observation.headSha,
    body: draftEvidenceBody(
      review,
      check,
      receipt?.id ?? null,
      store.latestAgentContext(
        workspaceId,
        store.getWorkspace(workspaceId).local!.branch,
        review.observation.baseSha,
        review.observation.headSha,
      ),
    ),
  };
}
