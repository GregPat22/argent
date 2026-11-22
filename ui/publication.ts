import type {
  CandidateReviewView,
  PublicationInput,
  PublicationReview,
  PublicationStatus,
} from "../src/desktop/contracts.js";
import { api } from "./actions.js";
import { byId, enable, setText, show } from "./dom.js";
import { isActive, isLocal, plural, readableError } from "./model.js";
import { currentWorkspace, state } from "./state.js";

const field = (name: string) => byId<HTMLInputElement>("publication-" + name);
const evidence = () => byId<HTMLDialogElement>("draft-evidence-dialog");
const receiptDialog = () =>
  byId<HTMLDialogElement>("publication-status-dialog");
const fields = ["repository", "base", "title"];
let candidate: CandidateReviewView | null = null,
  originalBody = "";
let generation = 0,
  ready = false,
  reviewing = false;
let plan: PublicationReview | null = null;
let receiptRequest = 0,
  receiptWorkspace = "";
// A lost reply or a second opening while a request is in flight cannot authorize another push.
const dispatched = new Map<string, "pending" | "unconfirmed">();
function requestStatus(id: string) {
  switch (dispatched.get(id)) {
    case "pending":
      return "Publication is in progress. Open Draft publication status again to read the outcome.";
    case "unconfirmed":
      return "No outcome was confirmed. This window blocks another request. Inspect the branch and pull requests on GitHub before reopening the desktop for a fresh review.";
    default:
      return "";
  }
}

function input(shown: CandidateReviewView): PublicationInput {
  return {
    reviewIdentity: shown.identity,
    repository: field("repository").value,
    baseBranch: field("base").value,
    title: field("title").value,
  };
}
function sameInput(left: PublicationInput, right: PublicationInput) {
  return (
    left.reviewIdentity === right.reviewIdentity &&
    left.repository === right.repository &&
    left.baseBranch === right.baseBranch &&
    left.title === right.title
  );
}
function receiptText(result: PublicationStatus) {
  const target = `${result.repository}\nSource: ${result.branch} · ${result.headSha}\nBase: ${result.baseBranch} · ${result.baseSha}`;
  if (result.status === "published")
    return "Verified draft pull request\n" + result.url + "\n" + target;
  return (
    (result.phase === "push" ? "Branch push" : "Draft creation") +
    " needs attention. Inspect the destination on GitHub before taking any further action.\n" +
    target
  );
}
function eligible() {
  const w = currentWorkspace();
  return (
    !!candidate &&
    evidence().open &&
    state.connected &&
    w?.id === candidate.workspaceId &&
    w.local?.baseSha === candidate.baseSha &&
    w.state === "running" &&
    !w.archiveStatus &&
    !w.commitNeedsAttention &&
    !state.runs.some((r) => isActive(r.status)) &&
    state.pending?.workspaceId !== w.id
  );
}
function clearPlan() {
  generation++;
  plan = null;
  reviewing = false;
  setText("publication-target", "");
  setText("publication-history", "");
  show("publication-target", false);
  show("publication-approval", false);
  enable("publication-confirm", false);
  if (originalBody) setText("draft-evidence-body", originalBody);
}
export function clearPublication() {
  originalBody = "";
  candidate = null;
  ready = false;
  clearPlan();
  for (const name of fields) field(name).value = "";
  show("publication-form", false);
  enable("publication-review", false);
  setText("publication-message", "");
}
function renderForm() {
  const editable =
    ready && eligible() && !dispatched.has(candidate!.workspaceId);
  show("publication-form", editable);
  enable(
    "publication-review",
    editable &&
      !reviewing &&
      fields.every((name) => !!field(name).value?.trim()),
  );
  enable(
    "publication-confirm",
    editable && !!plan && sameInput(plan, input(candidate!)),
  );
}

export async function preparePublication(
  shown: CandidateReviewView,
  body: string,
) {
  candidate = shown;
  originalBody = body;
  const version = generation;
  setText("publication-message", "Reading saved publication status…");
  try {
    const saved = await api().publicationStatus(shown.workspaceId);
    if (version !== generation || !eligible()) return;
    ready = saved === null;
    setText(
      "publication-message",
      saved ? receiptText(saved) : requestStatus(shown.workspaceId),
    );
    renderForm();
  } catch (error) {
    if (version === generation)
      setText("publication-message", readableError(error));
  }
}
async function review() {
  if (
    !candidate ||
    !eligible() ||
    !ready ||
    reviewing ||
    dispatched.has(candidate.workspaceId)
  )
    return;
  const shown = candidate,
    request = input(shown);
  if (
    !request.repository.trim() ||
    !request.baseBranch.trim() ||
    !request.title.trim()
  )
    return;
  clearPlan();
  const version = generation;
  reviewing = true;
  renderForm();
  setText("publication-message", "Preparing the local publication review…");
  try {
    const result = await api().reviewPublication(shown.workspaceId, request);
    if (
      version !== generation ||
      !eligible() ||
      !sameInput(request, input(shown))
    )
      return;
    if (
      !sameInput(result, request) ||
      result.workspaceId !== shown.workspaceId ||
      result.headSha !== shown.headSha ||
      result.baseSha !== shown.baseSha ||
      result.branch !== currentWorkspace()?.local?.branch
    )
      throw new Error(
        "Publication target changed. Refresh the candidate review.",
      );
    plan = result;
    setText(
      "publication-target",
      `GitHub repository: ${result.repository}\nSource: ${result.branch} · ${result.headSha}\nBase: ${result.baseBranch} · ${result.baseSha}\nTitle: ${result.title}\nDescription (Markdown)`,
    );
    setText("draft-evidence-body", result.body);
    setText(
      "publication-history",
      "Pushing sends " +
        plural(result.commitCount, "commit") +
        " since the displayed base, including commit messages, authors and intermediate file contents. The draft will use the title and complete description shown above.",
    );
    setText(
      "publication-message",
      "Review the destination, branch history and draft description before confirming.",
    );
    show("publication-target", true);
    show("publication-approval", true);
  } catch (error) {
    if (version === generation)
      setText("publication-message", readableError(error));
  } finally {
    if (version === generation) {
      reviewing = false;
      renderForm();
    }
  }
}

async function publish() {
  if (
    !candidate ||
    !eligible() ||
    !ready ||
    !plan ||
    dispatched.has(candidate.workspaceId)
  )
    return;
  const target = plan,
    request = input(candidate),
    id = candidate.workspaceId;
  if (!sameInput(target, request)) {
    clearPlan();
    renderForm();
    return;
  }
  dispatched.set(id, "pending");
  ready = false;
  clearPlan();
  setText("draft-evidence-body", target.body);
  renderForm();
  const version = generation;
  setText(
    "publication-message",
    "Publishing the reviewed branch and draft pull request…",
  );
  try {
    const result = await api().publishDraft(id, request, target.identity);
    if (
      result.workspaceId !== id ||
      result.identity !== target.identity ||
      result.headSha !== target.headSha ||
      result.baseSha !== target.baseSha ||
      result.repository !== target.repository ||
      result.branch !== target.branch ||
      result.baseBranch !== target.baseBranch
    )
      throw new Error(
        "The publication receipt does not match the reviewed target.",
      );
    dispatched.delete(id);
    if (version === generation) {
      candidate = null;
      setText("publication-message", receiptText(result));
    }
  } catch (error) {
    if (
      error instanceof Error &&
      /^Request rejected \(4[0-9]{2}\):/.test(error.message)
    )
      dispatched.delete(id);
    else dispatched.set(id, "unconfirmed");
    if (version === generation)
      setText(
        "publication-message",
        readableError(error) +
          " Open Draft publication status from the workspace menu to inspect the outcome.",
      );
  }
}

async function openReceipt() {
  if (!state.connected || !isLocal(currentWorkspace()) || receiptDialog().open)
    return;
  const id = state.selectedWorkspace,
    request = ++receiptRequest;
  receiptWorkspace = id;
  byId("workspace-menu").hidePopover?.();
  receiptDialog().showModal();
  byId("publication-status-close").focus();
  setText("publication-receipt", "Reading saved publication status…");
  const current = () =>
    request === receiptRequest &&
    receiptDialog().open &&
    state.connected &&
    state.selectedWorkspace === id;
  try {
    const result = await api().publicationStatus(id);
    if (current())
      setText(
        "publication-receipt",
        result
          ? receiptText(result)
          : requestStatus(id) || "No publication recorded for this workspace.",
      );
  } catch (error) {
    if (current()) setText("publication-receipt", readableError(error));
  }
}
function closeReceipt() {
  receiptRequest++;
  receiptDialog().close();
  setText("publication-receipt", "");
  byId("workspace-menu-button").focus();
}
export function renderPublication() {
  show("workspace-publication", isLocal(currentWorkspace()));
  enable(
    "workspace-publication",
    isLocal(currentWorkspace()) && state.connected,
  );
  if (
    receiptDialog().open &&
    (receiptWorkspace !== state.selectedWorkspace || !state.connected)
  )
    closeReceipt();
  // The service stops the workspace while it owns a confirmed publication.
  // Polling that transition must keep the pending response visible.
  if (
    candidate &&
    !eligible() &&
    dispatched.get(candidate.workspaceId) !== "pending"
  ) {
    clearPublication();
    if (evidence().open)
      setText(
        "publication-message",
        "Workspace state changed. Refresh the candidate review.",
      );
  }
}
export function wirePublication() {
  for (const name of fields)
    field(name).addEventListener("input", () => {
      if (!ready || !eligible()) return;
      clearPlan();
      setText("publication-message", "");
      renderForm();
    });
  byId("publication-review").addEventListener("click", () => void review());
  byId("publication-confirm").addEventListener("click", () => void publish());
  byId("workspace-publication").addEventListener(
    "click",
    () => void openReceipt(),
  );
  byId("publication-status-close").addEventListener("click", closeReceipt);
  receiptDialog().addEventListener("cancel", (event) => {
    event.preventDefault();
    closeReceipt();
  });
}
