import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdtemp,
  open,
  realpath,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  DomainError,
  UncertainExecutionError,
  requireString,
} from "./domain.js";
import { git } from "./git.js";
import { checkId } from "./local-checks.js";
import {
  REVIEW_LIMITS,
  reviewPinnedChanges,
  type LocalCommandReviewFile,
} from "./local-command-review.js";
import {
  directoryIdentity,
  worktreeIdentity,
} from "./local-worktree-identity.js";
import type { Store } from "./store.js";

export interface CommitDetails {
  author: string;
  email: string;
  message: string;
}
export interface StagedReview extends CommitDetails {
  workspaceId: string;
  branch: string;
  identity: string;
  parentSha: string;
  treeId: string;
  files: readonly LocalCommandReviewFile[];
}
export interface CommitReceipt {
  workspaceId: string;
  reviewIdentity: string;
  commitSha: string;
}

const changed = () =>
  new DomainError(
    409,
    "The staged changes, branch or workspace changed. Review again.",
  );
const special = () =>
  new DomainError(
    409,
    "Finish the in-progress Git operation or use an ordinary stage-zero index before committing.",
  );
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const decode = (bytes: Buffer) =>
  new TextDecoder("utf8", { fatal: true, ignoreBOM: true }).decode(bytes);
const oid = (bytes: Buffer) => {
  const text = bytes.toString("ascii");
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})\n$/.test(text)) throw changed();
  return text.slice(0, -1);
};

export function commitDetails(value: unknown): CommitDetails {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 3
  )
    throw new DomainError(400, "Expected author, email and commit message");
  const data = value as CommitDetails;
  const author = requireString(data.author, "author", 150).trim(),
    email = requireString(data.email, "email", 254).trim(),
    message = requireString(data.message, "message", 2000).trim();
  if (
    /[<>\x00-\x1f\x7f]/.test(author) ||
    !/^[^@\s<>\x00-\x1f\x7f]+@[^@\s<>\x00-\x1f\x7f]+$/.test(email) ||
    /[\x00-\x08\x0b-\x1f\x7f]/.test(message) ||
    [author, email, message].some((v) => /[\uD800-\uDFFF]/u.test(v))
  )
    throw new DomainError(
      400,
      "Enter a Git author name, email and commit message without control characters",
    );
  return { author, email, message };
}

async function indexBytes(admin: string): Promise<Buffer> {
  const file = await open(
    join(admin, "index"),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = await file.stat();
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.size > REVIEW_LIMITS.treeBytes
    )
      throw special();
    const bytes = Buffer.alloc(before.size);
    let read = 0;
    while (read < bytes.length) {
      const chunk = await file.read(bytes, read, bytes.length - read, read);
      if (!chunk.bytesRead) throw changed();
      read += chunk.bytesRead;
    }
    const after = await file.stat();
    if (after.size !== before.size || after.ctimeMs !== before.ctimeMs)
      throw changed();
    return bytes;
  } finally {
    await file.close();
  }
}

async function refuseOperation(admin: string) {
  for (const name of [
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "REBASE_HEAD",
    "rebase-apply",
    "rebase-merge",
    "sequencer",
    "BISECT_START",
    "index.lock",
  ]) {
    try {
      await lstat(join(admin, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw special();
    }
    throw special();
  }
}

// Copy the bounded index before write-tree: Git may cache a tree in its index.
// A review may materialize immutable tree objects but never stages files or moves a ref.
async function inspect(
  store: Store,
  rootPath: string,
  id: string,
  details: CommitDetails,
  signal: AbortSignal,
) {
  checkId(id);
  const generation = store.archiveWriterGeneration(id);
  store.requireIdleWorkspace(id);
  const workspace = store.getWorkspace(id),
    local = workspace.local;
  if (!local || workspace.state !== "running")
    throw new DomainError(409, "Commit requires a running local workspace");
  const root = await realpath(rootPath);
  const registration = await worktreeIdentity(root, id, local, signal);
  const original = store.creationIdentity(id);
  if (original !== null && original !== registration) throw changed();
  const cwd = local.worktreePath,
    ref = `refs/heads/${local.branch}`;
  const paths = decode(
    await git(
      cwd,
      [
        "rev-parse",
        "--path-format=absolute",
        "--absolute-git-dir",
        "--git-common-dir",
      ],
      16384,
      signal,
    ),
  ).split("\n");
  if (paths.length !== 3 || paths[2] !== "" || !paths[0] || !paths[1])
    throw changed();
  const [admin, common] = paths as [string, string, string];
  const sourceCommon = decode(
    await git(
      local.repositoryPath,
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      16384,
      signal,
    ),
  );
  if (
    sourceCommon !== common + "\n" ||
    dirname(admin) !== join(common, "worktrees") ||
    (await realpath(admin)) !== admin ||
    (await realpath(common)) !== common
  )
    throw changed();
  const branchTip = async () => {
    const actual = decode(
      await git(cwd, ["symbolic-ref", "--no-recurse", "HEAD"], 256, signal),
    );
    const [name, kind, sha, link] = decode(
      await git(
        local.repositoryPath,
        [
          `--git-dir=${common}`,
          "for-each-ref",
          "--format=%(refname)%00%(objecttype)%00%(objectname)%00%(symref)",
          ref,
        ],
        512,
        signal,
      ),
    ).split("\0");
    if (
      actual !== ref + "\n" ||
      name !== ref ||
      kind !== "commit" ||
      !sha ||
      link !== "\n" ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)
    )
      throw changed();
    return sha;
  };
  await refuseOperation(admin);
  const parentSha = await branchTip();
  const index = await indexBytes(admin);
  const temp = await mkdtemp(join(await realpath(tmpdir()), "argent-staged-"));
  const owned = await directoryIdentity(temp);
  const copy = join(temp, "index");
  let uncertain = false;
  try {
    await writeFile(copy, index, { flag: "wx", mode: 0o600 });
    const readIndex = (args: string[], limit: number) =>
      git(
        cwd,
        ["-c", "core.splitIndex=false", ...args],
        limit,
        signal,
        undefined,
        copy,
      );
    if ((await readIndex(["rev-parse", "--shared-index-path"], 16384)).length)
      throw special();
    const listed = decode(
      await readIndex(
        ["ls-files", "--stage", "-v", "--sparse", "-z"],
        REVIEW_LIMITS.treeBytes,
      ),
    );
    const entries = listed.split("\0");
    if (entries.pop() !== "") throw special();
    if (entries.length > REVIEW_LIMITS.treeFiles)
      throw new DomainError(413, "Staged tree exceeds review limits");
    const treeId = oid(await readIndex(["write-tree"], 128));
    const { head, files } = await reviewPinnedChanges(
      local.repositoryPath,
      common,
      parentSha,
      treeId,
      signal,
      undefined,
      entries.length,
    );
    const unseen = new Set(head.keys());
    for (const entry of entries) {
      const match =
        /^H (100644|100755|120000) ([a-f0-9]{40}|[a-f0-9]{64}) 0\t([\s\S]+)$/.exec(
          entry,
        );
      const found = match && head.get(match[3]!);
      if (
        !match ||
        !unseen.delete(match[3]!) ||
        !found ||
        found.mode !== match[1] ||
        found.oid !== match[2]
      )
        throw special();
    }
    if (unseen.size) throw special();
    const verify = async () => {
      await refuseOperation(admin);
      if (
        (await worktreeIdentity(
          await realpath(rootPath),
          id,
          local,
          signal,
        )) !== registration ||
        (await branchTip()) !== parentSha ||
        !(await indexBytes(admin)).equals(index) ||
        store.archiveWriterGeneration(id) !== generation
      )
        throw changed();
      store.requireIdleWorkspace(id);
      signal.throwIfAborted();
    };
    await verify();
    const identity = hash([
      "argent-staged-commit-v1",
      id,
      registration,
      generation,
      ref,
      parentSha,
      treeId,
      details,
    ]);
    const review: StagedReview = {
      workspaceId: id,
      branch: local.branch,
      parentSha,
      treeId,
      identity,
      files,
      ...details,
    };
    return {
      review,
      generation,
      repository: local.repositoryPath,
      common,
      ref,
      verify,
    };
  } catch (error) {
    uncertain = error instanceof UncertainExecutionError;
    throw error;
  } finally {
    if (!uncertain) {
      if ((await directoryIdentity(temp)) !== owned)
        throw new DomainError(409, "Temporary index ownership changed");
      const file = await lstat(copy).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      });
      if (file && (!file.isFile() || file.nlink !== 1))
        throw new DomainError(409, "Unexpected temporary index");
      if (file) await unlink(copy);
      await rmdir(temp);
    }
  }
}

export async function reviewStagedCommit(
  store: Store,
  root: string,
  id: string,
  input: unknown,
  disconnect?: AbortSignal,
): Promise<StagedReview> {
  const timeout = AbortSignal.timeout(REVIEW_LIMITS.timeoutMs);
  const signal = disconnect ? AbortSignal.any([timeout, disconnect]) : timeout;
  return (await inspect(store, root, id, commitDetails(input), signal)).review;
}

export async function commitStagedChanges(
  store: Store,
  root: string,
  id: string,
  input: unknown,
  expected: unknown,
  disconnect?: AbortSignal,
): Promise<CommitReceipt> {
  checkId(id);
  if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected))
    throw new DomainError(400, "Expected the staged review identity");
  const details = commitDetails(input);
  const key = hash([expected, details]);
  const receipt = (commitSha: string): CommitReceipt => ({
    workspaceId: id,
    reviewIdentity: expected,
    commitSha,
  });
  const previous = store.localCommitReceipt(id, key);
  if (previous) return receipt(previous);
  try {
    const timeout = AbortSignal.timeout(REVIEW_LIMITS.timeoutMs);
    const signal = disconnect
      ? AbortSignal.any([timeout, disconnect])
      : timeout;
    const { review, generation, repository, common, ref, verify } =
      await inspect(store, root, id, details, signal);
    if (review.identity !== expected || !review.files.length) throw changed();
    const args = [
      `--git-dir=${common}`,
      "-c",
      `user.name=${details.author}`,
      "-c",
      `user.email=${details.email}`,
      "-c",
      "i18n.commitEncoding=UTF-8",
      "-c",
      `author.name=${details.author}`,
      "-c",
      `author.email=${details.email}`,
      "-c",
      `committer.name=${details.author}`,
      "-c",
      `committer.email=${details.email}`,
    ];
    // First construct and verify an unreachable object. Only the subsequent CAS moves a ref.
    const commitSha = oid(
      await git(
        repository,
        [
          ...args,
          "commit-tree",
          "--no-gpg-sign",
          review.treeId,
          "-p",
          review.parentSha,
          "-m",
          details.message,
        ],
        128,
        signal,
      ),
    );
    const bytes = await git(
      repository,
      [`--git-dir=${common}`, "cat-file", "commit", commitSha],
      16384,
      signal,
    );
    const text = decode(bytes);
    const lines = text.split("\n"),
      author = `${details.author} <${details.email}>`;
    const dates = lines[2]?.slice(("author " + author + " ").length);
    if (
      createHash(commitSha.length === 64 ? "sha256" : "sha1")
        .update(`commit ${bytes.length}\0`)
        .update(bytes)
        .digest("hex") !== commitSha ||
      !dates ||
      !/^\d+ [+-]\d{4}$/.test(dates) ||
      text !==
        `tree ${review.treeId}\nparent ${review.parentSha}\nauthor ${author} ${dates}\ncommitter ${author} ${dates}\n\n${details.message}\n`
    )
      throw new DomainError(
        409,
        "Git could not record the reviewed author and message exactly",
      );
    await verify();
    const duplicate = store.beginLocalCommit(id, key, commitSha, generation);
    if (duplicate) return receipt(duplicate);
    await git(
      repository,
      [...args, "update-ref", "--no-deref", ref, commitSha, review.parentSha],
      128,
      timeout,
    );
    if (
      oid(
        await git(
          repository,
          [`--git-dir=${common}`, "rev-parse", "--verify", ref],
          128,
          timeout,
        ),
      ) !== commitSha
    )
      throw changed();
    store.finishLocalCommit(id, key);
    return receipt(commitSha);
  } catch (error) {
    // An identical confirmation may have finished while this request was
    // reading Git. Its durable outcome wins over a now-stale preflight.
    const confirmed = store.localCommitReceipt(id, key);
    if (confirmed) return receipt(confirmed);
    throw error;
  }
}
