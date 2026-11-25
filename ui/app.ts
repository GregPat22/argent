import { renderChecks, wireChecks } from "./checks.js";
// Orchestrates refresh and rendering. Execution stays with the local service;
// this window only reads state and sends explicit, idempotent requests.
import { renderCommit, wireCommit } from "./commit.js";
import { renderChanges, wireChanges } from "./changes.js";
import { renderPublication, wirePublication } from "./publication.js";
import { renderCandidate, wireCandidate } from "./candidate.js";
import { renderCommands, wireCommands } from "./commands.js";
import { actions, api, hasBridge } from "./actions.js";
import type { Workspace } from "../src/domain.js";
import { renderComposer, sendMessage, wireComposer } from "./composer.js";
import { byId, enable, setClass, setText, show } from "./dom.js";
import { mergeHistory as merge } from "./history.js";
import {
  archiveLabel,
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
  rememberScroll,
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
let archiving = "";

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
  branch.title =
    local && !workspace?.archiveStatus
      ? `${local.worktreePath} · click to copy`
      : (workspace?.repository ?? "");
  branch.disabled = !local || !!workspace?.archiveStatus;
  setClass(branch, "is-demo", !local);
  const review = state.runs.some((run) => run.status === "needs_attention");
  const working = state.runs.some((run) => isWorking(run.status));
  const label = !workspace
    ? ""
    : !state.connected
      ? "Offline"
      : workspace.state === "stopped"
        ? archiveLabel(workspace) || "Stopped"
        : review
          ? "Needs review"
          : working
            ? "Working"
            : "Ready";
  const pill = byId("workspace-state");
  pill.textContent = label;
  pill.hidden = !workspace || label === "Ready";
  pill.className = `pill pill-${label.toLowerCase().replaceAll(" ", "-")}`;
  show("workspace-demo-tag", !!workspace && !local);
  show("workspace-parallel", !!local);
  enable("workspace-parallel", state.connected && !state.mutationBusy);
  show("copy-path", !!local && !workspace?.archiveStatus);
  show("workspace-archive", !!local && !workspace?.archiveStatus);
  enable("workspace-archive", canArchive(workspace));
  if (
    dialog("archive-dialog").open &&
    (archiving !== workspace?.id || !canArchive(workspace))
  )
    dialog("archive-dialog").close();
  show(
    "workspace-lifecycle",
    !workspace?.archiveStatus && !workspace?.commitNeedsAttention,
  );
  const lifecycle = byId<HTMLButtonElement>("workspace-lifecycle");
  lifecycle.textContent =
    workspace?.state === "stopped" ? "Start workspace" : "Stop workspace";
  lifecycle.disabled =
    !!workspace?.archiveStatus ||
    !state.connected ||
    state.mutationBusy ||
    state.runs.some((run) => isActive(run.status));
  show("workspace-menu-button", !!workspace);
}

const welcomeInput = () => byId<HTMLTextAreaElement>("welcome-input");

function renderWelcomeActions(): void {
  const ready = state.connected && !state.mutationBusy;
  enable("welcome-create", ready);
  enable("welcome-demo", ready);
  enable(
    "welcome-send",
    ready && !state.pending && !!welcomeInput().value?.trim(),
  );
  welcomeInput().readOnly = state.mutationBusy;
}

function focusComposer(): void {
  byId(currentWorkspace() ? "composer-input" : "welcome-input").focus();
}

function render(): void {
  const workspace = currentWorkspace();
  const enteringWelcome = loaded && !workspace && byId("welcome").hidden;
  show("welcome", loaded && !workspace);
  if (enteringWelcome && document.activeElement === document.body)
    welcomeInput().focus();
  show("workspace-content", !!workspace);
  show("workspace-header-copy", !!workspace);
  show("disconnected-banner", !state.connected && loaded);
  setText(
    "disconnected-text",
    state.otherBuild
      ? "A local service from a different Argent build is still running. Stop it, then reconnect."
      : "The local service is offline. Your history is still here.",
  );
  setText("reconnect-inline", state.otherBuild ? "Stop it…" : "Reconnect");
  enable("reconnect-inline", !state.mutationBusy && hasBridge());
  renderWelcomeActions();
  renderSidebar();
  renderHeader();
  renderCommit();
  renderChanges();
  renderChecks();
  renderCommands();
  renderCandidate();
  renderPublication();
  // Until this workspace's messages are read, show nothing rather than an
  // empty state that a workspace with history does not have.
  show(
    "detail-empty",
    !!workspace && state.runsLoaded === workspace.id && state.runs.length === 0,
  );
  if (workspace) {
    const local = isLocal(workspace);
    setText(
      "empty-title",
      workspace.archiveStatus
        ? "No messages in this workspace"
        : local
          ? `A fresh branch, ready.`
          : "A scripted demo, ready.",
    );
    setText(
      "empty-text",
      workspace.archiveStatus
        ? `Branch ${workspace.local!.branch}`
        : local
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
  rememberScroll();
  state.selectedWorkspace = id;
  state.runsLoaded = "";
  state.runs = [];
  state.runCursor = null;
  state.runPaging = false;
  resetTranscript();
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
    state.otherBuild = status.otherBuild;
    if (!state.connected) {
      loaded = true;
      render();
      return;
    }
    const page = await api().listWorkspaces();
    if (version !== epoch) return;
    state.workspaces = merge(state.workspaces, page.items);
    if (!state.workspacePaging) state.workspaceCursor = page.nextCursor;
    const workspaceId = state.selectedWorkspace || state.pending?.workspaceId;
    if (workspaceId && !page.items.some((item) => item.id === workspaceId)) {
      try {
        const opened = await api().getWorkspace(workspaceId);
        if (version !== epoch) return;
        state.workspaces = merge(state.workspaces, [opened]);
      } catch (error) {
        if (version !== epoch) return;
        if (
          state.selectedWorkspace ||
          !/^Request rejected \(404\):/.test(message(error))
        )
          throw error;
      }
    }
    // Each launch opens on the welcome screen, like a fresh window. The one
    // exception is an uncertain submission: its workspace opens so the retry
    // stays visible instead of silently blocking a new send.
    if (
      !state.selectedWorkspace &&
      state.pending &&
      state.workspaces.some((item) => item.id === state.pending!.workspaceId)
    )
      state.selectedWorkspace = state.pending.workspaceId;
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
    state.runsLoaded = state.selectedWorkspace;
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

function openCreatedWorkspace(workspace: Workspace, draft: string): void {
  state.workspaces = merge(state.workspaces, [workspace]);
  selectWorkspace(workspace.id);
  if (draft) {
    byId<HTMLTextAreaElement>("composer-input").value = draft;
    welcomeInput().value = "";
    renderComposer();
  }
  focusComposer();
}

async function chooseRepository(sendDraft: boolean): Promise<void> {
  if (!state.connected || state.mutationBusy) return;
  const fromWelcome = !currentWorkspace();
  const draft = fromWelcome ? (welcomeInput().value ?? "") : "";
  if (sendDraft && (!draft.trim() || state.pending)) return;

  let createdId: string | undefined;
  await mutate(async () => {
    const workspace = await api().createLocalWorkspace();
    if (!workspace) return;
    createdId = workspace.id;
    openCreatedWorkspace(workspace, draft);
  });
  if (sendDraft && createdId && state.selectedWorkspace === createdId)
    await sendMessage();
  else if (fromWelcome && !currentWorkspace()) welcomeInput().focus();
}

function addRepository(): void {
  void chooseRepository(false);
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
  focusComposer,
});

wireCommit();
wireChanges();
wireChecks();
wireCommands();
wireCandidate();
wirePublication();
wireComposer();
wirePalette();

welcomeInput().addEventListener("input", renderWelcomeActions);
byId("welcome-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void chooseRepository(true);
});
welcomeInput().addEventListener("keydown", (event) => {
  const key = event as KeyboardEvent;
  if (key.key !== "Enter" || key.isComposing || key.shiftKey || key.altKey)
    return;
  key.preventDefault();
  if (!key.repeat) void chooseRepository(true);
});

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
  const workspace = currentWorkspace();
  if (workspace?.archiveStatus) return;
  const path = workspace?.local?.worktreePath;
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

/*
 * A click on the backdrop closes a dialog exactly as Escape does: through its
 * cancel handler, which returns focus and drops pending reads. Press and
 * release must both land outside the panel, so a text selection that ends
 * outside never closes it. Dialogs holding typed work are marked
 * data-keep-open and close only from their own controls or Escape.
 */
for (const element of document.querySelectorAll<HTMLDialogElement>(
  "dialog:not([data-keep-open])",
)) {
  let pressedOutside = false;
  const outside = (event: Event) => {
    const { clientX: x, clientY: y } = event as MouseEvent;
    const box = element.getBoundingClientRect();
    return (
      event.target === element &&
      (x < box.left || x > box.right || y < box.top || y > box.bottom)
    );
  };
  element.addEventListener("pointerdown", (event) => {
    pressedOutside = outside(event);
  });
  element.addEventListener("click", (event) => {
    const dismiss = pressedOutside && element.open && outside(event);
    pressedOutside = false;
    if (
      dismiss &&
      element.dispatchEvent(new Event("cancel", { cancelable: true }))
    )
      element.close();
  });
}

byId<HTMLFormElement>("workspace-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const button = byId<HTMLButtonElement>("workspace-submit");
  if (button.disabled) return;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  formError("workspace-form-error");
  const draft = currentWorkspace() ? "" : (welcomeInput().value ?? "");
  void (async () => {
    try {
      const workspace = await api().createWorkspace(
        byId<HTMLInputElement>("repository-input").value.trim(),
      );
      dialog("workspace-dialog").close();
      byId<HTMLInputElement>("repository-input").value = "";
      openCreatedWorkspace(workspace, draft);
    } catch (error) {
      formError("workspace-form-error", error);
    } finally {
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
    }
  })();
});

function canArchive(workspace: Workspace | undefined): boolean {
  return (
    !!workspace?.local &&
    !workspace.archiveStatus &&
    !workspace.commitNeedsAttention &&
    state.connected &&
    !state.mutationBusy &&
    state.pending?.workspaceId !== workspace.id &&
    !state.runs.some((run) => isActive(run.status))
  );
}
byId("workspace-archive").addEventListener("click", () => {
  const workspace = currentWorkspace();
  if (!workspace || !canArchive(workspace)) return;
  byId("workspace-menu").hidePopover?.();
  archiving = workspace.id;
  setText(
    "archive-target",
    `${workspaceTitle(workspace)} / ${workspace.local!.branch}`,
  );
  byId<HTMLInputElement>("archive-discard").checked = false;
  setText("archive-confirm", "Archive workspace");
  openDialog("archive-dialog", "archive-cancel");
});
function closeArchive(): void {
  dialog("archive-dialog").close();
  byId("workspace-menu-button").focus();
}
byId("archive-cancel").addEventListener("click", closeArchive);
dialog("archive-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeArchive();
});
byId("archive-discard").addEventListener("change", () =>
  setText(
    "archive-confirm",
    byId<HTMLInputElement>("archive-discard").checked
      ? "Discard and archive"
      : "Archive workspace",
  ),
);
byId("archive-confirm").addEventListener("click", () => {
  const workspace = currentWorkspace();
  if (
    !dialog("archive-dialog").open ||
    !workspace ||
    workspace.id !== archiving ||
    !canArchive(workspace)
  )
    return;
  const discard = byId<HTMLInputElement>("archive-discard").checked;
  closeArchive();
  void mutate(async () => {
    const updated = await api().archiveWorkspace(workspace.id, discard);
    epoch++; // An older in-flight poll may still hold the pre-archive state.
    state.workspaces = merge(state.workspaces, [updated]);
  });
});
function toggleLifecycle(): void {
  byId("workspace-menu").hidePopover?.();
  const workspace = currentWorkspace();
  if (!workspace || workspace.archiveStatus) return;
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
    const status = await api().startService();
    state.connected = status.connected;
    state.otherBuild = status.otherBuild;
  });
}
// A service of another build is never stopped implicitly: stopping interrupts
// its work, so the developer confirms it in the same dialog as any stop.
function reconnectOrStop(): void {
  if (state.connected || state.otherBuild) openDialog("stop-dialog");
  else reconnect();
}
byId("service-toggle").addEventListener("click", () => {
  byId("service-popover").hidePopover?.();
  reconnectOrStop();
});
byId("reconnect-inline").addEventListener("click", reconnectOrStop);
byId("service-stop-confirm").addEventListener("click", () => {
  dialog("stop-dialog").close();
  void mutate(async () => {
    await api().stopService();
    state.connected = false;
    state.otherBuild = false;
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
    l: focusComposer,
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
