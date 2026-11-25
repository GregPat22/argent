import type { WorkspaceChange, WorkspaceChanges } from "../src/domain.js";
import { api } from "./actions.js";
import { byId, enable, h, setClass, setText, show } from "./dom.js";
import { renderDiff } from "./diff-view.js";
import { diffStats, isLocal, isWorking, readableError } from "./model.js";
import { currentWorkspace, state } from "./state.js";

let generation = 0;
let workspaceId = "";
let connected = false;
let pending = false;
let result: WorkspaceChanges | null = null;
let selected = "";
/** The panel is docked beside the conversation and stays open while you work. */
let open = false;
/** The last agent-turn state seen: a finished turn reads the changes again. */
let seenTurns = "";
/** Preserve line structure but make invisible controls and bidi overrides visible. */
export function displayText(text: string): string {
  return text.replace(
    /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
const fileName = (path: string) => displayText(JSON.stringify(path));

function lineCounts(counted: { added: number; removed: number }): string {
  return `+${counted.added} −${counted.removed}`;
}

function clear(): void {
  generation++;
  pending = false;
  empty();
}
/** Removes what the panel shows, without invalidating a reading in flight. */
function empty(): void {
  result = null;
  selected = "";
  byId("changes-files").replaceChildren();
  byId("changes-diff").replaceChildren();
  setText("changes-diff", "");
  setText("changes-file-title", "");
  setText("changes-meta", "");
  setText("changes-base", "");
  show("changes-content", false);
}
function status(text: string): void {
  setText("changes-status", text);
  byId("changes-status").setAttribute("aria-busy", String(pending));
  enable(
    "changes-refresh",
    state.connected && isLocal(currentWorkspace()) && !pending,
  );
}
function selectFile(file: WorkspaceChange): void {
  selected = file.path;
  for (const button of byId(
    "changes-files",
  ).querySelectorAll<HTMLButtonElement>("button"))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.path === selected),
    );
  setText(
    "changes-file-title",
    `${file.status}: ${file.previousPath ? `${fileName(file.previousPath)} → ` : ""}${fileName(file.path)}`,
  );
  setText(
    "changes-meta",
    `Mode ${file.oldMode ?? "absent"} → ${file.newMode ?? "absent"}`,
  );
  const pre = byId("changes-diff");
  pre.replaceChildren();
  pre.textContent = "";
  if (file.binary)
    pre.textContent = "Binary or non-UTF-8 content. Text preview unavailable.";
  else if (!file.diff)
    pre.textContent = "No text difference; file metadata changed.";
  else renderDiff(pre, file.diff, displayText, true);
  pre.scrollTop = 0;
  byId("changes-diff").scrollLeft = 0;
}
/**
 * Reads the workspace's changes. Opening and Refresh clear the panel while
 * reading; `auto`, after an agent turn ends, keeps it until the new reading
 * arrives, then keeps the selected file and its scroll position.
 */
async function readChanges(auto = false): Promise<void> {
  const workspace = currentWorkspace();
  if (!open || pending || !state.connected || !isLocal(workspace)) return;
  const previous = selected;
  const scroll = byId("changes-diff").scrollTop;
  if (auto) generation++;
  else clear();
  const version = generation;
  const id = workspace!.id;
  pending = true;
  status(
    auto
      ? "Reading workspace changes after the agent's turn…"
      : "Reading workspace changes…",
  );
  try {
    const changes = await api().workspaceChanges(id);
    if (
      version !== generation ||
      !open ||
      state.selectedWorkspace !== id ||
      !state.connected
    )
      return;
    if (
      changes.workspaceId !== id ||
      changes.baseSha !== workspace!.local!.baseSha ||
      changes.simulation !== false ||
      changes.tested !== false ||
      changes.kind !== "workspace-changes" ||
      changes.consistency !== "live"
    )
      throw new Error(
        "The service returned changes for a different workspace or base. Refresh to try again.",
      );
    empty();
    result = changes;
    pending = false;
    const total = { added: 0, removed: 0 };
    for (const file of changes.files) {
      const counted = diffStats(file.binary ? "" : file.diff);
      total.added += counted.added;
      total.removed += counted.removed;
    }
    status(
      changes.files.length
        ? `${changes.files.length} changed ${changes.files.length === 1 ? "file" : "files"} · ${lineCounts(total)}. Live observation — not tested. Refresh to read again.`
        : "No changes against the workspace base. Live observation — not tested.",
    );
    setText(
      "changes-base",
      `Base ${changes.baseSha.slice(0, 12)} · HEAD ${changes.headSha.slice(0, 12)}`,
    );
    for (const file of changes.files) {
      // The quoted label is split at its last slash so the file name stands
      // out; both parts are the same escaped text, shown whole.
      const label = fileName(file.path);
      const slash = label.lastIndexOf("/") + 1;
      const button = h(
        "button",
        {
          class: "changes-file",
          data: { path: file.path },
          attrs: { type: "button", "aria-pressed": "false" },
          on: {
            click: () => {
              if (result === changes) selectFile(file);
            },
          },
        },
        h("span", {
          class: `file-status file-${file.status}`,
          text: file.status,
        }),
        h(
          "span",
          { class: "file-name" },
          slash > 0 &&
            h("span", { class: "file-dir", text: label.slice(0, slash) }),
          h("span", { class: "file-base", text: label.slice(slash) }),
        ),
        h("span", {
          class: "file-counts",
          text: file.binary ? "binary" : lineCounts(diffStats(file.diff)),
        }),
      );
      byId("changes-files").append(button);
    }
    show("changes-content", changes.files.length > 0);
    const file =
      changes.files.find((item) => item.path === previous) ?? changes.files[0];
    if (file) selectFile(file);
    if (auto && file?.path === previous)
      byId("changes-diff").scrollTop = scroll;
  } catch (error) {
    if (version !== generation || !open || state.selectedWorkspace !== id)
      return;
    clear();
    status(readableError(error));
  }
}

/** Agent turns of the open workspace: unknown, working, or how many have run. */
function turns(): string {
  if (state.runsLoaded !== state.selectedWorkspace) return "";
  return state.runs.some((run) => isWorking(run.status))
    ? "working"
    : String(state.runs.length);
}
function setOpen(value: boolean): void {
  open = value;
  setClass(byId("changes-panel"), "is-open", value);
  setClass(byId("changes-scrim"), "is-open", value);
  setClass(byId("workspace-content"), "with-changes", value);
  setClass(byId("workspace-changes"), "is-active", value);
  byId("workspace-changes").setAttribute("aria-expanded", String(value));
}
/** Shows the selected workspace in the open panel and reads its changes. */
function start(): void {
  clear();
  workspaceId = state.selectedWorkspace;
  connected = state.connected;
  seenTurns = turns();
  setText("changes-base", "");
  if (!isLocal(currentWorkspace()))
    status(
      "Scripted demo — no repository is checked out and no real diff is available.",
    );
  else if (!connected)
    status(
      "The local service is disconnected. Reconnect, then refresh changes.",
    );
  else void readChanges();
}

/**
 * Called during ordinary renders. The open panel reads when it opens, when
 * another workspace is selected, after reconnecting and when an agent turn
 * ends; polling never reads on its own.
 */
export function renderChanges(): void {
  const workspace = currentWorkspace();
  show("workspace-changes", !!workspace);
  enable("workspace-changes", !!workspace && !workspace.archiveStatus);
  if (!open) return;
  if (!workspace || workspace.archiveStatus) {
    closeChanges(false);
    return;
  }
  if (workspaceId !== state.selectedWorkspace) {
    start();
    return;
  }
  if (connected !== state.connected) {
    connected = state.connected;
    seenTurns = turns();
    if (connected) void readChanges();
    else {
      clear();
      status(
        "The local service is disconnected. Reconnect, then refresh changes.",
      );
    }
    return;
  }
  const now = turns();
  if (now === seenTurns) return;
  const before = seenTurns;
  seenTurns = now;
  // A turn that ended (or a new finished one) may have changed files.
  if (before !== "" && now !== "" && now !== "working") void readChanges(true);
}
function closeChanges(focus = true): void {
  clear();
  setOpen(false);
  if (focus) byId("workspace-changes").focus();
}
export function wireChanges(): void {
  byId("workspace-changes").addEventListener("click", () => {
    if (open) {
      closeChanges();
      return;
    }
    if (!currentWorkspace() || currentWorkspace()?.archiveStatus) return;
    setOpen(true);
    start();
    byId("changes-close").focus();
  });
  byId("changes-refresh").addEventListener("click", () => void readChanges());
  // Up and down move through the file list and show each file's diff.
  byId("changes-files").addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    if (key !== "ArrowDown" && key !== "ArrowUp") return;
    const buttons = Array.from(
      byId("changes-files").querySelectorAll<HTMLButtonElement>("button"),
    );
    const index = buttons.findIndex(
      (button) => button === document.activeElement,
    );
    const next = buttons[index + (key === "ArrowDown" ? 1 : -1)];
    if (index < 0 || !next) return;
    event.preventDefault();
    next.focus();
    next.click();
  });
  byId("changes-close").addEventListener("click", () => closeChanges());
  // Escape inside the panel closes it; on narrow windows so does the scrim.
  byId("changes-panel").addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key !== "Escape" || !open) return;
    event.preventDefault();
    event.stopPropagation();
    closeChanges();
  });
  byId("changes-scrim").addEventListener("click", () => closeChanges());
}
