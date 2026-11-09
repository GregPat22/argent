// The workspace conversation: every run is one turn, oldest first.
import type { RunView } from "../src/domain.js";
import { actions } from "./actions.js";
import { byId, h, icon, show } from "./dom.js";
import {
  clock,
  duration,
  isWorking,
  limitLabel,
  plural,
  statusLabels,
  turnFrom,
  type Step,
} from "./model.js";
import { recordCard } from "./record.js";
import { state, turnRecord } from "./state.js";

/** Turns shown before "Show earlier messages". */
export const VISIBLE_TURNS = 6;
const EVENT_PAGE_SIZE = 500;

interface Rendered {
  signature: string;
  element: HTMLElement;
  status: HTMLElement;
  eventControls: HTMLButtonElement[];
}
const rendered = new Map<string, Rendered>();
let renderedWorkspace = "";

/** Runs the conversation shows, oldest first. */
export function visibleRuns(): RunView[] {
  const newestFirst = state.showEarlier.has(state.selectedWorkspace)
    ? state.runs
    : state.runs.slice(0, VISIBLE_TURNS);
  return [...newestFirst].reverse();
}

function stepRow(step: Step): HTMLElement {
  const symbol =
    step.kind === "tool"
      ? step.error
        ? "triangle-alert"
        : "terminal"
      : step.kind === "say"
        ? "message-square"
        : "chevron-right";
  const time = h("time", { text: clock(step.at) });
  time.dateTime = new Date(step.at).toISOString();
  return h(
    "li",
    {
      class: `step step-${step.kind}${step.kind === "tool" && step.error ? " step-error" : ""}`,
    },
    icon(symbol, "step-icon"),
    h("span", { class: "step-text", text: step.text }),
    time,
  );
}

function statusText(run: RunView, lastAt: number): string {
  if (isWorking(run.status) && !state.connected)
    return `${statusLabels[run.status]} when last seen`;
  if (isWorking(run.status))
    return `${statusLabels[run.status]} · ${duration(Date.now() - run.createdAt)}`;
  const took =
    lastAt > run.createdAt ? ` in ${duration(lastAt - run.createdAt)}` : "";
  return `${statusLabels[run.status]}${run.status === "completed" ? took : ""}`;
}

function end(run: RunView, reason: string): HTMLElement | null {
  const record = turnRecord(run.id);
  if (run.status === "completed") {
    if (record.artifact)
      return recordCard(run, record.artifact, state.struck.has(run.id));
    return h("p", {
      class: "end",
      text: record.artifactError
        ? `The record could not be read: ${record.artifactError}`
        : "Reading Argent’s record…",
    });
  }
  if (run.status === "failed")
    return h(
      "p",
      { class: "end end-fault" },
      icon("circle-x"),
      h("span", {
        text: `Failed. ${reason || "No record was made."}`,
      }),
    );
  if (run.status === "cancelled")
    return h(
      "p",
      { class: "end" },
      icon("ban"),
      h("span", {
        text: "Cancelled before it finished. Nothing was recorded.",
      }),
    );
  if (run.status === "needs_attention")
    return h(
      "div",
      { class: "end end-attention", attrs: { role: "group" } },
      icon("triangle-alert"),
      h(
        "div",
        {},
        h("strong", { text: "This run stopped without a clear outcome." }),
        h("p", {
          text: run.simulation
            ? "Argent did not retry it, in case part of it already happened. Look over what it did, then mark it reviewed."
            : "The local agent may still be running. This workspace stays blocked until its process can be reconciled. Review its files and running processes; reconnecting does not stop or replay it.",
        }),
        run.simulation &&
          h("button", {
            class: "button",
            text: "Review and abandon",
            attrs: { type: "button", "data-action": "resolve" },
            on: { click: () => actions.resolveRun(run.id) },
          }),
      ),
    );
  return null;
}

function turnElement(run: RunView): Rendered {
  const record = turnRecord(run.id);
  const eventControls: HTMLButtonElement[] = [];
  const start =
    record.eventPageStart ??
    Math.max(0, record.events.length - EVENT_PAGE_SIZE);
  const turn = turnFrom(record.events.slice(start, start + EVENT_PAGE_SIZE));
  const summary = turnFrom(record.events);
  const agent = run.simulation ? "Scripted demo" : "Claude Code";
  const working = isWorking(run.status);
  const meta = h(
    "div",
    { class: "message-meta" },
    h("time", { text: clock(run.createdAt) }),
  );
  if (!run.simulation && run.permissionMode === "full")
    meta.append(h("span", { class: "tag tag-attention", text: "Full access" }));
  meta.append(h("span", { text: `${limitLabel(run.maxRuntimeMs)} limit` }));
  const status = h("span", {
    class: `status status-${run.status}`,
    text: statusText(run, summary.lastAt),
  });
  const reply = h(
    "div",
    { class: "reply" },
    h(
      "div",
      { class: "reply-head" },
      h(
        "span",
        { class: `agent-mark${run.simulation ? " demo" : ""}` },
        icon(run.simulation ? "flask-conical" : "terminal"),
      ),
      h("span", { class: "agent-name", text: agent }),
      status,
    ),
  );
  if (record.events.length > EVENT_PAGE_SIZE) {
    const pageButton = (earlier: boolean) => {
      const button = h("button", {
        class: "button",
        text: earlier ? "Earlier events" : "Later events",
        attrs: { type: "button" },
        data: { action: earlier ? "earlier-events" : "later-events" },
        on: {
          click: () => {
            if (earlier)
              record.eventPageStart = Math.max(0, start - EVENT_PAGE_SIZE);
            else {
              const next = start + EVENT_PAGE_SIZE;
              record.eventPageStart =
                next >= record.events.length - EVENT_PAGE_SIZE ? null : next;
            }
            actions.render();
            // Rebuilding this turn replaces the focused button. Keep keyboard
            // navigation on the same control, or its enabled neighbor at an end.
            const controls = rendered.get(run.id)?.eventControls;
            const preferred = controls?.[earlier ? 0 : 1];
            const focus = preferred?.disabled
              ? controls?.find((control) => !control.disabled)
              : preferred;
            focus?.focus();
          },
        },
      });
      button.disabled = earlier
        ? start === 0
        : start + EVENT_PAGE_SIZE >= record.events.length;
      eventControls.push(button);
      return button;
    };
    reply.append(
      h(
        "nav",
        {
          class: "event-pages",
          attrs: { "aria-label": `Activity history for ${run.task}` },
        },
        pageButton(true),
        h("span", {
          text: `Events ${start + 1}–${Math.min(start + EVENT_PAGE_SIZE, record.events.length)} of ${record.events.length}`,
        }),
        pageButton(false),
      ),
    );
  }
  if (working) {
    const live = h("ol", { class: "steps live" });
    for (const step of turn.steps) live.append(stepRow(step));
    if (!turn.steps.length)
      live.append(
        h("li", {
          class: "step step-note waiting",
          text:
            run.status === "queued"
              ? "Waiting for the local worker…"
              : "Starting…",
        }),
      );
    reply.append(live);
  } else {
    if (turn.says.length)
      reply.append(
        h(
          "div",
          { class: "says" },
          h("span", { class: "says-label", text: `${agent} says` }),
          ...turn.says.map((said) => h("p", { text: said })),
        ),
      );
    const others = turn.steps.filter((step) => step.kind !== "say");
    if (others.length) {
      const list = h("ol", { class: "steps" });
      for (const step of others) list.append(stepRow(step));
      reply.append(
        h(
          "details",
          { class: "steps-disclosure" },
          h(
            "summary",
            {},
            icon("chevron-right", "disclosure-icon"),
            h("span", { text: plural(others.length, "step") }),
          ),
          list,
        ),
      );
    }
    const ending = end(run, summary.reason);
    if (ending) reply.append(ending);
  }
  const element = h(
    "article",
    {
      class: `turn${working && state.connected ? " is-working" : ""}`,
      data: { runId: run.id },
      attrs: { "aria-label": `Message: ${run.task}` },
    },
    h(
      "div",
      { class: "message" },
      h("p", { class: "message-text", text: run.task }),
      meta,
    ),
    reply,
  );
  return { signature: signature(run), element, status, eventControls };
}

function signature(run: RunView): string {
  const record = turnRecord(run.id);
  return JSON.stringify([
    run.status,
    run.simulation,
    state.connected,
    run.task,
    record.events.length,
    record.eventPageStart,
    !!record.artifact,
    record.artifactError,
    state.struck.has(run.id),
  ]);
}

export function renderTranscript(): void {
  const list = byId("transcript");
  const scroller = byId("conversation");
  if (renderedWorkspace !== state.selectedWorkspace) {
    rendered.clear();
    list.replaceChildren();
    renderedWorkspace = state.selectedWorkspace;
  }
  const runs = visibleRuns();
  const nearBottom =
    scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  const wanted = new Set(runs.map((run) => run.id));
  for (const [id, item] of rendered)
    if (!wanted.has(id)) {
      item.element.remove();
      rendered.delete(id);
    }
  let previous: HTMLElement | null = null;
  let added = false;
  for (const run of runs) {
    let item = rendered.get(run.id);
    if (!item || item.signature !== signature(run)) {
      const fresh = turnElement(run);
      // The marks strike in once; later renders show them at rest.
      if (state.struck.delete(run.id)) fresh.signature = signature(run);
      if (item) item.element.replaceWith(fresh.element);
      else added = true;
      item = fresh;
      rendered.set(run.id, item);
    } else if (isWorking(run.status)) {
      item.status.textContent = statusText(
        run,
        turnFrom(turnRecord(run.id).events).lastAt,
      );
    }
    const expected: Element | null = previous
      ? previous.nextElementSibling
      : list.firstElementChild;
    if (expected !== item.element) {
      if (previous) previous.after(item.element);
      else list.prepend(item.element);
    }
    previous = item.element;
  }
  const hidden = state.runs.length - runs.length;
  show("show-earlier", hidden > 0);
  byId("show-earlier").textContent =
    `Show ${plural(hidden, "earlier message")}`;
  show(
    "more-runs",
    state.showEarlier.has(state.selectedWorkspace) && !!state.runCursor,
  );
  (byId("more-runs") as HTMLButtonElement).disabled =
    !state.connected || state.mutationBusy;
  if (added || nearBottom) scroller.scrollTop = scroller.scrollHeight;
}

export function resetTranscript(): void {
  renderedWorkspace = "";
}
