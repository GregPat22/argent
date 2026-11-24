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
export function archiveLabel(workspace: Workspace | undefined): string {
  if (workspace?.commitNeedsAttention) return "Commit needs attention";
  if (workspace?.archiveStatus === "archived") return "Archived";
  if (workspace?.archiveStatus === "needs_attention")
    return "Archive needs attention";
  return "";
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
  const stopped =
    input.workspace?.state !== "running" || !!input.workspace?.archiveStatus;
  const canType =
    input.connected && !!input.workspace && !stopped && !input.pendingHere;
  const hint = !input.connected
    ? "Reconnect to continue"
    : !input.workspace
      ? ""
      : stopped
        ? input.workspace.commitNeedsAttention
          ? "Check the local branch. The commit outcome needs attention."
          : input.workspace.archiveStatus === "needs_attention"
            ? "Argent could not confirm worktree removal. This workspace is locked."
            : input.workspace.archiveStatus === "archived"
              ? "Workspace archived. Its branch and history are saved."
              : "This workspace is stopped"
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

/** One line of a unified diff, with its line numbers in the old and new file. */
export interface DiffLine {
  kind: "meta" | "hunk" | "add" | "del" | "context" | "note";
  text: string;
  old: number | null;
  new: number | null;
}

/**
 * Classifies a unified diff line by line for display. Lines before the first
 * hunk header are file metadata, so "--- a/x" and "+++ b/x" never count as
 * changes. The text itself is returned unchanged.
 */
export function diffLines(diff: string): DiffLine[] {
  const lines = diff.split("\n");
  if (lines.at(-1) === "") lines.pop();
  let inHunk = false;
  let old = 0;
  let current = 0;
  return lines.map((text): DiffLine => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      inHunk = true;
      old = Number(hunk[1]);
      current = Number(hunk[2]);
      return { kind: "hunk", text, old: null, new: null };
    }
    if (text.startsWith("diff --git ")) inHunk = false;
    if (!inHunk) return { kind: "meta", text, old: null, new: null };
    if (text.startsWith("\\"))
      return { kind: "note", text, old: null, new: null };
    if (text.startsWith("+"))
      return { kind: "add", text, old: null, new: current++ };
    if (text.startsWith("-"))
      return { kind: "del", text, old: old++, new: null };
    return { kind: "context", text, old: old++, new: current++ };
  });
}

/** Below this many line pairs a gap is compared exactly, cell by cell. */
const EXACT_CELLS = 250_000;

type Edit = ["=" | "-" | "+", number, number];

/**
 * A minimal line diff between two texts, bounded for review on the desktop.
 * Common lines at either end are matched first. A small gap is compared
 * exactly; a large one is split at lines that occur once on each side, in
 * order. A large gap with no such line is shown as removed and re-added, and
 * the result says it is not exact.
 */
function lineEdits(
  a: readonly string[],
  b: readonly string[],
): { edits: Edit[]; exact: boolean } {
  const edits: Edit[] = [];
  let exact = true;
  const replace = (a0: number, a1: number, b0: number, b1: number) => {
    for (let i = a0; i < a1; i++) edits.push(["-", i, -1]);
    for (let j = b0; j < b1; j++) edits.push(["+", -1, j]);
  };
  const compare = (a0: number, a1: number, b0: number, b1: number) => {
    const n = a1 - a0;
    const m = b1 - b0;
    // lcs[i][j]: common lines of a[a0 + i ..] and b[b0 + j ..].
    const width = m + 1;
    const lcs = new Uint16Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        lcs[i * width + j] =
          a[a0 + i] === b[b0 + j]
            ? lcs[(i + 1) * width + j + 1]! + 1
            : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[a0 + i] === b[b0 + j])
        edits.push(["=", a0 + i++, b0 + j++]);
      else if (
        j >= m ||
        (i < n && lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!)
      )
        edits.push(["-", a0 + i++, -1]);
      else edits.push(["+", -1, b0 + j++]);
    }
  };
  const walk = (a0: number, a1: number, b0: number, b1: number): void => {
    while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) edits.push(["=", a0++, b0++]);
    let tail = 0;
    while (
      a1 - tail > a0 &&
      b1 - tail > b0 &&
      a[a1 - tail - 1] === b[b1 - tail - 1]
    )
      tail++;
    a1 -= tail;
    b1 -= tail;
    if (a0 === a1 || b0 === b1) replace(a0, a1, b0, b1);
    else if ((a1 - a0) * (b1 - b0) <= EXACT_CELLS) compare(a0, a1, b0, b1);
    else {
      // Lines that occur exactly once on each side anchor the comparison.
      const seen = new Map<string, { a: number; b: number; at: number }>();
      for (let i = a0; i < a1; i++) {
        const entry = seen.get(a[i]!) ?? { a: 0, b: 0, at: -1 };
        entry.a++;
        entry.at = i;
        seen.set(a[i]!, entry);
      }
      const unique: [number, number][] = [];
      const inB = new Map<string, number>();
      for (let j = b0; j < b1; j++) inB.set(b[j]!, (inB.get(b[j]!) ?? 0) + 1);
      for (let j = b0; j < b1; j++) {
        const entry = seen.get(b[j]!);
        if (entry?.a === 1 && inB.get(b[j]!) === 1) unique.push([entry.at, j]);
      }
      unique.sort((x, y) => x[0] - y[0]);
      const anchors = increasing(unique);
      if (!anchors.length) {
        exact = false;
        replace(a0, a1, b0, b1);
      } else {
        for (const [i, j] of anchors) {
          walk(a0, i, b0, j);
          edits.push(["=", i, j]);
          a0 = i + 1;
          b0 = j + 1;
        }
        walk(a0, a1, b0, b1);
      }
    }
    for (let k = 0; k < tail; k++) edits.push(["=", a1 + k, b1 + k]);
  };
  walk(0, a.length, 0, b.length);
  return { edits, exact };
}

/** The longest run of pairs, already ordered by their first index, whose second index increases. */
function increasing(pairs: readonly [number, number][]): [number, number][] {
  const tails: number[] = [];
  const previous = new Array<number>(pairs.length).fill(-1);
  for (let k = 0; k < pairs.length; k++) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (pairs[tails[middle]!]![1] < pairs[k]![1]) low = middle + 1;
      else high = middle;
    }
    if (low > 0) previous[k] = tails[low - 1]!;
    tails[low] = k;
  }
  const result: [number, number][] = [];
  for (let k = tails.at(-1) ?? -1; k >= 0; k = previous[k]!)
    result.push(pairs[k]!);
  return result.reverse();
}

/**
 * The diff a person reviews. Argent's service returns each changed text file
 * as one whole-file replacement hunk; this recovers which lines actually
 * changed from the two complete copies, keeping every line. Hunks that
 * already contain context are shown as they are. `exact` is false when part
 * of a file was too large to compare and stays removed and re-added.
 */
export function readableDiff(diff: string): {
  lines: DiffLine[];
  exact: boolean;
} {
  const raw = diffLines(diff);
  const lines: DiffLine[] = [];
  let exact = true;
  let k = 0;
  while (k < raw.length) {
    const hunk = raw[k]!;
    lines.push(hunk);
    k++;
    if (hunk.kind !== "hunk") continue;
    // A whole-file hunk is removals, then additions, each with an optional
    // "No newline" note after its last line.
    const removed: { text: string; note: DiffLine | null }[] = [];
    const added: { text: string; note: DiffLine | null }[] = [];
    let end = k;
    while (
      raw[end]?.kind === "del" ||
      (raw[end]?.kind === "note" && removed.length && !added.length)
    ) {
      if (raw[end]!.kind === "del")
        removed.push({ text: raw[end]!.text.slice(1), note: null });
      else removed.at(-1)!.note = raw[end]!;
      end++;
    }
    while (
      raw[end]?.kind === "add" ||
      (raw[end]?.kind === "note" && added.length)
    ) {
      if (raw[end]!.kind === "add")
        added.push({ text: raw[end]!.text.slice(1), note: null });
      else added.at(-1)!.note = raw[end]!;
      end++;
    }
    const pure =
      removed.length > 0 &&
      added.length > 0 &&
      (end >= raw.length ||
        raw[end]!.kind === "meta" ||
        raw[end]!.kind === "hunk");
    if (!pure) continue;
    // A missing final newline is a difference, so it is part of the key.
    const key = (line: { text: string; note: DiffLine | null }) =>
      line.note ? `${line.text}\u0000` : line.text;
    const result = lineEdits(removed.map(key), added.map(key));
    exact &&= result.exact;
    const oldStart = raw[k]!.old ?? 1;
    const newStart =
      raw.find((line, index) => index >= k && line.kind === "add")!.new ?? 1;
    for (const [operation, i, j] of result.edits) {
      const line = operation === "+" ? added[j]! : removed[i]!;
      lines.push(
        operation === "="
          ? {
              kind: "context",
              text: ` ${line.text}`,
              old: oldStart + i,
              new: newStart + j,
            }
          : operation === "-"
            ? {
                kind: "del",
                text: `-${line.text}`,
                old: oldStart + i,
                new: null,
              }
            : {
                kind: "add",
                text: `+${line.text}`,
                old: null,
                new: newStart + j,
              },
      );
      if (line.note) lines.push(line.note);
    }
    k = end;
  }
  return { lines, exact };
}

/** Added and removed lines a person reviews, ignoring file headers. */
export function diffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of readableDiff(diff).lines)
    if (line.kind === "add") added++;
    else if (line.kind === "del") removed++;
  return { added, removed };
}
