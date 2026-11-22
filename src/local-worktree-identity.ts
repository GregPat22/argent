import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DomainError, type LocalWorktree } from "./domain.js";
import { git } from "./git.js";

const refused = () =>
  new DomainError(409, "Cannot confirm the original linked worktree");

export async function directoryIdentity(path: string): Promise<string> {
  if ((await realpath(path)) !== path) throw refused();
  const stat = await lstat(path, { bigint: true });
  if (!stat.isDirectory()) throw refused();
  return [stat.dev, stat.ino, stat.birthtimeNs].join("/");
}

/** Bind the created directory to its registration in the source repository. */
export async function worktreeIdentity(
  root: string,
  id: string,
  local: LocalWorktree,
  signal?: AbortSignal,
): Promise<string> {
  const directory = local.worktreePath;
  if (
    directory !== join(root, id) ||
    local.branch !== `argent/${id.slice(0, 8)}`
  )
    throw refused();
  const worktree = await directoryIdentity(directory);
  const repository = await directoryIdentity(local.repositoryPath);
  if (!(await lstat(join(directory, ".git"))).isFile()) throw refused();
  const locations = async (cwd: string) => {
    const bytes = await git(
      cwd,
      [
        "rev-parse",
        "--path-format=absolute",
        "--show-toplevel",
        "--git-common-dir",
        "--absolute-git-dir",
      ],
      16384,
      signal,
    );
    const [top, common, admin, end, ...extra] = new TextDecoder("utf-8", {
      fatal: true,
    })
      .decode(bytes)
      .split("\n");
    if (top !== cwd || !common || !admin || end !== "" || extra.length)
      throw refused();
    return { common, admin };
  };
  const source = await locations(local.repositoryPath);
  const linked = await locations(directory);
  if (
    linked.common !== source.common ||
    dirname(linked.admin) !== join(source.common, "worktrees") ||
    linked.admin === source.admin
  )
    throw refused();
  const listing = await git(
    local.repositoryPath,
    ["worktree", "list", "--porcelain", "-z"],
    1 << 20,
    signal,
  );
  const records = new TextDecoder("utf-8", { fatal: true })
    .decode(listing)
    .split("\0\0")
    .map((record) => record.split("\0"))
    .filter((fields) => fields[0] === `worktree ${directory}`);
  const expected = `branch refs/heads/${local.branch}`;
  if (
    records.length !== 1 ||
    records[0]!.length !== 3 ||
    !records[0]!.includes(expected)
  )
    throw refused();
  return createHash("sha256")
    .update(
      JSON.stringify([
        id,
        directory,
        worktree,
        local.repositoryPath,
        repository,
        local.branch,
        linked.common,
        await directoryIdentity(linked.common),
        linked.admin,
        await directoryIdentity(linked.admin),
      ]),
    )
    .digest("hex");
}
