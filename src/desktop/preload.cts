import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge, BridgeMethod, BridgeReply } from "./contracts.js";

async function invoke<T>(method: BridgeMethod, args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(
    "argent:call",
    method,
    args,
  )) as BridgeReply;
  if (!result.ok) throw new Error(result.error);
  return result.value as T;
}

const bridge: DesktopBridge = {
  status: () => invoke("status", []),
  startService: () => invoke("startService", []),
  stopService: () => invoke("stopService", []),
  listWorkspaces: (before) => invoke("listWorkspaces", [before]),
  getWorkspace: (id) => invoke("getWorkspace", [id]),
  workspaceChanges: (id) => invoke("workspaceChanges", [id]),
  commandConfiguration: (id) => invoke("commandConfiguration", [id]),
  approveCommandConfiguration: (id, expected, key) =>
    invoke("approveCommandConfiguration", [id, expected, key]),
  latestCheck: (id) => invoke("latestCheck", [id]),
  runChecks: (id, consent, key) => invoke("runChecks", [id, consent, key]),
  cancelCheck: (id, check) => invoke("cancelCheck", [id, check]),
  candidateReview: (id) => invoke("candidateReview", [id]),
  consentCandidate: (id, expected, key) =>
    invoke("consentCandidate", [id, expected, key]),
  createWorkspace: (repository) => invoke("createWorkspace", [repository]),
  createLocalWorkspace: (from) => invoke("createLocalWorkspace", [from]),
  listRuns: (workspace, before) => invoke("listRuns", [workspace, before]),
  createRun: (workspace, task, maxRuntimeMs, key, permissionMode) =>
    invoke("createRun", [workspace, task, maxRuntimeMs, key, permissionMode]),
  getRun: (id) => invoke("getRun", [id]),
  events: (id, after) => invoke("events", [id, after]),
  artifact: (id) => invoke("artifact", [id]),
  setWorkspaceState: (id, state) => invoke("setWorkspaceState", [id, state]),
  cancelRun: (id) => invoke("cancelRun", [id]),
  resolveRun: (id, note) => invoke("resolveRun", [id, note]),
};
contextBridge.exposeInMainWorld("argent", bridge);
