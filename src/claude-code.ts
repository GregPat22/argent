import { accessSync, constants, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, relative } from "node:path";
import { readAgentEvents, type StreamEvent } from "./agent-stream.js";
import {
  captureProcess,
  captureProcessResult,
  launchProcess,
} from "./process-group.js";
import type { AgentAdapter, AgentMessage } from "./adapters.js";
import {
  DomainError,
  UncertainExecutionError,
  isReportedModel,
  type Run,
} from "./domain.js";
import type { RecoveryOwner } from "./local-agent-recovery.js";
import type { Store } from "./store.js";

// Spec 0013: the agent gets only these variables. Provider API keys and host
// tokens are never passed, so a missing sign-in fails instead of billing an API.
const ALLOWED_ENV = new Set([
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "TERM",
  "TMPDIR",
  "CLAUDE_CONFIG_DIR",
]);

// A desktop app launched from the Finder has a minimal PATH; also look where the
// official installers put the CLI and common developer tools.
function searchPath(env: NodeJS.ProcessEnv): string[] {
  const home = env.HOME ?? homedir();
  return [
    ...(env.PATH ?? "").split(delimiter),
    join(home, ".local", "bin"),
    join(home, ".claude", "local"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ].filter(
    (entry, index, all) =>
      entry && isAbsolute(entry) && all.indexOf(entry) === index,
  );
}

export function agentEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(source))
    if (
      value !== undefined &&
      (ALLOWED_ENV.has(name) || name.startsWith("LC_"))
    )
      env[name] = value;
  env.PATH = searchPath(source).join(delimiter);
  return env;
}

/** Resolves an executable to an absolute path without invoking a shell. */
export function findExecutable(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (isAbsolute(name)) return executable(name) ? name : null;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  for (const directory of searchPath(env)) {
    const candidate = join(directory, name);
    if (executable(candidate)) return candidate;
  }
  return null;
}

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export interface ClaudeCodeOptions {
  /** Absolute path or name of the official `claude` CLI. */
  executable?: string;
  env?: NodeJS.ProcessEnv;
  /** Time between SIGTERM and SIGKILL when stopping the agent. */
  killGraceMs?: number;
  recoveryOwner?: RecoveryOwner | undefined;
}

/**
 * Runs Claude Code through its official CLI in the workspace's worktree. The
 * task is written to standard input; output is the CLI's JSON event stream.
 * Not a sandbox: the agent runs as the developer (spec 0013).
 */
export class ClaudeCodeAgent implements AgentAdapter {
  private readonly env: NodeJS.ProcessEnv;
  private readonly killGraceMs: number;

  constructor(
    private readonly store: Store,
    private readonly options: ClaudeCodeOptions = {},
  ) {
    this.env = options.env ?? process.env;
    this.killGraceMs = options.killGraceMs ?? 3000;
  }

  private command(): string {
    const command = findExecutable(
      this.options.executable ?? this.env.ARGENT_CLAUDE_PATH ?? "claude",
      this.env,
    );
    if (!command)
      throw new DomainError(
        409,
        "Claude Code CLI not found. Install the official Claude Code CLI, then run claude auth login in Terminal. If already installed, set ARGENT_CLAUDE_PATH to the executable.",
      );
    return command;
  }

  async checkReadiness(signal: AbortSignal): Promise<void> {
    const command = this.command();
    const options = { cwd: "/", env: agentEnvironment(this.env) };
    const unknown =
      "Claude Code sign-in could not be verified. Run claude auth status in Terminal and retry.";
    let status: { code: number; stdout: Buffer };
    let reported: unknown;
    try {
      await requireSupportedCli(command, options.cwd, options.env, signal);
      status = await captureProcessResult(
        command,
        ["auth", "status"],
        options,
        {
          signal,
          timeoutMs: 5000,
          maxBuffer: 16384,
          allowedExitCodes: [0, 1],
        },
      );
      reported = JSON.parse(status.stdout.toString("utf8"));
    } catch (error) {
      if (error instanceof UncertainExecutionError)
        throw new DomainError(
          409,
          "Argent could not confirm the CLI readiness probe stopped. Inspect local processes before sending the task again.",
        );
      signal.throwIfAborted();
      if (error instanceof DomainError) throw error;
      throw new DomainError(409, unknown);
    }
    const auth = reported as {
      loggedIn?: unknown;
      authMethod?: unknown;
    } | null;
    if (status.code === 0 && auth?.loggedIn === true) {
      if (auth.authMethod === "claude.ai") return;
      throw new DomainError(
        409,
        "Claude Code did not report a claude.ai sign-in. Check claude auth status in Terminal, select your Claude account with claude auth login, then retry.",
      );
    }
    if (
      status.code === 1 &&
      auth?.loggedIn === false &&
      auth.authMethod === "none"
    )
      throw new DomainError(
        409,
        "Claude Code is not signed in. Run claude auth login in Terminal, then send your task again.",
      );
    throw new DomainError(409, unknown);
  }

  async *execute(
    run: Run,
    directory: string,
    signal: AbortSignal,
  ): AsyncIterable<AgentMessage> {
    signal.throwIfAborted();
    const command = this.command();
    const env = agentEnvironment(this.env);
    await requireSupportedCli(command, directory, env, signal);
    const session = this.store.agentSession(run.workspaceId);
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      run.permissionMode === "full" ? "bypassPermissions" : "acceptEdits",
      "--permission-prompts",
      "none",
      ...(session.started
        ? ["--resume", session.id]
        : ["--session-id", session.id]),
    ];
    const execution = launchProcess(
      command,
      args,
      {
        cwd: directory,
        env,
      },
      signal,
      this.killGraceMs,
    );
    const { child, exited } = execution;
    try {
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-4000);
      });
      child.stdin.on("error", () => undefined);
      if (this.options.recoveryOwner && child.pid !== undefined)
        this.store.recordAgentGroup(
          run.id,
          run.leaseToken!,
          this.options.recoveryOwner,
          child.pid,
        );
      child.stdin.end(run.task);

      yield {
        kind: "status",
        text:
          run.permissionMode === "full"
            ? "Claude Code started with full access: commands run without approval."
            : "Claude Code started: file edits allowed, other actions needing approval are denied.",
      };
      let result: StreamEvent | null = null;
      for await (const event of readAgentEvents(child.stdout)) {
        if (event.type === "system" && event.subtype === "init") {
          if (event.session_id === session.id)
            this.store.markAgentSessionStarted(run.workspaceId);
          yield {
            kind: "status",
            ...(event.session_id === session.id && isReportedModel(event.model)
              ? { cliModel: event.model }
              : {}),
            text: `Session ${session.started ? "resumed" : "started"}${event.model ? ` (${event.model})` : ""}.`,
          };
        } else if (event.type === "result") {
          result = event;
        } else {
          yield* describe(event, directory);
        }
      }
      const outcome = await exited;
      signal.throwIfAborted();
      if (outcome.error)
        throw new DomainError(
          409,
          `Claude Code could not start: ${outcome.error.message}`,
        );
      if (
        outcome.code !== 0 ||
        !result ||
        result.is_error ||
        result.subtype !== "success"
      ) {
        const detail =
          typeof result?.result === "string"
            ? result.result
            : (stderr.trim().split("\n").at(-1) ?? "");
        if (detail) yield { kind: "tool_error", text: detail };
        // The CLI can report subtype "success" on an error result. Keep its
        // untrusted metadata out of Argent's failure summary.
        throw new DomainError(
          409,
          `Claude Code failed (exit ${outcome.code ?? "unknown"}).`,
        );
      }
      yield {
        kind: "status",
        text: `Claude Code finished after ${result.num_turns ?? "?"} turns in ${Math.round((result.duration_ms ?? 0) / 1000)} s.`,
      };
    } finally {
      await execution.dispose();
    }
  }
}

function* describe(
  event: StreamEvent,
  directory: string,
): Generator<AgentMessage> {
  const content = event.message?.content;
  if (!Array.isArray(content)) return;
  for (const block of content as Record<string, unknown>[]) {
    if (event.type === "assistant" && block.type === "text") {
      if (typeof block.text === "string" && block.text.trim())
        yield { kind: "text", text: block.text };
    } else if (event.type === "assistant" && block.type === "tool_use") {
      yield { kind: "tool", text: toolSummary(block, directory) };
    } else if (
      event.type === "user" &&
      block.type === "tool_result" &&
      block.is_error === true
    ) {
      yield {
        kind: "tool_error",
        text: `Tool error: ${flatten(block.content)}`,
      };
    }
  }
}

function toolSummary(
  block: Record<string, unknown>,
  directory: string,
): string {
  const name = typeof block.name === "string" ? block.name : "tool";
  const input =
    block.input &&
    typeof block.input === "object" &&
    !Array.isArray(block.input)
      ? (block.input as Record<string, unknown>)
      : {};
  const path = (value: unknown) =>
    typeof value === "string"
      ? isAbsolute(value) && !relative(directory, value).startsWith("..")
        ? relative(directory, value) || "."
        : value
      : "";
  if (typeof input.command === "string") return `${name}: ${input.command}`;
  if (input.file_path !== undefined) return `${name}: ${path(input.file_path)}`;
  if (typeof input.pattern === "string") return `${name}: ${input.pattern}`;
  if (typeof input.description === "string")
    return `${name}: ${input.description}`;
  return name;
}

function flatten(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value
      .map((part) =>
        typeof part === "object" && part && "text" in part
          ? String((part as { text: unknown }).text)
          : "",
      )
      .join(" ");
  return "";
}

async function requireSupportedCli(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<void> {
  const unreadable =
    "Claude Code's version could not be verified. Run claude --version in Terminal and check the configured executable.";
  let output: Buffer;
  try {
    output = await captureProcess(
      command,
      ["--version"],
      { cwd, env },
      { signal, timeoutMs: 5000, maxBuffer: 1024 },
    );
  } catch (error) {
    if (error instanceof UncertainExecutionError) throw error;
    signal.throwIfAborted();
    throw new DomainError(409, unreadable);
  }
  const match = /^(\d+)\.(\d+)\.(\d+) \(Claude Code\)$/.exec(
    output.toString("utf8").trim(),
  );
  if (!match) throw new DomainError(409, unreadable);
  const major = Number(match[1]),
    minor = Number(match[2]),
    patch = Number(match[3]);
  if (
    major > 2 ||
    (major === 2 && (minor > 1 || (minor === 1 && patch >= 259)))
  )
    return;
  throw new DomainError(
    409,
    "Claude Code 2.1.259 or newer is required. Run claude update in Terminal, then try again.",
  );
}
