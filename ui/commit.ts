import type { StagedReview } from "../src/local-commit.js";
import { actions, api } from "./actions.js";
import { argumentText } from "./commands.js";
import { byId, enable, h, setText, show } from "./dom.js";
import { isActive, isLocal, readableError } from "./model.js";
import { currentWorkspace, state } from "./state.js";

let workspaceId = "",
  generation = 0,
  pending = false;
let review: StagedReview | null = null;
const dialog = () => byId<HTMLDialogElement>("commit-dialog");
const field = (id: string) => byId<HTMLInputElement>(id);
const details = () => ({
  author: field("commit-author").value.trim(),
  email: field("commit-email").value.trim(),
  message: field("commit-message").value.trim(),
});
function clear() {
  generation++;
  review = null;
  pending = false;
  byId("commit-files").replaceChildren();
  setText("commit-status", "");
  enable("commit-confirm", false);
}
function eligible() {
  const w = currentWorkspace();
  return (
    !!w?.local &&
    w.state === "running" &&
    !w.archiveStatus &&
    !w.commitNeedsAttention &&
    state.connected &&
    !state.mutationBusy &&
    !state.sending &&
    state.pending?.workspaceId !== w.id &&
    !state.runs.some((r) => isActive(r.status))
  );
}
export function renderCommit() {
  show(
    "workspace-commit",
    isLocal(currentWorkspace()) && !currentWorkspace()?.archiveStatus,
  );
  enable("workspace-commit", eligible());
  if (!dialog().open) return;
  if (workspaceId !== state.selectedWorkspace || !state.connected) {
    clear();
    dialog().close();
    return;
  }
  enable("commit-review", eligible() && !pending);
  enable("commit-confirm", eligible() && !pending && !!review?.files.length);
}
export function wireCommit() {
  byId("workspace-commit").addEventListener("click", () => {
    if (!eligible() || dialog().open) return;
    clear();
    workspaceId = state.selectedWorkspace;
    for (const id of ["commit-author", "commit-email", "commit-message"])
      field(id).value = "";
    byId("workspace-menu").hidePopover?.();
    dialog().showModal();
    field("commit-author").focus();
    renderCommit();
  });
  byId("commit-close").addEventListener("click", () => dialog().close());
  dialog().addEventListener("close", () => {
    clear();
    byId("workspace-menu-button").focus();
  });
  for (const id of ["commit-author", "commit-email", "commit-message"])
    field(id).addEventListener("input", () => {
      clear();
      renderCommit();
    });
  byId("commit-review").addEventListener("click", () => void execute(false));
  byId("commit-confirm").addEventListener("click", () => void execute(true));
}
async function execute(confirm: boolean) {
  if (
    !dialog().open ||
    !eligible() ||
    workspaceId !== state.selectedWorkspace ||
    pending ||
    (confirm && !review?.files.length)
  )
    return;
  const input = details(),
    expected = review?.identity,
    id = workspaceId;
  clear();
  const version = generation;
  pending = true;
  renderCommit();
  const valid = () =>
    version === generation &&
    dialog().open &&
    state.selectedWorkspace === id &&
    state.connected;
  setText(
    "commit-status",
    confirm ? "Creating local commit…" : "Reading the staged tree…",
  );
  try {
    if (confirm && expected) {
      const receipt = await api().commitStagedChanges(id, input, expected);
      if (valid())
        setText("commit-status", `Created commit ${receipt.commitSha}.`);
      void actions.refresh();
      return;
    }
    const result = await api().reviewStagedCommit(id, input);
    if (!valid()) return;
    review = result;
    setText(
      "commit-status",
      result.files.length
        ? `${result.branch}\nParent ${result.parentSha}\nStaged tree ${result.treeId}\nAuthor and committer ${result.author} <${result.email}>\nMessage ${result.message}`
        : "Nothing staged. Stage your changes in this workspace, then review again.",
    );
    for (const file of result.files)
      byId("commit-files").append(
        h(
          "details",
          { class: "command-action" },
          h("summary", {
            text: `${file.status} · ${file.previousPath ? argumentText(file.previousPath) + " → " : ""}${argumentText(file.path)}`,
          }),
          h("p", {
            class: "mono",
            text: `${file.oldMode ?? "absent"} ${file.oldBlobId ?? ""} → ${file.newMode ?? "absent"} ${file.newBlobId ?? ""}`,
          }),
          h("pre", {
            text: file.binary
              ? `Binary · ${file.oldBytes ?? 0} → ${file.newBytes ?? 0} bytes`
              : file.diff
                  .split("\n")
                  .map((line) => argumentText(line).slice(1, -1))
                  .join("\n"),
          }),
        ),
      );
  } catch (error) {
    if (valid()) setText("commit-status", readableError(error));
    if (confirm) void actions.refresh();
  } finally {
    if (valid()) {
      pending = false;
      renderCommit();
    }
  }
}
