// Draws a unified diff as one text-only element per line, shared by every
// dialog that shows file content.
import { h } from "./dom.js";
import { type DiffLine, readableDiff } from "./model.js";

/** Unchanged lines kept around each change, as Git shows them. */
const CONTEXT = 3;

/** One text-only span; the numbers live in an attribute, so copying skips them. */
function lineSpan(line: DiffLine, escape: (text: string) => string) {
  return h("span", {
    class: `diff-line diff-${line.kind}`,
    text: escape(line.text),
    data: {
      gutter: `${line.old ?? ""}`.padStart(5) + `${line.new ?? ""}`.padStart(5),
    },
  });
}

/**
 * Appends the changed lines of `diff` to `pre`. `escape` makes hidden
 * characters visible. With `fold`, unchanged runs longer than the context
 * fold behind a control that restores them in place; without it every line
 * stays visible, as consent requires.
 */
export function renderDiff(
  pre: HTMLElement,
  diff: string,
  escape: (text: string) => string,
  fold: boolean,
): void {
  const { lines, exact } = readableDiff(diff);
  const span = (line: DiffLine) => lineSpan(line, escape);
  if (!exact)
    pre.append(
      span({
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
    if (!fold || lines[k]!.kind !== "context") {
      pre.append(span(lines[k++]!));
      continue;
    }
    let end = k;
    while (lines[end]?.kind === "context") end++;
    const keepStart = changed(lines[k - 1]) ? CONTEXT : 0;
    const keepEnd = changed(lines[end]) ? CONTEXT : 0;
    const hidden = end - k - keepStart - keepEnd;
    if (hidden < 4) {
      for (; k < end; k++) pre.append(span(lines[k]!));
      continue;
    }
    for (const line of lines.slice(k, k + keepStart)) pre.append(span(line));
    const folded = lines.slice(k + keepStart, end - keepEnd);
    const control = h("button", {
      class: "diff-fold",
      text: `Show ${folded.length} unchanged lines`,
      attrs: { type: "button" },
      on: {
        click: () => {
          let anchor: HTMLElement = control;
          for (const line of folded) {
            const next = span(line);
            anchor.after(next);
            anchor = next;
          }
          control.remove();
          pre.focus();
        },
      },
    });
    pre.append(control);
    for (const line of lines.slice(end - keepEnd, end)) pre.append(span(line));
    k = end;
  }
}
