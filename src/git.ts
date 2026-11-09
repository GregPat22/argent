import { DomainError } from "./domain.js";
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
];
function environment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_OPTIONAL_LOCKS: "0",
    LANG: "C",
  };
}

/** No shell, hooks, filter commands, credential helpers or network transports. */
export async function git(
  cwd: string,
  args: string[],
  maxBuffer = 1 << 20,
  signal?: AbortSignal,
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
  const overrides = filters.flatMap((name) => [
    "-c",
    `${name}=${name.endsWith(".required") ? "false" : ""}`,
  ]);
  try {
    return await captureProcess(
      "git",
      [...SAFE_GIT, ...overrides, ...args],
      options,
      { signal, maxBuffer },
    );
  } catch (error) {
    if (signal?.aborted) signal.throwIfAborted();
    if (error instanceof DomainError) throw error;
    throw new DomainError(409, `Git ${args[0]} failed`);
  }
}
