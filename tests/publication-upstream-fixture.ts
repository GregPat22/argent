import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
} from "node:http";
import { join } from "node:path";
import { GitHubPublisher } from "../src/github-publisher.js";
import { captureProcess } from "../src/process-group.js";

export function fixtureGit(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "user.name=Argent Fixture",
      "-c",
      "user.email=test@example.invalid",
      ...args,
    ],
    {
      cwd,
      env: {
        PATH: "/usr/bin:/bin",
        LANG: "C",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_ALLOW_PROTOCOL: "file",
        GIT_TERMINAL_PROMPT: "0",
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

async function readBody(response: IncomingMessage) {
  const buffers: Buffer[] = [];
  for await (const part of response)
    buffers.push(Buffer.from(part as Uint8Array));
  return Buffer.concat(buffers);
}

/** Simulate gh's argv and Unix-socket request without reading a developer sign-in. */
async function fixtureGh(args: string[], directory: string, token: string) {
  assert.deepEqual(args.slice(0, 6), [
    "api",
    "--hostname",
    "github.com",
    "--method",
    "POST",
    "graphql",
  ]);
  const variables: Record<string, string | number> = {};
  let query = "";
  for (let i = 6; i < args.length; i += 2) {
    const flag = args[i],
      field = args[i + 1]!;
    assert.ok(flag === "-F" || flag === "-f");
    const split = field.indexOf("=");
    assert.ok(split > 0);
    const key = field.slice(0, split),
      value = field.slice(split + 1);
    if (key === "query") query = value;
    else variables[key] = flag === "-F" ? Number(value) : value;
  }
  assert.ok(query);
  const config = readFileSync(join(directory, "config.yml"), "utf8");
  const socketPath = JSON.parse(config.replace(/^http_unix_socket: /, ""));
  assert.equal(socketPath, join(directory, "api.sock"));
  const request = httpRequest({
    socketPath,
    method: "POST",
    path: "/graphql",
    headers: {
      Host: "api.github.com",
      Authorization: "token " + token,
      "content-type": "application/json",
    },
  });
  const received = once(request, "response");
  request.end(JSON.stringify({ query, variables }));
  const [response] = (await received) as [IncomingMessage];
  const body = await readBody(response);
  assert.equal(response.statusCode, 200);
  return body;
}

interface FixtureDraft {
  title: string;
  body: string;
  head: string;
  base: string;
}
type QueryOperation = "refs" | "create draft" | "read draft";
interface FixtureHooks {
  beforeCommand?(
    command: string,
    args: string[],
    options: Parameters<typeof captureProcess>[2],
  ): void | Promise<void>;
  editReply?(operation: QueryOperation, data: Record<string, unknown>): unknown;
}
export async function publicationUpstream(
  root: string,
  repo: string,
  repository = "example/project",
  hooks: FixtureHooks = {},
) {
  const receiver = join(root, "upstream.git");
  fixtureGit(root, "clone", "--bare", "--no-local", "--", repo, receiver);
  const credential = randomUUID(),
    url = "https://github.com/" + repository + "/pull/1";
  const effects: string[] = [],
    drafts: FixtureDraft[] = [];
  const repoInfo = {
    id: "fixture-node",
    nameWithOwner: repository,
    isFork: false,
  };
  const ref = (full: string) => {
    assert.match(full, /^refs\/heads\/[A-Za-z0-9_./-]+$/);
    const oid = fixtureGit(
      receiver,
      "for-each-ref",
      "--format=%(objectname)",
      full,
    );
    return oid
      ? {
          name: full.slice("refs/heads/".length),
          target: { __typename: "Commit", oid },
        }
      : null;
  };
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.method, "POST");
      assert.equal(req.url, "/graphql");
      assert.equal(req.headers.authorization, "Bearer " + credential);
      const { query, variables: v } = JSON.parse(
        (await readBody(req)).toString(),
      ) as { query: string; variables: Record<string, string | number> };
      let data: Record<string, unknown>, operation: QueryOperation;
      if (query.startsWith("query PublicationRefs(")) {
        assert.equal(v.owner + "/" + v.name, repository);
        operation = "refs";
        data = {
          repository: {
            ...repoInfo,
            base: ref(String(v.base)),
            head: ref(String(v.head)),
          },
        };
      } else if (query.startsWith("mutation PublicationDraft(")) {
        assert.match(query, /draft:true/);
        assert.equal(v.repository, repoInfo.id);
        assert.equal(drafts.length, 0);
        for (const name of ["base", "head", "body", "title"])
          assert.equal(typeof v[name], "string");
        drafts.push({
          base: String(v.base),
          head: String(v.head),
          title: String(v.title),
          body: String(v.body),
        });
        operation = "create draft";
        data = { createPullRequest: { pullRequest: { url } } };
      } else {
        assert.ok(query.startsWith("query PublicationReceipt("));
        assert.equal(v.owner + "/" + v.name, repository);
        assert.equal(v.number, 1);
        const draft = drafts[0]!;
        const head = ref("refs/heads/" + draft.head),
          base = ref("refs/heads/" + draft.base);
        assert.ok(head && base);
        operation = "read draft";
        data = {
          repository: {
            ...repoInfo,
            pullRequest: {
              number: 1,
              url,
              state: "OPEN",
              isDraft: true,
              title: draft.title,
              body: draft.body,
              baseRefName: base.name,
              headRefName: head.name,
              baseRefOid: base.target.oid,
              headRefOid: head.target.oid,
              baseRepository: repoInfo,
              headRepository: repoInfo,
            },
          },
        };
      }
      effects.push(operation);
      const reply = hooks.editReply?.(operation, data) ?? data;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: reply }));
    } catch {
      effects.push("unexpected API request");
      res.writeHead(400).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const publisher = new GitHubPublisher({
    gh: async () => "fixture-gh",
    request: (options, received) => {
      assert.equal(options.protocol, "https:");
      assert.equal(options.hostname, "api.github.com");
      assert.equal(options.port, 443);
      assert.equal(options.rejectUnauthorized, true);
      assert.equal(options.path, "/graphql");
      assert.equal(options.method, "POST");
      return httpRequest(
        {
          hostname: "127.0.0.1",
          port: address.port,
          method: options.method,
          path: options.path,
          headers: options.headers,
          agent: false,
        },
        received,
      );
    },
    run: async (command, args, options, limits) => {
      await hooks.beforeCommand?.(command, args, options);
      const env = options.env!;
      if (command === "fixture-gh") {
        if (args[0] === "auth") {
          assert.deepEqual(args, ["auth", "token", "--hostname", "github.com"]);
          return Buffer.from(credential + "\n");
        }
        assert.equal(env.GH_CONFIG_DIR, options.cwd);
        assert.ok(env.GH_TOKEN && env.GH_TOKEN !== credential);
        return fixtureGh(args, String(options.cwd), env.GH_TOKEN);
      }
      assert.equal(command, "/usr/bin/git");
      if (args.includes("push")) {
        const urlAt = args.lastIndexOf("--") + 1;
        assert.equal(args[urlAt], "https://github.com/" + repository + ".git");
        assert.equal(args.length, urlAt + 2);
        const refspec = args[urlAt + 1]!;
        assert.match(
          refspec,
          /^[a-f0-9]{40}:refs\/heads\/argent\/[a-f0-9]{8}$/,
        );
        assert.ok(
          args.includes("--force-with-lease=" + refspec.split(":")[1] + ":"),
        );
        assert.equal(env.GIT_ALLOW_PROTOCOL, "https");
        effects.push("push");
        const argv = [...args];
        argv[urlAt] = receiver;
        const localEnv: NodeJS.ProcessEnv = {
          ...env,
          GIT_ALLOW_PROTOCOL: "file",
        };
        delete localEnv.GIT_CONFIG_COUNT;
        delete localEnv.GIT_CONFIG_KEY_0;
        delete localEnv.GIT_CONFIG_VALUE_0;
        return captureProcess(
          command,
          argv,
          { ...options, env: localEnv },
          limits,
        );
      }
      assert.equal(env.GIT_ALLOW_PROTOCOL, "");
      if (args.includes("cat-file"))
        assert.deepEqual(args.slice(args.indexOf("cat-file")), [
          "cat-file",
          "--batch-all-objects",
          "--batch-check=%(objectsize)",
        ]);
      else
        assert.ok(
          ["rev-parse", "pack-objects", "index-pack", "fsck", "rev-list"].some(
            (name) => args.includes(name),
          ),
        );
      return captureProcess(command, args, options, limits);
    },
  });
  return {
    publisher,
    receiver,
    effects,
    drafts,
    url,
    async close() {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}
