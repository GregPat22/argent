import type { WorkspaceChange, WorkspaceChanges } from "../src/domain.js";
import { api } from "./actions.js";
import { byId, enable, h, setText, show } from "./dom.js";
import {
  type DiffLine,
  diffStats,
  isLocal,
  readableDiff,
  readableError,
} from "./model.js";
import { currentWorkspace, state } from "./state.js";

let generation = 0;
let workspaceId = "";
let connected = false;
let pending = false;
let result: WorkspaceChanges | null = null;
let selected = "";

const dialog = () => byId<HTMLDialogElement>("changes-dialog");
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
/** Unchanged lines kept around each change, as Git shows them. */
const CONTEXT = 3;

/** One text-only span per line; the numbers live in an attribute, so copying skips them. */
function lineSpan(line: DiffLine): HTMLElement {
  return h("span", {
    class: `diff-line diff-${line.kind}`,
    text: displayText(line.text),
    data: {
      gutter: `${line.old ?? ""}`.padStart(5) + `${line.new ?? ""}`.padStart(5),
    },
  });
}

/**
 * Shows the changed lines with three lines of context. Longer unchanged runs
 * fold behind a control that restores every line in place, so nothing the
 * service returned is out of reach.
 */
function showDiff(pre: HTMLElement, diff: string): void {
  const { lines, exact } = readableDiff(diff);
  if (!exact)
    pre.append(
      lineSpan({
        kind: "note",
        text: "Part of this file was too large to compare line by line and is shown as removed and re-added.",
        old: null,
        new: null,
      }),
    );
  const changed = (line: DiffLine | undefined) =>
    line?.kind === "add" || line?.kind === "del";
  let k = 0;
  while (k < lines.length) {
    if (lines[k]!.kind !== "context") {
      pre.append(lineSpan(lines[k++]!));
      continue;
    }
    let end = k;
    while (lines[end]?.kind === "context") end++;
    const keepStart = changed(lines[k - 1]) ? CONTEXT : 0;
    const keepEnd = changed(lines[end]) ? CONTEXT : 0;
    const hidden = end - k - keepStart - keepEnd;
    if (hidden < 4) {
      for (; k < end; k++) pre.append(lineSpan(lines[k]!));
      continue;
    }
    for (const line of lines.slice(k, k + keepStart))
      pre.append(lineSpan(line));
    const folded = lines.slice(k + keepStart, end - keepEnd);
    const fold = h("button", {
      class: "diff-fold",
      text: `Show ${folded.length} unchanged lines`,
      attrs: { type: "button" },
      on: {
        click: () => {
          let anchor: HTMLElement = fold;
          for (const line of folded) {
            const span = lineSpan(line);
            anchor.after(span);
            anchor = span;
          }
          fold.remove();
          pre.focus();
        },
      },
    });
    pre.append(fold);
    for (const line of lines.slice(end - keepEnd, end))
      pre.append(lineSpan(line));
    k = end;
  }
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
  else showDiff(pre, file.diff);
  pre.scrollTop = 0;
  byId("changes-diff").scrollLeft = 0;
}
async function readChanges(): Promise<void> {
  const workspace = currentWorkspace();
  if (!dialog().open || pending || !state.connected || !isLocal(workspace))
    return;
  const previous = selected;
  clear();
  const version = generation;
  const id = workspace!.id;
  pending = true;
  status("Reading workspace changes…");
  try {
    const changes = await api().workspaceChanges(id);
    if (
      version !== generation ||
      !dialog().open ||
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
  } catch (error) {
    if (
      version !== generation ||
      !dialog().open ||
      state.selectedWorkspace !== id
    )
      return;
    clear();
    status(readableError(error));
  }
}

/** Called during ordinary renders: invalidates, but never performs repository reads. */
export function renderChanges(): void {
  const workspace = currentWorkspace();
  show("workspace-changes", !!workspace);
  enable("workspace-changes", !!workspace && !workspace.archiveStatus);
  if (!dialog().open) return;
  if (workspaceId !== state.selectedWorkspace || workspace?.archiveStatus) {
    closeChanges();
    return;
  }
  if (connected !== state.connected) {
    connected = state.connected;
    clear();
    status(
      connected
        ? "Service reconnected. Refresh to read workspace changes."
        : "The local service is disconnected. Reconnect, then refresh changes.",
    );
  }
}
function closeChanges(): void {
  clear();
  dialog().close();
  byId("workspace-changes").focus();
}
export function wireChanges(): void {
  byId("workspace-changes").addEventListener("click", () => {
    if (
      !currentWorkspace() ||
      currentWorkspace()?.archiveStatus ||
      dialog().open
    )
      return;
    clear();
    workspaceId = state.selectedWorkspace;
    connected = state.connected;
    setText("changes-base", "");
    dialog().showModal();
    byId("changes-close").focus();
    if (!isLocal(currentWorkspace()))
      status(
        "Scripted demo — no repository is checked out and no real diff is available.",
      );
    else if (!connected)
      status(
        "The local service is disconnected. Reconnect, then refresh changes.",
      );
    else void readChanges();
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
  byId("changes-close").addEventListener("click", closeChanges);
  dialog().addEventListener("cancel", (event) => {
    event.preventDefault();
    closeChanges();
  });
  dialog().addEventListener("close", () => {
    if (!dialog().open) clear();
  });
}
