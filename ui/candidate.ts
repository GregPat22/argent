import { openChecks } from "./checks.js";
import type { CandidateReviewView } from "../src/desktop/contracts.js";
import { api } from "./actions.js";
import { argumentText } from "./commands.js";
import { byId, enable, h, setText, show } from "./dom.js";
import { day, isLocal, plural, readableError, rejected } from "./model.js";
import { currentWorkspace, state } from "./state.js";

let generation = 0;
let runAction = false;
const command = () => (runAction ? "run" : "test");
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
    !!shown.configuration.config.commands[command()] &&
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
  setText("candidate-run", runAction ? "Start run command" : "Run checks");
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
function changeName(file: CandidateReviewView["files"][number]): string {
  return file.previousPath
    ? `${argumentText(file.previousPath)} → ${argumentText(file.path)}`
    : argumentText(file.path);
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
  const tests = shown.judgingChanges.testPaths;
  const report = h(
    "section",
    { class: "command-action" },
    h("h3", { text: "Judging changes" }),
    h("p", {
      text:
        tests === null
          ? "Tests · Not checkable. Neither commit contains a recognised JavaScript or TypeScript test path."
          : `Tests · ${plural(tests.length, "changed test path")} (JavaScript and TypeScript test paths).`,
    }),
  );
  const appendPaths = (paths: readonly number[]) => {
    for (const index of paths) {
      const file = shown.files[index]!;
      const link = file.oldMode === "120000" || file.newMode === "120000";
      report.append(
        h("p", {
          class: "mono",
          text: `${file.status} · ${changeName(file)}${link ? " · symbolic link" : ""}`,
        }),
      );
    }
  };
  appendPaths(tests ?? []);
  const skips = shown.judgingChanges.skips;
  if (skips) {
    report.append(
      h("p", {
        text: "Skip markers · Compared literal .skip calls and disabled-test aliases with quoted titles.",
      }),
    );
    if (skips.every((file) => file.entries?.length === 0))
      report.append(h("p", { text: "No new recognised skip markers." }));
    for (const { file, entries } of skips) {
      if (entries?.length === 0) continue;
      report.append(
        h("p", {
          class: "mono",
          text: `${changeName(shown.files[file]!)} · ${entries === null ? "skip markers not summarised" : "new skip markers"}`,
        }),
      );
      for (const entry of entries ?? [])
        report.append(
          h("p", {
            class: "mono",
            text: `${entry.marker} · line ${entry.line}`,
          }),
        );
    }
  }
  const commands = shown.judgingChanges.commandPaths;
  report.append(
    h("p", {
      text: `What the approved commands run · ${plural(commands.length, "changed configuration or workflow file")}. Checked the command file, recognised check configurations and GitHub Actions workflows.`,
    }),
  );
  appendPaths(commands);
  function appendNamed(
    findings: CandidateReviewView["judgingChanges"]["scripts"],
    label: string,
  ) {
    for (const { file, entries } of findings ?? []) {
      if (entries?.length === 0) continue;
      report.append(
        h("p", {
          class: "mono",
          text: `${changeName(shown.files[file]!)} · ${entries === null ? "changed and not summarised" : label}`,
        }),
      );
      for (const entry of entries ?? [])
        report.append(
          h("p", {
            class: "mono",
            text: `${entry.change} · ${argumentText(entry.name)}`,
          }),
        );
    }
  }
  const scripts = shown.judgingChanges.scripts;
  report.append(
    h("p", {
      text:
        scripts === null
          ? "npm scripts · Not checkable. Neither commit contains a package.json."
          : "npm scripts · Compared script definitions in changed package.json files.",
    }),
  );
  if (scripts && scripts.every((summary) => summary.entries?.length === 0))
    report.append(h("p", { text: "No npm script definitions changed." }));
  appendNamed(scripts, "npm scripts");
  const packages = shown.judgingChanges.packages;
  report.append(
    h("p", {
      text:
        packages === null
          ? "Dependency lockfiles · Not checkable. Neither commit contains an npm lockfile."
          : "Dependency lockfiles · Compared installed packages in changed npm v2/v3 lockfiles.",
    }),
  );
  if (packages && packages.every((file) => file.entries?.length === 0))
    report.append(h("p", { text: "No recognised package changes." }));
  for (const { file, entries } of packages ?? []) {
    if (entries?.length === 0) continue;
    report.append(
      h("p", {
        class: "mono",
        text: `${changeName(shown.files[file]!)} · ${entries === null ? "changed and not summarised" : "packages"}`,
      }),
    );
    for (const entry of entries ?? []) {
      report.append(
        h("p", {
          class: "mono",
          text: `${entry.change} · ${argumentText(entry.location)} · ${entry.before === null ? "absent" : argumentText(entry.before)} → ${entry.after === null ? "absent" : argumentText(entry.after)}${entry.newInstallScript ? " · newly declares an install script" : ""}${entry.resolution ? ` · source: ${entry.resolution.before ?? "absent"} → ${entry.resolution.after}` : ""}`,
        }),
      );
    }
  }
  const settings = shown.judgingChanges.registrySettings;
  report.append(
    h("p", {
      text:
        settings === null
          ? "Committed npm source settings · Not checkable. Neither commit contains a .npmrc file."
          : "Committed npm source settings · Compared registry, scoped registry and replace-registry-host assignments in changed .npmrc files.",
    }),
  );
  if (settings && settings.every((file) => file.entries?.length === 0))
    report.append(h("p", { text: "No recognised registry settings changed." }));
  appendNamed(settings, "registry settings");
  content.append(report);
  for (const action of ["setup", command()] as const) {
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
    const name = changeName(file);
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
      ? `Consent recorded ${day(shown.consent.createdAt)} for setup and ${command()}, and matches this reading. Starting it is a separate action.`
      : `Consent applies only to setup and ${command()} for these changes and this exact commit. It records your review; it does not start a command.`,
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
    const shown = await (runAction
      ? api().runCandidateReview(id)
      : api().candidateReview(id));
    if (stale(version, id)) return;
    if (
      shown.kind !== "local-candidate-review" ||
      shown.action !== (runAction ? "setup-run" : undefined) ||
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
      !shown.configuration.config.commands[command()]
        ? `The approved configuration has no ${command()} command. Consent is unavailable.`
        : shown.summary.binaryFiles
          ? "Binary or non-UTF-8 changes cannot receive consent. No partial review is accepted."
          : shown.consent
            ? `Consent matches this reading. ${runAction ? "Start run command" : "Run checks"} starts setup then ${command()} in a fresh checkout.`
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
  const name = `${runAction ? "run" : "test"}:${id}:${identity}`;
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
    await (runAction
      ? api().consentRunCandidate(id, identity, key)
      : api().consentCandidate(id, identity, key));
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
    const name = `${runAction ? "run" : "test"}:${id}:${consent}`;
    let key = checkKeys.get(name);
    if (!key) {
      key = crypto.randomUUID();
      checkKeys.set(name, key);
    }
    pending = true;
    status(`Requesting setup and ${command()} for the reviewed commit…`);
    void (
      runAction
        ? api().startRunAction(id, consent, key)
        : api().runChecks(id, consent, key)
    )
      .then(() => {
        if (stale(version, id)) return;
        // Preserve the key until the receipt is observed. A later explicit click
        // is a new check, never a retry of an uncertain request.
        checkKeys.delete(name);
        close();
        openChecks(runAction);
      })
      .catch((error: unknown) => {
        if (stale(version, id)) return;
        pending = false;
        status(
          `${readableError(error)} Open ${runAction ? "Run results" : "Checks"} or refresh before retrying. Retrying this request will not run it twice.`,
        );
      });
  });
  const open = (run: boolean) => {
    if (
      !state.connected ||
      !isLocal(currentWorkspace()) ||
      dialog().open ||
      byId<HTMLButtonElement>(run ? "commands-review-run" : "commands-review")
        .disabled
    )
      return;
    byId("commands-close").click();
    clear();
    runAction = run;
    setText(
      "candidate-title",
      runAction ? "Review commit for run command" : "Review this commit",
    );
    setText(
      "candidate-notice",
      `Review every changed file before consenting to the approved setup and ${command()} commands for this commit. Commands can execute changed scripts. Local execution is not a sandbox. Recording consent runs nothing. ${runAction ? "Start run command" : "Run checks"} separately starts setup and ${command()} in a fresh checkout with a thirty-minute execution limit. Cancellation and cleanup may take longer. Cancellation stops each command's process group; a process a command starts in a new session, or one left running if the service stops unexpectedly, is not stopped.${runAction ? " Run results are not test evidence. Workspace edits are not used. Raw output is not retained." : ""}`,
    );
    workspaceId = state.selectedWorkspace;
    connected = state.connected;
    dialog().showModal();
    byId("candidate-close").focus();
    void read();
  };
  byId("commands-review").addEventListener("click", () => open(false));
  byId("commands-review-run").addEventListener("click", () => open(true));
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
