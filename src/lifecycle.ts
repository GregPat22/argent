export type LifecycleKind = "create" | "pause" | "resume" | "delete";
export type LifecycleState =
  | "provisioning"
  | "ready"
  | "quiescing"
  | "pausing"
  | "paused"
  | "resuming"
  | "needs_attention"
  | "deleting"
  | "deleted";

export interface LifecycleWorkspace {
  workspaceId: string;
  state: LifecycleState;
  providerId: string | null;
  revision: number;
  simulation: true;
}

export interface LifecycleOperation {
  id: string;
  workspaceId: string;
  kind: LifecycleKind;
  previousState: LifecycleState | null;
  status: "queued" | "running" | "succeeded" | "needs_attention";
  maxRuntimeMs: number;
  createdAt: number;
  deadlineAt: number | null;
  leaseToken: string | null;
  leaseExpiresAt: number | null;
  dispatchedAt: number | null;
  quiescedAt: number | null;
  simulation: true;
}

export interface LifecycleEvent {
  cursor: number;
  operationId: string;
  type: string;
  state: LifecycleState;
  reason: string | null;
  createdAt: number;
  simulation: true;
}

export type LifecycleObservation =
  | {
      state: "ready" | "paused" | "missing";
      providerId: string;
      creationMarker?: string;
    }
  | { state: "unknown" };

// This contract intentionally cannot enable a real provider. Bootstrap,
// authorization and resource/cleanup policy must exist before that expansion.
export interface SimulatedLifecycleProvider {
  readonly simulation: true;
  create(marker: string, signal: AbortSignal): Promise<LifecycleObservation>;
  quiesce(providerId: string, signal: AbortSignal): Promise<boolean>;
  pause(providerId: string, signal: AbortSignal): Promise<LifecycleObservation>;
  resume(
    providerId: string,
    signal: AbortSignal,
  ): Promise<LifecycleObservation>;
  delete(providerId: string, signal: AbortSignal): Promise<void>;
  inspect(
    marker: string,
    providerId: string | null,
    signal: AbortSignal,
  ): Promise<LifecycleObservation>;
}
