// Pure presentation logic: no DOM access, unit tested in Node.
import type {
  PermissionMode,
  RunEvent,
  RunStatus,
  RunView,
  Workspace,
} from "../src/domain.js";

export const statusLabels: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Working",
  cancelling: "Stopping",
  completed: "Finished",
  failed: "Failed",
  cancelled: "Cancelled",
  needs_attention: "Needs review",
};

/** States that keep the workspace from starting another run. */
export const activeStates: readonly RunStatus[] = [
  "queued",
  "running",
  "cancelling",
  "needs_attention",
];
export const terminalStates: readonly RunStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

export function isActive(status: RunStatus): boolean {
  return activeStates.includes(status);
}
export function isWorking(status: RunStatus): boolean {
  return status === "queued" || status === "running" || status === "cancelling";
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
export function baseName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function clock(value: number): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function day(value: number): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}
export function limitLabel(ms: number): string {
  return ms >= 60000 && ms % 60000 === 0
    ? `${ms / 60000} min`
    : `${ms / 1000} s`;
}

export function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The operation could not be completed.";
}
export function readableError(error: unknown): string {
  const detail = message(error).replace(/^Request rejected \(\d+\):\s*/, "");
  if (detail.startsWith("repository must be"))
    return "Use a GitHub repository URL, such as https://github.com/owner/repository. Remove credentials and query parameters.";
  return detail.charAt(0).toUpperCase() + detail.slice(1);
}
/** A rejection the service definitely did not accept, so a retry is not needed. */
export function rejected(error: unknown): boolean {
  return /Request rejected \((400|401|403|404|409|413)\)/.test(message(error));
}

export function isLocal(workspace: Workspace | undefined): boolean {
  return workspace?.provider === "local-worktree" && !!workspace.local;
}
export function workspaceTitle(workspace: Workspace): string {
  return workspace.local
    ? baseName(workspace.local.repositoryPath)
    : (workspace.repository.split("/").at(-1) ?? "Workspace");
}
/** The second breadcrumb: the branch for local work, the owner for demos. */
export function workspaceDetail(workspace: Workspace): string {
  return workspace.local
    ? workspace.local.branch
    : workspace.repository.replace(/^https:\/\//, "");
}
export function rowLabel(workspace: Workspace): string {
  return workspace.local ? workspace.local.branch : day(workspace.createdAt);
}

export interface WorkspaceGroup {
  key: string;
  label: string;
  demo: boolean;
  items: Workspace[];
}

/** Groups workspaces by repository, newest group first, keeping input order. */
export function groupWorkspaces(
  workspaces: readonly Workspace[],
): WorkspaceGroup[] {
  const groups = new Map<string, WorkspaceGroup>();
  for (const workspace of workspaces) {
    const key = workspace.local
      ? `local:${workspace.local.repositoryPath}`
      : `demo:${workspace.repository}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: workspace.local
          ? baseName(workspace.local.repositoryPath)
          : workspace.repository
              .replace(/^https:\/\/github\.com\//, "")
              .replace(/^https:\/\//, ""),
        demo: !workspace.local,
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(workspace);
  }
  return Array.from(groups.values());
}

export type Step =
  | { kind: "say"; text: string; at: number }
  | { kind: "tool"; text: string; error: boolean; at: number }
  | { kind: "note"; text: string; at: number };

export interface Turn {
  /** The agent's own words, in order. */
  says: string[];
  /** Everything else the agent did, in order (tools, scripted steps, status). */
  steps: Step[];
  /** A short reason for a failed, cancelled or uncertain end, if one was recorded. */
  reason: string;
  /** The time of the last recorded event. */
  lastAt: number;
}

/** Maps a run's durable events onto what a person reads in the conversation. */
export function turnFrom(events: readonly RunEvent[]): Turn {
  const turn: Turn = { says: [], steps: [], reason: "", lastAt: 0 };
  for (const event of events) {
    turn.lastAt = Math.max(turn.lastAt, event.createdAt);
    const text =
      typeof event.data.message === "string" ? event.data.message : "";
    if (event.type === "agent.log") {
      const kind = String(event.data.kind ?? "");
      if (kind === "text" && text) {
        turn.says.push(text);
        turn.steps.push({ kind: "say", text, at: event.createdAt });
      } else if (kind === "tool" || kind === "tool_error")
        turn.steps.push({
          kind: "tool",
          text,
          error: kind === "tool_error",
          at: event.createdAt,
        });
      else if (text)
        turn.steps.push({ kind: "note", text, at: event.createdAt });
    } else if (
      event.type === "run.failed" ||
      event.type === "run.cancelled" ||
      event.type === "run.needs_attention" ||
      event.type === "run.resolved"
    ) {
      const detail =
        text ||
        (typeof event.data.note === "string" ? event.data.note : "") ||
        (typeof event.data.reason === "string"
          ? event.data.reason.replaceAll("_", " ")
          : "");
      if (detail)
        turn.reason = detail.charAt(0).toUpperCase() + detail.slice(1);
    }
  }
  return turn;
}

export interface ComposerInput {
  connected: boolean;
  busy: boolean;
  workspace: Workspace | undefined;
  runs: readonly RunView[];
  pendingHere: boolean;
  pendingElsewhere: boolean;
  text: string;
}

export interface ComposerGate {
  /** The text area accepts typing (drafting is allowed while a run works). */
  canType: boolean;
  canSend: boolean;
  /** Short reason shown beside the send button when sending is unavailable. */
  hint: string;
  /** A run is working, so the send button becomes Stop. */
  working: boolean;
}

export function composerGate(input: ComposerInput): ComposerGate {
  const working = input.runs.some((run) => isWorking(run.status));
  const review = input.runs.some((run) => run.status === "needs_attention");
  const stopped = input.workspace?.state !== "running";
  const canType =
    input.connected && !!input.workspace && !stopped && !input.pendingHere;
  const hint = !input.connected
    ? "Reconnect to continue"
    : !input.workspace
      ? ""
      : stopped
        ? "This workspace is stopped"
        : input.pendingHere
          ? "Waiting for confirmation"
          : review
            ? "Review the interrupted run first"
            : working
              ? "Working. You can draft your next message."
              : input.pendingElsewhere
                ? "Another workspace has an unconfirmed message"
                : "";
  return {
    canType,
    canSend:
      canType &&
      !input.busy &&
      !working &&
      !review &&
      !input.pendingElsewhere &&
      !!input.text.trim(),
    hint,
    working,
  };
}

export interface LimitChoice {
  values: number[];
  fallback: number;
}

/** Local runs are chosen in minutes (up to two hours); demos in seconds. */
export function limitChoices(local: boolean): LimitChoice {
  return local
    ? {
        values: [5, 15, 30, 60, 120].map((minutes) => minutes * 60000),
        fallback: 30 * 60000,
      }
    : {
        values: [10, 30, 60, 120, 300].map((seconds) => seconds * 1000),
        fallback: 30000,
      };
}

/** Full access is chosen for one message at a time, then returns to edits only. */
export function permissionAfterSend(): PermissionMode {
  return "edits";
}

export function agentMeta(run: RunView): string {
  return run.simulation
    ? `Scripted demo · ${limitLabel(run.maxRuntimeMs)} limit`
    : `Claude Code · ${run.permissionMode === "full" ? "full access" : "edits only"} · ${limitLabel(run.maxRuntimeMs)} limit`;
}
