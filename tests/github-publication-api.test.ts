import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  realpath,
  readdir,
  readFile,
  unlink,
  rm,
  writeFile,
} from "node:fs/promises";
import http from "node:http";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { captureProcess } from "../src/process-group.js";
import {
  publicationGraphQL,
  type PublicationRequest,
} from "../src/github-publication-api.js";

const query =
  'query Offline($name:String!){repository(owner:"example",name:$name){id}}';
const fields = { name: "fixture" };
const token = "offline-auth-marker";
async function setup(t: TestContext, redirect = false) {
  const directory = await mkdtemp(
    join(await realpath("/tmp"), "argent-gh-test-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const socket = join(directory, "gh.sock");
  await writeFile(
    join(directory, "config.yml"),
    "http_unix_socket: " + JSON.stringify(socket) + "\n",
    { mode: 0o600 },
  );
  const upstreamSocket = join(directory, "upstream.sock");
  let requests = 0;
  const replies: string[] = [];
  const upstream = http.createServer(async (req, res) => {
    requests++;
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/graphql");
    assert.equal(req.headers.authorization, "Bearer " + token);
    let body = "";
    for await (const part of req) body += part;
    assert.deepEqual(JSON.parse(body), { query, variables: fields });
    if (redirect) {
      // This socket is the entire upstream. The Location is never requested
      // and neither the CLI nor the caller receives provider response headers.
      res.writeHead(307, {
        Location: "https://example.invalid/private",
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ message: token }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"data":{"repository":{"id":"fixture"}}}');
    }
  });
  await new Promise<void>((resolve) =>
    upstream.listen(upstreamSocket, resolve),
  );
  t.after(
    () => new Promise<void>((resolve) => upstream.close(() => resolve())),
  );
  const request: PublicationRequest = (options, received) => {
    assert.equal(options.protocol, "https:");
    assert.equal(options.hostname, "api.github.com");
    assert.equal(options.port, 443);
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.agent, false);
    return http.request(
      {
        socketPath: upstreamSocket,
        path: options.path!,
        method: options.method!,
        headers: options.headers!,
        signal: options.signal!,
      },
      received,
    );
  };
  async function callLocal(
    authorization: string,
    body: string,
    path = "/graphql",
  ) {
    return new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          socketPath: socket,
          path,
          method: "POST",
          headers: {
            Host: "api.github.com",
            Authorization: authorization,
            "Content-Type": "application/json",
          },
        },
        (res) => {
          let reply = "";
          res.on("data", (b) => (reply += b));
          res.on("end", () => {
            replies.push(reply);
            resolve(res.statusCode!);
          });
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  }
  return {
    directory,
    socket,
    query,
    fields,
    token,
    request,
    replies,
    callLocal,
    requests: () => requests,
  };
}

test("the gh Unix socket accepts the exact request once and forwards only its reviewed fields", async (t) => {
  const f = await setup(t);
  const result = await publicationGraphQL({
    ...f,
    invoke: async (args, env) => {
      assert.deepEqual(args, [
        "api",
        "--hostname",
        "github.com",
        "--method",
        "POST",
        "graphql",
        "-f",
        "query=" + query,
        "-f",
        "name=fixture",
      ]);
      assert.ok(!JSON.stringify([args, env]).includes(token));
      assert.equal(env.HTTPS_PROXY, "http://127.0.0.1:0");
      assert.equal(env.GH_CONFIG_DIR, f.directory);
      const auth = "token " + env.GH_TOKEN;
      const body = JSON.stringify({ query, variables: fields });
      assert.equal(await f.callLocal("token wrong", body), 502);
      assert.equal(await f.callLocal(auth, body, "/other"), 502);
      assert.equal(
        await f.callLocal(
          auth,
          JSON.stringify({
            query: "query Changed{viewer{login}}",
            variables: fields,
          }),
        ),
        502,
      );
      assert.equal(
        await f.callLocal(
          auth,
          JSON.stringify({ query, variables: { name: "other" } }),
        ),
        502,
      );
      assert.equal(f.requests(), 0);
      const status = await Promise.all([
        f.callLocal(auth, body),
        f.callLocal(auth, body),
      ]);
      assert.deepEqual(status.sort(), [200, 502]);
      return Buffer.from("untrusted local stdout");
    },
  });
  assert.equal(result.toString(), '{"data":{"repository":{"id":"fixture"}}}');
  assert.equal(f.requests(), 1);
});

test("GitHub redirects are refused without replay or response disclosure", async (t) => {
  const f = await setup(t, true);
  await assert.rejects(
    publicationGraphQL({
      ...f,
      invoke: async (_args, env) => {
        const body = JSON.stringify({ query, variables: fields });
        const auth = "token " + env.GH_TOKEN;
        assert.equal(await f.callLocal(auth, body), 502);
        assert.equal(await f.callLocal(auth, body), 502);
        return Buffer.from("ignored");
      },
    }),
    (error) =>
      error instanceof Error &&
      error.message === "GitHub publication request failed",
  );
  assert.equal(f.requests(), 1);
  assert.ok(
    f.replies.every(
      (r) => !r.includes(token) && !r.includes("example.invalid"),
    ),
  );
});

test("installed gh issues its GraphQL command over the private Unix socket", async (t) => {
  const candidates = [
    "/usr/bin/gh",
    "/opt/homebrew/bin/gh",
    "/usr/local/bin/gh",
  ];
  let gh: string | undefined;
  for (const c of candidates)
    try {
      await access(c);
      gh = c;
      break;
    } catch {
      /* optional installed CLI */
    }
  if (!gh) {
    t.skip("GitHub CLI is not installed in a standard location");
    return;
  }
  const f = await setup(t);
  const result = await publicationGraphQL({
    ...f,
    invoke: (args, env) =>
      captureProcess(
        gh!,
        args,
        { cwd: f.directory, env },
        { timeoutMs: 5000, maxBuffer: 4096 },
      ),
  });
  assert.equal(f.requests(), 1);
  assert.equal(JSON.parse(result.toString()).data.repository.id, "fixture");
  assert.deepEqual((await readdir(f.directory)).sort(), [
    "config.yml",
    "upstream.sock",
  ]);
});

test("Unix socket cleanup retains a replacement file in the private directory", async (t) => {
  const f = await setup(t);
  await assert.rejects(
    publicationGraphQL({
      ...f,
      invoke: async (_args, env) => {
        const body = JSON.stringify({ query, variables: fields });
        assert.equal(await f.callLocal("token " + env.GH_TOKEN, body), 200);
        await unlink(f.socket);
        await writeFile(f.socket, "fixture replacement", { flag: "wx" });
        return Buffer.alloc(0);
      },
    }),
    /GitHub publication request failed/,
  );
  assert.equal(await readFile(f.socket, "utf8"), "fixture replacement");
  assert.deepEqual((await readdir(f.directory)).sort(), [
    "config.yml",
    "gh.sock",
    "upstream.sock",
  ]);
});
