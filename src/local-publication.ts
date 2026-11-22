import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { DomainError } from "./domain.js";
import { readDraftEvidence } from "./draft-evidence.js";
import {
  validatePublicationTarget,
  type PublicationTransport,
} from "./github-publisher.js";
import { checkId } from "./local-checks.js";
import { worktreeIdentity } from "./local-worktree-identity.js";
import { publicationHistory } from "./publication-history.js";
import {
  isPublicationUrl,
  githubRepository,
  publicationTitle,
  publicationBaseRef,
  type PublicationTarget,
  type PublicationInput,
  type PublicationReview,
  type PublicationStatus,
} from "./publication-record.js";
import type { Store } from "./store.js";

const hash = (fields: readonly unknown[]) =>
  createHash("sha256").update(JSON.stringify(fields)).digest("hex");
const stale = () =>
  new DomainError(
    409,
    "The publication changed. Review the destination, history and evidence again.",
  );
function digest(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{64}$/.test(value) ||
    value.length !== 64
  )
    throw new DomainError(400, "Expected a reviewed identity");
  return value;
}
function fields(
  input: Record<string, unknown>,
  confirm: boolean,
): PublicationInput {
  if (
    Object.keys(input).length !== (confirm ? 5 : 4) ||
    (confirm && !Object.hasOwn(input, "identity"))
  )
    throw new DomainError(400, "Unexpected publication fields");
  if (
    !githubRepository(input.repository) ||
    !publicationBaseRef(input.baseBranch) ||
    !publicationTitle(input.title)
  )
    throw new DomainError(
      400,
      "Expected a GitHub owner/repository, a base branch and a single-line title",
    );
  return {
    reviewIdentity: digest(input.reviewIdentity),
    repository: input.repository,
    baseBranch: input.baseBranch,
    title: input.title,
  };
}
async function inspect(
  store: Store,
  root: string,
  id: string,
  operator: string,
  request: PublicationInput,
  signal: AbortSignal,
) {
  checkId(id);
  store.requireIdleWorkspace(id);
  const generation = store.archiveWriterGeneration(id);
  const workspace = store.getWorkspace(id),
    local = workspace.local;
  if (!local || workspace.state !== "running")
    throw new DomainError(
      409,
      "Publication requires a running local workspace",
    );
  const directory = await realpath(root);
  const registration = await worktreeIdentity(directory, id, local, signal);
  const original = store.creationIdentity(id);
  if (original !== null && registration !== original) throw stale();
  const preview = await readDraftEvidence(
    store,
    root,
    id,
    operator,
    request.reviewIdentity,
    signal,
  );
  if (preview.headSha === local.baseSha)
    throw new DomainError(
      409,
      "Commit the workspace changes before preparing a draft.",
    );
  if (preview.headSha.length !== 40 || local.baseSha.length !== 40)
    throw new DomainError(
      409,
      "GitHub publication requires a SHA-1 repository.",
    );
  const target: PublicationTarget = {
    repository: request.repository,
    baseBranch: request.baseBranch,
    baseSha: local.baseSha,
    branch: local.branch,
    headSha: preview.headSha,
    title: request.title,
    body: preview.body,
  };
  validatePublicationTarget(target);
  const commitCount = await publicationHistory(
    local.worktreePath,
    target.baseSha,
    target.headSha,
    signal,
  );
  if (
    (await worktreeIdentity(directory, id, local, signal)) !== registration ||
    store.archiveWriterGeneration(id) !== generation
  )
    throw stale();
  signal.throwIfAborted();
  const identity = hash([
    "argent-github-draft-v1",
    operator,
    id,
    registration,
    generation,
    request.reviewIdentity,
    target.repository,
    target.baseBranch,
    target.baseSha,
    target.branch,
    target.headSha,
    commitCount,
    target.title,
    target.body,
  ]);
  const review: PublicationReview = {
    workspaceId: id,
    reviewIdentity: request.reviewIdentity,
    identity,
    commitCount,
    ...target,
  };
  return { review, generation, worktree: local.worktreePath };
}

export async function reviewPublication(
  store: Store,
  root: string,
  id: string,
  operator: string,
  input: Record<string, unknown>,
  disconnected: AbortSignal,
): Promise<PublicationReview> {
  const signal = AbortSignal.any([disconnected, AbortSignal.timeout(60_000)]);
  if (store.publicationStatus(checkId(id)))
    throw new DomainError(
      409,
      "This workspace already has a publication record.",
    );
  return (
    await inspect(store, root, id, operator, fields(input, false), signal)
  ).review;
}

async function publishDraft(
  store: Store,
  root: string,
  id: string,
  operator: string,
  input: Record<string, unknown>,
  transport: PublicationTransport,
  disconnected: AbortSignal,
  stopping: AbortSignal,
): Promise<PublicationStatus> {
  checkId(id);
  const request = fields(input, true),
    expected = digest(input.identity);
  const key = hash([
    id,
    operator,
    request.reviewIdentity,
    request.repository,
    request.baseBranch,
    request.title,
    expected,
  ]);
  const prior = store.publicationStatus(id, key);
  if (prior) return prior;
  const signal = AbortSignal.any([
    disconnected,
    stopping,
    AbortSignal.timeout(90_000),
  ]);
  try {
    const first = await inspect(store, root, id, operator, request, signal);
    if (first.review.identity !== expected) throw stale();
    await transport.preflight(first.review);
    const target = first.review;
    // Building and validating the pack or looking up a credential can fail
    // before a push has been attempted. Reserve only at the dispatch boundary.
    await transport.push(first.worktree, target, async () => {
      const current = await inspect(store, root, id, operator, request, signal);
      if (current.review.identity !== expected) throw stale();
      signal.throwIfAborted();
      if (store.beginPublication(current.review, key, current.generation))
        throw stale();
    });
    stopping.throwIfAborted();
    await transport.confirmHead(target);
    stopping.throwIfAborted();
    store.advancePublication(id, expected, "draft");
    const url = await transport.createDraft(target);
    if (!isPublicationUrl(url, target.repository))
      throw new DomainError(409, "Unexpected draft URL");
    stopping.throwIfAborted();
    await transport.verifyDraft(target, url);
    return store.advancePublication(id, expected, "complete", url);
  } catch (error) {
    // May be a duplicate request racing the owner. No catch path sends another effect.
    const recorded = store.publicationStatus(id, key);
    if (recorded) return recorded;
    if (signal.aborted)
      throw new DomainError(408, "Publication review interrupted");
    if (error instanceof DomainError && error.status < 500) throw error;
    // Without a recorded intent the adapter did not dispatch a remote mutation.
    // A fresh explicit review may proceed after correcting a local/auth failure.
    throw new DomainError(
      409,
      "Publication preflight could not confirm the destination and refs.",
    );
  }
}

/** Keep the durable store open until confirmed requests finish, including after a disconnect. */
export class LocalPublications {
  private readonly pending = new Set<Promise<PublicationStatus>>();
  constructor(
    private readonly transport: PublicationTransport,
    private readonly stopping: AbortSignal,
  ) {}

  async publish(
    store: Store,
    root: string,
    id: string,
    operator: string,
    input: Record<string, unknown>,
    disconnected: AbortSignal,
  ) {
    this.stopping.throwIfAborted();
    const task = publishDraft(
      store,
      root,
      id,
      operator,
      input,
      this.transport,
      disconnected,
      this.stopping,
    );
    this.pending.add(task);
    try {
      return await task;
    } finally {
      this.pending.delete(task);
    }
  }

  async drain() {
    await Promise.allSettled(this.pending);
  }
}
