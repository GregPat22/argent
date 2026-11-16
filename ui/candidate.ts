import { openChecks } from "./checks.js";
import type { CandidateReviewView } from "../src/desktop/contracts.js";
import { api } from "./actions.js";
import { argumentText } from "./commands.js";
import { byId, enable, h, setText, show } from "./dom.js";
import { day, isLocal, plural, readableError, rejected } from "./model.js";
import { currentWorkspace, state } from "./state.js";

let generation = 0;
let workspaceId = "";
let connected = false;
let pending = false;
let view: CandidateReviewView | null = null;
const keys = new Map<string, string>();
const checkKeys = new Map<string, string>();
const dialog = () => byId<HTMLDialogElement>("candidate-dialog");
function clear(): void {
  generation++;
  pending = false;
  view = null;
  byId("candidate-files").replaceChildren();
  setText("candidate-consent-status", "");
  show("candidate-content", false);
}
function eligible(shown: CandidateReviewView): boolean {
  return (
    !!shown.configuration.config.commands.test &&
    !shown.files.some((file) => file.binary)
  );
}
function status(message: string): void {
  setText("candidate-status", message);
  byId("candidate-status").setAttribute("aria-busy", String(pending));
  enable(
    "candidate-refresh",
    state.connected && isLocal(currentWorkspace()) && !pending,
  );
  enable(
    "candidate-consent",
    state.connected && !pending && !!view && eligible(view) && !view.consent,
  );
  enable("candidate-run", state.connected && !pending && !!view?.consent);
  setText(
    "candidate-consent",
    view?.consent ? "Consent recorded" : "Record consent for this commit",
  );
}
function stale(version: number, id: string): boolean {
  return (
    version !== generation ||
    !dialog().open ||
    state.selectedWorkspace !== id ||
    !state.connected
  );
}
/** Preserve line breaks; make all other nonprinting/non-ASCII characters explicit. */
function diffText(text: string): string {
  return text
    .split("\n")
    .map((line) => argumentText(line).slice(1, -1))
    .join("\n");
}
function display(shown: CandidateReviewView): void {
  const content = byId("candidate-files");
  content.append(
    h("p", {
      class: "mono",
      text: `Base ${shown.baseSha}\nCommit ${shown.headSha}\nTree ${shown.treeId}`,
    }),
  );
  content.append(
    h("p", {
      text: `argent.json in this commit: ${shown.configurationState}. Commands below always come from the approved base. Argent cannot identify which changed files they execute, so review the complete change set.`,
    }),
  );
  for (const action of ["setup", "test"] as const) {
    const command = shown.configuration.config.commands[action];
    if (!command) continue;
    content.append(
      h(
        "section",
        { class: "command-action" },
        h("h3", { text: action }),
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
  content.append(
    h("p", {
      text: `${plural(shown.files.length, "changed file")}. Text uses visible escapes for backslashes, control characters and non-ASCII characters; line breaks are preserved.`,
    }),
  );
  for (const file of shown.files) {
    const name = file.previousPath
      ? `${argumentText(file.previousPath)} → ${argumentText(file.path)}`
      : argumentText(file.path);
    content.append(
      h(
        "section",
        { class: "candidate-file" },
        h("h3", {
          text: `${file.status} · ${name}${file.configuration ? " · command configuration" : ""}`,
        }),
        h("p", {
          class: "mono",
          text: `Before: ${file.oldMode ?? "absent"} · ${file.oldBlobId ?? "no blob"} · ${file.oldBytes ?? 0} bytes\nAfter: ${file.newMode ?? "absent"} · ${file.newBlobId ?? "no blob"} · ${file.newBytes ?? 0} bytes`,
        }),
        h("pre", {
          text: file.binary
            ? "Binary or non-UTF-8 content is not displayed. This change blocks consent."
            : file.diff
              ? diffText(file.diff)
              : "No text content changed; review the metadata above.",
        }),
      ),
    );
  }
  if (!shown.files.length)
    content.append(h("p", { text: "No changes from the base commit." }));
  setText(
    "candidate-consent-status",
    shown.consent
      ? `Consent recorded ${day(shown.consent.createdAt)} and matches this reading. Run checks is a separate action.`
      : "Consent applies only to these changes and this exact commit. It records your review; it does not start a check.",
  );
  show("candidate-content", true);
}
async function read(): Promise<void> {
  const workspace = currentWorkspace();
  if (!dialog().open || pending || !state.connected || !isLocal(workspace))
    return;
  clear();
  const version = generation,
    id = workspace!.id;
  pending = true;
  status("Reading the complete committed changes…");
  try {
    const shown = await api().candidateReview(id);
    if (stale(version, id)) return;
    if (
      shown.kind !== "local-candidate-review" ||
      shown.workspaceId !== id ||
      shown.baseSha !== workspace!.local!.baseSha ||
      shown.executionAllowed !== false ||
      shown.tested !== false
    )
      throw new Error(
        "The service returned a review for a different workspace or base. Refresh to try again.",
      );
    view = shown;
    pending = false;
    display(shown);
    status(
      !shown.configuration.config.commands.test
        ? "The approved configuration has no test command. Consent is unavailable."
        : shown.summary.binaryFiles
          ? "Binary or non-UTF-8 changes cannot receive consent. No partial review is accepted."
          : shown.consent
            ? "Consent matches this reading. Run checks starts setup then test in a fresh checkout."
            : "Read the commands and every changed file before recording consent.",
    );
  } catch (error) {
    if (stale(version, id)) return;
    clear();
    status(readableError(error));
  }
}
async function consent(): Promise<void> {
  const shown = view;
  if (
    !dialog().open ||
    pending ||
    !state.connected ||
    !shown ||
    shown.consent ||
    !eligible(shown) ||
    shown.workspaceId !== state.selectedWorkspace
  )
    return;
  const id = shown.workspaceId,
    identity = shown.identity;
  const name = `${id}:${identity}`;
  let key = keys.get(name);
  if (!key) {
    key = crypto.randomUUID();
    keys.set(name, key);
  }
  const version = generation;
  pending = true;
  status("Recording consent for the displayed commit…");
  byId("candidate-close").focus();
  try {
    await api().consentCandidate(id, identity, key);
  } catch (error) {
    if (stale(version, id)) return;
    clear();
    status(
      rejected(error)
        ? `${readableError(error).replace(/\.$/, "")}. Refresh to review again.`
        : "Argent could not confirm that consent was recorded. Refresh to read the current state. Retrying this review records it only once.",
    );
    return;
  }
  if (stale(version, id)) return;
  pending = false;
  await read();
}
function close(): void {
  clear();
  dialog().close();
  byId("workspace-commands").focus();
}
export function renderCandidate(): void {
  if (!dialog().open) return;
  if (workspaceId !== state.selectedWorkspace) {
    close();
    return;
  }
  if (connected !== state.connected) {
    connected = state.connected;
    clear();
    status(
      connected
        ? "Service reconnected. Refresh to read the committed changes."
        : "The local service is disconnected. Reconnect, then refresh.",
    );
  }
}
export function wireCandidate(): void {
  byId("candidate-run").addEventListener("click", () => {
    if (
      !dialog().open ||
      pending ||
      !state.connected ||
      !view?.consent ||
      view.workspaceId !== state.selectedWorkspace
    )
      return;
    const id = view.workspaceId,
      consent = view.consent.id,
      version = generation;
    const name = `${id}:${consent}`;
    let key = checkKeys.get(name);
    if (!key) {
      key = crypto.randomUUID();
      checkKeys.set(name, key);
    }
    pending = true;
    status("Requesting setup and test for the reviewed commit…");
    void api()
      .runChecks(id, consent, key)
      .then(() => {
        if (stale(version, id)) return;
        // Preserve the key until the receipt is observed. A later explicit click
        // is a new check, never a retry of an uncertain request.
        checkKeys.delete(name);
        close();
        openChecks();
      })
      .catch((error: unknown) => {
        if (stale(version, id)) return;
        pending = false;
        status(
          `${readableError(error)} Open Checks or refresh before retrying. Retrying this request will not run it twice.`,
        );
      });
  });
  byId("commands-review").addEventListener("click", () => {
    if (
      !state.connected ||
      !isLocal(currentWorkspace()) ||
      dialog().open ||
      byId<HTMLButtonElement>("commands-review").disabled
    )
      return;
    byId("commands-close").click();
    clear();
    workspaceId = state.selectedWorkspace;
    connected = state.connected;
    dialog().showModal();
    byId("candidate-close").focus();
    void read();
  });
  byId("candidate-refresh").addEventListener("click", () => void read());
  byId("candidate-consent").addEventListener("click", () => void consent());
  byId("candidate-close").addEventListener("click", close);
  dialog().addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog().addEventListener("close", () => {
    if (!dialog().open) clear();
  });
}
