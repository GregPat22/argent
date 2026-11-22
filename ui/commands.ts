// Review and approval of a repository's command configuration. The service
// reads it only when this dialog opens, on Refresh and after an approval.
// Nothing here runs a command: approval records a review.
import type { CommandConfigurationView } from "../src/desktop/contracts.js";
import { api } from "./actions.js";
import { byId, enable, h, setText, show } from "./dom.js";
import { day, isLocal, plural, readableError, rejected } from "./model.js";
import { currentWorkspace, state } from "./state.js";

const ACTIONS = [
  [
    "setup",
    "Runs first before checks or the run command, in a fresh checkout.",
  ],
  ["test", "Decides the check result for the exact commit."],
  [
    "run",
    "Runs in a fresh checkout after separate consent; its result is not test evidence.",
  ],
] as const;

let generation = 0;
let workspaceId = "";
let connected = false;
let pending = false;
let view: CommandConfigurationView | null = null;
/** One request key per reviewed configuration, reused when a retry is needed. */
const keys = new Map<string, string>();

const dialog = () => byId<HTMLDialogElement>("commands-dialog");

/**
 * One argument exactly as the process would receive it: quoted, with every
 * character outside printable ASCII escaped, so spaces, invisible characters
 * and look-alike letters cannot pass a review unseen.
 */
export function argumentText(argument: string): string {
  return JSON.stringify(argument).replace(
    /[^ -~]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function clear(): void {
  generation++;
  pending = false;
  view = null;
  byId("commands-list").replaceChildren();
  setText("commands-source", "");
  setText("commands-approval", "");
  show("commands-content", false);
  show("commands-example", false);
}
function status(text: string): void {
  setText("commands-status", text);
  byId("commands-status").setAttribute("aria-busy", String(pending));
  enable(
    "commands-refresh",
    state.connected && isLocal(currentWorkspace()) && !pending,
  );
  enable("commands-review", state.connected && !!view?.approval && !pending);
  enable(
    "commands-review-run",
    state.connected &&
      !!view?.approval &&
      !!view.configuration?.config.commands.run &&
      !pending,
  );
  const approvable = !!view?.configuration && !view.approval;
  setText(
    "commands-approve",
    view?.approval ? "Approved" : "Approve these commands",
  );
  enable("commands-approve", state.connected && approvable && !pending);
}
/** A late reply for a closed dialog, another workspace or an older reading. */
function stale(version: number, id: string): boolean {
  return (
    version !== generation ||
    !dialog().open ||
    state.selectedWorkspace !== id ||
    !state.connected
  );
}

function showConfiguration(shown: CommandConfigurationView): void {
  const configuration = shown.configuration!;
  setText(
    "commands-source",
    `argent.json · base ${configuration.source.baseSha.slice(0, 12)} · content SHA-256 ${configuration.source.sha256.slice(0, 12)}`,
  );
  for (const [action, purpose] of ACTIONS) {
    const command = configuration.config.commands[action];
    if (!command) continue;
    byId("commands-list").append(
      h(
        "section",
        { class: "command-action" },
        h("h3", { text: action }),
        h("p", {
          text: `${purpose} ${plural(command.argv.length, "argument")}, the first is the program.`,
        }),
        h(
          "ol",
          { class: "command-argv" },
          ...command.argv.map((argument) =>
            h("li", { text: argumentText(argument) }),
          ),
        ),
      ),
    );
  }
  setText(
    "commands-approval",
    shown.approval
      ? `Approved ${day(shown.approval.approvedAt)} for this repository and these exact bytes. A changed configuration needs a fresh approval.`
      : "Not approved. Approving records that you reviewed these commands for this repository. It does not run them.",
  );
  show("commands-content", true);
}

async function readConfiguration(): Promise<void> {
  const workspace = currentWorkspace();
  if (!dialog().open || pending || !state.connected || !isLocal(workspace))
    return;
  clear();
  const version = generation;
  const id = workspace!.id;
  pending = true;
  status("Reading the command configuration…");
  try {
    const shown = await api().commandConfiguration(id);
    if (stale(version, id)) return;
    if (
      shown.kind !== "local-command-configuration" ||
      shown.workspaceId !== id ||
      shown.executionAllowed !== false ||
      (shown.configuration &&
        shown.configuration.source.baseSha !== workspace!.local!.baseSha) ||
      (shown.approval && !shown.configuration)
    )
      throw new Error(
        "The service returned a configuration for a different workspace or base. Refresh to try again.",
      );
    view = shown;
    pending = false;
    if (!shown.configuration) {
      show("commands-example", true);
      status(
        "No argent.json at this workspace's base commit, so there is nothing to approve. Commit one like the example below, then create a workspace from that commit.",
      );
      return;
    }
    showConfiguration(shown);
    status(
      shown.approval
        ? "Read from the base commit. This configuration is approved. Review the commit before running checks."
        : "Read from the base commit. Review every argument before approving.",
    );
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

async function approve(): Promise<void> {
  const shown = view;
  if (
    !dialog().open ||
    pending ||
    !state.connected ||
    !shown?.configuration ||
    shown.approval ||
    shown.workspaceId !== state.selectedWorkspace
  )
    return;
  const id = shown.workspaceId;
  // The identity of exactly what is on screen. The service reads the commands
  // again and refuses if they no longer match it.
  const identity = shown.configuration.approvalCandidate.identity;
  const name = `${id}:${identity}`;
  let key = keys.get(name);
  if (!key) {
    key = crypto.randomUUID();
    keys.set(name, key);
  }
  const version = generation;
  pending = true;
  status("Recording your approval…");
  // The approve button is disabled from here on; keep focus inside the dialog.
  byId("commands-close").focus();
  try {
    await api().approveCommandConfiguration(id, identity, key);
  } catch (error) {
    if (
      version !== generation ||
      !dialog().open ||
      state.selectedWorkspace !== id
    )
      return;
    clear();
    status(
      rejected(error)
        ? `${readableError(error).replace(/\.$/, "")}. Nothing was approved. Refresh to read the configuration again.`
        : "Argent could not confirm that the approval was recorded. Refresh to read the current state. Approving again records it only once.",
    );
    return;
  }
  if (stale(version, id)) return;
  // A receipt is history. What is approved now comes from a fresh reading.
  pending = false;
  await readConfiguration();
}

/** Called during ordinary renders: invalidates, but never reads the repository. */
export function renderCommands(): void {
  const workspace = currentWorkspace();
  show("workspace-commands", !!workspace);
  enable("workspace-commands", !!workspace && !workspace.archiveStatus);
  if (!dialog().open) return;
  if (workspaceId !== state.selectedWorkspace || workspace?.archiveStatus) {
    closeCommands();
    return;
  }
  if (connected !== state.connected) {
    connected = state.connected;
    clear();
    status(
      connected
        ? "Service reconnected. Refresh to read the command configuration."
        : "The local service is disconnected. Reconnect, then refresh.",
    );
  }
}
function closeCommands(): void {
  clear();
  dialog().close();
  byId("workspace-commands").focus();
}
export function wireCommands(): void {
  byId("workspace-commands").addEventListener("click", () => {
    if (
      !currentWorkspace() ||
      currentWorkspace()?.archiveStatus ||
      dialog().open
    )
      return;
    clear();
    workspaceId = state.selectedWorkspace;
    connected = state.connected;
    dialog().showModal();
    byId("commands-close").focus();
    if (!isLocal(currentWorkspace()))
      status(
        "Scripted demo — no repository is checked out, so there is no command configuration.",
      );
    else if (!connected)
      status("The local service is disconnected. Reconnect, then refresh.");
    else void readConfiguration();
  });
  byId("commands-refresh").addEventListener(
    "click",
    () => void readConfiguration(),
  );
  byId("commands-approve").addEventListener("click", () => void approve());
  byId("commands-close").addEventListener("click", closeCommands);
  dialog().addEventListener("cancel", (event) => {
    event.preventDefault();
    closeCommands();
  });
  dialog().addEventListener("close", () => {
    if (!dialog().open) clear();
  });
}
