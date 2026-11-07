import type {
  Evidence,
  Page,
  PermissionMode,
  RunEvent,
  RunView,
  Workspace,
} from "../domain.js";

export interface ServiceStatus {
  connected: boolean;
  engine: "local";
}

export interface ArtifactView {
  evidence: Evidence;
  content: unknown;
  simulation: boolean;
}

export interface DesktopBridge {
  status(): Promise<ServiceStatus>;
  startService(): Promise<ServiceStatus>;
  stopService(): Promise<void>;
  listWorkspaces(before?: string): Promise<Page<Workspace>>;
  getWorkspace(id: string): Promise<Workspace>;
  createWorkspace(repository: string): Promise<Workspace>;
  /**
   * Creates a worktree workspace. The repository folder is chosen by the person
   * in a native dialog, or reused from `fromWorkspaceId`; the renderer never
   * supplies a path. Resolves to null when the dialog is cancelled.
   */
  createLocalWorkspace(fromWorkspaceId?: string): Promise<Workspace | null>;
  listRuns(workspaceId: string, before?: string): Promise<Page<RunView>>;
  createRun(
    workspaceId: string,
    task: string,
    maxRuntimeMs: number,
    key: string,
    permissionMode?: PermissionMode,
  ): Promise<RunView>;
  getRun(id: string): Promise<RunView>;
  events(
    id: string,
    after: number,
  ): Promise<{ events: RunEvent[]; nextCursor: number }>;
  artifact(id: string): Promise<ArtifactView>;
  setWorkspaceState(id: string, state: Workspace["state"]): Promise<Workspace>;
  cancelRun(id: string): Promise<RunView>;
  resolveRun(id: string, note: string): Promise<RunView>;
}

export type BridgeMethod = keyof DesktopBridge;

export type BridgeReply =
  { ok: true; value: unknown } | { ok: false; error: string };

declare global {
  interface Window {
    argent?: DesktopBridge;
  }
}
