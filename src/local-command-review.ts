import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  DomainError,
  UncertainExecutionError,
  type WorkspaceChange,
} from "./domain.js";
import { git } from "./git.js";
import { COMMAND_CONFIG_PATH } from "./local-command-config.js";
import type { Store } from "./store.js";
import {
  CHANGES_LIMITS,
  CLEAN_COMMIT_LIMITS,
  compareEntries,
  inspectLocalCommandCandidate,
  pathName,
  type Entry,
  type LocalCommandCandidateObservation,
} from "./workspace-changes.js";

export const REVIEW_POLICY = "argent-local-command-review-v1";
/**
 * `files` bounds changed paths, which a person must read; `treeFiles` bounds
 * each commit's whole tree. One deadline also covers the observation.
 */
export const REVIEW_LIMITS = Object.freeze({
  ...CHANGES_LIMITS,
  treeFiles: CLEAN_COMMIT_LIMITS.files,
  treeBytes: CLEAN_COMMIT_LIMITS.listingBytes,
  timeoutMs: CLEAN_COMMIT_LIMITS.timeoutMs + 120000,
});

/** Untrusted display data. Blob identities are Git's, verified against bytes. */
export type LocalCommandReviewFile = Readonly<
  WorkspaceChange & {
    oldBlobId: string | null;
    newBlobId: string | null;
    oldBytes: number | null;
    newBytes: number | null;
    /** The fixed command-configuration path, as either side of the change. */
    configuration: boolean;
  }
>;

/**
 * What a person would have to read before consenting to run the approved base
 * commands against this exact commit. Not consent, not a runnable plan.
 */
export type LocalCommandCandidateReview = Readonly<{
  kind: "local-command-candidate-review";
  version: 1;
  identity: string;
  policyVersion: typeof REVIEW_POLICY;
  observation: LocalCommandCandidateObservation;
  /** Commands always come from the approved base, never from the candidate. */
  commandSource: "approved-base-configuration";
  /** The candidate's own copy of the configuration file, compared to the base. */
  configuration: "unchanged" | "changed" | "removed";
  files: readonly LocalCommandReviewFile[];
  summary: Readonly<{ files: number; textFiles: number; binaryFiles: number }>;
  /** Binary content has an identity and a size; it was never displayed. */
  binaryContent: "identity-only";
  /** Argent cannot tell which changed files a command will execute. */
  commandInputs: "not-identified";
  consent: "not-collected";
  execution: "forbidden";
  consistency: "pinned-objects";
  simulation: false;
  tested: false;
}>;

interface SizedEntry extends Entry {
  size: number;
}

const unreviewable = () =>
  new DomainError(409, "Candidate changes cannot be reviewed safely");
const limit = () =>
  new DomainError(413, "Candidate review exceeds inspection limits");
const decode = (bytes: Buffer) =>
  new TextDecoder("utf8", { fatal: true, ignoreBOM: true }).decode(bytes);

/**
 * Internal and read-only. Compares the workspace's recorded base with the
 * exact observed commit, reading only Git objects named by those two commits.
 */
export async function reviewLocalCommandCandidate(
  store: Store,
  worktreeRoot: string,
  workspaceId: string,
  operatorId: string,
  requestedSignal?: AbortSignal,
): Promise<LocalCommandCandidateReview> {
  const controller = new AbortController();
  const signal = requestedSignal
    ? AbortSignal.any([requestedSignal, controller.signal])
    : controller.signal;
  const timer = setTimeout(
    () => controller.abort(new DomainError(408, "Candidate review timed out")),
    REVIEW_LIMITS.timeoutMs,
  );
  try {
    signal.throwIfAborted();
    // Validates the identifiers, the owned worktree, the operator's fresh
    // approval and byte-for-byte cleanliness at one exact commit.
    const observation = await inspectLocalCommandCandidate(
      store,
      worktreeRoot,
      workspaceId,
      operatorId,
      signal,
    );
    const local = store.getWorkspace(workspaceId).local;
    if (!local) throw unreviewable();
    const binding = JSON.stringify(local);
    const root = await realpath(worktreeRoot);
    const directory = join(root, workspaceId);
    const commonAt = async (cwd: string) => {
      const value = decode(
        await git(cwd, ["rev-parse", "--git-common-dir"], 1 << 20, signal),
      );
      if (!value.endsWith("\n")) throw unreviewable();
      return realpath(resolve(cwd, value.slice(0, -1)));
    };
    const common = await commonAt(local.repositoryPath);
    if ((await commonAt(directory)) !== common) throw unreviewable();
    // Never rediscover objects through the agent-writable .git file.
    const objectGit = (args: string[], maxBuffer: number) =>
      git(
        local.repositoryPath,
        [`--git-dir=${common}`, ...args],
        maxBuffer,
        signal,
      );
    const object = async (
      type: "commit" | "tree" | "blob",
      oid: string,
      maxBuffer: number,
    ) => {
      if (type !== "blob") {
        const size = decode(await objectGit(["cat-file", "-s", oid], 128));
        if (!/^(0|[1-9][0-9]*)\n$/.test(size)) throw unreviewable();
        if (!Number.isSafeInteger(Number(size)) || Number(size) > maxBuffer)
          throw limit();
      }
      const bytes = await objectGit(["cat-file", type, oid], maxBuffer);
      if (
        createHash(oid.length === 64 ? "sha256" : "sha1")
          .update(`${type} ${bytes.length}\0`)
          .update(bytes)
          .digest("hex") !== oid
      )
        throw unreviewable();
      return bytes;
    };
    const tree = async (commit: string) => {
      const bytes = await object("commit", commit, REVIEW_LIMITS.treeBytes);
      const match = /^tree ([a-f0-9]{40}|[a-f0-9]{64})\n/.exec(decode(bytes));
      if (!match || match[1]!.length !== commit.length) throw unreviewable();
      if (commit === observation.headSha && match[1] !== observation.treeId)
        throw unreviewable();
      const entries = new Map<string, SizedEntry>();
      const pending = [{ oid: match[1]!, prefix: "" }];
      let total = bytes.length;
      let trees = 0;
      while (pending.length) {
        signal.throwIfAborted();
        if (++trees > REVIEW_LIMITS.treeFiles) throw limit();
        const { oid, prefix } = pending.pop()!;
        const raw = await object("tree", oid, REVIEW_LIMITS.treeBytes);
        total += raw.length;
        if (total > REVIEW_LIMITS.treeBytes) throw limit();
        let offset = 0;
        const siblings = new Set<string>();
        while (offset < raw.length) {
          const space = raw.indexOf(32, offset);
          const nul = raw.indexOf(0, space + 1);
          const end = nul + 1 + commit.length / 2;
          if (space < offset || nul < space || end > raw.length)
            throw unreviewable();
          const mode = decode(raw.subarray(offset, space));
          const component = decode(raw.subarray(space + 1, nul));
          if (component.includes("/") || siblings.has(component))
            throw unreviewable();
          siblings.add(component);
          const name = pathName(prefix + component);
          const child = raw.subarray(nul + 1, end).toString("hex");
          offset = end;
          if (mode === "40000") {
            pending.push({ oid: child, prefix: name + "/" });
          } else {
            if (
              !["100644", "100755", "120000"].includes(mode) ||
              entries.has(name)
            )
              throw unreviewable();
            entries.set(name, { mode, oid: child, size: -1 });
            if (entries.size > REVIEW_LIMITS.treeFiles) throw limit();
          }
        }
      }
      return entries;
    };
    const base = await tree(observation.baseSha);
    const head = await tree(observation.headSha);
    if (head.size !== observation.files) throw unreviewable();
    // Only changed blobs are sized and read; every traversed tree is verified.
    const names = [...new Set([...base.keys(), ...head.keys()])]
      .filter((name) => {
        const old = base.get(name);
        const next = head.get(name);
        return !old || !next || old.oid !== next.oid || old.mode !== next.mode;
      })
      .sort();
    if (names.length > REVIEW_LIMITS.files) throw limit();

    for (const name of names) {
      for (const entry of [base.get(name), head.get(name)]) {
        if (!entry) continue;
        const size = decode(
          await objectGit(["cat-file", "-s", entry.oid], 128),
        );
        if (!/^(0|[1-9][0-9]*)\n$/.test(size)) throw unreviewable();
        entry.size = Number(size);
        if (!Number.isSafeInteger(entry.size)) throw unreviewable();
      }
    }
    let total = 0;
    const compared = await compareEntries(
      names,
      base,
      head,
      async (entry) => {
        // Reserve before reading: sizes come from the pinned tree listing.
        if (
          entry.size > REVIEW_LIMITS.fileBytes ||
          total + entry.size > REVIEW_LIMITS.totalBytes
        )
          throw limit();
        total += entry.size;
        const bytes = await object("blob", entry.oid, REVIEW_LIMITS.fileBytes);
        if (
          bytes.length !== entry.size ||
          createHash(entry.oid.length === 64 ? "sha256" : "sha1")
            .update(`blob ${bytes.length}\0`)
            .update(bytes)
            .digest("hex") !== entry.oid
        )
          throw unreviewable();
        return bytes;
      },
      signal,
    );

    // The approval was read from this blob, so the base must still name it.
    const approved = base.get(COMMAND_CONFIG_PATH);
    if (!approved || approved.mode === "120000") throw unreviewable();
    const candidate = head.get(COMMAND_CONFIG_PATH);
    const configuration = !candidate
      ? "removed"
      : candidate.oid === approved.oid && candidate.mode === approved.mode
        ? "unchanged"
        : "changed";

    const files = compared
      .map(({ change, old, next }) =>
        Object.freeze({
          ...change,
          oldBlobId: old?.oid ?? null,
          newBlobId: next?.oid ?? null,
          oldBytes: old?.size ?? null,
          newBytes: next?.size ?? null,
          configuration:
            change.path === COMMAND_CONFIG_PATH ||
            change.previousPath === COMMAND_CONFIG_PATH,
        }),
      )
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

    if (
      (await realpath(worktreeRoot)) !== root ||
      (await commonAt(directory)) !== common ||
      (await commonAt(local.repositoryPath)) !== common ||
      JSON.stringify(store.getWorkspace(workspaceId).local) !== binding
    )
      throw unreviewable();
    signal.throwIfAborted();

    const binaryFiles = files.filter((file) => file.binary).length;
    const identity = createHash("sha256")
      .update(
        JSON.stringify([
          REVIEW_POLICY,
          observation.identity,
          configuration,
          files.map((file) => [
            file.path,
            file.previousPath,
            file.status,
            file.oldMode,
            file.oldBlobId,
            file.newMode,
            file.newBlobId,
            file.binary,
          ]),
        ]),
      )
      .digest("hex");
    return Object.freeze({
      kind: "local-command-candidate-review",
      version: 1,
      identity,
      policyVersion: REVIEW_POLICY,
      observation,
      commandSource: "approved-base-configuration",
      configuration,
      files: Object.freeze(files),
      summary: Object.freeze({
        files: files.length,
        textFiles: files.length - binaryFiles,
        binaryFiles,
      }),
      binaryContent: "identity-only",
      commandInputs: "not-identified",
      consent: "not-collected",
      execution: "forbidden",
      consistency: "pinned-objects",
      simulation: false,
      tested: false,
    });
  } catch (error) {
    if (error instanceof UncertainExecutionError) throw error;
    if (signal.aborted) signal.throwIfAborted();
    if (error instanceof DomainError)
      throw error.status === 413 ? limit() : error;
    throw unreviewable();
  } finally {
    clearTimeout(timer);
  }
}
