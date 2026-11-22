import { createHash } from "node:crypto";
import { DomainError } from "./domain.js";
import { PUBLICATION_MAX_COMMITS } from "./publication-record.js";
import { git } from "./git.js";

/** Follow stored commit bytes rather than Git's configurable revision ancestry. */
export async function publicationHistory(
  worktree: string,
  baseSha: string,
  headSha: string,
  signal: AbortSignal,
): Promise<number> {
  const refused = () =>
    new DomainError(
      409,
      "Publication requires a linear history of 1 to 64 commits after the workspace base.",
    );
  let count = 0;
  for (let sha = headSha; sha !== baseSha;) {
    if (count === PUBLICATION_MAX_COMMITS || !/^[0-9a-f]{40}$/.test(sha))
      throw refused();
    const bytes = await git(
      worktree,
      ["cat-file", "commit", sha],
      256 * 1024,
      signal,
    );
    const actual = createHash("sha1")
      .update(`commit ${bytes.length}\0`)
      .update(bytes)
      .digest("hex");
    const end = bytes.indexOf("\n\n");
    if (actual !== sha || end < 0) throw refused();
    const headers = bytes.subarray(0, end).toString("latin1").split("\n");
    const parents = headers.filter((line) => line.startsWith("parent "));
    const match = /^parent ([0-9a-f]{40})$/.exec(parents[0] ?? "");
    if (parents.length !== 1 || !match) throw refused();
    sha = match[1]!;
    count++;
  }
  if (!count) throw refused();
  return count;
}
