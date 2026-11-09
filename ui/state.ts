// Renderer state. The local service stays authoritative; this only mirrors what
// it returned, plus per-window preferences and the one uncertain submission.
import type { ArtifactView } from "../src/desktop/contracts.js";
import type {
  PermissionMode,
  RunEvent,
  RunStatus,
  RunView,
  Workspace,
} from "../src/domain.js";

export interface Pending {
  workspaceId: string;
  task: string;
  maxRuntimeMs: number;
  key: string;
  permissionMode?: PermissionMode;
}

export interface TurnRecord {
  events: RunEvent[];
  cursor: number;
  /** Null follows the latest page; a number pins an earlier page during polling. */
  eventPageStart: number | null;
  artifact: ArtifactView | null;
  artifactError: string;
  /** Terminal, all events read and any record fetched: no more polling. */
  settled: boolean;
}

export const state = {
  workspaces: [] as Workspace[],
  runs: [] as RunView[],
  selectedWorkspace: "",
  workspaceCursor: null as string | null,
  runCursor: null as string | null,
  workspacePaging: false,
  runPaging: false,
  connected: false,
  mutationBusy: false,
  sending: false,
  pending: null as Pending | null,
  saved: {} as { workspaceId?: string },
  turns: new Map<string, TurnRecord>(),
  /** Last status seen for each run, to notice a run finishing while watched. */
  seen: new Map<string, RunStatus>(),
  /** Runs that finished while this window watched them: their marks strike in. */
  struck: new Set<string>(),
  showEarlier: new Set<string>(),
  drafts: new Map<string, string>(),
  permission: new Map<string, PermissionMode>(),
  confirmedFull: new Set<string>(),
  limits: new Map<string, number>(),
  syncedAt: 0,
};

export function currentWorkspace(): Workspace | undefined {
  return state.workspaces.find(
    (workspace) => workspace.id === state.selectedWorkspace,
  );
}

export function turnRecord(runId: string): TurnRecord {
  let record = state.turns.get(runId);
  if (!record) {
    record = {
      events: [],
      cursor: 0,
      eventPageStart: null,
      artifact: null,
      artifactError: "",
      settled: false,
    };
    state.turns.set(runId, record);
  }
  return record;
}

export function restore(): void {
  try {
    const preferences: unknown = JSON.parse(
      localStorage.getItem("argent.selection") ?? "{}",
    );
    if (preferences && typeof preferences === "object") {
      const row = preferences as Record<string, unknown>;
      if (typeof row.workspaceId === "string")
        state.saved.workspaceId = row.workspaceId;
    }
    const value: unknown = JSON.parse(
      localStorage.getItem("argent.pending") ?? "null",
    );
    if (value && typeof value === "object") {
      const row = value as Record<string, unknown>;
      if (
        typeof row.workspaceId === "string" &&
        typeof row.task === "string" &&
        row.task.length <= 4000 &&
        typeof row.maxRuntimeMs === "number" &&
        typeof row.key === "string"
      ) {
        state.pending = {
          workspaceId: row.workspaceId,
          task: row.task,
          maxRuntimeMs: row.maxRuntimeMs,
          key: row.key,
          ...(row.permissionMode === "edits" || row.permissionMode === "full"
            ? { permissionMode: row.permissionMode }
            : {}),
        };
      }
    }
  } catch {
    /* A corrupt optional preference must not prevent launch. */
  }
}

export function persist(): void {
  state.saved = { workspaceId: state.selectedWorkspace };
  try {
    localStorage.setItem(
      "argent.selection",
      JSON.stringify({ workspaceId: state.selectedWorkspace }),
    );
    if (state.pending)
      localStorage.setItem("argent.pending", JSON.stringify(state.pending));
    else localStorage.removeItem("argent.pending");
  } catch {
    /* The service remains authoritative when browser preferences are unavailable. */
  }
}
