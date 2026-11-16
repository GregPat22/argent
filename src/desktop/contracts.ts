import type { LocalCheckView } from "../local-checks.js";
export type { LocalCheckView } from "../local-checks.js";
import type {
  Evidence,
  Page,
  PermissionMode,
  RunEvent,
  RunView,
  Workspace,
  WorkspaceChanges,
} from "../domain.js";
import type { LocalCommandConfigDescriptor } from "../local-command-config.js";
import type {
  CandidateReviewView,
  CandidateConsentReceiptView,
} from "../local-command-views.js";
export type {
  CandidateReviewView,
  CandidateConsentReceiptView,
} from "../local-command-views.js";

export interface ServiceStatus {
  connected: boolean;
  engine: "local";
}

export interface ArtifactView {
  evidence: Evidence;
  content: unknown;
  simulation: boolean;
}

/**
 * One fresh reading of the configuration at the workspace's base commit and
 * its approval. It is display data and never permission to run a command.
 */
export interface CommandConfigurationView {
  kind: "local-command-configuration";
  workspaceId: string;
  configuration: LocalCommandConfigDescriptor | null;
  approval: { id: string; approvedAt: number } | null;
  executionAllowed: false;
}

/** A historical audit receipt. The current state is always read again. */
export interface CommandApprovalReceiptView {
  kind: "local-command-approval-receipt";
  workspaceId: string;
  approval: {
    id: string;
    workspaceId: string;
    descriptor: LocalCommandConfigDescriptor;
    approvedAt: number;
  };
  event: {
    cursor: number;
    type: "configuration.approved" | "configuration.reused";
    createdAt: number;
  };
  historical: true;
  executionAllowed: false;
}

export interface DesktopBridge {
  status(): Promise<ServiceStatus>;
  startService(): Promise<ServiceStatus>;
  stopService(): Promise<void>;
  listWorkspaces(before?: string): Promise<Page<Workspace>>;
  getWorkspace(id: string): Promise<Workspace>;
  workspaceChanges(id: string): Promise<WorkspaceChanges>;
  commandConfiguration(id: string): Promise<CommandConfigurationView>;
  latestCheck(id: string): Promise<LocalCheckView | null>;
  runChecks(
    id: string,
    consentId: string,
    key: string,
  ): Promise<LocalCheckView>;
  cancelCheck(id: string, checkId: string): Promise<LocalCheckView>;
  candidateReview(id: string): Promise<CandidateReviewView>;
  consentCandidate(
    id: string,
    expectedReviewIdentity: string,
    key: string,
  ): Promise<CandidateConsentReceiptView>;
  /**
   * Records approval of the configuration the person was shown. The renderer
   * supplies only that configuration's identity and a request key; the service
   * reads the commands again itself and refuses a different identity.
   */
  approveCommandConfiguration(
    id: string,
    expectedCandidateIdentity: string,
    key: string,
  ): Promise<CommandApprovalReceiptView>;
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
