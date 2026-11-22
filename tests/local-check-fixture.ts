import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import { Store } from "../src/store.js";
import { createLocalWorkspace } from "../src/local-worktree.js";
import { readLocalCommandConfig } from "../src/local-command-config.js";
import { reviewLocalCommandCandidate } from "../src/local-command-review.js";
import { LocalCheckWorker } from "../src/local-check-worker.js";

export function git(cwd: string, ...args: string[]) {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=Argent Test",
      "-c",
      "user.email=test@example.invalid",
      ...args,
    ],
    { cwd, stdio: ["ignore", "pipe", "pipe"] },
  )
    .toString()
    .trim();
}
export async function localCheckFixture(
  t: TestContext,
  setup = 'require("node:fs").writeFileSync("deps", "ready")',
  testCode = 'if(require("node:fs").readFileSync("deps", "utf8") !== "ready") process.exit(9); console.log("tested");',
  purpose: "setup-test" | "setup-run" = "setup-test",
  runOnly = false,
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "argent-check-"))),
    repo = join(root, "repo"),
    database = join(root, "store.sqlite"),
    worktrees = join(root, "worktrees"),
    verification = join(root, "verification");
  mkdirSync(repo);
  git(repo, "init", "--quiet", "--initial-branch=main");
  writeFileSync(
    join(repo, "argent.json"),
    JSON.stringify({
      version: 1,
      commands: {
        ...(runOnly
          ? {}
          : {
              setup: { argv: [process.execPath, "setup.cjs"] },
              test: { argv: [process.execPath, "test.cjs"] },
            }),
        run: { argv: [process.execPath, "run.cjs"] },
      },
    }),
  );
  writeFileSync(join(repo, "setup.cjs"), setup);
  writeFileSync(
    join(repo, "test.cjs"),
    purpose === "setup-run" ? "throw new Error('test must not run')" : testCode,
  );
  writeFileSync(
    join(repo, "run.cjs"),
    purpose === "setup-run"
      ? testCode
      : "throw new Error('run must not execute')",
  );
  writeFileSync(join(repo, ".gitignore"), "deps\n");
  writeFileSync(join(repo, "file.txt"), "original\n");
  mkdirSync(join(repo, "nested"));
  writeFileSync(join(repo, "nested", "value.txt"), "original\n");
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "initial");
  const store = new Store(database),
    db = new DatabaseSync(database);
  const connections = [store];
  t.after(() => {
    db.close();
    for (const c of connections) c.close();
    rmSync(root, { recursive: true, force: true });
  });
  const workspace = await createLocalWorkspace(store, worktrees, repo),
    id = workspace.id,
    directory = workspace.local!.worktreePath;
  const descriptor = (await readLocalCommandConfig(store, worktrees, id))!;
  await store.localCommandApprovals.approve(
    worktrees,
    id,
    "operator",
    descriptor.approvalCandidate.identity,
    "approve",
  );
  const review = await reviewLocalCommandCandidate(
    store,
    worktrees,
    id,
    "operator",
  );
  const consent = await store.localCommandConsents.consent(
    worktrees,
    id,
    "operator",
    review.identity,
    "consent",
    undefined,
    purpose,
  );
  const worker = new LocalCheckWorker(
    store,
    { worktreeRoot: worktrees, verificationRoot: verification },
    10000,
  );
  const enqueue = (key = "check") =>
    store.localChecks.enqueue(
      worktrees,
      id,
      "operator",
      consent.id,
      key,
      undefined,
      purpose,
    );
  const latest = () =>
    store.localChecks.latest(worktrees, id, "operator", undefined, purpose);
  return {
    root,
    repo,
    directory,
    database,
    db,
    store,
    connections,
    worktrees,
    verification,
    workspace,
    id,
    consent,
    review,
    enqueue,
    latest,
    worker,
  };
}
