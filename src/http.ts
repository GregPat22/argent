import { timingSafeEqual, createHash } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { DomainError, type Run } from "./domain.js";
import { Store } from "./store.js";
import { inspectArtifact } from "./artifacts.js";
import { createLocalWorkspace } from "./local-worktree.js";

function publicRun(run: Run): Omit<Run, "leaseToken"> {
  const { leaseToken: _token, ...result } = run;
  return result;
}

async function readBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const part of request) {
    const chunk = Buffer.from(part as Uint8Array);
    size += chunk.length;
    if (size > 16384) throw new DomainError(413, "Request body exceeds 16 KiB");
    chunks.push(chunk);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new DomainError(400, "Invalid JSON body");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new DomainError(400, "Expected a JSON object");
  }
  return body as Record<string, unknown>;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

export interface ServerOptions {
  artifactRoot?: string;
  /** Enables real local worktree workspaces (spec 0013) under this folder. */
  worktreeRoot?: string;
  instanceId?: string;
  onStop?: () => void;
}

export function makeServer(
  store: Store,
  token: string,
  options: ServerOptions = {},
): Server {
  if (token.length < 32)
    throw new Error("API token must contain at least 32 characters");
  const expected = createHash("sha256").update(`Bearer ${token}`).digest();
  const server = createServer((request, response) => {
    void (async () => {
      // Deny browser-origin requests: M0 is an operator API with no CORS surface.
      if (request.headers.origin)
        throw new DomainError(
          403,
          "Browser origins are not supported by this prototype",
        );
      const supplied = createHash("sha256")
        .update(request.headers.authorization ?? "")
        .digest();
      if (!timingSafeEqual(expected, supplied))
        throw new DomainError(401, "Unauthorized");
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const parts = url.pathname.split("/").filter(Boolean);
      const method = request.method;
      if (method === "GET" && url.pathname === "/health") {
        send(response, 200, {
          status: "ok",
          milestone: options.instanceId ? "P1" : "M0",
          simulation: true,
          instanceId: options.instanceId ?? null,
        });
      } else if (
        method === "POST" &&
        url.pathname === "/service/stop" &&
        options.onStop
      ) {
        // Do not leave the stop request's keep-alive socket serving polls while
        // the desktop service drains an interrupted worker and closes the server.
        response.setHeader("Connection", "close");
        send(response, 202, { stopping: true });
        queueMicrotask(options.onStop);
      } else if (method === "GET" && url.pathname === "/workspaces") {
        send(
          response,
          200,
          store.listWorkspaces(
            Number(url.searchParams.get("limit") ?? 50),
            url.searchParams.get("before") ?? undefined,
          ),
        );
      } else if (method === "POST" && url.pathname === "/workspaces") {
        const body = await readBody(request);
        if (body.source === "local") {
          if (!options.worktreeRoot)
            throw new DomainError(
              409,
              "Local execution is not enabled in this service",
            );
          send(
            response,
            201,
            await createLocalWorkspace(store, options.worktreeRoot, body.path),
          );
        } else {
          send(response, 201, store.createWorkspace(body.repository));
        }
      } else if (
        parts[0] === "workspaces" &&
        parts.length === 3 &&
        parts[2] === "runs" &&
        method === "GET"
      ) {
        const page = store.listRuns(
          parts[1]!,
          Number(url.searchParams.get("limit") ?? 50),
          url.searchParams.get("before") ?? undefined,
        );
        send(response, 200, { ...page, items: page.items.map(publicRun) });
      } else if (
        parts[0] === "workspaces" &&
        parts.length === 2 &&
        method === "GET"
      ) {
        send(response, 200, store.getWorkspace(parts[1]!));
      } else if (
        parts[0] === "runs" &&
        parts.length === 3 &&
        parts[2] === "resolve" &&
        method === "POST"
      ) {
        const body = await readBody(request);
        send(
          response,
          200,
          publicRun(store.resolveSimulation(parts[1]!, body.note)),
        );
      } else if (
        parts[0] === "runs" &&
        parts.length === 3 &&
        parts[2] === "artifact" &&
        method === "GET" &&
        options.artifactRoot
      ) {
        send(
          response,
          200,
          inspectArtifact(store, options.artifactRoot, parts[1]!),
        );
      } else if (
        parts[0] === "workspaces" &&
        parts.length === 3 &&
        method === "POST" &&
        ["start", "stop"].includes(parts[2]!)
      ) {
        send(
          response,
          200,
          store.setWorkspaceState(
            parts[1]!,
            parts[2] === "start" ? "running" : "stopped",
          ),
        );
      } else if (
        parts[0] === "runs" &&
        parts.length === 1 &&
        method === "POST"
      ) {
        const body = await readBody(request);
        if (typeof body.workspaceId !== "string")
          throw new DomainError(400, "workspaceId is required");
        send(
          response,
          202,
          publicRun(
            store.createRun(
              body.workspaceId,
              body.task,
              request.headers["idempotency-key"],
              body.maxRuntimeMs,
              undefined,
              body.permissionMode,
            ),
          ),
        );
      } else if (
        parts[0] === "runs" &&
        parts.length === 2 &&
        method === "GET"
      ) {
        send(response, 200, publicRun(store.getRun(parts[1]!)));
      } else if (
        parts[0] === "runs" &&
        parts.length === 3 &&
        parts[2] === "cancel" &&
        method === "POST"
      ) {
        send(response, 200, publicRun(store.cancel(parts[1]!)));
      } else if (
        parts[0] === "runs" &&
        parts.length === 3 &&
        parts[2] === "events" &&
        method === "GET"
      ) {
        const after = Number(url.searchParams.get("after") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? 100);
        const events = store.events(parts[1]!, after, limit);
        send(response, 200, {
          events,
          nextCursor: events.at(-1)?.cursor ?? after,
        });
      } else {
        throw new DomainError(404, "Route not found");
      }
    })().catch((error: unknown) => {
      if (response.destroyed) return;
      send(response, error instanceof DomainError ? error.status : 500, {
        error: error instanceof DomainError ? error.message : "Internal error",
      });
    });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}
