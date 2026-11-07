// The composer sends a message straight to the selected workspace. Permission
// and time limit are chips; Full access is confirmed once per workspace and
// returns to edits only after every send. An unconfirmed submission keeps its
// idempotency key until the service accepts or rejects it.
import type { PermissionMode } from "../src/domain.js";
import { actions, api } from "./actions.js";
import { byId, enable, h, setClass, setText, show } from "./dom.js";
import { mergeHistory } from "./history.js";
import {
  composerGate,
  isLocal,
  isWorking,
  limitChoices,
  limitLabel,
  permissionAfterSend,
  rejected,
} from "./model.js";
import { currentWorkspace, persist, state } from "./state.js";

let composerWorkspace = "";
let limitKind = "";

const input = () => byId<HTMLTextAreaElement>("composer-input");

function permission(): PermissionMode {
  return state.permission.get(state.selectedWorkspace) ?? "edits";
}

function limit(): number {
  const local = isLocal(currentWorkspace());
  return (
    state.limits.get(state.selectedWorkspace) ?? limitChoices(local).fallback
  );
}

function gate() {
  return composerGate({
    connected: state.connected,
    busy: state.mutationBusy || state.sending,
    workspace: currentWorkspace(),
    runs: state.runs,
    pendingHere: state.pending?.workspaceId === state.selectedWorkspace,
    pendingElsewhere:
      !!state.pending && state.pending.workspaceId !== state.selectedWorkspace,
    text: input().value ?? "",
  });
}

export function renderComposer(): void {
  const composer = input();
  const workspace = currentWorkspace();
  const local = isLocal(workspace);
  const pendingHere =
    state.pending && state.pending.workspaceId === state.selectedWorkspace
      ? state.pending
      : null;
  if (composerWorkspace !== state.selectedWorkspace) {
    if (composerWorkspace)
      state.drafts.set(composerWorkspace, composer.value ?? "");
    composer.value = state.drafts.get(state.selectedWorkspace) ?? "";
    composerWorkspace = state.selectedWorkspace;
  }
  if (pendingHere && composer.value !== pendingHere.task)
    composer.value = pendingHere.task;
  composer.readOnly = !!pendingHere;
  const status = gate();
  composer.disabled = !status.canType;
  composer.placeholder = !workspace
    ? ""
    : local
      ? "What should Claude Code do here?"
      : "Describe a scripted demo task";

  const kind = local ? "local" : "demo";
  const select = byId<HTMLSelectElement>("limit-select");
  if (limitKind !== `${kind}:${state.selectedWorkspace}`) {
    limitKind = `${kind}:${state.selectedWorkspace}`;
    select.replaceChildren();
    for (const value of limitChoices(local).values)
      select.append(
        h("option", {
          text: `${limitLabel(value)} limit`,
          attrs: { value: String(value) },
        }),
      );
  }
  select.value = String(pendingHere?.maxRuntimeMs ?? limit());
  select.disabled = !status.canType || !!pendingHere;

  const mode = pendingHere?.permissionMode ?? permission();
  const toggle = byId<HTMLButtonElement>("permission-toggle");
  show("permission-toggle", local);
  toggle.textContent = mode === "full" ? "Full access" : "Edits only";
  toggle.setAttribute("aria-pressed", String(mode === "full"));
  setClass(toggle, "is-full", mode === "full");
  toggle.disabled = !status.canType || !!pendingHere;
  toggle.title =
    mode === "full"
      ? "Claude Code may run any command as you for this message. Click for edits only."
      : "Claude Code may read and edit files in this worktree. Commands are denied.";

  setText("agent-label", local ? "Claude Code" : "Scripted demo");
  setText(
    "composer-agent-note",
    local
      ? "Claude Code runs as you, with your files, network and credentials. Not a sandbox."
      : "Scripted demo. No model, cloud resource or pull request.",
  );
  setText("composer-status", status.hint);
  show("composer-start", !!workspace && workspace.state === "stopped");
  enable(
    "composer-start",
    state.connected &&
      !state.mutationBusy &&
      !state.runs.some((run) => isWorking(run.status)),
  );
  show("composer-submit", !status.working);
  enable("composer-submit", status.canSend);
  const cancel = byId<HTMLButtonElement>("cancel-run");
  const active = state.runs.find((run) => isWorking(run.status));
  show("cancel-run", status.working);
  cancel.disabled =
    !state.connected || state.mutationBusy || active?.status === "cancelling";
  cancel.title =
    active?.status === "cancelling" ? "Stopping…" : "Stop this run";
  show("pending-bar", !!pendingHere);
  enable("pending-retry", !!pendingHere && state.connected && !state.sending);
  setClass(byId("composer-form"), "is-full", local && mode === "full");
}

async function send(): Promise<void> {
  const workspace = currentWorkspace();
  if (!workspace || state.sending) return;
  const retrying = state.pending?.workspaceId === workspace.id;
  if (state.pending && !retrying) {
    actions.showError(
      new Error(
        "Another workspace has a message that was not confirmed. Open it and retry before sending another.",
      ),
    );
    return;
  }
  const status = gate();
  if (!retrying && !status.canSend) return;
  if (retrying && !state.connected) return;
  const local = isLocal(workspace);
  state.pending ??= {
    workspaceId: workspace.id,
    task: input().value.trim(),
    maxRuntimeMs: limit(),
    key: crypto.randomUUID(),
    ...(local ? { permissionMode: permission() } : {}),
  };
  if (!state.pending.task) {
    state.pending = null;
    return;
  }
  persist();
  state.sending = true;
  actions.clearError();
  actions.render();
  const submission = state.pending;
  try {
    const run = await api().createRun(
      submission.workspaceId,
      submission.task,
      submission.maxRuntimeMs,
      submission.key,
      submission.permissionMode,
    );
    state.pending = null;
    persist();
    if (composerWorkspace === submission.workspaceId) input().value = "";
    if (state.drafts.get(submission.workspaceId)?.trim() === submission.task)
      state.drafts.delete(submission.workspaceId);
    state.permission.set(submission.workspaceId, permissionAfterSend());
    if (state.selectedWorkspace === run.workspaceId) {
      state.runs = mergeHistory(state.runs, [run]);
      state.seen.set(run.id, run.status);
    }
  } catch (error) {
    if (rejected(error)) {
      state.pending = null;
      persist();
      if (composerWorkspace === submission.workspaceId)
        input().value = submission.task;
    }
    actions.showError(error);
  } finally {
    state.sending = false;
    actions.render();
    void actions.refresh();
  }
}

function setPermission(mode: PermissionMode): void {
  state.permission.set(state.selectedWorkspace, mode);
  actions.render();
}

export function wireComposer(): void {
  byId("composer-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void send();
  });
  input().addEventListener("input", () => {
    enable("composer-submit", gate().canSend);
  });
  input().addEventListener("keydown", (event) => {
    const key = event as KeyboardEvent;
    if (key.key !== "Enter" || key.isComposing || key.shiftKey || key.altKey)
      return;
    key.preventDefault();
    void send();
  });
  byId("pending-retry").addEventListener("click", () => void send());
  byId("limit-select").addEventListener("change", () => {
    state.limits.set(
      state.selectedWorkspace,
      Number(byId<HTMLSelectElement>("limit-select").value),
    );
  });
  byId("permission-toggle").addEventListener("click", () => {
    if (permission() === "full") return setPermission("edits");
    if (state.confirmedFull.has(state.selectedWorkspace))
      return setPermission("full");
    byId("full-access-confirm").showPopover();
    byId("full-access-keep").focus();
  });
  byId("full-access-allow").addEventListener("click", () => {
    state.confirmedFull.add(state.selectedWorkspace);
    byId("full-access-confirm").hidePopover();
    setPermission("full");
    input().focus();
  });
  byId("full-access-keep").addEventListener("click", () => {
    byId("full-access-confirm").hidePopover();
    byId("permission-toggle").focus();
  });
  byId("cancel-run").addEventListener("click", () => {
    const run = state.runs.find((item) => isWorking(item.status));
    if (!run) return;
    void actions.mutate(async () => {
      const updated = await api().cancelRun(run.id);
      if (state.selectedWorkspace === updated.workspaceId)
        state.runs = mergeHistory(state.runs, [updated]);
    });
  });
}
