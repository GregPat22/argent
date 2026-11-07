import type {
  AgentAdapter,
  AgentMessage,
  ExecutionAdapters,
  WorkspaceAdapter,
} from "./adapters.js";
import { DomainError } from "./domain.js";
import { Store } from "./store.js";

export class Worker {
  constructor(
    private readonly store: Store,
    private readonly workspaces: WorkspaceAdapter,
    private readonly agent: AgentAdapter,
    private readonly leaseMs = 5000,
    // Real local execution is opt-in: without it, local-worktree runs fail safely.
    private readonly local?: ExecutionAdapters,
  ) {}

  async tick(shutdown?: AbortSignal): Promise<boolean> {
    this.store.reconcile();
    if (shutdown?.aborted) return false;
    const run = this.store.claim(this.leaseMs);
    if (!run) return false;
    const token = run.leaseToken!;
    const controller = new AbortController();
    const stop = () => controller.abort("worker_shutdown");
    shutdown?.addEventListener("abort", stop, { once: true });
    const deadline = setTimeout(
      () => controller.abort("runtime_exceeded"),
      Math.max(0, run.deadlineAt! - Date.now()),
    );
    const heartbeat = setInterval(
      () => {
        try {
          const current = this.store.heartbeat(run.id, token, this.leaseMs);
          if (current.status === "cancelling")
            controller.abort("user_cancelled");
        } catch {
          controller.abort("lease_lost");
        }
      },
      Math.max(20, Math.floor(this.leaseMs / 4)),
    );

    try {
      const workspace = this.store.getWorkspace(run.workspaceId);
      const real = workspace.provider === "local-worktree";
      if (real && !this.local)
        throw new DomainError(409, "local_execution_not_configured");
      const adapters = real
        ? this.local!
        : { workspace: this.workspaces, agent: this.agent };
      const directory = adapters.workspace.prepare(workspace);
      for await (const message of adapters.agent.execute(
        run,
        directory,
        controller.signal,
      )) {
        controller.signal.throwIfAborted();
        const line = normalize(message);
        this.store.appendLog(run.id, token, line.text, undefined, line.kind);
      }
      controller.signal.throwIfAborted();
      const current = this.store.getRun(run.id);
      if (current.status === "cancelling") {
        this.store.finish(run.id, token, "cancelled", {
          reason: "user_cancelled",
        });
      } else {
        const evidence = adapters.workspace.verify(directory, run);
        this.store.finish(
          run.id,
          token,
          "completed",
          { outcome: real ? "worktree_recorded" : "simulation_passed" },
          evidence,
        );
      }
    } catch (error) {
      const current = this.store.getRun(run.id);
      // A lost worker cannot assert an outcome. Reconciliation will mark uncertainty.
      if (
        current.leaseToken === token &&
        (current.leaseExpiresAt ?? 0) > Date.now() &&
        ["running", "cancelling"].includes(current.status)
      ) {
        const reason: unknown = controller.signal.reason;
        const status =
          reason === "worker_shutdown" || reason === "lease_lost"
            ? "needs_attention"
            : current.status === "cancelling"
              ? "cancelled"
              : "failed";
        this.store.finish(run.id, token, status, {
          reason:
            typeof reason === "string"
              ? reason
              : error instanceof DomainError
                ? error.message
                : "adapter_or_verification_failed",
        });
      }
    } finally {
      clearInterval(heartbeat);
      clearTimeout(deadline);
      shutdown?.removeEventListener("abort", stop);
    }
    return true;
  }
}

const MAX_LINE = 2048;

function normalize(message: AgentMessage): {
  kind: "text" | "tool" | "tool_error" | "status";
  text: string;
} {
  const line =
    typeof message === "string"
      ? { kind: "text" as const, text: message }
      : message;
  // Keep the run moving: an over-long agent line is truncated, not fatal.
  const clean = line.text.replaceAll("\0", "");
  const text =
    clean.length > MAX_LINE ? `${clean.slice(0, MAX_LINE - 1)}…` : clean;
  return { kind: line.kind, text: text.trim() ? text : "(empty)" };
}
