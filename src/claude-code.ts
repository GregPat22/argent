import { accessSync, constants, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, relative } from "node:path";
import { createInterface } from "node:readline";
import { launchProcess } from "./process-group.js";
import type { AgentAdapter, AgentMessage } from "./adapters.js";
import { DomainError, type Run } from "./domain.js";
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
}

interface StreamEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  model?: string;
  is_error?: boolean;
  num_turns?: number;
  duration_ms?: number;
  result?: unknown;
  message?: { content?: unknown };
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

  async *execute(
    run: Run,
    directory: string,
    signal: AbortSignal,
  ): AsyncIterable<AgentMessage> {
    signal.throwIfAborted();
    const command = findExecutable(
      this.options.executable ?? this.env.ARGENT_CLAUDE_PATH ?? "claude",
      this.env,
    );
    if (!command)
      throw new DomainError(
        409,
        "Claude Code CLI not found. Install it and sign in, or set ARGENT_CLAUDE_PATH.",
      );
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
    const process = launchProcess(
      command,
      args,
      {
        cwd: directory,
        env: agentEnvironment(this.env),
      },
      signal,
      this.killGraceMs,
    );
    const { child, exited } = process;
    try {
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-4000);
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(run.task);

      yield {
        kind: "status",
        text:
          run.permissionMode === "full"
            ? "Claude Code started with full access: commands run without approval."
            : "Claude Code started: file edits allowed, other actions needing approval are denied.",
      };
      let result: StreamEvent | null = null;
      const lines = createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });
      for await (const line of lines) {
        let event: StreamEvent;
        try {
          event = JSON.parse(line) as StreamEvent;
        } catch {
          continue;
        }
        if (event.type === "system" && event.subtype === "init") {
          if (event.session_id === session.id)
            this.store.markAgentSessionStarted(run.workspaceId);
          yield {
            kind: "status",
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
      if (outcome.code !== 0 || !result || result.is_error) {
        const detail =
          typeof result?.result === "string"
            ? result.result
            : (stderr.trim().split("\n").at(-1) ?? "");
        if (detail) yield { kind: "tool_error", text: detail };
        throw new DomainError(
          409,
          `Claude Code did not finish successfully (exit ${outcome.code ?? "unknown"}${result?.subtype ? `, ${result.subtype}` : ""})`,
        );
      }
      yield {
        kind: "status",
        text: `Claude Code finished after ${result.num_turns ?? "?"} turns in ${Math.round((result.duration_ms ?? 0) / 1000)} s.`,
      };
    } finally {
      await process.dispose();
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
  const input = (block.input ?? {}) as Record<string, unknown>;
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
