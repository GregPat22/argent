// Repositories and their workspaces, plus the local-service footer.
import { actions } from "./actions.js";
import { byId, enable, h, icon, setClass, setText, show } from "./dom.js";
import {
  archiveLabel,
  groupWorkspaces,
  isWorking,
  rowLabel,
  workspaceDetail,
} from "./model.js";
import { state } from "./state.js";

let signature = "";
let selection = "";
/** Rows of the current build, so a new selection can update them in place. */
const rows = new Map<string, { row: HTMLElement; glyph: HTMLElement }>();

/** The selected workspace's activity glyph; other workspaces show their state. */
function glyph(workspaceId: string, stopped: boolean): HTMLElement {
  if (workspaceId === state.selectedWorkspace) {
    if (state.runs.some((run) => run.status === "needs_attention"))
      return h("span", {
        class: "row-glyph attention",
        attrs: { "aria-label": "Needs review", role: "img" },
      });
    if (state.connected && state.runs.some((run) => isWorking(run.status)))
      return h(
        "span",
        {
          class: "row-glyph working",
          attrs: { "aria-label": "Working", role: "img" },
        },
        icon("loader-circle"),
      );
  }
  return h("span", {
    class: `row-glyph${stopped ? " stopped" : ""}`,
    attrs: { "aria-label": stopped ? "Stopped" : "Ready", role: "img" },
  });
}

export function renderSidebar(): void {
  const list = byId("workspace-list");
  const activity = state.runs
    .filter((run) => isWorking(run.status) || run.status === "needs_attention")
    .map((run) => run.status)
    .join(",");
  // Selection is kept out of the structure: choosing another workspace moves
  // the highlight on the existing rows, so it can transition.
  const next = JSON.stringify([state.workspaces, activity, state.connected]);
  if (next === signature && selection !== state.selectedWorkspace) {
    selection = state.selectedWorkspace;
    for (const [id, entry] of rows) {
      const selected = id === selection;
      setClass(entry.row, "selected", selected);
      entry.row.setAttribute("aria-current", String(selected));
      const stopped =
        state.workspaces.find((workspace) => workspace.id === id)?.state ===
        "stopped";
      const fresh = glyph(id, stopped);
      entry.glyph.replaceWith(fresh);
      entry.glyph = fresh;
    }
  }
  if (next !== signature) {
    signature = next;
    selection = state.selectedWorkspace;
    rows.clear();
    const focused = (
      document as Document | undefined
    )?.activeElement?.getAttribute?.("data-workspace-id");
    list.replaceChildren();
    for (const group of groupWorkspaces(state.workspaces)) {
      const items = h("ul", {
        class: "repo-rows",
      });
      for (const workspace of group.items) {
        const selected = workspace.id === state.selectedWorkspace;
        const mark = glyph(workspace.id, workspace.state === "stopped");
        const row = h(
          "button",
          {
            class: `workspace-row${selected ? " selected" : ""}${workspace.state === "stopped" ? " is-stopped" : ""}`,
            title: workspace.archiveStatus
              ? workspace.repository
              : (workspace.local?.worktreePath ?? workspace.repository),
            data: { workspaceId: workspace.id },
            attrs: {
              type: "button",
              "aria-current": String(selected),
            },
            on: { click: () => actions.selectWorkspace(workspace.id) },
          },
          mark,
          h("span", { class: "row-label", text: rowLabel(workspace) }),
        );
        if (workspace.state === "stopped")
          row.append(
            h("span", {
              class: "row-meta",
              text: archiveLabel(workspace) || "Stopped",
            }),
          );
        rows.set(workspace.id, { row, glyph: mark });
        items.append(h("li", {}, row));
      }
      const first = group.items[0]!;
      const head = h(
        "div",
        { class: "repo-head" },
        icon(group.demo ? "flask-conical" : "folder-git-2", "repo-icon"),
        h("span", {
          class: "repo-name",
          text: group.label,
          title: group.demo
            ? workspaceDetail(first)
            : (first.local?.repositoryPath ?? ""),
        }),
      );
      if (group.demo)
        head.append(h("span", { class: "repo-tag", text: "Demo" }));
      else
        head.append(
          h(
            "button",
            {
              class: "icon-button repo-add",
              title: `New workspace from ${group.label}`,
              attrs: {
                type: "button",
                "aria-label": `New workspace from ${group.label}`,
              },
              on: { click: () => actions.newWorkspaceFrom(first.id) },
            },
            icon("plus"),
          ),
        );
      list.append(
        h(
          "section",
          {
            class: "repo-group",
            attrs: { "aria-label": group.label },
          },
          head,
          items,
        ),
      );
    }
    if (focused)
      for (const group of list.children)
        for (const row of (
          group as HTMLElement
        ).querySelectorAll?.<HTMLElement>("[data-workspace-id]") ?? [])
          if (row.dataset.workspaceId === focused) row.focus();
  }
  // The mutation lock can change while the repository rows stay identical.
  for (const add of list.querySelectorAll<HTMLButtonElement>(".repo-add"))
    add.disabled = !state.connected || state.mutationBusy;
  show("sidebar-empty", state.workspaces.length === 0);
  show("more-workspaces", !!state.workspaceCursor);
  enable("more-workspaces", state.connected && !state.mutationBusy);
  enable("new-workspace", state.connected && !state.mutationBusy);
  renderService();
}

function renderService(): void {
  setText(
    "service-status",
    state.connected ? "Service online" : "Service offline",
  );
  const dot = byId("service-indicator");
  dot.className = `status-dot ${state.connected ? "online" : "offline"}`;
  setText(
    "service-detail",
    state.connected
      ? `Runs keep going when you close this window.${state.syncedAt ? " Updated just now." : ""}`
      : state.otherBuild
        ? "A service from a different Argent build is still running. Stop it, then reconnect to start this build's service."
        : "Nothing runs until the service is back. Your history is still here.",
  );
  const stoppable = state.connected || state.otherBuild;
  const toggle = byId<HTMLButtonElement>("service-toggle");
  toggle.textContent = stoppable ? "Stop service…" : "Reconnect";
  toggle.disabled = state.mutationBusy || !window.argent;
  setClass(toggle, "danger", stoppable);
  toggle.setAttribute(
    "aria-label",
    stoppable
      ? "Stop local execution service"
      : "Reconnect to local execution service",
  );
}
