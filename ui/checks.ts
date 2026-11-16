import type { LocalCheckView } from "../src/desktop/contracts.js";
import { api } from "./actions.js";
import { argumentText } from "./commands.js";
import { byId, enable, h, setText, show } from "./dom.js";
import { isLocal, readableError } from "./model.js";
import { currentWorkspace, state } from "./state.js";

let generation = 0,
  workspaceId = "",
  connected = false,
  pending = false;
let view: LocalCheckView | null = null;
const dialog = () => byId<HTMLDialogElement>("checks-dialog");
function clear() {
  generation++;
  pending = false;
  view = null;
  byId("checks-result").replaceChildren();
  enable("checks-cancel", false);
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
  enable(
    "checks-cancel",
    state.connected &&
      !pending &&
      !!view &&
      ["queued", "running"].includes(view.status),
  );
}
async function read() {
  if (!dialog().open || pending || !state.connected) return;
  clear();
  pending = true;
  const version = generation,
    id = workspaceId;
  status("Reading check state and current commit…");
  try {
    const result = await api().latestCheck(id);
    if (stale(version, id)) return;
    pending = false;
    view = result;
    if (!result) {
      status(
        "No checks have run. Open Commands, review the commit and record consent, then choose Run checks.",
      );
      return;
    }
    const label = result.result
      ? `${result.result.outcome === "passed" ? "Checks passed" : "Checks failed"}${result.freshness === "stale" ? " · stale" : result.freshness === "unknown" ? " · freshness not checked" : " · matches this reading"}`
      : result.status === "needs_attention"
        ? "Check interrupted · needs attention. The workspace stays blocked; no automatic retry."
        : result.status === "failed"
          ? "Check failed before evidence could be recorded."
          : `Check ${result.status}`;
    status(`${label}. Refresh to read again.`);
    const content = byId("checks-result");
    content.append(
      h("p", {
        class: "mono",
        text: `Commit ${result.headSha}\nCheck ${result.id}`,
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
            h("pre", { text: phase.argv.map(argumentText).join("\n") }),
            h("p", {
              class: "mono",
              text: `stdout: ${phase.stdout.bytes} bytes · SHA-256 ${phase.stdout.sha256}\nstderr: ${phase.stderr.bytes} bytes · SHA-256 ${phase.stderr.sha256}`,
            }),
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
export function openChecks() {
  if (!state.connected || !isLocal(currentWorkspace()) || dialog().open) return;
  clear();
  workspaceId = state.selectedWorkspace;
  connected = state.connected;
  dialog().showModal();
  byId("checks-close").focus();
  void read();
}
function close() {
  clear();
  dialog().close();
  byId("workspace-checks").focus();
}
export function renderChecks() {
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
  byId("workspace-checks").addEventListener("click", openChecks);
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
    void api()
      .cancelCheck(id, check)
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
