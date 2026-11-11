import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { DomainError, UncertainExecutionError } from "./domain.js";
import { git } from "./git.js";
import type { Store } from "./store.js";

export const COMMAND_CONFIG_PATH = "argent.json";
export const COMMAND_CONFIG_POLICY = "argent-local-commands-v1";
export const COMMAND_CONFIG_LIMITS = Object.freeze({
  bytes: 64 << 10,
  arguments: 64,
  argumentBytes: 4 << 10,
  timeoutMs: 10000,
});
const ACTIONS = ["setup", "run", "test"] as const;
type Action = (typeof ACTIONS)[number];
type Command = Readonly<{ argv: readonly string[] }>;
export type LocalCommandConfig = Readonly<{
  version: 1;
  commands: Readonly<Partial<Record<Action, Command>>>;
}>;
export type LocalCommandConfigDescriptor = Readonly<{
  kind: "local-command-config";
  config: LocalCommandConfig;
  source: Readonly<{
    path: typeof COMMAND_CONFIG_PATH;
    baseSha: string;
    blobId: string;
    sha256: string;
  }>;
  approvalCandidate: Readonly<{ identity: string; policyVersion: string }>;
}>;
interface DirectoryIdentity {
  path: string;
  device: string;
  inode: string;
}
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const invalid = () =>
  new DomainError(409, "Invalid local command configuration");
const unsafe = () =>
  new DomainError(
    409,
    "Local command configuration source is unsafe or changed",
  );
const limit = () =>
  new DomainError(413, "Local command configuration exceeds limits");
const decode = (bytes: Buffer) =>
  new TextDecoder("utf8", { fatal: true, ignoreBOM: true }).decode(bytes);

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}

/** Pure schema validation. Never converts values to strings or executes argv. */
export function parseLocalCommandConfig(bytes: Buffer): LocalCommandConfig {
  if (bytes.length > COMMAND_CONFIG_LIMITS.bytes) throw limit();
  let value: Record<string, unknown>;
  try {
    value = object(JSON.parse(decode(bytes)) as unknown);
  } catch {
    throw invalid();
  }
  if (
    value.version !== 1 ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, "version") ||
    !Object.hasOwn(value, "commands")
  )
    throw invalid();
  const supplied = object(value.commands);
  if (
    Object.keys(supplied).length === 0 ||
    Object.keys(supplied).some(
      (name) => !ACTIONS.some((action) => action === name),
    )
  )
    throw invalid();
  const commands: Partial<Record<Action, Command>> = {};
  for (const action of ACTIONS) {
    if (!Object.hasOwn(supplied, action)) continue;
    const command = object(supplied[action]);
    if (
      Object.keys(command).length !== 1 ||
      !Object.hasOwn(command, "argv") ||
      !Array.isArray(command.argv) ||
      command.argv.length === 0
    )
      throw invalid();
    if (command.argv.length > COMMAND_CONFIG_LIMITS.arguments) throw limit();
    const argv: string[] = [];
    for (const argument of command.argv as unknown[]) {
      if (
        typeof argument !== "string" ||
        argument.includes("\0") ||
        // JSON permits escaped lone surrogates; UTF-8 encoding would silently
        // replace them and change the argument a later process receives.
        /[\uD800-\uDFFF]/u.test(argument)
      )
        throw invalid();
      if (Buffer.byteLength(argument) > COMMAND_CONFIG_LIMITS.argumentBytes)
        throw limit();
      argv.push(argument);
    }
    if (!argv[0]!.trim()) throw invalid();
    commands[action] = Object.freeze({ argv: Object.freeze(argv) });
  }
  return Object.freeze({ version: 1, commands: Object.freeze(commands) });
}

/** Versioned identity for review, not an approval or permission to execute. */
export function commandConfigCandidateIdentity(
  repository: Readonly<DirectoryIdentity>,
  contentSha256: string,
  policyVersion: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "argent-command-config-approval-v1",
        repository.path,
        repository.device,
        repository.inode,
        contentSha256,
        policyVersion,
      ]),
    )
    .digest("hex");
}

async function directoryIdentity(path: string): Promise<DirectoryIdentity> {
  if (
    !isAbsolute(path) ||
    path.includes("\0") ||
    (await realpath(path)) !== path
  )
    throw unsafe();
  const stat = await lstat(path, { bigint: true });
  if (!stat.isDirectory()) throw unsafe();
  return { path, device: String(stat.dev), inode: String(stat.ino) };
}

/** Read only the fixed configuration blob at a stored workspace's exact base. */
export async function readLocalCommandConfig(
  store: Store,
  worktreeRoot: string,
  workspaceId: string,
  requestedSignal?: AbortSignal,
): Promise<LocalCommandConfigDescriptor | null> {
  const controller = new AbortController();
  const signal = requestedSignal
    ? AbortSignal.any([requestedSignal, controller.signal])
    : controller.signal;
  const timer = setTimeout(
    () =>
      controller.abort(
        new DomainError(408, "Local command configuration read timed out"),
      ),
    COMMAND_CONFIG_LIMITS.timeoutMs,
  );
  try {
    signal.throwIfAborted();
    const workspace = store.getWorkspace(workspaceId);
    const local = workspace.local;
    if (
      workspace.provider !== "local-worktree" ||
      !local ||
      workspace.id !== workspaceId ||
      !ID.test(workspace.id) ||
      !SHA.test(local.baseSha) ||
      local.branch !== `argent/${workspace.id.slice(0, 8)}`
    )
      throw unsafe();
    const root = await realpath(worktreeRoot);
    const directory = join(root, workspace.id);
    if (local.worktreePath !== directory) throw unsafe();
    const text = async (cwd: string, args: string[]) => {
      signal.throwIfAborted();
      const value = decode(
        await git(cwd, args, COMMAND_CONFIG_LIMITS.bytes, signal),
      );
      if (!value.endsWith("\n")) throw unsafe();
      return value.slice(0, -1);
    };
    const inspectIdentity = async () => {
      signal.throwIfAborted();
      if ((await realpath(worktreeRoot)) !== root) throw unsafe();
      const directories = await Promise.all(
        [root, directory, local.repositoryPath].map(directoryIdentity),
      );
      for (const cwd of [directory, local.repositoryPath]) {
        if (
          (await text(cwd, ["rev-parse", "--show-toplevel"])) !== cwd ||
          (await text(cwd, ["rev-parse", "--is-bare-repository"])) !== "false"
        )
          throw unsafe();
      }
      if (
        (await text(directory, ["symbolic-ref", "--short", "HEAD"])) !==
        local.branch
      )
        throw unsafe();
      const common = async (cwd: string) =>
        directoryIdentity(
          await realpath(
            resolve(cwd, await text(cwd, ["rev-parse", "--git-common-dir"])),
          ),
        );
      const repository = await common(local.repositoryPath);
      if (
        JSON.stringify(await common(directory)) !== JSON.stringify(repository)
      )
        throw unsafe();
      if (
        (await text(directory, [
          "rev-parse",
          "--verify",
          `${local.baseSha}^{commit}`,
        ])) !== local.baseSha
      )
        throw unsafe();
      return { directories, repository };
    };
    const before = await inspectIdentity();
    const entry = decode(
      await git(
        directory,
        [
          "ls-tree",
          "-z",
          "--full-tree",
          local.baseSha,
          "--",
          COMMAND_CONFIG_PATH,
        ],
        COMMAND_CONFIG_LIMITS.bytes,
        signal,
      ),
    );
    let result: LocalCommandConfigDescriptor | null = null;
    if (entry !== "") {
      const match =
        /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\targent\.json\0$/.exec(
          entry,
        );
      if (!match) throw unsafe();
      const blobId = match[2]!;
      const sizeText = await text(directory, ["cat-file", "-s", blobId]);
      if (!/^(?:0|[1-9][0-9]*)$/.test(sizeText)) throw unsafe();
      const size = Number(sizeText);
      if (!Number.isSafeInteger(size) || size > COMMAND_CONFIG_LIMITS.bytes)
        throw limit();
      const bytes = await git(
        directory,
        ["cat-file", "blob", blobId],
        COMMAND_CONFIG_LIMITS.bytes,
        signal,
      );
      if (
        bytes.length !== size ||
        createHash(blobId.length === 64 ? "sha256" : "sha1")
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest("hex") !== blobId
      )
        throw unsafe();
      const config = parseLocalCommandConfig(bytes);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      result = Object.freeze({
        kind: "local-command-config",
        config,
        source: Object.freeze({
          path: COMMAND_CONFIG_PATH,
          baseSha: local.baseSha,
          blobId,
          sha256,
        }),
        approvalCandidate: Object.freeze({
          identity: commandConfigCandidateIdentity(
            before.repository,
            sha256,
            COMMAND_CONFIG_POLICY,
          ),
          policyVersion: COMMAND_CONFIG_POLICY,
        }),
      });
    }
    if (JSON.stringify(await inspectIdentity()) !== JSON.stringify(before))
      throw unsafe();
    signal.throwIfAborted();
    return result;
  } catch (error) {
    if (error instanceof UncertainExecutionError) throw error;
    if (signal.aborted) signal.throwIfAborted();
    if (error instanceof DomainError) throw error;
    throw unsafe();
  } finally {
    clearTimeout(timer);
  }
}
