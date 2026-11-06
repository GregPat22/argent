import type { ArtifactView, DesktopBridge } from "../src/desktop/contracts.js";
import type { RunEvent, RunStatus, RunView, Workspace } from "../src/domain.js";
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
let workspaceCursor: string | null = null;
let runCursor: string | null = null;
let workspacePaging = false;
let runPaging = false;
let workspaceSignature = "";
let runSignature = "";
let events: RunEvent[] = [];
let eventCursor = 0;
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
function showError(error: unknown): void {
  element("error-text").textContent = message(error);
  element("error-banner").hidden = false;
}
function clearError(): void {
  element("error-banner").hidden = true;
}
function formError(id: string, error?: unknown): void {
  element(id).textContent = error ? message(error) : "";
  element(id).hidden = !error;
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
  element("disconnected-banner").hidden = connected;
  element<HTMLButtonElement>("new-workspace").disabled =
    !connected || mutationBusy;
  element<HTMLButtonElement>("welcome-create").disabled =
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
      const pieces = workspace.repository.split("/");
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
      button.title = workspace.repository;
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
      button.append(node("span", "⌁", "workspace-icon"), copy, dot);
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

function eventDescription(event: RunEvent): {
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
  let detail = "";
  if (typeof event.data.message === "string") detail = event.data.message;
  else if (event.type === "run.queued")
    detail = "The task is safely recorded and waiting for the local worker.";
  else if (event.type === "run.started")
    detail =
      "The worker claimed the run. Closing this window will not cancel it.";
  else if (event.type === "verification.recorded")
    detail =
      "Artifact identity and contents were checked independently of adapter messages.";
  else if (event.type === "run.completed")
    detail = "The scripted run completed with independent simulation evidence.";
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
  const rendered = new Set(
    Array.from(list.children).map(
      (item) => (item as HTMLElement).dataset.cursor,
    ),
  );
  for (const event of events) {
    if (rendered.has(String(event.cursor))) continue;
    const row = node("article", "", "activity-event");
    row.dataset.cursor = String(event.cursor);
    const symbol =
      event.type === "run.completed" || event.type === "verification.recorded"
        ? "✓"
        : event.type === "run.needs_attention"
          ? "!"
          : "·";
    const copy = node("div", "", "event-copy");
    const heading = node("div", "", "event-heading");
    const description = eventDescription(event);
    const timestamp = node("time", time(event.createdAt));
    timestamp.dateTime = new Date(event.createdAt).toISOString();
    heading.append(node("h4", description.title), timestamp);
    copy.append(heading, node("p", description.detail));
    row.append(node("span", symbol, "event-symbol"), copy);
    list.append(row);
  }
  while (list.children.length > 500) list.firstElementChild?.remove();
  element("event-count").textContent = String(events.length);
  element("activity-empty").hidden = events.length > 0;
  if (nearBottom && list.parentElement)
    list.parentElement.scrollTop = list.parentElement.scrollHeight;
}

function renderVerification(): void {
  const run = currentRun();
  element("verification-result").hidden = !artifact;
  element("verification-empty").hidden = !!artifact;
  element("verification-indicator").textContent = artifact ? "✓" : "○";
  element("verification-empty-title").textContent = artifactError
    ? "Evidence is unavailable."
    : run?.status === "failed"
      ? "No passing verification."
      : "Evidence comes first.";
  element("verification-empty-text").textContent =
    artifactError ||
    (run?.status === "failed" || run?.status === "cancelled"
      ? "This run did not complete with verified evidence. Inspect its activity for the recorded outcome."
      : "A completed simulation will include an independently checked artifact and its SHA-256 fingerprint.");
  if (!artifact) return;
  element("artifact-name").textContent = artifact.evidence.artifact;
  element("artifact-sha").textContent = artifact.evidence.sha256;
  element("artifact-content").textContent = JSON.stringify(
    artifact.content,
    null,
    2,
  );
}

function render(): void {
  updateConnection();
  renderWorkspaces();
  const workspace = currentWorkspace();
  element("welcome").hidden = !!workspace;
  element("workspace-content").hidden = !workspace;
  element("workspace-title").textContent =
    workspace?.repository.split("/").at(-1) ?? "Welcome to Argent";
  element("workspace-repository").textContent =
    workspace?.repository.replace("https://", "") ??
    "A durable place for your development tasks.";
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
  element<HTMLButtonElement>("new-task").disabled = !canRun;
  element<HTMLButtonElement>("empty-new-task").disabled = !canRun;
  renderRuns();
  const run = currentRun();
  element("detail-empty").hidden = !!run;
  element("run-detail").hidden = !run;
  if (!run) return;
  element("run-state").textContent = labels[run.status];
  element("run-state").className = `badge ${run.status}`;
  element("run-id").textContent = `RUN ${shortId(run.id)}`;
  element("run-title").textContent = run.task;
  element("run-meta").textContent =
    `${date(run.createdAt)}  ·  Scripted adapter  ·  ${run.maxRuntimeMs / 1000}s execution limit`;
  const cancel = element<HTMLButtonElement>("cancel-run");
  cancel.hidden = !["queued", "running", "cancelling"].includes(run.status);
  cancel.disabled = !connected || mutationBusy || run.status === "cancelling";
  cancel.textContent =
    run.status === "cancelling" ? "Cancelling…" : "Cancel task";
  element("attention-panel").hidden = run.status !== "needs_attention";
  element<HTMLButtonElement>("resolve-run").disabled =
    !connected || mutationBusy;
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
    if (
      !selectedWorkspace &&
      savedSelection.workspaceId &&
      !workspaces.some((item) => item.id === savedSelection.workspaceId)
    ) {
      try {
        const remembered = await api().getWorkspace(savedSelection.workspaceId);
        if (version !== epoch) return;
        workspaces = merge(workspaces, [remembered]);
      } catch (error) {
        if (version !== epoch) return;
        if (/^Request rejected \(404\):/.test(message(error))) {
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
          ].slice(-500);
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

function openTask(): void {
  if (!selectedWorkspace || !connected) return;
  const remembered =
    pending?.workspaceId === selectedWorkspace ? pending : null;
  const task = element<HTMLTextAreaElement>("task-input");
  const runtime = element<HTMLInputElement>("runtime-input");
  task.value = remembered?.task ?? "";
  runtime.value = String((remembered?.maxRuntimeMs ?? 30000) / 1000);
  task.readOnly = !!remembered;
  runtime.readOnly = !!remembered;
  element("pending-notice").hidden = !remembered;
  element("task-submit").textContent = remembered
    ? "Retry submission"
    : "Start simulation ↗";
  formError("task-form-error");
  showDialog("task-dialog", "task-input");
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
  showDialog("workspace-dialog", "repository-input");
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
      Number(element<HTMLInputElement>("runtime-input").value) * 1000,
    key: crypto.randomUUID(),
  };
  if (!pending.task) {
    pending = null;
    formError("task-form-error", new Error("Describe a task before starting."));
    return;
  }
  persist();
  button.disabled = true;
  formError("task-form-error");
  const submission = pending;
  void (async () => {
    try {
      const run = await api().createRun(
        submission.workspaceId,
        submission.task,
        submission.maxRuntimeMs,
        submission.key,
      );
      pending = null;
      persist();
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
        element<HTMLTextAreaElement>("task-input").readOnly = false;
        element<HTMLInputElement>("runtime-input").readOnly = false;
        element("pending-notice").hidden = true;
        element("task-submit").textContent = "Start simulation ↗";
      } else {
        element<HTMLTextAreaElement>("task-input").readOnly = true;
        element<HTMLInputElement>("runtime-input").readOnly = true;
        element("pending-notice").hidden = false;
        element("task-submit").textContent = "Retry submission";
      }
      formError("task-form-error", error);
    } finally {
      button.disabled = false;
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
