import type { LocalCheckView } from "../src/desktop/contracts.js";
import { api } from "./actions.js";
import { argumentText } from "./commands.js";
import { byId, enable, h, setClass, setText, show } from "./dom.js";
import { isLocal, isWorking, plural, readableError } from "./model.js";
import { currentWorkspace, state } from "./state.js";

let generation = 0,
  workspaceId = "",
  connected = false,
  pending = false;
let view: LocalCheckView | null = null;
let runAction = false;
/** Queued, running and cancelling work is read again on its own. */
const POLL_MS = 3000;
let poll: ReturnType<typeof setTimeout> | undefined;
function stopPoll() {
  if (poll !== undefined) clearTimeout(poll);
  poll = undefined;
}
const active = (result: LocalCheckView | null) =>
  !!result && isWorking(result.status);
/** What a reading shows; an unchanged automatic reading is not redrawn. */
const shown = (result: LocalCheckView | null) =>
  result
    ? `${result.id}|${result.status}|${result.result?.outcome ?? ""}|${result.freshness}`
    : "";
const dialog = () => byId<HTMLDialogElement>("checks-dialog");
function clear() {
  generation++;
  stopPoll();
  pending = false;
  view = null;
  byId("checks-result").replaceChildren();
  verdict("");
  enable("checks-cancel", false);
  show("checks-cancel", false);
}
type Verdict = "" | "passed" | "failed" | "neutral";
/** Colours the result line: green only for passed checks that match this reading. */
function verdict(kind: Verdict) {
  const line = byId("checks-status");
  for (const name of ["passed", "failed", "neutral"])
    setClass(line, `verdict-${name}`, kind === name);
  setClass(line, "verdict", kind !== "");
}
function stale(version: number, id: string) {
  return (
    version !== generation ||
    !dialog().open ||
    state.selectedWorkspace !== id ||
    !state.connected
  );
}
function status(text: string) {
  setText("checks-status", text);
  enable("checks-refresh", state.connected && !pending);
  const cancellable = !!view && ["queued", "running"].includes(view.status);
  // Cancel appears only while a check is queued or running.
  show("checks-cancel", cancellable);
  enable("checks-cancel", state.connected && !pending && cancellable);
}
const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
/** How long queued or running work has taken, so a long check looks alive. */
function elapsed(result: LocalCheckView): string {
  const minutes = Math.floor((Date.now() - result.createdAt) / 60_000);
  return `started ${clock(result.createdAt)} · ${minutes < 1 ? "under a minute" : `${minutes} min`} so far`;
}
/** The status line for queued, running or cancelling work. */
function activeLine(result: LocalCheckView): string {
  return `${runAction ? "Run command" : "Check"} ${result.status} · ${elapsed(result)}. Updates on its own while it runs.`;
}
/**
 * Reads the latest record. `auto` is the quiet re-reading of active work: it
 * keeps the current display unless what it shows has changed.
 */
async function read(auto = false) {
  if (!dialog().open || pending || !state.connected) return;
  if (!auto) {
    clear();
    pending = true;
    status("Reading check state and current commit…");
  }
  const version = generation,
    id = workspaceId;
  try {
    const result = await (runAction
      ? api().latestRunAction(id)
      : api().latestCheck(id));
    if (stale(version, id)) return;
    if (
      result &&
      result.kind !== (runAction ? "local-run-action" : "local-check")
    )
      throw new Error(
        "The service returned a different command action. Refresh to try again.",
      );
    if (!runAction) noteCheck(id, result);
    if (auto && shown(result) === shown(view)) {
      // Only the elapsed time moves; the rest of the display stays as it is.
      if (result && active(result)) status(activeLine(result));
      schedule();
      return;
    }
    if (auto) clear();
    pending = false;
    view = result;
    schedule();
    if (!result) {
      status(
        currentWorkspace()?.archiveStatus
          ? runAction
            ? "No run command was recorded."
            : "No checks were recorded."
          : runAction
            ? "No run command has started. Open Commands, review the commit for run, record separate consent, then choose Start run command."
            : "No checks have run. Open Commands, review the commit and record consent, then choose Run checks.",
      );
      return;
    }
    const noun = runAction ? "Run command" : "Check";
    // A failed setup means the selected command never started.
    const setupOnly =
      result.result?.outcome === "failed" &&
      result.result.phases.at(-1)?.action === "setup";
    const outcome = !result.result
      ? ""
      : runAction
        ? setupOnly
          ? "Run command did not start · setup failed · not test evidence"
          : result.result.outcome === "succeeded"
            ? "Run command succeeded · not test evidence"
            : "Run command failed · not test evidence"
        : setupOnly
          ? "Checks failed · setup failed, test did not run"
          : result.result.outcome === "passed"
            ? "Checks passed"
            : "Checks failed";
    const label = result.result
      ? `${outcome}${result.freshness === "stale" ? " · stale" : result.freshness === "unknown" ? " · freshness not checked" : " · matches this reading"}`
      : result.status === "needs_attention"
        ? `${noun} interrupted · needs attention. If the service stopped unexpectedly, its commands may still be running and its checkout may remain. The workspace stays blocked: recovery after an interruption is planned, not available. No automatic retry`
        : result.status === "failed"
          ? `${noun} failed before a result could be recorded`
          : `${noun} ${result.status}`;
    status(
      active(result) ? activeLine(result) : `${label}. Refresh to read again.`,
    );
    verdict(
      !result.result
        ? result.status === "needs_attention" || result.status === "failed"
          ? "failed"
          : "neutral"
        : !runAction &&
            result.result.outcome === "passed" &&
            result.freshness === "current"
          ? "passed"
          : (
                runAction
                  ? result.result.outcome !== "succeeded"
                  : result.result.outcome !== "passed"
              )
            ? "failed"
            : "neutral",
    );
    const content = byId("checks-result");
    if (result.result && !runAction) {
      const count = result.result.judgingChangeCount;
      content.append(
        h("p", {
          text:
            count === undefined
              ? "Judging-change count not recorded for this check."
              : plural(count, "reported judging change"),
        }),
      );
    }
    content.append(
      h("p", {
        class: "mono",
        text: `Commit ${result.headSha}\n${runAction ? "Run command" : "Check"} ${result.id}`,
      }),
    );
    if (result.result) {
      content.append(
        h("p", {
          text: "These are the named commands Argent observed, not a guarantee about correctness. Freshness is a point-in-time reading; later edits invalidate it.",
        }),
      );
      for (const phase of result.result.phases)
        content.append(
          h(
            "section",
            { class: "command-action" },
            h("h3", {
              text: `${phase.action} · ${phase.outcome}${phase.exitCode === null ? "" : ` · exit ${phase.exitCode}`} · ${phase.durationMs} ms`,
            }),
            h("pre", { text: phase.argv.map(argumentText).join(" ") }),
            h(
              "details",
              { class: "phase-digests" },
              h("summary", {
                text: `Output digests · stdout ${phase.stdout.bytes} bytes · stderr ${phase.stderr.bytes} bytes`,
              }),
              h("p", {
                class: "mono",
                text: `stdout: ${phase.stdout.bytes} bytes · SHA-256 ${phase.stdout.sha256}\nstderr: ${phase.stderr.bytes} bytes · SHA-256 ${phase.stderr.sha256}`,
              }),
            ),
          ),
        );
      content.append(
        h("p", {
          text: "Raw command output is not retained. Only byte counts and digests are recorded.",
        }),
      );
    }
  } catch (error) {
    if (stale(version, id)) return;
    clear();
    status(readableError(error));
  }
}
/** Reads active work again shortly, while the dialog stays open. */
function schedule() {
  stopPoll();
  if (dialog().open && active(view))
    poll = setTimeout(() => {
      poll = undefined;
      void read(true);
    }, POLL_MS);
}

/*
 * The header's Checks button carries the latest check at a glance. It is read
 * when a workspace opens, after reconnecting and when an agent turn ends, and
 * again every few seconds while a check is queued or running. Each reading is
 * point-in-time: nothing watches the files in between.
 */
let badgeFor = "",
  badgeKey = "",
  badgeVersion = 0,
  badgeAt = 0;
let badgeView: LocalCheckView | null = null;
let badgeTimer: ReturnType<typeof setTimeout> | undefined;
function stopBadgeTimer() {
  if (badgeTimer !== undefined) clearTimeout(badgeTimer);
  badgeTimer = undefined;
}

function noteCheck(id: string, result: LocalCheckView | null) {
  if (id !== state.selectedWorkspace) return;
  badgeVersion++;
  badgeFor = id;
  badgeView = result;
  badgeAt = Date.now();
  stopBadgeTimer();
  if (active(result))
    badgeTimer = setTimeout(() => {
      badgeTimer = undefined;
      void readBadge();
    }, POLL_MS);
  paintBadge();
}
async function readBadge() {
  const id = state.selectedWorkspace,
    version = ++badgeVersion;
  stopBadgeTimer();
  try {
    const result = await api().latestCheck(id);
    if (
      version !== badgeVersion ||
      id !== state.selectedWorkspace ||
      !state.connected ||
      (result && result.kind !== "local-check")
    )
      return;
    noteCheck(id, result);
  } catch {
    // The badge keeps its last reading; the Checks dialog reports errors.
  }
}
function resetBadge() {
  badgeVersion++;
  stopBadgeTimer();
  badgeFor = "";
  badgeView = null;
}
type Badge = "" | "passed" | "failed" | "running" | "neutral";
function badge(result: LocalCheckView | null): [Badge, string] {
  if (!result) return ["", ""];
  const at = clock(badgeAt);
  if (isWorking(result.status))
    return ["running", `${result.status}, ${elapsed(result)}`];
  if (!result.result)
    return result.status === "needs_attention"
      ? ["failed", "interrupted, needs attention"]
      : result.status === "failed"
        ? ["failed", "failed before a result was recorded"]
        : ["neutral", result.status];
  const outcome = result.result.outcome === "passed" ? "passed" : "failed";
  return result.freshness === "current"
    ? [outcome, `${outcome}, matches the reading at ${at}`]
    : [
        "neutral",
        `${outcome}, ${result.freshness === "stale" ? "stale" : "freshness not checked"} at ${at}`,
      ];
}
function paintBadge() {
  const [kind, label] = badge(
    badgeFor === state.selectedWorkspace && state.connected ? badgeView : null,
  );
  const dot = byId("checks-badge");
  dot.hidden = !kind;
  for (const name of ["passed", "failed", "running", "neutral"])
    setClass(dot, `check-badge-${name}`, kind === name);
  const button = byId("workspace-checks");
  button.setAttribute("aria-label", label ? `Checks · ${label}` : "Checks");
  button.title = label ? `Latest check: ${label}` : "";
}

export function openChecks(run = false) {
  if (!state.connected || !isLocal(currentWorkspace()) || dialog().open) return;
  clear();
  runAction = run;
  setText("checks-title", runAction ? "Run results" : "Check results");
  setText("checks-cancel", runAction ? "Cancel run command" : "Cancel check");
  workspaceId = state.selectedWorkspace;
  connected = state.connected;
  dialog().showModal();
  byId("checks-close").focus();
  void read();
}
function close() {
  clear();
  dialog().close();
  byId(runAction ? "workspace-run-action" : "workspace-checks").focus();
}
export function renderChecks() {
  // Read again when the workspace, the connection or a finished agent turn
  // could change the answer. While an agent works, the files are changing.
  const workspace = currentWorkspace();
  const working = state.runs.some((run) => isWorking(run.status));
  const key =
    state.connected &&
    isLocal(workspace) &&
    state.runsLoaded === state.selectedWorkspace
      ? `${state.selectedWorkspace}|${working ? "working" : state.runs.length}`
      : "";
  if (key !== badgeKey) {
    badgeKey = key;
    if (!key) resetBadge();
    else if (!working) void readBadge();
  }
  paintBadge();
  show("workspace-run-action", !!currentWorkspace());
  enable(
    "workspace-run-action",
    state.connected && isLocal(currentWorkspace()),
  );
  show("workspace-checks", !!currentWorkspace());
  enable("workspace-checks", state.connected && isLocal(currentWorkspace()));
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
        ? "Reconnected. Refresh to read check state."
        : "Disconnected. Reconnect, then refresh.",
    );
  }
}
export function wireChecks() {
  byId("workspace-checks").addEventListener("click", () => openChecks());
  byId("workspace-run-action").addEventListener("click", () =>
    openChecks(true),
  );
  byId("checks-refresh").addEventListener("click", () => void read());
  byId("checks-close").addEventListener("click", close);
  dialog().addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog().addEventListener("close", () => {
    if (!dialog().open) clear();
  });
  byId("checks-cancel").addEventListener("click", () => {
    if (
      pending ||
      !view ||
      !state.connected ||
      !["queued", "running"].includes(view.status)
    )
      return;
    const id = workspaceId,
      version = generation,
      check = view.id;
    pending = true;
    status("Requesting cancellation…");
    void (
      runAction
        ? api().cancelRunAction(id, check)
        : api().cancelCheck(id, check)
    )
      .then(async () => {
        if (stale(version, id)) return;
        pending = false;
        await read();
      })
      .catch((error: unknown) => {
        if (stale(version, id)) return;
        clear();
        status(readableError(error));
      });
  });
}
