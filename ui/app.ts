import type { ArtifactView, DesktopBridge } from "../src/desktop/contracts.js";
import type {
  PermissionMode,
  RunEvent,
  RunStatus,
  RunView,
  Workspace,
} from "../src/domain.js";
import { mergeHistory as merge } from "./history.js";

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing interface element: ${id}`);
  return result as T;
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.textContent = text;
  if (className) result.className = className;
  return result;
}

const labels: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  cancelling: "Cancelling",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  needs_attention: "Needs review",
};
const activeStates: RunStatus[] = [
  "queued",
  "running",
  "cancelling",
  "needs_attention",
];
const bridge = window.argent;
let workspaces: Workspace[] = [];
let runs: RunView[] = [];
let selectedWorkspace = "";
let selectedRun = "";
let composerWorkspace = "";
const composerDrafts = new Map<string, string>();
let workspaceCursor: string | null = null;
let runCursor: string | null = null;
let workspacePaging = false;
let runPaging = false;
let workspaceSignature = "";
let runSignature = "";
let events: RunEvent[] = [];
let eventCursor = 0;
const EVENT_PAGE_SIZE = 500;
let eventPageStart: number | null = null;
let artifact: ArtifactView | null = null;
let artifactError = "";
let connected = false;
let refreshBusy = false;
let refreshAgain = false;
let stopped = false;
let epoch = 0;
let activeTab: "activity" | "verification" = "activity";
let timer: ReturnType<typeof setTimeout> | undefined;
let mutationBusy = false;
let pending: {
  workspaceId: string;
  task: string;
  maxRuntimeMs: number;
  key: string;
  permissionMode?: PermissionMode;
} | null = null;
let savedSelection: { workspaceId?: string; runId?: string } = {};

try {
  const preferences: unknown = JSON.parse(
    localStorage.getItem("argent.selection") ?? "{}",
  );
  if (preferences && typeof preferences === "object") {
    const row = preferences as Record<string, unknown>;
    if (typeof row.workspaceId === "string")
      savedSelection.workspaceId = row.workspaceId;
    if (typeof row.runId === "string") savedSelection.runId = row.runId;
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
      pending = {
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

function persist(): void {
  savedSelection = { workspaceId: selectedWorkspace, runId: selectedRun };
  try {
    localStorage.setItem(
      "argent.selection",
      JSON.stringify({ workspaceId: selectedWorkspace, runId: selectedRun }),
    );
    if (pending)
      localStorage.setItem("argent.pending", JSON.stringify(pending));
    else localStorage.removeItem("argent.pending");
  } catch {
    /* The service remains authoritative when browser preferences are unavailable. */
  }
}

function api(): DesktopBridge {
  if (!bridge)
    throw new Error(
      "Open Argent from the installed desktop application to connect to its local service.",
    );
  return bridge;
}

function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The operation could not be completed.";
}
function readableError(error: unknown): string {
  const detail = message(error).replace(/^Request rejected \(\d+\):\s*/, "");
  if (detail.startsWith("repository must be"))
    return "Use a GitHub repository URL, such as https://github.com/owner/repository. Remove credentials and query parameters.";
  return detail.charAt(0).toUpperCase() + detail.slice(1);
}
function showError(error: unknown): void {
  element("error-text").textContent = readableError(error);
  element("error-banner").hidden = false;
}
function clearError(): void {
  element("error-banner").hidden = true;
}
function formError(id: string, error?: unknown): void {
  element(id).textContent = error ? readableError(error) : "";
  element(id).hidden = !error;
  const fields: Record<string, string[]> = {
    "workspace-form-error": ["repository-input"],
    "task-form-error": ["task-input", "runtime-input"],
    "resolve-form-error": ["resolution-input"],
  };
  for (const field of fields[id] ?? [])
    element(field).setAttribute("aria-invalid", String(!!error));
}
function shortId(id: string): string {
  return id.slice(0, 8);
}
function date(value: number): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function time(value: number): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
function currentWorkspace(): Workspace | undefined {
  return workspaces.find((workspace) => workspace.id === selectedWorkspace);
}
function currentRun(): RunView | undefined {
  return runs.find((run) => run.id === selectedRun);
}
function isLocal(workspace: Workspace | undefined): boolean {
  return workspace?.provider === "local-worktree" && !!workspace.local;
}
function baseName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}
function agentLabel(run: RunView): string {
  return run.simulation
    ? "Scripted adapter"
    : `Claude Code · ${run.permissionMode === "full" ? "full access" : "edits only"}`;
}
function limitLabel(run: RunView): string {
  return run.maxRuntimeMs >= 60000 && run.maxRuntimeMs % 60000 === 0
    ? `${run.maxRuntimeMs / 60000} min execution limit`
    : `${run.maxRuntimeMs / 1000}s execution limit`;
}
function files(count: number): string {
  return `${count} changed file${count === 1 ? "" : "s"}`;
}
function busyWorkspace(): boolean {
  return runs.some((run) => activeStates.includes(run.status));
}
function badge(status: RunStatus): HTMLElement {
  return node("span", labels[status], `badge ${status}`);
}
function updateConnection(): void {
  element("service-status").textContent = connected
    ? "Service online"
    : "Service offline";
  element("service-indicator").className =
    `status-dot ${connected ? "online" : "offline"}`;
  const button = element<HTMLButtonElement>("service-toggle");
  button.textContent = connected ? "Stop" : "Reconnect";
  button.disabled = mutationBusy || !bridge;
  button.setAttribute(
    "aria-label",
    connected
      ? "Stop local execution service"
      : "Reconnect to local execution service",
  );
  element("disconnected-banner").hidden = connected;
  element<HTMLButtonElement>("new-workspace").disabled =
    !connected || mutationBusy;
  element<HTMLButtonElement>("welcome-create").disabled =
    !connected || mutationBusy;
  element<HTMLButtonElement>("local-workspace-choose").disabled =
    !connected || mutationBusy;
}

function renderWorkspaces(): void {
  const list = element("workspace-list");
  const signature = JSON.stringify([selectedWorkspace, workspaces]);
  if (signature !== workspaceSignature) {
    workspaceSignature = signature;
    const focused = document.activeElement?.getAttribute("data-workspace-id");
    list.replaceChildren();
    for (const workspace of workspaces) {
      const pieces = workspace.local
        ? [workspace.local.branch, baseName(workspace.local.repositoryPath)]
        : workspace.repository.split("/");
      const button = node(
        "button",
        "",
        `workspace-item${workspace.id === selectedWorkspace ? " selected" : ""}`,
      );
      button.dataset.workspaceId = workspace.id;
      button.setAttribute(
        "aria-pressed",
        String(workspace.id === selectedWorkspace),
      );
      button.title = workspace.local?.worktreePath ?? workspace.repository;
      const copy = node("span", "", "workspace-copy");
      copy.append(
        node("span", pieces.at(-1) ?? "Workspace", "workspace-name"),
        node("span", pieces.at(-2) ?? "GitHub", "workspace-owner"),
      );
      const dot = node(
        "span",
        "",
        `status-dot ${workspace.state === "running" ? "online" : "offline"}`,
      );
      dot.setAttribute("aria-label", workspace.state);
      const workspaceIcon = node(
        "span",
        "",
        "workspace-icon icon icon-folder-git-2",
      );
      workspaceIcon.setAttribute("aria-hidden", "true");
      button.append(workspaceIcon, copy, dot);
      button.addEventListener("click", () => selectWorkspace(workspace.id));
      list.append(button);
    }
    if (focused)
      Array.from(
        list.querySelectorAll<HTMLButtonElement>("[data-workspace-id]"),
      )
        .find((button) => button.dataset.workspaceId === focused)
        ?.focus();
  }
  element("sidebar-empty").hidden = workspaces.length > 0;
  element("more-workspaces").hidden = !workspaceCursor;
  element<HTMLButtonElement>("more-workspaces").disabled =
    !connected || mutationBusy;
}

function renderRuns(): void {
  const list = element("run-list");
  const signature = JSON.stringify([selectedRun, runs]);
  if (signature !== runSignature) {
    runSignature = signature;
    const focused = document.activeElement?.getAttribute("data-run-id");
    list.replaceChildren();
    for (const run of runs) {
      const button = node(
        "button",
        "",
        `run-item${run.id === selectedRun ? " selected" : ""}`,
      );
      button.dataset.runId = run.id;
      button.setAttribute("aria-pressed", String(run.id === selectedRun));
      const heading = node("div", "", "run-item-heading");
      heading.append(
        badge(run.status),
        node("span", date(run.createdAt), "run-item-time"),
      );
      button.append(
        heading,
        node("h3", run.task),
        node("span", `RUN ${shortId(run.id)}`, "run-item-id mono"),
      );
      button.addEventListener("click", () => selectRun(run.id));
      list.append(button);
    }
    if (focused)
      Array.from(list.querySelectorAll<HTMLButtonElement>("[data-run-id]"))
        .find((button) => button.dataset.runId === focused)
        ?.focus();
  }
  element("task-count").textContent = String(runs.length);
  element("tasks-empty").hidden = runs.length > 0;
  element("more-runs").hidden = !runCursor;
  element<HTMLButtonElement>("more-runs").disabled = !connected || mutationBusy;
}

const logTitles: Record<string, string> = {
  text: "Claude Code",
  tool: "Tool call",
  tool_error: "Tool error",
  status: "Status",
};

function eventDescription(
  event: RunEvent,
  real: boolean,
): {
  title: string;
  detail: string;
  data?: string;
} {
  const known: Record<string, string> = {
    "run.queued": "Task queued",
    "run.started": "Execution started",
    "agent.log": "Scripted adapter",
    "verification.recorded": "Verification recorded",
    "run.completed": "Simulation completed",
    "run.failed": "Execution stopped",
    "run.cancelled": "Task cancelled",
    "run.cancelling": "Cancellation requested",
    "run.needs_attention": "Human review required",
    "run.resolved": "Review recorded",
  };
  if (real) {
    known["agent.log"] =
      logTitles[String(event.data.kind ?? "text")] ?? "Claude Code";
    known["verification.recorded"] = "Worktree recorded";
    known["run.completed"] = "Run completed";
  }
  let detail = "";
  if (typeof event.data.message === "string") detail = event.data.message;
  else if (event.type === "run.queued")
    detail = "The task is safely recorded and waiting for the local worker.";
  else if (event.type === "run.started")
    detail =
      "The worker claimed the run. Closing this window will not cancel it.";
  else if (event.type === "verification.recorded")
    detail = real
      ? "Argent inspected the worktree itself: branch, commit, changed files and diff fingerprint. Nothing was tested."
      : "Artifact identity and contents were checked independently of adapter messages.";
  else if (event.type === "run.completed")
    detail = real
      ? "Claude Code finished and Argent recorded the worktree. Review the changes before using them."
      : "The scripted run completed with independent simulation evidence.";
  else if (event.type === "run.needs_attention")
    detail = "The outcome is uncertain. No work was automatically replayed.";
  else if (typeof event.data.note === "string") detail = event.data.note;
  else if (typeof event.data.reason === "string")
    detail = event.data.reason.replaceAll("_", " ");
  else detail = "This state transition was committed to the run history.";
  return { title: known[event.type] ?? event.type, detail };
}

function renderEvents(): void {
  const list = element("activity-list");
  const nearBottom = list.parentElement
    ? list.parentElement.scrollHeight -
        list.parentElement.scrollTop -
        list.parentElement.clientHeight <
      65
    : true;
  const start = eventPageStart ?? Math.max(0, events.length - EVENT_PAGE_SIZE);
  const visible = events.slice(start, start + EVENT_PAGE_SIZE);
  if (
    (list.firstElementChild as HTMLElement | null)?.dataset.cursor !==
    String(visible[0]?.cursor)
  )
    list.replaceChildren();
  element<HTMLButtonElement>("earlier-events").disabled = start === 0;
  element<HTMLButtonElement>("later-events").disabled =
    start + visible.length >= events.length;
  element("event-range").textContent = events.length
    ? `Events ${start + 1}–${start + visible.length} of ${events.length}`
    : "No events yet";
  const rendered = new Set(
    Array.from(list.children).map(
      (item) => (item as HTMLElement).dataset.cursor,
    ),
  );
  const real = currentRun()?.simulation === false;
  for (const event of visible) {
    if (rendered.has(String(event.cursor))) continue;
    const row = node("article", "", "activity-event");
    row.dataset.cursor = String(event.cursor);
    const kind = String(event.data.kind ?? "");
    const symbol =
      event.type === "run.completed" || event.type === "verification.recorded"
        ? "circle-check"
        : event.type === "run.needs_attention" || kind === "tool_error"
          ? "triangle-alert"
          : event.type === "agent.log"
            ? kind === "text"
              ? "message-square"
              : kind === "status"
                ? "info"
                : "terminal"
            : event.type === "run.started"
              ? "play"
              : "clock-3";
    const copy = node("div", "", "event-copy");
    const heading = node("div", "", "event-heading");
    const description = eventDescription(event, real);
    const timestamp = node("time", time(event.createdAt));
    timestamp.dateTime = new Date(event.createdAt).toISOString();
    heading.append(node("h4", description.title), timestamp);
    copy.append(heading, node("p", description.detail));
    const eventIcon = node("span", "", `event-symbol icon icon-${symbol}`);
    eventIcon.setAttribute("aria-hidden", "true");
    row.append(eventIcon, copy);
    list.append(row);
  }
  element("event-count").textContent = String(events.length);
  element("activity-empty").hidden = events.length > 0;
  if (nearBottom && list.parentElement)
    list.parentElement.scrollTop = list.parentElement.scrollHeight;
}

function renderVerification(): void {
  const run = currentRun();
  element("verification-result").hidden = !artifact;
  element("verification-empty").hidden = !!artifact;
  element("verification-indicator").className =
    `icon icon-${artifact ? "circle-check" : "circle-dashed"}`;
  element("verification-empty-title").textContent = artifactError
    ? "Evidence is unavailable."
    : run?.status === "failed"
      ? "No passing verification."
      : "Evidence comes first.";
  element("verification-empty-text").textContent =
    artifactError ||
    (run?.status === "failed" || run?.status === "cancelled"
      ? "This run did not complete with verified evidence. Inspect its activity for the recorded outcome."
      : run && !run.simulation
        ? "A finished Claude Code run records its branch, commit, changed files and a diff fingerprint. Nothing is tested yet."
        : "A completed simulation will include an independently checked artifact and its SHA-256 fingerprint.");
  if (!artifact) return;
  const evidence = artifact.evidence;
  const worktree = evidence.kind === "worktree-record";
  element("verified-title").textContent = worktree
    ? "Worktree recorded"
    : "Artifact verified";
  element("verified-subtitle").textContent = worktree
    ? "Argent inspected the branch itself. Nothing was tested."
    : "Independent simulation check passed";
  element("verified-badge").textContent = worktree
    ? "NOT TESTED"
    : "SIMULATION";
  element("evidence-check").textContent = worktree
    ? "Branch, commit, changed files and diff"
    : "Artifact identity and content";
  element("artifact-label").textContent = worktree ? "Worktree" : "Artifact";
  element("sha-label").textContent = worktree ? "Diff SHA-256" : "SHA-256";
  element("artifact-heading-title").textContent = worktree
    ? "Recorded evidence"
    : "Artifact contents";
  element("evidence-note").textContent = worktree
    ? "This records what changed against the base commit. It is not a test result or a pull request."
    : "This verifies a simulation artifact. It is not evidence of repository tests or a pull request.";
  element("artifact-name").textContent =
    evidence.kind === "simulation-artifact-check"
      ? evidence.artifact
      : `${evidence.branch} at ${evidence.headSha.slice(0, 12)}, ${files(evidence.changedFiles)} (not tested)`;
  element("artifact-sha").textContent =
    evidence.kind === "simulation-artifact-check"
      ? evidence.sha256
      : evidence.diffSha256;
  element("artifact-content").textContent = JSON.stringify(
    worktree ? evidence : artifact.content,
    null,
    2,
  );
}

function render(): void {
  updateConnection();
  renderWorkspaces();
  const workspace = currentWorkspace();
  const composer = element<HTMLTextAreaElement>("composer-input");
  if (composerWorkspace !== selectedWorkspace) {
    if (composerWorkspace)
      composerDrafts.set(composerWorkspace, composer.value ?? "");
    composer.value = composerDrafts.get(selectedWorkspace) ?? "";
    composerWorkspace = selectedWorkspace;
  }
  element("task-navigation").hidden = !workspace;
  element("welcome").hidden = !!workspace;
  element("workspace-content").hidden = !workspace;
  const local = isLocal(workspace) ? workspace!.local! : undefined;
  element("workspace-title").textContent = local
    ? baseName(local.repositoryPath)
    : (workspace?.repository.split("/").at(-1) ?? "Welcome to Argent");
  element("workspace-repository").textContent = local
    ? `${local.branch} · ${local.worktreePath}`
    : (workspace?.repository.replace("https://", "") ??
      "A durable place for your development tasks.");
  element("workspace-repository").title = local?.worktreePath ?? "";
  const notice = element("execution-notice");
  notice.className = `simulation-notice${local ? " local-agent" : ""}`;
  element("execution-notice-icon").className =
    `icon icon-${local ? "triangle-alert" : "info"}`;
  element("execution-notice-title").textContent = local
    ? "Claude Code · not a sandbox"
    : "Local simulation";
  element("execution-notice-detail").textContent = local
    ? " · The agent runs as you, with your files, network and credentials. Its changes stay on this branch in its own worktree."
    : " · Scripted execution and verified artifacts. No model, cloud resource or pull request.";
  element("agent-label").textContent = local
    ? "Claude Code"
    : "Scripted adapter";
  element("composer-agent-note").textContent = local
    ? "Claude Code · your sign-in · follow-ups continue the conversation"
    : "Scripted simulation · No model connected";
  const parallel = element<HTMLButtonElement>("workspace-parallel");
  parallel.hidden = !local;
  parallel.disabled = !connected || mutationBusy;
  const state = element("workspace-state");
  state.hidden = !workspace;
  state.textContent = workspace?.state === "running" ? "Ready" : "Stopped";
  state.className = `badge workspace-${workspace?.state ?? "stopped"}`;
  const lifecycle = element<HTMLButtonElement>("workspace-lifecycle");
  lifecycle.hidden = !workspace;
  lifecycle.textContent =
    workspace?.state === "stopped" ? "Start workspace" : "Stop workspace";
  lifecycle.disabled = !connected || mutationBusy || busyWorkspace();
  const canRun =
    connected &&
    !mutationBusy &&
    workspace?.state === "running" &&
    !busyWorkspace();
  element<HTMLButtonElement>("composer-submit").disabled =
    !canRun || !(composer.value ?? "").trim();
  element<HTMLButtonElement>("detail-start").disabled = !canRun;
  element<HTMLButtonElement>("session-add").disabled = !canRun;
  element("composer-status").textContent = !connected
    ? "Reconnect to continue"
    : workspace?.state === "stopped"
      ? "Start this workspace to continue"
      : runs.some((run) => run.status === "needs_attention")
        ? "Review the interrupted session above"
        : busyWorkspace()
          ? "Session in progress · inspect activity above"
          : "Review before starting";
  element<HTMLTextAreaElement>("composer-input").disabled = !canRun;
  element<HTMLButtonElement>("new-task").disabled = !canRun;
  element<HTMLButtonElement>("empty-new-task").disabled = !canRun;
  renderRuns();
  const run = currentRun();
  element("detail-empty").hidden = !!run;
  element("run-detail").hidden = !run;
  element("inspector-artifact-summary").textContent = !run
    ? "Select a session to inspect its recorded evidence."
    : artifact
      ? artifact.evidence.kind === "simulation-artifact-check"
        ? `Retained artifact: ${artifact.evidence.artifact}`
        : `Worktree record: ${files(artifact.evidence.changedFiles)}`
      : "No verified artifact available for this session.";
  element("inspector-check-summary").textContent = !run
    ? "Select a session to inspect its verification status."
    : artifact
      ? artifact.evidence.kind === "simulation-artifact-check"
        ? "Artifact identity and SHA-256 verified. Simulation only."
        : `Worktree recorded at ${artifact.evidence.headSha.slice(0, 12)}. Not tested.`
      : `Session ${labels[run.status].toLowerCase()}. No recorded evidence available.`;
  element<HTMLButtonElement>("inspect-artifact").disabled = !run;
  element<HTMLButtonElement>("inspect-checks").disabled = !run;
  if (!run) return;
  element("run-state").textContent = labels[run.status];
  element("run-state").className = `badge ${run.status}`;
  element("run-id").textContent = `RUN ${shortId(run.id)}`;
  element("run-title").textContent = run.task;
  element("run-meta").textContent =
    `${date(run.createdAt)}  ·  ${agentLabel(run)}  ·  ${limitLabel(run)}`;
  const cancel = element<HTMLButtonElement>("cancel-run");
  cancel.hidden = !["queued", "running", "cancelling"].includes(run.status);
  cancel.disabled = !connected || mutationBusy || run.status === "cancelling";
  cancel.textContent =
    run.status === "cancelling" ? "Cancelling…" : "Cancel task";
  element("attention-panel").hidden = run.status !== "needs_attention";
  element<HTMLButtonElement>("resolve-run").disabled =
    !connected || mutationBusy || !run.simulation;
  element("attention-description").textContent = run.simulation
    ? "This simulation was interrupted. Review the activity, then abandon it to continue."
    : "The local agent may still be running. This workspace stays blocked until its process can be reconciled. Review its files and running processes; reconnecting does not stop or replay it.";
  renderEvents();
  renderVerification();
}

function selectWorkspace(id: string): void {
  if (selectedWorkspace === id) return;
  epoch++;
  selectedWorkspace = id;
  selectedRun = "";
  runs = [];
  runCursor = null;
  runPaging = false;
  resetInspection();
  persist();
  render();
  void refresh();
}

function resetInspection(): void {
  events = [];
  eventCursor = 0;
  eventPageStart = null;
  artifact = null;
  artifactError = "";
  element("activity-list").replaceChildren();
}

function selectRun(id: string): void {
  if (selectedRun === id) return;
  epoch++;
  selectedRun = id;
  resetInspection();
  persist();
  render();
  void refresh();
}

async function refresh(): Promise<void> {
  if (stopped) return;
  if (refreshBusy) {
    refreshAgain = true;
    return;
  }
  refreshBusy = true;
  clearTimeout(timer);
  const version = epoch;
  try {
    const status = await api().status();
    if (version !== epoch) return;
    connected = status.connected;
    if (!connected) {
      render();
      return;
    }
    const page = await api().listWorkspaces();
    if (version !== epoch) return;
    workspaces = merge(workspaces, page.items);
    if (!workspacePaging) workspaceCursor = page.nextCursor;
    const workspaceId = selectedWorkspace || savedSelection.workspaceId;
    if (workspaceId && !page.items.some((item) => item.id === workspaceId)) {
      try {
        const remembered = await api().getWorkspace(workspaceId);
        if (version !== epoch) return;
        workspaces = merge(workspaces, [remembered]);
      } catch (error) {
        if (version !== epoch) return;
        if (
          !selectedWorkspace &&
          /^Request rejected \(404\):/.test(message(error))
        ) {
          delete savedSelection.workspaceId;
          delete savedSelection.runId;
        } else {
          throw error;
        }
      }
    }
    if (!selectedWorkspace && workspaces.length) {
      selectedWorkspace = workspaces.some(
        (item) => item.id === savedSelection.workspaceId,
      )
        ? savedSelection.workspaceId!
        : workspaces[0]!.id;
    }
    if (selectedWorkspace) {
      const runPage = await api().listRuns(selectedWorkspace);
      if (version !== epoch) return;
      runs = merge(runs, runPage.items);
      if (!runPaging) runCursor = runPage.nextCursor;
      if (
        !selectedRun &&
        savedSelection.runId &&
        !runs.some((item) => item.id === savedSelection.runId)
      ) {
        try {
          const saved = await api().getRun(savedSelection.runId);
          if (version !== epoch) return;
          if (saved.workspaceId === selectedWorkspace)
            runs = merge(runs, [saved]);
        } catch (error) {
          if (version !== epoch) return;
          if (/^Request rejected \(404\):/.test(message(error))) {
            delete savedSelection.runId;
          } else {
            throw error;
          }
        }
      }
      if (!selectedRun && runs.length) {
        selectedRun = runs.some((item) => item.id === savedSelection.runId)
          ? savedSelection.runId!
          : runs[0]!.id;
        resetInspection();
      }
      if (selectedRun) {
        const run = await api().getRun(selectedRun);
        if (version !== epoch) return;
        if (run.workspaceId !== selectedWorkspace)
          throw new Error("The selected run belongs to another workspace.");
        runs = merge(runs, [run]);
        for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
          const history = await api().events(selectedRun, eventCursor);
          if (version !== epoch) return;
          events = [
            ...events,
            ...history.events.filter((item) => item.cursor > eventCursor),
          ];
          eventCursor = history.nextCursor;
          if (history.events.length < 100) break;
        }
        if (
          run.status === "completed" &&
          (!artifact || activeTab === "verification")
        ) {
          try {
            const result = await api().artifact(run.id);
            if (version !== epoch) return;
            artifact = result;
            artifactError = "";
          } catch (error) {
            if (version !== epoch) return;
            artifact = null;
            artifactError = message(error);
          }
        }
      }
    }
    persist();
    element("sync-status").textContent =
      `Synced ${time(Date.now())} · Execution stays with the service when this window closes.`;
    render();
  } catch (error) {
    if (version === epoch) {
      showError(error);
      updateConnection();
    }
  } finally {
    refreshBusy = false;
    timer = setTimeout(
      () => {
        refreshAgain = false;
        void refresh();
      },
      refreshAgain ? 0 : 1000,
    );
  }
}

function showDialog(id: string, focusId?: string): void {
  const dialog = element<HTMLDialogElement>(id);
  if (!dialog.open) dialog.showModal();
  if (focusId) element(focusId).focus();
}

// Local runs are entered in minutes (up to two hours); simulations in seconds.
let runtimeUnitMs = 1000;

function submitLabel(): string {
  return isLocal(currentWorkspace()) ? "Start Claude Code" : "Start simulation";
}

function permissionInputs(): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="permission"]'),
  );
}

function setTaskLocked(locked: boolean): void {
  element<HTMLTextAreaElement>("task-input").readOnly = locked;
  element<HTMLInputElement>("runtime-input").readOnly = locked;
  for (const input of permissionInputs()) input.disabled = locked;
  element("pending-notice").hidden = !locked;
  element("task-submit").textContent = locked
    ? "Retry submission"
    : submitLabel();
}

function openTask(): void {
  if (!selectedWorkspace || !connected) return;
  const remembered =
    pending?.workspaceId === selectedWorkspace ? pending : null;
  const local = isLocal(currentWorkspace());
  const followUp = local && runs.length > 0;
  runtimeUnitMs = local ? 60000 : 1000;
  const task = element<HTMLTextAreaElement>("task-input");
  const runtime = element<HTMLInputElement>("runtime-input");
  runtime.max = local ? "120" : "300";
  element("runtime-unit").textContent = local ? "minutes" : "seconds";
  element("task-eyebrow").textContent = local
    ? "CLAUDE CODE · NOT A SANDBOX"
    : "LOCAL SIMULATION";
  element("task-dialog-title").textContent = followUp
    ? "Continue the conversation"
    : "Start a task";
  element("task-description").textContent = local
    ? `Claude Code works in this workspace's worktree with your own sign-in${followUp ? " and resumes the previous conversation" : ""}. It runs as you, with access to your files, network and credentials.`
    : "The scripted adapter will record activity and create a verifiable artifact.";
  element("permission-field").hidden = !local;
  const mode = remembered?.permissionMode ?? "edits";
  for (const input of permissionInputs()) input.checked = input.value === mode;
  task.value = remembered?.task ?? "";
  runtime.value = String(
    Math.round(
      (remembered?.maxRuntimeMs ?? (local ? 1800000 : 30000)) / runtimeUnitMs,
    ),
  );
  setTaskLocked(!!remembered);
  formError("task-form-error");
  showDialog("task-dialog", "task-input");
}

function selectedPermission(): PermissionMode | undefined {
  if (!isLocal(currentWorkspace())) return undefined;
  return permissionInputs().find((input) => input.checked)?.value === "full"
    ? "full"
    : "edits";
}

async function mutate(action: () => Promise<void>): Promise<void> {
  if (mutationBusy) return;
  mutationBusy = true;
  clearError();
  render();
  try {
    await action();
  } catch (error) {
    showError(error);
  } finally {
    mutationBusy = false;
    render();
    void refresh();
  }
}

element("new-workspace").addEventListener("click", () => {
  formError("workspace-form-error");
  showDialog("workspace-dialog", "local-workspace-choose");
});
element("local-workspace-choose").addEventListener("click", () => {
  if (!connected || mutationBusy) return;
  void mutate(async () => {
    const button = element<HTMLButtonElement>("local-workspace-choose");
    button.setAttribute("aria-busy", "true");
    formError("workspace-form-error");
    try {
      const workspace = await api().createLocalWorkspace();
      if (!workspace) return;
      workspaces = merge(workspaces, [workspace]);
      element<HTMLDialogElement>("workspace-dialog").close();
      selectWorkspace(workspace.id);
    } catch (error) {
      formError("workspace-form-error", error);
    } finally {
      button.setAttribute("aria-busy", "false");
    }
  });
});
element("earlier-events").addEventListener("click", () => {
  const start = eventPageStart ?? Math.max(0, events.length - EVENT_PAGE_SIZE);
  eventPageStart = Math.max(0, start - EVENT_PAGE_SIZE);
  renderEvents();
});
element("later-events").addEventListener("click", () => {
  if (eventPageStart === null) return;
  const start = eventPageStart + EVENT_PAGE_SIZE;
  eventPageStart = start >= events.length - EVENT_PAGE_SIZE ? null : start;
  renderEvents();
});
element("workspace-parallel").addEventListener("click", () => {
  const source = currentWorkspace();
  if (!isLocal(source)) return;
  void mutate(async () => {
    const workspace = await api().createLocalWorkspace(source!.id);
    if (!workspace) return;
    workspaces = merge(workspaces, [workspace]);
    selectWorkspace(workspace.id);
  });
});
element("welcome-create").addEventListener("click", () =>
  element("new-workspace").click(),
);
element("new-task").addEventListener("click", openTask);
element("empty-new-task").addEventListener("click", openTask);
element("dismiss-error").addEventListener("click", clearError);
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-close-dialog]",
))
  button.addEventListener("click", () => button.closest("dialog")?.close());

element<HTMLFormElement>("workspace-form").addEventListener(
  "submit",
  (event) => {
    event.preventDefault();
    const button = element<HTMLButtonElement>("workspace-submit");
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    formError("workspace-form-error");
    void (async () => {
      try {
        const workspace = await api().createWorkspace(
          element<HTMLInputElement>("repository-input").value.trim(),
        );
        workspaces = merge(workspaces, [workspace]);
        element<HTMLDialogElement>("workspace-dialog").close();
        element<HTMLInputElement>("repository-input").value = "";
        selectWorkspace(workspace.id);
      } catch (error) {
        formError("workspace-form-error", error);
      } finally {
        button.disabled = false;
        button.setAttribute("aria-busy", "false");
      }
    })();
  },
);

element<HTMLFormElement>("task-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const button = element<HTMLButtonElement>("task-submit");
  if (button.disabled) return;
  if (pending && pending.workspaceId !== selectedWorkspace) {
    formError(
      "task-form-error",
      new Error(
        "Another workspace has a pending submission. Return there and retry it before starting another task.",
      ),
    );
    return;
  }
  pending ??= {
    workspaceId: selectedWorkspace,
    task: element<HTMLTextAreaElement>("task-input").value.trim(),
    maxRuntimeMs:
      Number(element<HTMLInputElement>("runtime-input").value) * runtimeUnitMs,
    key: crypto.randomUUID(),
    ...(selectedPermission() ? { permissionMode: selectedPermission()! } : {}),
  };
  if (!pending.task) {
    pending = null;
    formError("task-form-error", new Error("Describe a task before starting."));
    return;
  }
  persist();
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  formError("task-form-error");
  const submission = pending;
  void (async () => {
    try {
      const run = await api().createRun(
        submission.workspaceId,
        submission.task,
        submission.maxRuntimeMs,
        submission.key,
        submission.permissionMode,
      );
      pending = null;
      persist();
      const composer = element<HTMLTextAreaElement>("composer-input");
      if (
        composerWorkspace === submission.workspaceId &&
        composer.value.trim() === submission.task
      )
        composer.value = "";
      if (
        composerDrafts.get(submission.workspaceId)?.trim() === submission.task
      )
        composerDrafts.delete(submission.workspaceId);
      element<HTMLDialogElement>("task-dialog").close();
      if (selectedWorkspace !== run.workspaceId)
        selectWorkspace(run.workspaceId);
      runs = merge(runs, [run]);
      selectRun(run.id);
    } catch (error) {
      if (
        /Request rejected \((400|401|403|404|409|413)\)/.test(message(error))
      ) {
        pending = null;
        persist();
        setTaskLocked(false);
      } else {
        setTaskLocked(true);
      }
      formError("task-form-error", error);
    } finally {
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
      void refresh();
    }
  })();
});

element("workspace-lifecycle").addEventListener("click", () => {
  const workspace = currentWorkspace();
  if (!workspace) return;
  void mutate(async () => {
    const updated = await api().setWorkspaceState(
      workspace.id,
      workspace.state === "running" ? "stopped" : "running",
    );
    workspaces = merge(workspaces, [updated]);
  });
});
element("cancel-run").addEventListener("click", () => {
  const id = selectedRun;
  void mutate(async () => {
    const run = await api().cancelRun(id);
    if (selectedWorkspace === run.workspaceId) runs = merge(runs, [run]);
  });
});
element("resolve-run").addEventListener("click", () => {
  formError("resolve-form-error");
  showDialog("resolve-dialog", "resolution-input");
});
element<HTMLFormElement>("resolve-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = selectedRun;
  const button = element<HTMLButtonElement>("resolution-submit");
  if (button.disabled) return;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  void (async () => {
    try {
      const run = await api().resolveRun(
        id,
        element<HTMLTextAreaElement>("resolution-input").value.trim(),
      );
      if (selectedWorkspace === run.workspaceId) runs = merge(runs, [run]);
      element<HTMLDialogElement>("resolve-dialog").close();
      element<HTMLTextAreaElement>("resolution-input").value = "";
      void refresh();
    } catch (error) {
      formError("resolve-form-error", error);
    } finally {
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
    }
  })();
});
element("service-toggle").addEventListener("click", () => {
  if (connected) showDialog("stop-dialog");
  else
    void mutate(async () => {
      connected = (await api().startService()).connected;
    });
});
element("service-stop-confirm").addEventListener("click", () => {
  element<HTMLDialogElement>("stop-dialog").close();
  void mutate(async () => {
    await api().stopService();
    connected = false;
  });
});
element("more-workspaces").addEventListener("click", () => {
  if (!workspaceCursor) return;
  const cursor = workspaceCursor;
  void mutate(async () => {
    const page = await api().listWorkspaces(cursor);
    workspaces = merge(workspaces, page.items);
    workspaceCursor = page.nextCursor;
    workspacePaging = true;
  });
});
element("more-runs").addEventListener("click", () => {
  if (!runCursor || !selectedWorkspace) return;
  const cursor = runCursor;
  const id = selectedWorkspace;
  void mutate(async () => {
    const page = await api().listRuns(id, cursor);
    if (selectedWorkspace === id) {
      runs = merge(runs, page.items);
      runCursor = page.nextCursor;
      runPaging = true;
    }
  });
});
for (const tab of ["activity", "verification"] as const)
  element(`${tab}-tab`).addEventListener("click", () => {
    activeTab = tab;
    for (const name of ["activity", "verification"] as const) {
      element(`${name}-tab`).classList.toggle("active", name === tab);
      element(`${name}-tab`).setAttribute(
        "aria-selected",
        String(name === tab),
      );
      element(`${name}-tab`).tabIndex = name === tab ? 0 : -1;
      element(`${name}-pane`).hidden = name !== tab;
    }
    if (tab === "verification") void refresh();
  });
for (const tab of ["activity", "verification"] as const) {
  element(`${tab}-tab`).addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target =
      event.key === "Home"
        ? "activity"
        : event.key === "End"
          ? "verification"
          : tab === "activity"
            ? "verification"
            : "activity";
    element(`${target}-tab`).click();
    element(`${target}-tab`).focus();
  });
}
window.addEventListener("beforeunload", () => {
  stopped = true;
  clearTimeout(timer);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refresh();
});

render();
if (!bridge) {
  showError(
    new Error(
      "Open Argent from the installed desktop application. This interface does not connect from a web browser.",
    ),
  );
} else void refresh();
