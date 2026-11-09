// Orchestrates refresh and rendering. Execution stays with the local service;
// this window only reads state and sends explicit, idempotent requests.
import { actions, api, hasBridge } from "./actions.js";
import { renderComposer, wireComposer } from "./composer.js";
import { byId, enable, setClass, setText, show } from "./dom.js";
import { mergeHistory as merge } from "./history.js";
import {
  isActive,
  isLocal,
  isWorking,
  message,
  readableError,
  terminalStates,
  workspaceDetail,
  workspaceTitle,
} from "./model.js";
import { openPalette, wirePalette } from "./palette.js";
import { renderSidebar } from "./sidebar.js";
import {
  currentWorkspace,
  persist,
  restore,
  state,
  turnRecord,
} from "./state.js";
import {
  renderTranscript,
  resetTranscript,
  visibleRuns,
} from "./transcript.js";

let loaded = false;
let refreshBusy = false;
let refreshAgain = false;
let stopped = false;
let epoch = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let resolving = "";

restore();

function showError(error: unknown): void {
  byId("error-text").textContent = readableError(error);
  byId("error-banner").hidden = false;
}
function clearError(): void {
  byId("error-banner").hidden = true;
}
function formError(id: string, error?: unknown): void {
  byId(id).textContent = error ? readableError(error) : "";
  byId(id).hidden = !error;
  const fields: Record<string, string> = {
    "workspace-form-error": "repository-input",
    "resolve-form-error": "resolution-input",
  };
  const field = fields[id];
  if (field) byId(field).setAttribute("aria-invalid", String(!!error));
}

function renderHeader(): void {
  const workspace = currentWorkspace();
  const local = isLocal(workspace) ? workspace!.local! : undefined;
  setText("workspace-title", workspace ? workspaceTitle(workspace) : "");
  const branch = byId<HTMLButtonElement>("workspace-repository");
  setText("workspace-branch", workspace ? workspaceDetail(workspace) : "");
  branch.title = local
    ? `${local.worktreePath} · click to copy`
    : (workspace?.repository ?? "");
  branch.disabled = !local;
  setClass(branch, "is-demo", !local);
  const review = state.runs.some((run) => run.status === "needs_attention");
  const working = state.runs.some((run) => isWorking(run.status));
  const label = !workspace
    ? ""
    : !state.connected
      ? "Offline"
      : workspace.state === "stopped"
        ? "Stopped"
        : review
          ? "Needs review"
          : working
            ? "Working"
            : "Ready";
  const pill = byId("workspace-state");
  pill.textContent = label;
  pill.hidden = !workspace || label === "Ready";
  pill.className = `pill pill-${label.toLowerCase().replace(" ", "-")}`;
  show("workspace-demo-tag", !!workspace && !local);
  show("workspace-parallel", !!local);
  enable("workspace-parallel", state.connected && !state.mutationBusy);
  show("copy-path", !!local);
  const lifecycle = byId<HTMLButtonElement>("workspace-lifecycle");
  lifecycle.textContent =
    workspace?.state === "stopped" ? "Start workspace" : "Stop workspace";
  lifecycle.disabled =
    !state.connected ||
    state.mutationBusy ||
    state.runs.some((run) => isActive(run.status));
  show("workspace-menu-button", !!workspace);
}

function render(): void {
  const workspace = currentWorkspace();
  show("welcome", loaded && !workspace);
  show("workspace-content", !!workspace);
  show("workspace-header-copy", !!workspace);
  show("disconnected-banner", !state.connected && loaded);
  enable("reconnect-inline", !state.mutationBusy && hasBridge());
  enable("welcome-create", state.connected && !state.mutationBusy);
  enable("welcome-demo", state.connected && !state.mutationBusy);
  renderSidebar();
  renderHeader();
  show("detail-empty", !!workspace && state.runs.length === 0);
  if (workspace) {
    const local = isLocal(workspace);
    setText(
      "empty-title",
      local ? `A fresh branch, ready.` : "A scripted demo, ready.",
    );
    setText(
      "empty-text",
      local
        ? `Claude Code works on ${workspace.local!.branch} in its own worktree. Your checkout is not changed. Describe a task below to start.`
        : "Scripted steps and a checked artifact. No model, no cloud, no repository access. Describe a task below to start.",
    );
    renderTranscript();
  }
  renderComposer();
}

function selectWorkspace(id: string): void {
  if (state.selectedWorkspace === id) return;
  epoch++;
  state.selectedWorkspace = id;
  state.runs = [];
  state.runCursor = null;
  state.runPaging = false;
  resetTranscript();
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
    state.connected = status.connected;
    if (!state.connected) {
      loaded = true;
      render();
      return;
    }
    const page = await api().listWorkspaces();
    if (version !== epoch) return;
    state.workspaces = merge(state.workspaces, page.items);
    if (!state.workspacePaging) state.workspaceCursor = page.nextCursor;
    const workspaceId = state.selectedWorkspace || state.saved.workspaceId;
    if (workspaceId && !page.items.some((item) => item.id === workspaceId)) {
      try {
        const remembered = await api().getWorkspace(workspaceId);
        if (version !== epoch) return;
        state.workspaces = merge(state.workspaces, [remembered]);
      } catch (error) {
        if (version !== epoch) return;
        if (
          !state.selectedWorkspace &&
          /^Request rejected \(404\):/.test(message(error))
        )
          delete state.saved.workspaceId;
        else throw error;
      }
    }
    if (!state.selectedWorkspace && state.workspaces.length) {
      state.selectedWorkspace = state.workspaces.some(
        (item) => item.id === state.saved.workspaceId,
      )
        ? state.saved.workspaceId!
        : state.workspaces[0]!.id;
    }
    if (state.selectedWorkspace) {
      const runPage = await api().listRuns(state.selectedWorkspace);
      if (version !== epoch) return;
      state.runs = merge(state.runs, runPage.items);
      if (!state.runPaging) state.runCursor = runPage.nextCursor;
      for (const run of state.runs) {
        const before = state.seen.get(run.id);
        if (before && isWorking(before) && run.status === "completed")
          state.struck.add(run.id);
        state.seen.set(run.id, run.status);
      }
      for (const run of visibleRuns()) {
        const record = turnRecord(run.id);
        if (record.settled) continue;
        let exhausted = false;
        for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
          const history = await api().events(run.id, record.cursor);
          if (version !== epoch) return;
          record.events = [
            ...record.events,
            ...history.events.filter((item) => item.cursor > record.cursor),
          ];
          record.cursor = history.nextCursor;
          if (history.events.length < 100) {
            exhausted = true;
            break;
          }
        }
        if (
          run.status === "completed" &&
          !record.artifact &&
          !record.artifactError
        ) {
          try {
            const artifact = await api().artifact(run.id);
            if (version !== epoch) return;
            record.artifact = artifact;
          } catch (error) {
            if (version !== epoch) return;
            record.artifactError = readableError(error);
          }
        }
        record.settled =
          exhausted &&
          terminalStates.includes(run.status) &&
          (run.status !== "completed" ||
            !!record.artifact ||
            !!record.artifactError);
      }
    }
    loaded = true;
    state.syncedAt = Date.now();
    persist();
    render();
  } catch (error) {
    if (version === epoch) {
      showError(error);
      render();
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

async function mutate(action: () => Promise<void>): Promise<void> {
  if (state.mutationBusy) return;
  state.mutationBusy = true;
  clearError();
  render();
  try {
    await action();
  } catch (error) {
    showError(error);
  } finally {
    state.mutationBusy = false;
    render();
    void refresh();
  }
}

function dialog(id: string): HTMLDialogElement {
  return byId<HTMLDialogElement>(id);
}
function openDialog(id: string, focusId?: string): void {
  if (!dialog(id).open) dialog(id).showModal();
  if (focusId) byId(focusId).focus();
}

function addRepository(): void {
  if (!state.connected) return;
  void mutate(async () => {
    const workspace = await api().createLocalWorkspace();
    if (!workspace) return;
    state.workspaces = merge(state.workspaces, [workspace]);
    selectWorkspace(workspace.id);
    byId("composer-input").focus();
  });
}

function newWorkspaceFrom(id: string): void {
  const source = state.workspaces.find((workspace) => workspace.id === id);
  if (!isLocal(source) || !state.connected) return;
  void mutate(async () => {
    const workspace = await api().createLocalWorkspace(source!.id);
    if (!workspace) return;
    state.workspaces = merge(state.workspaces, [workspace]);
    selectWorkspace(workspace.id);
    byId("composer-input").focus();
  });
}

function openDemo(): void {
  formError("workspace-form-error");
  openDialog("workspace-dialog", "repository-input");
}

function openSettings(): void {
  openDialog("settings-dialog", "settings-close");
}

function resolveRun(id: string): void {
  const run = state.runs.find((item) => item.id === id);
  if (!run?.simulation || run.status !== "needs_attention") return;
  resolving = id;
  formError("resolve-form-error");
  openDialog("resolve-dialog", "resolution-input");
}

Object.assign(actions, {
  render,
  refresh,
  selectWorkspace,
  mutate,
  showError,
  clearError,
  addRepository,
  newWorkspaceFrom,
  openDemo,
  openSettings,
  openPalette,
  resolveRun,
  focusComposer: () => byId("composer-input").focus(),
});

wireComposer();
wirePalette();

for (const id of ["new-workspace", "welcome-create"])
  byId(id).addEventListener("click", addRepository);
byId("welcome-demo").addEventListener("click", openDemo);
byId("settings-open").addEventListener("click", openSettings);
byId("dismiss-error").addEventListener("click", clearError);
byId("workspace-parallel").addEventListener("click", () => {
  byId("workspace-menu").hidePopover?.();
  newWorkspaceFrom(state.selectedWorkspace);
});
byId("copy-path").addEventListener("click", () => {
  byId("workspace-menu").hidePopover?.();
  copyPath();
});
byId("workspace-repository").addEventListener("click", copyPath);
function copyPath(): void {
  const path = currentWorkspace()?.local?.worktreePath;
  if (!path) return;
  void navigator.clipboard.writeText(path).then(
    () => {
      const branch = byId("workspace-repository");
      setClass(branch, "copied", true);
      setTimeout(() => setClass(branch, "copied", false), 1400);
    },
    () => showError(new Error("The worktree path could not be copied.")),
  );
}
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-close-dialog]",
))
  button.addEventListener("click", () => button.closest("dialog")?.close());

byId<HTMLFormElement>("workspace-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const button = byId<HTMLButtonElement>("workspace-submit");
  if (button.disabled) return;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  formError("workspace-form-error");
  void (async () => {
    try {
      const workspace = await api().createWorkspace(
        byId<HTMLInputElement>("repository-input").value.trim(),
      );
      state.workspaces = merge(state.workspaces, [workspace]);
      dialog("workspace-dialog").close();
      byId<HTMLInputElement>("repository-input").value = "";
      selectWorkspace(workspace.id);
      byId("composer-input").focus();
    } catch (error) {
      formError("workspace-form-error", error);
    } finally {
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
    }
  })();
});

function toggleLifecycle(): void {
  byId("workspace-menu").hidePopover?.();
  const workspace = currentWorkspace();
  if (!workspace) return;
  void mutate(async () => {
    const updated = await api().setWorkspaceState(
      workspace.id,
      workspace.state === "running" ? "stopped" : "running",
    );
    state.workspaces = merge(state.workspaces, [updated]);
  });
}
byId("workspace-lifecycle").addEventListener("click", toggleLifecycle);
byId("composer-start").addEventListener("click", toggleLifecycle);

byId<HTMLFormElement>("resolve-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = resolving;
  const button = byId<HTMLButtonElement>("resolution-submit");
  const selected = state.runs.find((run) => run.id === id);
  if (
    button.disabled ||
    !selected?.simulation ||
    selected.status !== "needs_attention"
  )
    return;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  void (async () => {
    try {
      const run = await api().resolveRun(
        id,
        byId<HTMLTextAreaElement>("resolution-input").value.trim(),
      );
      if (state.selectedWorkspace === run.workspaceId)
        state.runs = merge(state.runs, [run]);
      dialog("resolve-dialog").close();
      byId<HTMLTextAreaElement>("resolution-input").value = "";
      render();
      void refresh();
    } catch (error) {
      formError("resolve-form-error", error);
    } finally {
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
    }
  })();
});

function reconnect(): void {
  void mutate(async () => {
    state.connected = (await api().startService()).connected;
  });
}
byId("service-toggle").addEventListener("click", () => {
  byId("service-popover").hidePopover?.();
  if (state.connected) openDialog("stop-dialog");
  else reconnect();
});
byId("reconnect-inline").addEventListener("click", reconnect);
byId("service-stop-confirm").addEventListener("click", () => {
  dialog("stop-dialog").close();
  void mutate(async () => {
    await api().stopService();
    state.connected = false;
  });
});
byId("more-workspaces").addEventListener("click", () => {
  if (!state.workspaceCursor) return;
  const cursor = state.workspaceCursor;
  void mutate(async () => {
    const page = await api().listWorkspaces(cursor);
    state.workspaces = merge(state.workspaces, page.items);
    state.workspaceCursor = page.nextCursor;
    state.workspacePaging = true;
  });
});
byId("show-earlier").addEventListener("click", () => {
  state.showEarlier.add(state.selectedWorkspace);
  render();
  void refresh();
});
byId("more-runs").addEventListener("click", () => {
  if (!state.runCursor || !state.selectedWorkspace) return;
  const cursor = state.runCursor;
  const id = state.selectedWorkspace;
  void mutate(async () => {
    const page = await api().listRuns(id, cursor);
    if (state.selectedWorkspace === id) {
      state.runs = merge(state.runs, page.items);
      state.runCursor = page.nextCursor;
      state.runPaging = true;
    }
  });
});

document.addEventListener("keydown", (event) => {
  const key = event as KeyboardEvent;
  if (!(key.metaKey || key.ctrlKey) || key.altKey) return;
  if (document.querySelector("dialog[open]")) return;
  const name = key.key.toLowerCase();
  const shortcuts: Record<string, () => void> = {
    k: openPalette,
    o: addRepository,
    n: () =>
      isLocal(currentWorkspace())
        ? newWorkspaceFrom(state.selectedWorkspace)
        : addRepository(),
    ",": openSettings,
    l: () => byId("composer-input").focus(),
  };
  const shortcut = shortcuts[name];
  if (!shortcut || key.shiftKey) return;
  key.preventDefault();
  shortcut();
});
window.addEventListener("beforeunload", () => {
  stopped = true;
  clearTimeout(timer);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refresh();
});

render();
if (!hasBridge()) {
  loaded = true;
  showError(
    new Error(
      "Open Argent from the installed desktop application. This interface does not connect from a web browser.",
    ),
  );
  render();
} else void refresh();
