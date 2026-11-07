import {
  DomainError,
  requireInteger,
  requireString,
  type Workspace,
} from "../domain.js";
import type { BridgeReply, ServiceStatus } from "./contracts.js";
import {
  ensureService,
  isServiceAlive,
  readConnection,
  serviceRequest,
} from "./service-client.js";

export const APP_URL = "argent://app/index.html";

export function trustedSender(url: string, mainFrame: boolean): boolean {
  return mainFrame && url === APP_URL;
}

/** Asks the person to choose a repository folder; null when they cancel. */
export type ChooseDirectory = () => Promise<string | null>;

export class DesktopClient {
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
      const connection =
        method === "startService"
          ? await ensureService(this.directory)
          : readConnection(this.directory);
      const connected =
        connection !== null && (await isServiceAlive(connection));
      return { connected, engine: "local" } satisfies ServiceStatus;
    }
    const connection = readConnection(this.directory);
    if (!connection)
      throw new DomainError(
        503,
        "The local execution service is disconnected. Reconnect to continue.",
      );
    const str = (index: number, label: string, max = 4000) =>
      requireString(args[index], label, max);
    const id = (index = 0) => encodeURIComponent(str(index, "identifier", 128));
    const before = (index: number) =>
      args[index] === undefined
        ? ""
        : `?before=${encodeURIComponent(str(index, "cursor", 128))}`;
    switch (method) {
      case "stopService":
        if (args.length)
          throw new DomainError(400, "Unexpected service arguments");
        await serviceRequest(connection, "/service/stop", "POST", {});
        return null;
      case "listWorkspaces":
        return serviceRequest(connection, `/workspaces${before(0)}`);
      case "createWorkspace":
        return serviceRequest(connection, "/workspaces", "POST", {
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
          const source = (await serviceRequest(
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
        return serviceRequest(connection, "/workspaces", "POST", {
          source: "local",
          path,
        });
      }
      case "getWorkspace":
        return serviceRequest(connection, `/workspaces/${id()}`);
      case "listRuns":
        return serviceRequest(
          connection,
          `/workspaces/${id()}/runs${before(1)}`,
        );
      case "createRun":
        return serviceRequest(
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
        return serviceRequest(connection, `/runs/${id()}`);
      case "events":
        return serviceRequest(
          connection,
          `/runs/${id()}/events?after=${requireInteger(args[1], "after", 0, Number.MAX_SAFE_INTEGER)}`,
        );
      case "artifact":
        return serviceRequest(connection, `/runs/${id()}/artifact`);
      case "cancelRun":
        return serviceRequest(connection, `/runs/${id()}/cancel`, "POST", {});
      case "resolveRun":
        return serviceRequest(connection, `/runs/${id()}/resolve`, "POST", {
          note: str(1, "resolution note", 1000),
        });
      case "setWorkspaceState":
        if (args[1] !== "running" && args[1] !== "stopped")
          throw new DomainError(400, "Invalid workspace state");
        return serviceRequest(
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
