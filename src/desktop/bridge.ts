import {
  githubRepository,
  publicationBaseRef,
  publicationTitle,
  isPublicationUrl,
  PUBLICATION_MAX_COMMITS,
} from "../publication-record.js";
import {
  DRAFT_EVIDENCE_BYTES,
  type DraftEvidencePreview,
} from "../draft-evidence.js";
import {
  commitDetails,
  type CommitReceipt,
  type StagedReview,
} from "../local-commit.js";
import { validateCheckView } from "./checks.js";
import {
  DomainError,
  requireInteger,
  requireString,
  type Workspace,
} from "../domain.js";
import type {
  BridgeReply,
  PublicationInput,
  PublicationReview,
  PublicationStatus,
  ServiceStatus,
} from "./contracts.js";
import {
  ensureService,
  OTHER_BUILD_MESSAGE,
  probeService,
  readConnection,
  serviceRequest,
  type ServiceConnection,
  type ServiceProbe,
} from "./service-client.js";

import { validateWorkspaceChanges } from "./changes.js";
import {
  CANDIDATE_IDENTITY,
  WORKSPACE_ID,
  validateCommandApprovalReceipt,
  validateCommandConfiguration,
} from "./command-configuration.js";

import {
  validateCandidateReview,
  validateCandidateConsentReceipt,
} from "./candidate-review.js";
import { REVIEW_LIMITS } from "../local-command-review.js";

export const APP_URL = "argent://app/index.html";

export function trustedSender(url: string, mainFrame: boolean): boolean {
  return mainFrame && url === APP_URL;
}

/** Asks the person to choose a repository folder; null when they cancel. */
export type ChooseDirectory = () => Promise<string | null>;

const matches = (value: unknown, expression: RegExp): value is string =>
  typeof value === "string" && expression.exec(value)?.[0] === value;

function publicationInput(value: unknown): PublicationInput {
  const input = value as Partial<PublicationInput> | null;
  if (
    !input ||
    Object.keys(input).length !== 4 ||
    !matches(input.reviewIdentity, CANDIDATE_IDENTITY) ||
    !githubRepository(input.repository) ||
    !publicationBaseRef(input.baseBranch) ||
    !publicationTitle(input.title)
  )
    throw new DomainError(
      400,
      "Expected a review identity, a GitHub owner/repository, a base branch and a single-line title",
    );
  return {
    reviewIdentity: input.reviewIdentity,
    repository: input.repository,
    baseBranch: input.baseBranch,
    title: input.title,
  };
}

function publicationResponse(
  value: unknown,
  workspaceId: string,
  input?: PublicationInput,
  expectedIdentity?: string,
): PublicationReview | PublicationStatus {
  const invalid = () =>
    new DomainError(502, "Invalid draft publication response");
  const target = value as Partial<
    PublicationReview & { status: string; phase: string; url: string | null }
  > | null;
  if (
    !target ||
    target.workspaceId !== workspaceId ||
    !matches(target.identity, CANDIDATE_IDENTITY) ||
    (expectedIdentity && target.identity !== expectedIdentity) ||
    !githubRepository(target.repository) ||
    !publicationBaseRef(target.baseBranch) ||
    (input &&
      (target.repository !== input.repository ||
        target.baseBranch !== input.baseBranch)) ||
    target.branch !== "argent/" + workspaceId.slice(0, 8) ||
    !matches(target.headSha, /^[a-f0-9]{40}$/) ||
    !matches(target.baseSha, /^[a-f0-9]{40}$/) ||
    target.branch === target.baseBranch ||
    target.headSha === target.baseSha
  )
    throw invalid();
  const common = {
    workspaceId,
    identity: target.identity,
    repository: target.repository,
    baseBranch: target.baseBranch,
    baseSha: target.baseSha,
    branch: target.branch,
    headSha: target.headSha,
  };
  if (input && !expectedIdentity) {
    if (
      target.reviewIdentity !== input.reviewIdentity ||
      target.title !== input.title ||
      typeof target.body !== "string" ||
      !target.body.trim() ||
      /[\x00-\x08\x0b-\x1f\x7f]/.test(target.body) ||
      Buffer.byteLength(target.body) > DRAFT_EVIDENCE_BYTES ||
      typeof target.commitCount !== "number" ||
      !Number.isSafeInteger(target.commitCount) ||
      target.commitCount > PUBLICATION_MAX_COMMITS ||
      target.commitCount < 1
    )
      throw invalid();
    return {
      ...common,
      ...input,
      commitCount: target.commitCount,
      body: target.body,
    };
  }
  if (
    target.status === "needs_attention" &&
    (target.phase === "push" || target.phase === "draft") &&
    target.url === null
  )
    return { ...common, status: target.status, phase: target.phase, url: null };
  if (
    target.status !== "published" ||
    target.phase !== "complete" ||
    !isPublicationUrl(target.url, target.repository)
  )
    throw invalid();
  return {
    ...common,
    status: target.status,
    phase: target.phase,
    url: target.url,
  };
}

export class DesktopClient {
  /** The last instance seen running this build; instance IDs never change build. */
  private verifiedInstance: string | null = null;

  constructor(
    private readonly directory: string,
    private readonly chooseDirectory: ChooseDirectory = async () => null,
  ) {}

  async call(method: unknown, args: unknown): Promise<BridgeReply> {
    try {
      return { ok: true, value: await this.invoke(method, args) };
    } catch (error) {
      const message =
        error instanceof DomainError
          ? error.status >= 400 && error.status < 500
            ? `Request rejected (${error.status}): ${error.message}`
            : error.message
          : "The local service is unavailable. Reconnect to try again.";
      return { ok: false, error: message };
    }
  }

  private async requireBuild(connection: ServiceConnection): Promise<void> {
    if (connection.instanceId === this.verifiedInstance) return;
    const probe = await probeService(connection);
    if (probe === "other-build")
      throw new DomainError(409, OTHER_BUILD_MESSAGE);
    // An absent service is left to the request itself, which reports it.
    if (probe === "current") this.verifiedInstance = connection.instanceId;
  }

  private async invoke(method: unknown, args: unknown): Promise<unknown> {
    if (
      typeof method !== "string" ||
      !Array.isArray(args) ||
      args.length > 5 ||
      JSON.stringify(args).length > 20000
    ) {
      throw new DomainError(400, "Invalid desktop request");
    }
    if (method === "status" || method === "startService") {
      if (args.length)
        throw new DomainError(400, "Unexpected service arguments");
      if (method === "startService") {
        try {
          await ensureService(this.directory);
        } catch (error) {
          // Reported below as otherBuild, with the stop action as its remedy.
          if (
            !(error instanceof DomainError) ||
            error.message !== OTHER_BUILD_MESSAGE
          )
            throw error;
        }
      }
      const connection = readConnection(this.directory);
      const probe: ServiceProbe = connection
        ? await probeService(connection)
        : "absent";
      if (probe === "current") this.verifiedInstance = connection!.instanceId;
      return {
        connected: probe === "current",
        otherBuild: probe === "other-build",
        engine: "local",
      } satisfies ServiceStatus;
    }
    const connection = readConnection(this.directory);
    if (!connection)
      throw new DomainError(
        503,
        "The local execution service is disconnected. Reconnect to continue.",
      );
    // Stopping is the remedy for a service of another build, so it alone may
    // reach one. Any other route could be missing or mean something else there.
    const send: typeof serviceRequest = async (target, ...rest) => {
      if (method !== "stopService") await this.requireBuild(target);
      return serviceRequest(target, ...rest);
    };
    const str = (index: number, label: string, max = 4000) =>
      requireString(args[index], label, max);
    const id = (index = 0) => encodeURIComponent(str(index, "identifier", 128));
    const uuid = (value: unknown): value is string =>
      typeof value === "string" && WORKSPACE_ID.exec(value)?.[0] === value;
    const before = (index: number) =>
      args[index] === undefined
        ? ""
        : `?before=${encodeURIComponent(str(index, "cursor", 128))}`;
    switch (method) {
      case "stopService":
        if (args.length)
          throw new DomainError(400, "Unexpected service arguments");
        await send(connection, "/service/stop", "POST", {});
        return null;
      case "listWorkspaces":
        return send(connection, `/workspaces${before(0)}`);
      case "createWorkspace":
        return send(connection, "/workspaces", "POST", {
          repository: str(0, "repository", 250),
        });
      case "createLocalWorkspace": {
        if (args.length > 1)
          throw new DomainError(400, "Unexpected workspace arguments");
        let path: string | null;
        if (args[0] === undefined) {
          path = await this.chooseDirectory();
          if (path === null) return null;
        } else {
          const source = (await send(
            connection,
            `/workspaces/${id()}`,
          )) as Workspace;
          if (!source.local)
            throw new DomainError(
              409,
              "Only a local repository workspace can start another one",
            );
          path = source.local.repositoryPath;
        }
        return send(connection, "/workspaces", "POST", {
          source: "local",
          path,
        });
      }
      case "workspaceChanges": {
        if (args.length !== 1 || !uuid(args[0]))
          throw new DomainError(400, "Expected one workspace identifier");
        const value = await send(
          connection,
          `/workspaces/${id()}/changes`,
          "GET",
          undefined,
          undefined,
          20000,
        );
        return validateWorkspaceChanges(value, args[0]);
      }
      case "commandConfiguration": {
        if (args.length !== 1 || !uuid(args[0]))
          throw new DomainError(400, "Expected one workspace identifier");
        // The service reads Git under its own ten-second deadline.
        const value = await send(
          connection,
          `/workspaces/${id()}/command-configuration`,
          "GET",
          undefined,
          undefined,
          20000,
        );
        return validateCommandConfiguration(value, args[0]);
      }
      case "approveCommandConfiguration": {
        // Only the identity the person was shown and a request key: never a
        // command, path, revision or operator. The service reads the rest.
        const expected = args[1];
        if (
          args.length !== 3 ||
          !uuid(args[0]) ||
          typeof expected !== "string" ||
          !CANDIDATE_IDENTITY.test(expected) ||
          !uuid(args[2])
        )
          throw new DomainError(
            400,
            "Expected a workspace, the reviewed configuration identity and a request key",
          );
        const value = await send(
          connection,
          `/workspaces/${id()}/command-approvals`,
          "POST",
          { expectedCandidateIdentity: expected },
          args[2],
          20000,
        );
        return validateCommandApprovalReceipt(value, args[0], expected);
      }
      case "latestRunAction":
      case "startRunAction":
      case "cancelRunAction":
      case "latestCheck":
      case "runChecks":
      case "cancelCheck": {
        const runAction = [
          "latestRunAction",
          "startRunAction",
          "cancelRunAction",
        ].includes(method);
        const reading =
          method === "latestCheck" || method === "latestRunAction";
        const starting = method === "runChecks" || method === "startRunAction";
        const count = reading ? 1 : starting ? 3 : 2;
        if (args.length !== count || !args.every(uuid))
          throw new DomainError(400, "Expected command identifiers");
        const value = await send(
          connection,
          `/workspaces/${id()}/${runAction ? "run-actions" : "checks"}${!reading && !starting ? `/${id(1)}/cancel` : ""}`,
          reading ? "GET" : "POST",
          reading ? undefined : starting ? { consentId: args[1] } : {},
          starting ? (args[2] as string) : undefined,
          REVIEW_LIMITS.timeoutMs + 10000,
        );
        const view = validateCheckView(value, args[0] as string, runAction);
        if (!reading && (!view || (!starting && view.id !== args[1])))
          throw new DomainError(502, "Invalid command receipt");
        return view;
      }
      case "publicationStatus":
      case "reviewPublication":
      case "publishDraft": {
        const reading = method === "publicationStatus";
        const confirming = method === "publishDraft";
        if (
          !uuid(args[0]) ||
          args.length !== (reading ? 1 : confirming ? 3 : 2) ||
          (confirming && !matches(args[2], CANDIDATE_IDENTITY))
        )
          throw new DomainError(400, "Invalid draft publication arguments");
        const input = reading ? undefined : publicationInput(args[1]);
        const expected = confirming ? (args[2] as string) : undefined;
        const path = "/workspaces/" + id() + "/publication";
        const response = await send(
          connection,
          method === "reviewPublication" ? path + "/review" : path,
          reading ? "GET" : "POST",
          confirming ? { ...input, identity: expected } : input,
          undefined,
          confirming ? 120000 : 70000,
        );
        if (reading && response === null) return null;
        return publicationResponse(response, args[0], input, expected);
      }
      case "draftEvidence": {
        const expected = args[1];
        if (
          args.length !== 2 ||
          !uuid(args[0]) ||
          typeof expected !== "string" ||
          CANDIDATE_IDENTITY.exec(expected)?.[0] !== expected
        )
          throw new DomainError(
            400,
            "Expected a workspace and the displayed review identity",
          );
        const value = (await send(
          connection,
          `/workspaces/${id()}/draft-evidence/${expected}`,
          "GET",
          undefined,
          undefined,
          REVIEW_LIMITS.timeoutMs + 10000,
        )) as Partial<DraftEvidencePreview> | null;
        if (
          !value ||
          value.kind !== "draft-evidence-preview" ||
          value.workspaceId !== args[0] ||
          value.reviewIdentity !== expected ||
          typeof value.headSha !== "string" ||
          /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.exec(value.headSha)?.[0] !==
            value.headSha ||
          typeof value.body !== "string" ||
          !value.body ||
          Buffer.byteLength(value.body) > DRAFT_EVIDENCE_BYTES
        )
          throw new DomainError(502, "Invalid draft evidence preview");
        return {
          kind: value.kind,
          workspaceId: args[0],
          reviewIdentity: expected,
          headSha: value.headSha,
          body: value.body,
        } satisfies DraftEvidencePreview;
      }
      case "runCandidateReview":
      case "candidateReview": {
        const runAction = method === "runCandidateReview";
        if (args.length !== 1 || !uuid(args[0]))
          throw new DomainError(400, "Expected one workspace identifier");
        const value = await send(
          connection,
          `/workspaces/${id()}/${runAction ? "run-candidate-review" : "candidate-review"}`,
          "GET",
          undefined,
          undefined,
          REVIEW_LIMITS.timeoutMs + 10000,
        );
        return validateCandidateReview(value, args[0], runAction);
      }
      case "consentRunCandidate":
      case "consentCandidate": {
        const runAction = method === "consentRunCandidate";
        const expected = args[1];
        if (
          args.length !== 3 ||
          !uuid(args[0]) ||
          typeof expected !== "string" ||
          CANDIDATE_IDENTITY.exec(expected)?.[0] !== expected ||
          !uuid(args[2])
        )
          throw new DomainError(
            400,
            "Expected a workspace, the reviewed changes identity and a request key",
          );
        const value = await send(
          connection,
          `/workspaces/${id()}/${runAction ? "run-candidate-consents" : "candidate-consents"}`,
          "POST",
          { expectedReviewIdentity: expected },
          args[2],
          REVIEW_LIMITS.timeoutMs + 10000,
        );
        return validateCandidateConsentReceipt(
          value,
          args[0],
          expected,
          runAction,
        );
      }
      case "reviewStagedCommit":
      case "commitStagedChanges": {
        const reading = method === "reviewStagedCommit";
        const expected = args[2];
        if (
          !uuid(args[0]) ||
          args.length !== (reading ? 2 : 3) ||
          (!reading &&
            (typeof expected !== "string" ||
              CANDIDATE_IDENTITY.exec(expected)?.[0] !== expected))
        )
          throw new DomainError(
            400,
            "Expected a workspace, commit details and reviewed identity",
          );
        const details = commitDetails(args[1]);
        const value = await send(
          connection,
          `/workspaces/${id()}/${reading ? "commit-review" : "commits"}`,
          "POST",
          reading ? { details } : { details, expectedIdentity: expected },
          undefined,
          REVIEW_LIMITS.timeoutMs + 10000,
        );
        const invalid = () =>
          new DomainError(502, "Invalid local commit response");
        if (
          !value ||
          typeof value !== "object" ||
          (value as CommitReceipt).workspaceId !== args[0]
        )
          throw invalid();
        const sha = (x: unknown) =>
          typeof x === "string" &&
          /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.exec(x)?.[0] === x;
        if (!reading) {
          const receipt = value as CommitReceipt;
          if (receipt.reviewIdentity !== expected || !sha(receipt.commitSha))
            throw invalid();
          return receipt;
        }
        const review = value as StagedReview;
        if (
          typeof review.identity !== "string" ||
          CANDIDATE_IDENTITY.exec(review.identity)?.[0] !== review.identity ||
          review.branch !== `argent/${args[0].slice(0, 8)}` ||
          review.author !== details.author ||
          review.email !== details.email ||
          review.message !== details.message
        )
          throw invalid();
        validateWorkspaceChanges(
          {
            kind: "workspace-changes",
            workspaceId: args[0],
            baseSha: review.parentSha,
            headSha: review.treeId,
            files: review.files,
            consistency: "live",
            tested: false,
            simulation: false,
          },
          args[0],
        );
        for (const file of review.files) {
          for (const [mode, blob, size] of [
            [file.oldMode, file.oldBlobId, file.oldBytes],
            [file.newMode, file.newBlobId, file.newBytes],
          ] as const) {
            if (
              mode === null
                ? blob !== null || size !== null
                : !sha(blob) ||
                  blob?.length !== review.treeId.length ||
                  typeof size !== "number" ||
                  !Number.isSafeInteger(size) ||
                  size < 0 ||
                  size > REVIEW_LIMITS.fileBytes
            )
              throw invalid();
          }
        }
        return review;
      }
      case "archiveWorkspace": {
        if (args.length !== 2 || !uuid(args[0]) || typeof args[1] !== "boolean")
          throw new DomainError(
            400,
            "Expected a workspace and a discard choice",
          );
        const workspace = (await send(
          connection,
          `/workspaces/${id()}/archive`,
          "POST",
          { discardChanges: args[1] },
          undefined,
          REVIEW_LIMITS.timeoutMs + 10000,
        )) as Workspace | null;
        if (
          !workspace ||
          workspace.id !== args[0] ||
          workspace.provider !== "local-worktree" ||
          workspace.state !== "stopped" ||
          !workspace.local ||
          workspace.archiveStatus !== "archived"
        )
          throw new DomainError(502, "Archive outcome could not be confirmed");
        return workspace;
      }
      case "getWorkspace":
        return send(connection, `/workspaces/${id()}`);
      case "listRuns":
        return send(connection, `/workspaces/${id()}/runs${before(1)}`);
      case "createRun":
        return send(
          connection,
          "/runs",
          "POST",
          {
            workspaceId: str(0, "workspaceId", 128),
            task: str(1, "task"),
            maxRuntimeMs: requireInteger(args[2], "maxRuntimeMs", 100, 7200000),
            permissionMode: args[4] === undefined ? "edits" : args[4],
          },
          str(3, "idempotency key", 128),
        );
      case "getRun":
        return send(connection, `/runs/${id()}`);
      case "events":
        return send(
          connection,
          `/runs/${id()}/events?after=${requireInteger(args[1], "after", 0, Number.MAX_SAFE_INTEGER)}`,
        );
      case "artifact":
        return send(connection, `/runs/${id()}/artifact`);
      case "cancelRun":
        return send(connection, `/runs/${id()}/cancel`, "POST", {});
      case "resolveRun":
        return send(connection, `/runs/${id()}/resolve`, "POST", {
          note: str(1, "resolution note", 1000),
        });
      case "setWorkspaceState":
        if (args[1] !== "running" && args[1] !== "stopped")
          throw new DomainError(400, "Invalid workspace state");
        return send(
          connection,
          `/workspaces/${id()}/${args[1] === "running" ? "start" : "stop"}`,
          "POST",
          {},
        );
      default:
        throw new DomainError(400, "Unsupported desktop operation");
    }
  }
}
