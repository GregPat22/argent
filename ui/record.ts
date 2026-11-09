// Argent's record of a finished run, drawn as a row of hallmarks. A mark is
// struck only when Argent holds the data behind it; the rest stay as outlines,
// so "nothing was tested" is visible rather than implied.
import type { ArtifactView } from "../src/desktop/contracts.js";
import type { RunView } from "../src/domain.js";
import { h, svg } from "./dom.js";
import { limitLabel, plural } from "./model.js";

interface Mark {
  name: string;
  value: string;
  struck: boolean;
  tone?: "verified";
  glyph: () => SVGElement[];
}

const text = (x: number, y: number, size: number, value: string) =>
  svg(
    "text",
    { x, y, "text-anchor": "middle", "font-size": size, class: "mark-letter" },
    value,
  );

function punch(mark: Mark): SVGElement {
  return svg(
    "svg",
    {
      viewBox: "0 0 80 52",
      class: "mark-glyph",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "aria-hidden": "true",
    },
    ...mark.glyph(),
  );
}

function marks(run: RunView, artifact: ArtifactView): Mark[] {
  const evidence = artifact.evidence;
  const worktree = evidence.kind === "worktree-record";
  const commit = worktree ? evidence.headSha : "";
  return [
    {
      name: "Maker’s mark",
      value: run.simulation
        ? `Scripted demo · ${limitLabel(run.maxRuntimeMs)}`
        : `Claude Code · ${run.permissionMode === "full" ? "full access" : "edits only"} · ${limitLabel(run.maxRuntimeMs)}`,
      struck: true,
      glyph: () => [
        svg("path", { d: "M10 14h60l6 12-6 12H10l-6-12z" }),
        text(40, 31.5, 15, "AI"),
      ],
    },
    {
      name: "Date letter",
      value: commit ? `Commit ${commit.slice(0, 7)}` : "No commit in a demo",
      struck: !!commit,
      glyph: () => [
        svg("path", { d: "M18 8h44l8 8v20l-8 8H18l-8-8V16z" }),
        text(40, 31.5, 14, commit ? commit.slice(0, 4) : "····"),
      ],
    },
    {
      name: "Standard mark",
      value: "No checks yet",
      struck: false,
      glyph: () => [
        svg("ellipse", { cx: 40, cy: 26, rx: 32, ry: 17 }),
        svg("path", { d: "m29 26 7 7 15-15", "stroke-width": 3.2 }),
      ],
    },
    {
      name: "Assay mark",
      value: worktree ? "Not verified" : "SHA-256 checked · simulated",
      struck: !worktree,
      ...(worktree ? {} : { tone: "verified" as const }),
      glyph: () => [
        svg("path", {
          d: "M14 8h52v18c0 12-12 20-26 24-14-4-26-12-26-24z",
        }),
        text(40, 34, 18, "Ag"),
      ],
    },
  ];
}

function field(label: string, value: string, mono = false): HTMLElement {
  return h(
    "div",
    { class: "record-field" },
    h("dt", { text: label }),
    h("dd", { text: value, class: mono ? "mono" : "" }),
  );
}

export function recordCard(
  run: RunView,
  artifact: ArtifactView,
  strike: boolean,
): HTMLElement {
  const evidence = artifact.evidence;
  const worktree = evidence.kind === "worktree-record";
  const list = h("ol", {
    class: `marks${strike ? " striking" : ""}`,
    attrs: { "aria-label": "Hallmarks" },
  });
  for (const [index, mark] of marks(run, artifact).entries()) {
    const item = h(
      "li",
      {
        class: `mark ${mark.struck ? "struck" : "unstruck"}${mark.tone ? ` ${mark.tone}` : ""}`,
        data: { index: String(index) },
      },
      punch(mark),
      h(
        "span",
        { class: "mark-copy" },
        h("span", { class: "mark-name", text: mark.name }),
        h("span", { class: "mark-value", text: mark.value }),
      ),
    );
    list.append(item);
  }
  const fields = h(
    "dl",
    { class: "record-fields" },
    ...(worktree
      ? [
          field("Branch", evidence.branch, true),
          field("Commit", evidence.headSha.slice(0, 12), true),
          field("Changed", plural(evidence.changedFiles, "file")),
          field("Diff SHA-256", evidence.diffSha256, true),
        ]
      : [
          field("Artifact", evidence.artifact, true),
          field("SHA-256", evidence.sha256, true),
        ]),
  );
  return h(
    "section",
    { class: "record", attrs: { "aria-label": "Argent’s record" } },
    h(
      "header",
      { class: "record-head" },
      h(
        "div",
        {},
        h("h4", { text: "Argent recorded" }),
        h("p", {
          text: worktree
            ? "Read from the worktree by Argent, not reported by the agent."
            : "Checked by Argent against the scripted artifact.",
        }),
      ),
      h("span", {
        class: `tag${worktree ? "" : " tag-verified"}`,
        text: worktree ? "Not tested" : "Simulation",
      }),
    ),
    list,
    fields,
    h("p", {
      class: "record-note",
      text: worktree
        ? "Nothing was tested. Review the changes and run your checks before you merge."
        : "This verifies a scripted artifact only. It is not evidence of tests or a pull request.",
    }),
    h(
      "details",
      { class: "record-raw" },
      h("summary", { text: "Raw record" }),
      h("pre", {
        text: JSON.stringify(worktree ? evidence : artifact.content, null, 2),
      }),
    ),
  );
}
