import { DomainError, UncertainExecutionError } from "./domain.js";
import { captureProcess } from "./process-group.js";

const SAFE_GIT = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.untrackedCache=false",
  "-c",
  "core.attributesFile=/dev/null",
  "-c",
  "protocol.allow=never",
  "-c",
  "credential.helper=",
  "-c",
  "submodule.recurse=false",
  "-c",
  "diff.submodule=short",
  // Callers reject gitlinks before recording evidence. Never let even a dirty
  // submodule probe start child Git with its own, uninspected filter config.
  "-c",
  "diff.ignoreSubmodules=all",
];
function environment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_OPTIONAL_LOCKS: "0",
    // Unlike protocol.allow, this allowlist overrides per-protocol repository
    // configuration. Empty means no transport, including lazy promisor fetches.
    GIT_ALLOW_PROTOCOL: "",
    // Newer Git also understands this guard; transport denial covers older Git.
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    LANG: "C",
  };
}

/** No shell, hooks, filter commands, credential helpers or network transports. */
export async function git(
  cwd: string,
  args: string[],
  maxBuffer = 1 << 20,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<Buffer> {
  const options = { cwd, env: environment() };
  // Read names, never command values (which can contain private configuration).
  // Per-command overrides also cover included/worktree config. Do not cache:
  // the developer or agent can change configuration between inspections.
  const configured = await captureProcess(
    "git",
    [
      ...SAFE_GIT,
      "config",
      "--null",
      "--name-only",
      "--get-regexp",
      "^filter\\..*\\.(clean|smudge|process|required)$",
    ],
    options,
    { signal, allowedExitCodes: [0, 1] },
  );
  const filters = configured.toString("utf8").split("\0").filter(Boolean);
  // Keys may contain '=' in the subsection: -c key=value cannot represent
  // those keys. Separate environment fields preserve their exact identity.
  if (!Buffer.from(configured.toString("utf8")).equals(configured))
    throw new DomainError(
      409,
      "Git filter configuration cannot be read safely",
    );
  options.env.GIT_CONFIG_COUNT = String(filters.length);
  filters.forEach((name, index) => {
    options.env[`GIT_CONFIG_KEY_${index}`] = name;
    options.env[`GIT_CONFIG_VALUE_${index}`] = name.endsWith(".required")
      ? "false"
      : "";
  });
  // Unlike diff.ignoreSubmodules, this option also overrides per-submodule
  // ignore=none. Evidence callers reject all gitlinks rather than omit them.
  const commandArgs =
    args[0] === "diff"
      ? ["diff", "--ignore-submodules=all", ...args.slice(1)]
      : args;
  try {
    return await captureProcess("git", [...SAFE_GIT, ...commandArgs], options, {
      signal,
      maxBuffer,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
  } catch (error) {
    if (error instanceof UncertainExecutionError) throw error;
    if (signal?.aborted) signal.throwIfAborted();
    if (error instanceof DomainError) throw error;
    throw new DomainError(409, `Git ${args[0]} failed`);
  }
}
