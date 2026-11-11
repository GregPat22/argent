import type { WorkspaceChange, WorkspaceChanges } from "../src/domain.js";
import { api } from "./actions.js";
import { byId, enable, h, setText, show } from "./dom.js";
import { isLocal, readableError } from "./model.js";
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

function clear(): void {
  generation++;
  pending = false;
  result = null;
  selected = "";
  byId("changes-files").replaceChildren();
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
  setText(
    "changes-diff",
    file.binary
      ? "Binary or non-UTF-8 content. Text preview unavailable."
      : displayText(file.diff) || "No text difference; file metadata changed.",
  );
  byId("changes-diff").scrollTop = 0;
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
    status(
      changes.files.length
        ? `${changes.files.length} changed ${changes.files.length === 1 ? "file" : "files"}. Live observation — not tested. Refresh to read again.`
        : "No changes against the workspace base. Live observation — not tested.",
    );
    setText(
      "changes-base",
      `Base ${changes.baseSha.slice(0, 12)} · HEAD ${changes.headSha.slice(0, 12)}`,
    );
    for (const file of changes.files) {
      const button = h("button", {
        class: "changes-file",
        text: `${file.status} · ${fileName(file.path)}`,
        data: { path: file.path },
        attrs: { type: "button", "aria-pressed": "false" },
        on: {
          click: () => {
            if (result === changes) selectFile(file);
          },
        },
      });
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
  enable("workspace-changes", !!workspace);
  if (!dialog().open) return;
  if (workspaceId !== state.selectedWorkspace) {
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
    if (!currentWorkspace() || dialog().open) return;
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
  byId("changes-close").addEventListener("click", closeChanges);
  dialog().addEventListener("cancel", (event) => {
    event.preventDefault();
    closeChanges();
  });
  dialog().addEventListener("close", () => {
    if (!dialog().open) clear();
  });
}
