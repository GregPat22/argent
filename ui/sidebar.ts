// Repositories and their workspaces, plus the local-service footer.
import { actions } from "./actions.js";
import { byId, enable, h, icon, setClass, setText, show } from "./dom.js";
import {
  groupWorkspaces,
  isWorking,
  rowLabel,
  workspaceDetail,
} from "./model.js";
import { state } from "./state.js";

let signature = "";

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
  const next = JSON.stringify([
    state.selectedWorkspace,
    state.workspaces,
    activity,
    state.connected,
  ]);
  if (next !== signature) {
    signature = next;
    const focused = (
      document as Document | undefined
    )?.activeElement?.getAttribute?.("data-workspace-id");
    list.replaceChildren();
    for (const group of groupWorkspaces(state.workspaces)) {
      const rows = h("div", {
        class: "repo-rows",
        attrs: { role: "list" },
      });
      for (const workspace of group.items) {
        const selected = workspace.id === state.selectedWorkspace;
        const row = h(
          "button",
          {
            class: `workspace-row${selected ? " selected" : ""}${workspace.state === "stopped" ? " is-stopped" : ""}`,
            title: workspace.local?.worktreePath ?? workspace.repository,
            data: { workspaceId: workspace.id },
            attrs: {
              type: "button",
              role: "listitem",
              "aria-current": selected ? "true" : undefined,
            },
            on: { click: () => actions.selectWorkspace(workspace.id) },
          },
          glyph(workspace.id, workspace.state === "stopped"),
          h("span", { class: "row-label", text: rowLabel(workspace) }),
        );
        if (workspace.state === "stopped")
          row.append(h("span", { class: "row-meta", text: "Stopped" }));
        rows.append(row);
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
                disabled: !state.connected || state.mutationBusy,
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
          rows,
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
      : "Nothing runs until the service is back. Your history is still here.",
  );
  const toggle = byId<HTMLButtonElement>("service-toggle");
  toggle.textContent = state.connected ? "Stop service…" : "Reconnect";
  toggle.disabled = state.mutationBusy || !window.argent;
  setClass(toggle, "danger", state.connected);
  toggle.setAttribute(
    "aria-label",
    state.connected
      ? "Stop local execution service"
      : "Reconnect to local execution service",
  );
}
