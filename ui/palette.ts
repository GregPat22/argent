// Cmd+K: jump to a loaded workspace or run one of the few app actions.
import { actions } from "./actions.js";
import { byId, h, icon } from "./dom.js";
import { groupWorkspaces, isLocal, rowLabel } from "./model.js";
import { currentWorkspace, state } from "./state.js";

interface Entry {
  label: string;
  detail: string;
  symbol: string;
  run: () => void;
}

function entries(): Entry[] {
  const list: Entry[] = [];
  for (const group of groupWorkspaces(state.workspaces))
    for (const workspace of group.items)
      list.push({
        label: `${group.label} / ${rowLabel(workspace)}`,
        detail: workspace.local?.worktreePath ?? workspace.repository,
        symbol: group.demo ? "flask-conical" : "git-branch",
        run: () => actions.selectWorkspace(workspace.id),
      });
  const current = currentWorkspace();
  list.push({
    label: "Add a repository",
    detail: "Choose a local Git repository",
    symbol: "folder-plus",
    run: () => actions.addRepository(),
  });
  if (current && isLocal(current))
    list.push({
      label: "New workspace from this repository",
      detail: "A fresh branch and worktree",
      symbol: "plus",
      run: () => actions.newWorkspaceFrom(current.id),
    });
  list.push(
    {
      label: "Try a scripted demo",
      detail: "A simulation, no model or repository access",
      symbol: "flask-conical",
      run: () => actions.openDemo(),
    },
    {
      label: "Settings",
      detail: "Agent and local service",
      symbol: "settings-2",
      run: () => actions.openSettings(),
    },
  );
  return list;
}

function renderResults(): void {
  const query = byId<HTMLInputElement>("workspace-search")
    .value.trim()
    .toLowerCase();
  const results = byId("workspace-search-results");
  results.replaceChildren();
  for (const entry of entries()) {
    if (!`${entry.label} ${entry.detail}`.toLowerCase().includes(query))
      continue;
    results.append(
      h(
        "button",
        {
          class: "search-result",
          attrs: { type: "button" },
          on: {
            click: () => {
              byId<HTMLDialogElement>("navigation-dialog").close();
              entry.run();
            },
          },
        },
        icon(entry.symbol),
        h(
          "span",
          { class: "search-copy" },
          h("span", { class: "search-label", text: entry.label }),
          h("span", { class: "search-detail", text: entry.detail }),
        ),
      ),
    );
  }
  const count = results.children.length;
  byId("search-summary").textContent = count
    ? `${count} result${count === 1 ? "" : "s"} · ↑ ↓ to move · ↵ to open`
    : "No matches in loaded history. Older workspaces load from the sidebar.";
}

export function openPalette(): void {
  byId<HTMLInputElement>("workspace-search").value = "";
  renderResults();
  const dialog = byId<HTMLDialogElement>("navigation-dialog");
  if (!dialog.open) dialog.showModal();
  byId("workspace-search").focus();
}

export function wirePalette(): void {
  byId("search-nav").addEventListener("click", openPalette);
  byId("workspace-search").addEventListener("input", renderResults);
  byId("navigation-dialog").addEventListener("keydown", (event) => {
    const key = event as KeyboardEvent;
    const results = Array.from(
      byId("workspace-search-results").querySelectorAll<HTMLButtonElement>(
        "button",
      ),
    );
    if (!results.length) return;
    const current = results.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (key.key === "ArrowDown" || key.key === "ArrowUp") {
      key.preventDefault();
      const step = key.key === "ArrowDown" ? 1 : -1;
      const next =
        current < 0
          ? step > 0
            ? 0
            : results.length - 1
          : (current + step + results.length) % results.length;
      results[next]!.focus();
    } else if (
      key.key === "Enter" &&
      (key.target === byId("workspace-search") || current >= 0)
    ) {
      key.preventDefault();
      results[Math.max(current, 0)]!.click();
    }
  });
}
