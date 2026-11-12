import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { git } from "../src/git.js";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "argent-git-transport-"));
  const repo = join(root, "repo");
  const bin = join(root, "bin");
  const marker = join(root, "helper-ran");
  mkdirSync(repo);
  mkdirSync(bin);
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}:${oldPath}`;
  const env = {
    PATH: process.env.PATH,
    HOME: root,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
  };
  const raw = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: repo,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
      .toString()
      .trim();
  raw("init", "--quiet", "--initial-branch=main");
  writeFileSync(join(repo, "file.txt"), "fixture\n");
  raw("add", ".");
  raw(
    "-c",
    "user.name=Argent Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  );
  writeFileSync(
    join(bin, "git-remote-argentfixture"),
    `#!${process.execPath}\nrequire("node:fs").writeFileSync(${JSON.stringify(marker)}, "fixture");\nprocess.exit(1);\n`,
    { mode: 0o755 },
  );
  raw("config", "protocol.argentfixture.allow", "always");
  t.after(() => {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    rmSync(root, { recursive: true, force: true });
  });
  return { root, repo, marker, raw, env };
}

test("trusted Git denies an explicitly allowed custom protocol before its helper starts", async (t) => {
  const f = fixture(t);
  const args = [
    "-c",
    "protocol.allow=never",
    "ls-remote",
    "argentfixture::fixture",
  ];
  assert.notEqual(
    spawnSync("git", args, { cwd: f.repo, env: f.env }).status,
    0,
  );
  assert.equal(
    existsSync(f.marker),
    true,
    "per-protocol config overrides the default policy",
  );
  unlinkSync(f.marker);
  assert.notEqual(
    spawnSync("git", args, {
      cwd: f.repo,
      env: { ...f.env, GIT_ALLOW_PROTOCOL: "" },
    }).status,
    0,
  );
  assert.equal(
    existsSync(f.marker),
    false,
    "empty allowlist works without the newer lazy-fetch variable",
  );
  await assert.rejects(
    git(f.repo, ["ls-remote", "argentfixture::fixture"]),
    /Git ls-remote failed/,
  );
  assert.equal(existsSync(f.marker), false);
});

test("missing promisor objects cannot launch a lazy transport or refresh the index", async (t) => {
  const f = fixture(t);
  for (const [key, value] of [
    ["remote.origin.url", "argentfixture::fixture"],
    ["remote.origin.promisor", "true"],
    ["remote.origin.partialclonefilter", "blob:none"],
    ["extensions.partialclone", "origin"],
    ["core.repositoryformatversion", "1"],
  ])
    f.raw("config", key!, value!);
  const oid = f.raw("rev-parse", "HEAD:file.txt");
  const object = join(f.repo, ".git", "objects", oid.slice(0, 2), oid.slice(2));
  unlinkSync(object);
  const index = readFileSync(join(f.repo, ".git", "index"));
  const args = ["-c", "protocol.allow=never", "cat-file", "blob", oid];
  assert.notEqual(
    spawnSync("git", args, { cwd: f.repo, env: f.env }).status,
    0,
  );
  assert.equal(
    existsSync(f.marker),
    true,
    "control reaches only the owned marker helper",
  );
  unlinkSync(f.marker);
  assert.notEqual(
    spawnSync("git", args, {
      cwd: f.repo,
      env: { ...f.env, GIT_ALLOW_PROTOCOL: "" },
    }).status,
    0,
  );
  assert.equal(existsSync(f.marker), false);
  await assert.rejects(
    git(f.repo, ["cat-file", "blob", oid]),
    /Git cat-file failed/,
  );
  assert.equal(existsSync(f.marker), false);
  assert.equal(existsSync(object), false);
  assert.deepEqual(readFileSync(join(f.repo, ".git", "index")), index);
});

test("filter subsection names containing equals cannot bypass trusted Git", async (t) => {
  const f = fixture(t);
  f.raw("config", "filter.a=b.clean", `touch '${f.marker}'; cat`);
  writeFileSync(join(f.repo, ".git", "info", "attributes"), "* filter=a=b\n");
  writeFileSync(join(f.repo, "file.txt"), "changed\n");
  await git(f.repo, [
    "diff",
    "--binary",
    "--no-ext-diff",
    "--no-textconv",
    "HEAD",
  ]);
  assert.equal(existsSync(f.marker), false);
  f.raw("diff", "HEAD");
  assert.equal(
    existsSync(f.marker),
    true,
    "control actually invokes the filter",
  );
});
