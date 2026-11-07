import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  DomainError,
  type Evidence,
  type Run,
  type Workspace,
} from "./domain.js";

export interface WorkspaceAdapter {
  prepare(workspace: Workspace): string;
  verify(directory: string, run: Run): Evidence;
}

/** One line of agent output. Plain strings are agent text. */
export type AgentMessage =
  string | { kind: "text" | "tool" | "tool_error" | "status"; text: string };

export interface AgentAdapter {
  execute(
    run: Run,
    directory: string,
    signal: AbortSignal,
  ): AsyncIterable<AgentMessage>;
}

/** Real local execution: used for `local-worktree` workspaces only. */
export interface ExecutionAdapters {
  workspace: WorkspaceAdapter;
  agent: AgentAdapter;
}

export class LocalWorkspace implements WorkspaceAdapter {
  constructor(private readonly root: string) {}

  prepare(workspace: Workspace): string {
    if (!/^[a-f0-9-]{36}$/.test(workspace.id))
      throw new DomainError(400, "Invalid workspace identifier");
    const directory = join(this.root, workspace.id);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    return directory;
  }

  verify(directory: string, run: Run): Evidence {
    const artifact = `${run.id}.json`;
    const content = readFileSync(join(directory, artifact));
    const data = JSON.parse(content.toString()) as Record<string, unknown>;
    if (
      data.runId !== run.id ||
      data.task !== run.task ||
      data.simulation !== true
    ) {
      throw new Error("Simulation artifact failed independent verification");
    }
    return {
      kind: "simulation-artifact-check",
      passed: true,
      artifact,
      sha256: createHash("sha256").update(content).digest("hex"),
      simulation: true,
    };
  }
}

// Deliberately cannot launch commands or call model APIs. This is a conformance fixture.
export class ScriptedAgent implements AgentAdapter {
  constructor(private readonly stepDelayMs = 500) {}

  async *execute(
    run: Run,
    directory: string,
    signal: AbortSignal,
  ): AsyncIterable<string> {
    yield "Scripted adapter started; no repository or model is connected.";
    await delay(this.stepDelayMs, undefined, { signal });
    yield "Writing a simulation artifact to the persistent local workspace.";
    await delay(this.stepDelayMs, undefined, { signal });
    signal.throwIfAborted();
    writeFileSync(
      join(directory, `${run.id}.json`),
      JSON.stringify({
        runId: run.id,
        task: run.task,
        simulation: true,
      }),
      { flag: "wx", mode: 0o600 },
    );
    yield "Artifact written; independent verification follows.";
  }
}
