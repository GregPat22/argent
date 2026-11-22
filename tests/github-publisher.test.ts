import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  validatePublicationTarget,
  type PublicationTarget,
} from "../src/github-publisher.js";
import {
  fixtureGit,
  publicationUpstream,
} from "./publication-upstream-fixture.js";

type Hooks = NonNullable<Parameters<typeof publicationUpstream>[3]>;
const branch = "argent/abcdef01";
async function setup(t: TestContext, hooks: Hooks = {}) {
  const root = await mkdtemp(
    join(await realpath("/tmp"), "argent-transport-test-"),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, "source");
  await mkdir(repo);
  fixtureGit(repo, "init", "-b", "main");
  await writeFile(join(repo, "prior"), "Only in old history\n");
  fixtureGit(repo, "add", "prior");
  fixtureGit(repo, "commit", "-m", "Old snapshot");
  const oldSha = fixtureGit(repo, "rev-parse", "HEAD");
  fixtureGit(repo, "rm", "prior");
  await writeFile(join(repo, "sample"), "Base\n");
  fixtureGit(repo, "add", "sample");
  fixtureGit(repo, "commit", "-m", "Base snapshot");
  const baseSha = fixtureGit(repo, "rev-parse", "HEAD");
  const upstream = await publicationUpstream(
    root,
    repo,
    "example/project",
    hooks,
  );
  t.after(() => upstream.close());
  fixtureGit(repo, "switch", "-c", branch);
  for (const text of ["Intermediate", "Reviewed"]) {
    await writeFile(join(repo, "sample"), text + "\n");
    fixtureGit(repo, "add", "sample");
    fixtureGit(repo, "commit", "-m", text);
  }
  const headSha = fixtureGit(repo, "rev-parse", "HEAD");
  await writeFile(join(repo, "unstaged"), "Unpublished bytes\n");
  const unusedSha = fixtureGit(repo, "hash-object", "-w", "unstaged");
  // Source settings are never loaded by the authorized networked Git.
  fixtureGit(repo, "config", "push.followTags", "true");
  fixtureGit(repo, "config", "http.followRedirects", "true");
  fixtureGit(
    repo,
    "config",
    "url.file:///unselected/.insteadOf",
    "https://github.com/",
  );
  fixtureGit(repo, "tag", "local-only");
  const target: PublicationTarget = {
    repository: "example/project",
    baseBranch: "main",
    baseSha,
    branch,
    headSha,
    title: "Reviewed draft",
    body: '## Evidence\n\n@not-a-file {owner} "quoted"\n',
  };
  return { root, repo, oldSha, unusedSha, target, ...upstream };
}

test("publication accepts canonical targets and rejects unsafe or ambiguous input before dispatch", () => {
  const valid: PublicationTarget = {
    repository: "Example/fixture.project",
    baseBranch: "release/v1",
    baseSha: "a".repeat(40),
    branch,
    headSha: "b".repeat(40),
    title: "Draft",
    body: "## Evidence\n",
  };
  validatePublicationTarget(valid);
  const bad: Partial<PublicationTarget>[] = [
    { repository: "https://github.com/Example/project" },
    { repository: "Example/." },
    { repository: "Example/project.GIT" },
    { repository: "Example/project\n" },
    { repository: "a/b/c" },
    { repository: "bad-/sample" },
    { baseBranch: "refs/heads/main" },
    { baseBranch: "release/.hidden" },
    { baseBranch: "release/name.lock" },
    { baseBranch: "main\n" },
    { branch: "refs/tags/published" },
    { branch: "argent/abcdef01\n" },
    { baseBranch: branch },
    { headSha: valid.baseSha },
    { headSha: "c".repeat(40) + "\n" },
    { title: "line\n" },
    { title: "x\t" },
    { title: "" },
    { body: "x\0" },
    { body: "\ud800" },
  ];
  for (const change of bad)
    assert.throws(
      () => validatePublicationTarget({ ...valid, ...change }),
      /Invalid GitHub publication target/,
    );
});

test("real receive-pack gets only the reviewed branch from an isolated verified object set", async (t) => {
  let dispatched = false;
  let reserved = false;
  let scratch = "";
  const f = await setup(t, {
    beforeCommand(command, args, options) {
      const env = options.env!;
      assert.equal(env.PATH, "/usr/bin:/bin");
      assert.equal(env.LANG, "C");
      for (const key of [
        "GH_DEBUG",
        "GITHUB_TOKEN",
        "HTTPS_PROXY",
        "GIT_TRACE",
        "GIT_TRACE_CURL",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "SSH_AUTH_SOCK",
        "GIT_SSH_COMMAND",
      ]) {
        if (key === "HTTPS_PROXY" && args[0] === "api") continue;
        assert.equal(env[key], undefined);
      }
      if (command === "fixture-gh") {
        if (args[0] === "auth") {
          assert.equal(options.cwd, "/");
          assert.equal(env.HOME, userInfo().homedir);
          assert.equal(env.GH_TOKEN, undefined);
        }
        return;
      }
      assert.equal(command, "/usr/bin/git");
      if (!args.includes("push")) {
        assert.equal(env.GIT_CONFIG_VALUE_0, undefined);
        return;
      }
      assert.equal(reserved, true);
      dispatched = true;
      scratch = String(options.cwd);
      assert.equal(env.GIT_DIR, scratch);
      assert.equal(env.HOME, scratch);
      assert.equal(env.GIT_CONFIG_GLOBAL, "/dev/null");
      assert.equal(env.GIT_ALLOW_PROTOCOL, "https");
      assert.equal(env.GIT_OBJECT_DIRECTORY, undefined);
      assert.equal(
        env.GIT_CONFIG_KEY_0,
        "http.https://github.com/example/project.git.extraHeader",
      );
      assert.ok(env.GIT_CONFIG_VALUE_0?.startsWith("Authorization: Basic "));
      assert.ok(!JSON.stringify(args).includes(env.GIT_CONFIG_VALUE_0!));
      for (const option of [
        "credential.helper=",
        "http.followRedirects=false",
        "http.sslVerify=true",
        "core.hooksPath=/dev/null",
        "--no-follow-tags",
        "--no-verify",
        "--no-signed",
        "--recurse-submodules=no",
      ])
        assert.ok(args.includes(option));
      for (const oid of [f.oldSha, f.unusedSha])
        assert.throws(() => fixtureGit(scratch, "cat-file", "-e", oid));
      assert.equal(
        fixtureGit(scratch, "rev-parse", "--is-bare-repository"),
        "true",
      );
      assert.equal(fixtureGit(scratch, "rev-list", "--count", "HEAD"), "3");
    },
  });
  await f.publisher.preflight(f.target);
  await f.publisher.push(f.repo, f.target, async () => {
    assert.equal(reserved, false);
    assert.equal(dispatched, false);
    reserved = true;
  });
  assert.ok(dispatched);
  await assert.rejects(access(scratch), { code: "ENOENT" });
  assert.equal(
    fixtureGit(f.receiver, "rev-parse", "refs/heads/" + branch),
    f.target.headSha,
  );
  assert.equal(
    fixtureGit(f.receiver, "rev-parse", "refs/heads/main"),
    f.target.baseSha,
  );
  assert.equal(fixtureGit(f.receiver, "tag", "--list"), "");
  await f.publisher.confirmHead(f.target);
  const url = await f.publisher.createDraft(f.target);
  assert.equal(url, f.url);
  await f.publisher.verifyDraft(f.target, url);
  assert.deepEqual(f.drafts, [
    { title: f.target.title, body: f.target.body, head: branch, base: "main" },
  ]);
});

test("preflight binds canonical repository identity and exact refs", async (t) => {
  let edit: (data: Record<string, unknown>) => void = () => {};
  const f = await setup(t, {
    editReply(op, data) {
      if (op === "refs") edit(data.repository as Record<string, unknown>);
    },
  });
  const patches = [
    { nameWithOwner: "Example/project" },
    { isFork: true },
    { id: "" },
    { base: null },
    {
      base: {
        name: "other",
        target: { __typename: "Commit", oid: f.target.baseSha },
      },
    },
    {
      head: {
        name: branch,
        target: { __typename: "Commit", oid: f.target.headSha },
      },
    },
  ];
  for (const patch of patches) {
    edit = (r) => Object.assign(r, patch);
    await assert.rejects(f.publisher.preflight(f.target));
  }
  edit = () => {};
  await f.publisher.preflight(f.target);
  await assert.rejects(
    f.publisher.confirmHead({ ...f.target }),
    /fresh preflight/,
  );
  const title = f.target.title;
  f.target.title += " edited";
  await assert.rejects(f.publisher.createDraft(f.target), /fresh preflight/);
  f.target.title = title;
  edit = (r) => {
    r.id = "replacement-node";
  };
  let reserved = false;
  await assert.rejects(
    f.publisher.push(f.repo, f.target, async () => {
      reserved = true;
    }),
    /does not match/,
  );
  assert.equal(reserved, false);
  assert.ok(!f.effects.includes("push"));
});

test("a refusal at reservation sends no push; a concurrent remote ref creation cannot be overwritten", async (t) => {
  const f = await setup(t);
  await f.publisher.preflight(f.target);
  await assert.rejects(
    f.publisher.push(f.repo, f.target, async () => {
      throw new Error("reservation declined");
    }),
    /reservation declined/,
  );
  assert.ok(!f.effects.includes("push"));
  await assert.rejects(
    f.publisher.push(f.repo, f.target, async () => {
      fixtureGit(
        f.receiver,
        "update-ref",
        "refs/heads/" + branch,
        f.target.baseSha,
      );
    }),
    /GitHub publication command failed/,
  );
  assert.equal(
    fixtureGit(f.receiver, "rev-parse", "refs/heads/" + branch),
    f.target.baseSha,
  );
  assert.deepEqual(f.drafts, []);
});

test("draft receipts must match destination, source repo, refs, reviewed fields and open draft state", async (t) => {
  let edit: Record<string, unknown> = {};
  const f = await setup(t, {
    editReply(op, data) {
      if (op === "read draft")
        Object.assign(
          (data.repository as Record<string, unknown>).pullRequest as object,
          edit,
        );
    },
  });
  await f.publisher.preflight(f.target);
  await f.publisher.push(f.repo, f.target, async () => {});
  const url = await f.publisher.createDraft(f.target);
  for (const patch of [
    { state: "CLOSED" },
    { isDraft: false },
    { body: f.target.body + "changed" },
    { title: "Another" },
    { number: 2 },
    { url: url + "0" },
    { baseRefName: "other" },
    { baseRefOid: f.target.headSha },
    { headRefName: "other" },
    { headRefOid: f.target.baseSha },
    {
      headRepository: { nameWithOwner: "another/project", id: "fixture-node" },
    },
    {
      baseRepository: {
        nameWithOwner: f.target.repository,
        id: "different-node",
      },
    },
  ]) {
    edit = patch;
    await assert.rejects(
      f.publisher.verifyDraft(f.target, url),
      /does not match/,
    );
  }
  const before = f.effects.length;
  for (const other of [
    url + "/",
    url + "\n",
    url.replace("github.com", "example.invalid"),
    url.replace("/1", "/01"),
  ])
    await assert.rejects(f.publisher.verifyDraft(f.target, other));
  assert.equal(f.effects.length, before);
});

test("replaced scratch files are retained and raw command errors cannot escape", async (t) => {
  let changed = "";
  const f = await setup(t, {
    async beforeCommand(_command, args, options) {
      if (args.includes("push")) {
        changed = String(options.cwd);
        await unlink(join(changed, "HEAD"));
        await writeFile(join(changed, "HEAD"), "replacement to preserve\n", {
          flag: "wx",
        });
        throw new Error("synthetic private diagnostic");
      }
    },
  });
  await f.publisher.preflight(f.target);
  try {
    await assert.rejects(
      f.publisher.push(f.repo, f.target, async () => {}),
      (e) => e instanceof Error && !e.message.includes("private diagnostic"),
    );
    assert.ok(
      changed.startsWith(join(await realpath("/tmp"), "argent-publish-")),
    );
    assert.equal(
      await readFile(join(changed, "HEAD"), "utf8"),
      "replacement to preserve\n",
    );
    assert.ok(!f.effects.includes("push"));
  } finally {
    if (changed) await rm(changed, { recursive: true, force: true });
  }
});

test("oversized source blobs are refused before reservation or authenticated Git dispatch", async (t) => {
  const f = await setup(t);
  await writeFile(
    join(f.repo, "large"),
    Buffer.alloc(16 * 1024 * 1024 + 1, 65),
  );
  fixtureGit(f.repo, "add", "large");
  fixtureGit(f.repo, "commit", "-m", "Large fixture");
  f.target.headSha = fixtureGit(f.repo, "rev-parse", "HEAD");
  await f.publisher.preflight(f.target);
  let reserved = false;
  await assert.rejects(
    f.publisher.push(f.repo, f.target, async () => {
      reserved = true;
    }),
    /object set exceeds/,
  );
  assert.equal(reserved, false);
  assert.ok(!f.effects.includes("push"));
});
