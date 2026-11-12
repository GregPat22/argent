import { createHash } from "node:crypto";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { agentEnvironment, findExecutable } from "./claude-code.js";
import {
  DomainError,
  UncertainExecutionError,
  requireInteger,
} from "./domain.js";
import { COMMAND_CONFIG_LIMITS } from "./local-command-config.js";
import { launchProcess } from "./process-group.js";

export const COMMAND_RUN_LIMITS = Object.freeze({
  /** Retained end of each stream; the digest and count cover all of it. */
  tailBytes: 256 << 10,
  /** Both streams together. Reaching it stops the command. */
  outputBytes: 64 << 20,
  minRuntimeMs: 1000,
  maxRuntimeMs: 7200000,
  killGraceMs: 3000,
});

/** Untrusted bytes. `tail` is at most the last `tailBytes` of the stream. */
export type CommandStream = Readonly<{
  bytes: number;
  sha256: string;
  tail: Buffer;
  truncated: boolean;
}>;

/**
 * What one process did, as Argent observed it. Not evidence about a commit:
 * nothing here says which files the process saw or that they were reviewed.
 */
export type BoundedCommandResult = Readonly<{
  kind: "bounded-command-result";
  version: 1;
  argv: readonly string[];
  executable: string;
  cwd: string;
  outcome: "exited" | "signaled" | "timed_out" | "output_limit";
  /** Present only when the process exited on its own. */
  exitCode: number | null;
  signal: string | null;
  startedAt: number;
  durationMs: number;
  stdout: CommandStream;
  stderr: CommandStream;
  simulation: false;
  tested: false;
  evidence: "not-recorded";
}>;

export interface BoundedCommandOptions {
  /** An existing directory, given by its real absolute path. */
  cwd: string;
  maxRuntimeMs: number;
  /** Source for the allowlisted variables; defaults to the service's own. */
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

const invalid = (message: string) => new DomainError(400, message);
const unavailable = () =>
  new DomainError(409, "Command executable was not found or cannot run");

function validateArgv(value: readonly string[]): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > COMMAND_CONFIG_LIMITS.arguments ||
    value.some(
      (argument) =>
        typeof argument !== "string" ||
        argument.includes("\0") ||
        /[\uD800-\uDFFF]/u.test(argument) ||
        Buffer.byteLength(argument) > COMMAND_CONFIG_LIMITS.argumentBytes,
    ) ||
    !value[0]!.trim()
  )
    throw invalid("Command must be a bounded, non-empty argument array");
  return Object.freeze([...value]);
}

function workingDirectory(value: string): string {
  try {
    if (
      typeof value === "string" &&
      isAbsolute(value) &&
      !value.includes("\0") &&
      realpathSync(value) === value &&
      statSync(value).isDirectory()
    )
      return value;
  } catch {
    /* reported below */
  }
  throw invalid("Command directory must be an existing real absolute path");
}

/**
 * A bare name is searched on the allowlisted PATH. A relative path with a
 * slash must stay inside the working directory once links are resolved.
 */
function resolveExecutable(
  name: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): string {
  if (isAbsolute(name) || !name.includes("/")) {
    const found = findExecutable(name, env);
    if (!found) throw unavailable();
    return found;
  }
  try {
    const real = realpathSync(resolve(cwd, name));
    const inside = relative(cwd, real);
    if (inside && !inside.startsWith("..") && !isAbsolute(inside)) {
      accessSync(real, constants.X_OK);
      if (statSync(real).isFile()) return real;
    }
  } catch {
    /* reported below */
  }
  throw unavailable();
}

/** Counts and hashes every byte; keeps only the end. */
function collector() {
  const hash = createHash("sha256");
  let chunks: Buffer[] = [];
  let kept = 0;
  let bytes = 0;
  return {
    add(chunk: Buffer): void {
      hash.update(chunk);
      bytes += chunk.length;
      chunks.push(chunk);
      kept += chunk.length;
      while (kept - chunks[0]!.length >= COMMAND_RUN_LIMITS.tailBytes)
        kept -= chunks.shift()!.length;
    },
    finish(): CommandStream {
      const all = Buffer.concat(chunks);
      chunks = [];
      return Object.freeze({
        bytes,
        sha256: hash.digest("hex"),
        tail: all.subarray(
          Math.max(0, all.length - COMMAND_RUN_LIMITS.tailBytes),
        ),
        truncated: bytes > COMMAND_RUN_LIMITS.tailBytes,
      });
    },
  };
}

/**
 * Internal only: no configuration, approval, review, job or route calls this.
 * Runs one argument array without a shell, as the developer, with the agent's
 * allowlisted environment, bounded output and one deadline. Not a sandbox.
 */
export async function runBoundedCommand(
  command: readonly string[],
  options: BoundedCommandOptions,
): Promise<BoundedCommandResult> {
  const argv = validateArgv(command);
  const cwd = workingDirectory(options.cwd);
  const maxRuntimeMs = requireInteger(
    options.maxRuntimeMs,
    "maxRuntimeMs",
    COMMAND_RUN_LIMITS.minRuntimeMs,
    COMMAND_RUN_LIMITS.maxRuntimeMs,
  );
  const env = agentEnvironment(options.env ?? process.env);
  // The agent's own configuration location is not a command's concern.
  delete env.CLAUDE_CONFIG_DIR;
  const executable = resolveExecutable(argv[0]!, cwd, env);
  options.signal?.throwIfAborted();

  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  let stopped: "timed_out" | "output_limit" | undefined;
  const stop = (reason: "timed_out" | "output_limit") => {
    stopped ??= reason;
    controller.abort(reason);
  };
  const timer = setTimeout(() => stop("timed_out"), maxRuntimeMs);
  const stdout = collector();
  const stderr = collector();
  let total = 0;
  const startedAt = Date.now();
  let execution: ReturnType<typeof launchProcess> | undefined;
  try {
    execution = launchProcess(
      executable,
      argv.slice(1),
      { cwd, env },
      signal,
      COMMAND_RUN_LIMITS.killGraceMs,
    );
    const { child } = execution;
    let exit: { code: number | null; signal: NodeJS.Signals | null } | null =
      null;
    child.once("exit", (code, name) => {
      exit = { code, signal: name };
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end();
    for (const [stream, sink] of [
      [child.stdout, stdout],
      [child.stderr, stderr],
    ] as const)
      stream.on("data", (chunk: Buffer) => {
        sink.add(chunk);
        total += chunk.length;
        if (total > COMMAND_RUN_LIMITS.outputBytes) stop("output_limit");
      });
    const closed = await execution.exited;
    // Confirm that nothing in the group survives before describing an outcome.
    await execution.dispose();
    options.signal?.throwIfAborted();
    const ended = exit as {
      code: number | null;
      signal: NodeJS.Signals | null;
    } | null;
    // The executable was found but the system refused to start it.
    if (!stopped && (closed.error || !ended)) throw unavailable();
    return Object.freeze({
      kind: "bounded-command-result",
      version: 1,
      argv,
      executable,
      cwd,
      outcome: stopped ?? (ended!.code === null ? "signaled" : "exited"),
      exitCode: stopped ? null : ended!.code,
      signal: stopped ? null : ended!.signal,
      startedAt,
      durationMs: Date.now() - startedAt,
      stdout: stdout.finish(),
      stderr: stderr.finish(),
      simulation: false,
      tested: false,
      evidence: "not-recorded",
    });
  } catch (error) {
    if (error instanceof UncertainExecutionError) throw error;
    if (options.signal?.aborted) options.signal.throwIfAborted();
    throw error;
  } finally {
    clearTimeout(timer);
    await execution?.dispose();
  }
}
