import type {
  Evidence,
  Page,
  RunEvent,
  RunView,
  Workspace,
} from "../domain.js";

export interface ServiceStatus {
  connected: boolean;
  simulation: true;
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
  listRuns(workspaceId: string, before?: string): Promise<Page<RunView>>;
  createRun(
    workspaceId: string,
    task: string,
    maxRuntimeMs: number,
    key: string,
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
