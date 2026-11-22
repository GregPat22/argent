import { randomBytes } from "node:crypto";
import { link, lstat, mkdtemp, rmdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { directoryIdentity } from "./local-worktree-identity.js";
import {
  createServer,
  type ClientRequest,
  type IncomingMessage,
} from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { isDeepStrictEqual } from "node:util";
import { DomainError } from "./domain.js";

export type PublicationRequest = (
  options: RequestOptions,
  received: (response: IncomingMessage) => void,
) => ClientRequest;
const refused = () => new DomainError(502, "GitHub publication request failed");
const limit = 256 * 1024;

async function readBounded(message: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of message) {
    const bytes = Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > limit) throw refused();
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

/** Node HTTPS sends exactly one POST. It never follows Location, forwards a
 * response header, or allows the CLI to replay a returned redirect. */
async function graphqlPost(
  request: PublicationRequest,
  token: string,
  body: Buffer,
  signal: AbortSignal,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        protocol: "https:",
        hostname: "api.github.com",
        port: 443,
        path: "/graphql",
        method: "POST",
        agent: false,
        rejectUnauthorized: true,
        signal,
        headers: {
          Authorization: "Bearer " + token,
          "User-Agent": "Argent-Local-Publication",
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": body.length,
        },
      },
      (response) => {
        if (
          response.statusCode !== 200 ||
          response.headers["content-type"]
            ?.split(";")[0]
            ?.trim()
            .toLowerCase() !== "application/json"
        ) {
          response.destroy();
          reject(refused());
          return;
        }
        void readBounded(response).then(resolve, () => reject(refused()));
      },
    );
    req.on("error", () => reject(refused()));
    req.end(body);
  });
}

export async function publicationGraphQL(options: {
  directory: string;
  socket: string;
  token: string;
  query: string;
  fields: Record<string, string | number>;
  invoke: (args: string[], env: NodeJS.ProcessEnv) => Promise<Buffer>;
  request?: PublicationRequest;
}): Promise<Buffer> {
  const nonce = randomBytes(32).toString("hex");
  const expected = { query: options.query, variables: options.fields };
  const controller = new AbortController();
  let forwarded = false;
  let response: Buffer | undefined;
  const server = createServer(
    { maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 5000 },
    async (req, res) => {
      try {
        if (
          forwarded ||
          req.method !== "POST" ||
          req.url !== "/graphql" ||
          req.headers.host !== "api.github.com" ||
          req.headers.authorization !== "token " + nonce ||
          req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !==
            "application/json"
        )
          throw refused();
        const local = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            await readBounded(req),
          ),
        );
        // Recheck after asynchronous reads, before dispatching a single upstream
        // mutation. Send the known values, never caller-supplied headers or bytes.
        if (forwarded || !isDeepStrictEqual(local, expected)) throw refused();
        forwarded = true;
        response = await graphqlPost(
          options.request ?? httpsRequest,
          options.token,
          Buffer.from(JSON.stringify(expected)),
          controller.signal,
        );
        res.writeHead(200, {
          "Content-Type": "application/json",
          Connection: "close",
        });
        res.end(response);
      } catch {
        res.writeHead(502, {
          "Content-Type": "application/json",
          Connection: "close",
        });
        res.end('{"message":"GitHub publication request failed"}');
      }
    },
  );
  server.on("clientError", (_error, socket) => socket.destroy());
  if (dirname(options.socket) !== options.directory) throw refused();
  const directory = await directoryIdentity(options.directory);
  // libuv unlinks the path it originally bound when the server closes.
  // Bind under a private, short-lived directory and expose only a hard link.
  // A replacement at the gh-visible pathname must survive server teardown.
  const bindDirectory = await mkdtemp(join(options.directory, "bind-"));
  const bindIdentity = await directoryIdentity(bindDirectory);
  const bound = join(bindDirectory, "s");
  let removed = false;
  let exposed: string | undefined;
  const socketIdentity = async (path: string) => {
    const stat = await lstat(path, { bigint: true });
    if (!stat.isSocket()) throw refused();
    return [stat.dev, stat.ino, stat.birthtimeNs].join("/");
  };
  const removeBindDirectory = async () => {
    if (
      (await directoryIdentity(options.directory)) !== directory ||
      (await directoryIdentity(bindDirectory)) !== bindIdentity
    )
      throw refused();
    await rmdir(bindDirectory);
    removed = true;
  };
  const timer = setTimeout(() => {
    controller.abort();
    server.closeAllConnections();
  }, 55000);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(bound, resolve);
    });
    const original = await socketIdentity(bound);
    // link fails if gh's pathname is occupied; it cannot overwrite a file.
    await link(bound, options.socket);
    exposed = original;
    if (
      (await directoryIdentity(bindDirectory)) !== bindIdentity ||
      (await socketIdentity(bound)) !== original ||
      (await socketIdentity(options.socket)) !== original
    )
      throw refused();
    await unlink(bound);
    await removeBindDirectory();
    const args = [
      "api",
      "--hostname",
      "github.com",
      "--method",
      "POST",
      "graphql",
      "-f",
      "query=" + options.query,
    ];
    for (const [name, value] of Object.entries(options.fields))
      args.push(typeof value === "number" ? "-F" : "-f", name + "=" + value);
    // A gh version ignoring http_unix_socket must fail locally. Only the
    // Unix-socket request carries the one-use nonce; gh never gets the token.
    await options.invoke(args, {
      PATH: "/usr/bin:/bin",
      LANG: "C",
      HOME: options.directory,
      GH_CONFIG_DIR: options.directory,
      GH_HOST: "github.com",
      GH_TOKEN: nonce,
      GH_TELEMETRY: "false",
      GH_PROMPT_DISABLED: "1",
      GH_NO_UPDATE_NOTIFIER: "1",
      GH_NO_EXTENSION_UPDATE_NOTIFIER: "1",
      HTTPS_PROXY: "http://127.0.0.1:0",
      HTTP_PROXY: "http://127.0.0.1:0",
    });
    if (!forwarded || !response) throw refused();
    return response;
  } finally {
    clearTimeout(timer);
    controller.abort();
    server.closeAllConnections();
    if (server.listening)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    if (exposed) {
      if (
        (await directoryIdentity(options.directory)) !== directory ||
        (await socketIdentity(options.socket)) !== exposed
      )
        throw refused();
      await unlink(options.socket);
    }
    if (!removed) await removeBindDirectory();
  }
}
