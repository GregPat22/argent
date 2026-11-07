// Presentation-only navigation. Execution continues through the existing bridge.
function find<T extends HTMLElement = HTMLElement>(id: string): T {
  const target = document.getElementById(id);
  if (!target) throw new Error(`Missing shell element: ${id}`);
  return target as T;
}
function openDialog(id: string): void {
  const dialog = find<HTMLDialogElement>(id);
  if (!dialog.open) dialog.showModal();
}
function settingsSection(name: string): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-settings]",
  )) {
    const selected = button.dataset.settings === name;
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-current", selected ? "page" : "false");
    find(`settings-${button.dataset.settings}`).hidden = !selected;
  }
}
function tabs(
  attribute: "inspector" | "provider" | "terminal",
  panelId: (name: string) => string,
  select: (name: string) => void,
): void {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(`[data-${attribute}]`),
  );
  for (const [index, button] of buttons.entries()) {
    const name = button.getAttribute(`data-${attribute}`)!;
    const selected = button.getAttribute("aria-pressed") === "true";
    button.parentElement?.setAttribute("role", "tablist");
    button.setAttribute("role", "tab");
    button.id = `${attribute}-tab-${index}`;
    button.setAttribute("aria-controls", panelId(name));
    button.removeAttribute("aria-pressed");
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    const panel = find(panelId(name));
    panel.setAttribute("role", "tabpanel");
    panel.tabIndex = 0;
    if (selected) panel.setAttribute("aria-labelledby", button.id);
    button.addEventListener("click", () => {
      for (const tab of buttons) {
        tab.setAttribute("aria-selected", String(tab === button));
        tab.tabIndex = tab === button ? 0 : -1;
      }
      panel.setAttribute("aria-labelledby", button.id);
      select(name);
    });
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
              buttons.length;
      buttons[next]!.click();
      buttons[next]!.focus();
    });
  }
}
tabs(
  "inspector",
  (name) => `inspector-${name}`,
  (name) => {
    for (const panel of document.querySelectorAll<HTMLElement>(
      ".inspector-pane",
    ))
      panel.hidden = panel.id !== `inspector-${name}`;
  },
);
tabs(
  "provider",
  () => "provider-detail",
  (provider) => {
    find("provider-name").textContent = provider;
    find("provider-status").textContent =
      provider === "Claude Code"
        ? "Available · local repositories · official CLI"
        : provider === "Codex"
          ? "Not connected · planned next"
          : "Not connected · planned integration";
    find("provider-note").textContent =
      provider === "Claude Code"
        ? "Runs the claude CLI with your own sign-in. Argent never reads or stores it and never passes API-key variables, so a missing sign-in fails instead of billing an API account."
        : provider === "OpenCode"
          ? "OpenCode connects to its own provider catalog. Available subscription methods depend on the provider and execution environment."
          : `${provider} connections will use supported sign-in methods. Availability will be verified separately for local, self-hosted and managed execution.`;
  },
);
const terminalDescriptions: Record<string, string> = {
  Setup: "Setup output will appear here when repository actions are connected.",
  Run: "Repository run actions are coming later. No command is running here.",
  Terminal: "A terminal for this workspace's worktree will live here.",
};
tabs(
  "terminal",
  () => "terminal-output",
  (name) => {
    find("terminal-description").textContent = terminalDescriptions[name]!;
  },
);
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-settings]",
))
  button.addEventListener("click", () =>
    settingsSection(button.dataset.settings!),
  );
find("settings-open").addEventListener("click", () =>
  openDialog("settings-dialog"),
);
find("agent-picker").addEventListener("click", () => {
  settingsSection("agents");
  openDialog("settings-dialog");
});
find("create-nav").addEventListener("click", () =>
  find("new-workspace").click(),
);
for (const id of ["session-add", "detail-start"])
  find(id).addEventListener("click", () => find("new-task").click());
for (const id of ["inspect-artifact", "inspect-checks"])
  find(id).addEventListener("click", () => {
    find("verification-tab").click();
    find("verification-tab").focus();
  });
find("inspector-toggle").addEventListener("click", () => {
  const inspector = find("inspector");
  inspector.hidden = !inspector.hidden;
  const toggle = find("inspector-toggle");
  toggle.setAttribute("aria-expanded", String(!inspector.hidden));
  toggle.setAttribute(
    "aria-label",
    inspector.hidden ? "Show inspection panel" : "Hide inspection panel",
  );
  toggle.title = inspector.hidden
    ? "Show inspection panel"
    : "Hide inspection panel";
});
find("composer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (find<HTMLButtonElement>("new-task").disabled) return;
  const input = find<HTMLTextAreaElement>("composer-input");
  if (!input.value.trim()) {
    input.focus();
    return;
  }
  // Runtime review and pending submission identity remain owned by app.ts.
  find("new-task").click();
  const reviewed = find<HTMLTextAreaElement>("task-input");
  if (!reviewed.readOnly) reviewed.value = input.value.trim();
});
find("composer-input").addEventListener("input", () => {
  find<HTMLButtonElement>("composer-submit").disabled =
    find<HTMLButtonElement>("new-task").disabled ||
    !find<HTMLTextAreaElement>("composer-input").value.trim();
});
find("composer-input").addEventListener("keydown", (event) => {
  if (
    (event.metaKey || event.ctrlKey) &&
    event.key === "Enter" &&
    !event.isComposing
  ) {
    event.preventDefault();
    find<HTMLFormElement>("composer-form").requestSubmit();
  }
});
function renderSearch(): void {
  const query = find<HTMLInputElement>("workspace-search")
    .value.trim()
    .toLowerCase();
  const results = find("workspace-search-results");
  results.replaceChildren();
  for (const workspace of document.querySelectorAll<HTMLButtonElement>(
    "[data-workspace-id]",
  )) {
    if (
      !`${workspace.textContent} ${workspace.title}`
        .toLowerCase()
        .includes(query)
    )
      continue;
    const button = document.createElement("button");
    button.className = "search-result";
    button.textContent = workspace.title.replace("https://github.com/", "");
    button.addEventListener("click", () => {
      workspace.click();
      find<HTMLDialogElement>("navigation-dialog").close();
    });
    results.append(button);
  }
  const count = results.children.length;
  find("search-summary").textContent = count
    ? `${count} workspace${count === 1 ? "" : "s"} in loaded history · ↑ ↓ to navigate · Enter to open`
    : "No matching workspaces in loaded history.";
  if (!count)
    results.textContent =
      "Try another repository name, load more history from the sidebar, or create a workspace.";
}
function openNavigation(): void {
  find<HTMLInputElement>("workspace-search").value = "";
  renderSearch();
  openDialog("navigation-dialog");
  find("workspace-search").focus();
}
find("home-nav").addEventListener("click", openNavigation);
find("brand-home").addEventListener("click", openNavigation);
find("search-nav").addEventListener("click", openNavigation);
find("workspace-search").addEventListener("input", renderSearch);
find("navigation-dialog").addEventListener("keydown", (event) => {
  const results = Array.from(
    find("workspace-search-results").querySelectorAll<HTMLButtonElement>(
      "button",
    ),
  );
  if (!results.length) return;
  const current = results.indexOf(document.activeElement as HTMLButtonElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const next =
      current < 0
        ? event.key === "ArrowDown"
          ? 0
          : results.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + results.length) %
          results.length;
    results[next]!.focus();
  } else if (
    event.key === "Enter" &&
    (event.target === find("workspace-search") || current >= 0)
  ) {
    event.preventDefault();
    results[Math.max(current, 0)]!.click();
  }
});
document.addEventListener("keydown", (event) => {
  if (
    !(event.metaKey || event.ctrlKey) ||
    document.querySelector("dialog[open]")
  )
    return;
  const key = event.key.toLowerCase();
  if (key === "k" || (key === "h" && event.shiftKey)) {
    event.preventDefault();
    openNavigation();
  } else if (key === "n") {
    event.preventDefault();
    find("new-workspace").click();
  }
});
export {};
