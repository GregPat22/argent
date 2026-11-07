import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DomainError } from "./domain.js";
import type { Store } from "./store.js";

export function inspectArtifact(
  store: Store,
  root: string,
  runId: string,
): Record<string, unknown> {
  const run = store.getRun(runId);
  const evidence = store.evidence(runId);
  // A worktree record has no stored file to re-read; the diff view is L1.3.
  if (evidence.kind === "worktree-record")
    return { evidence, content: null, simulation: false };
  if (![run.id, run.workspaceId].every((id) => /^[a-f0-9-]{36}$/.test(id)))
    throw new DomainError(400, "Invalid artifact identity");
  const path = join(root, run.workspaceId, `${run.id}.json`);
  try {
    if (statSync(path).size > 32768)
      throw new DomainError(409, "Artifact exceeds inspection limit");
    const bytes = readFileSync(path);
    if (createHash("sha256").update(bytes).digest("hex") !== evidence.sha256) {
      throw new DomainError(409, "Artifact changed after verification");
    }
    return {
      evidence,
      content: JSON.parse(bytes.toString()) as unknown,
      simulation: true,
    };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError(409, "Verified artifact is unavailable");
  }
}
