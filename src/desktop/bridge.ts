import { validateCheckView } from "./checks.js";
import {
  DomainError,
  requireInteger,
  requireString,
  type Workspace,
} from "../domain.js";
import type { BridgeReply, ServiceStatus } from "./contracts.js";
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
