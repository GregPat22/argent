"use client";

import { ROADMAP_URL } from "@/lib/site";

const MILESTONES = [
  {
    id: "M0",
    title: "Durable engine",
    body: "Scripted runs, an independent worker, crash recovery and reconnect, covered by real multi-process tests.",
    label: "Works today · simulation",
    complete: true,
  },
  {
    id: "P1–P2",
    title: "Desktop prototype",
    body: "A local macOS app with workspaces, tasks, retained history and a familiar three-pane layout. Build it from source; execution is simulated.",
    label: "Prototype complete · simulation",
    complete: true,
  },
  {
    id: "M1",
    title: "Cloud MVP",
    body: "One GitHub repository, one persistent cloud workspace, one real agent (Codex first) and an independently tested draft pull request.",
    label: "In development",
    complete: false,
  },
  {
    id: "W1",
    title: "Daily workflows",
    body: "A branch or worktree per task, isolated workspaces side by side, setup, run and test actions, diffs and a terminal.",
    label: "Planned",
    complete: false,
  },
  {
    id: "P3–P4",
    title: "More agents, and your phone",
    body: "Claude Code and Codex with the subscriptions you already have where providers allow it, then Cursor and OpenCode. A native iOS companion to check in.",
    label: "Planned",
    complete: false,
  },
  {
    id: "Release",
    title: "Public downloads",
    body: "Signed, versioned builds with checksums, downloadable from this site.",
    label: "Planned",
    complete: false,
  },
];

export function Roadmap() {
  return (
    <section
      id="roadmap"
      aria-labelledby="roadmap-title"
      className="mx-auto max-w-[1320px] scroll-mt-24 px-6 py-24 md:px-10 md:py-32"
    >
      <div className="grid gap-8 md:grid-cols-12 md:items-end">
        <h2
          id="roadmap-title"
          className="display text-[clamp(2.4rem,5vw,4.6rem)] md:col-span-7"
        >
          Early, and honest
          <br />
          about it.
        </h2>
        <p className="max-w-[34rem] text-sterling md:col-span-5">
          Each milestone ends with evidence, not a date. Here is what exists and
          what comes next; team handoff and dependent tasks follow.{" "}
          <a
            href={ROADMAP_URL}
            target="_blank"
            rel="noreferrer"
            className="text-polished underline underline-offset-4"
          >
            Read the full roadmap
          </a>
          .
        </p>
      </div>
      <div className="silver-surface relative mt-12 overflow-hidden rounded-3xl border border-hairline-strong px-6 py-8 md:px-10">
        <div>
          <ol
            data-reveal-children
            className="grid gap-8 md:grid-cols-3 md:gap-6 xl:grid-cols-6"
          >
            {MILESTONES.map((milestone) => (
              <li key={milestone.id} className="relative pl-10 md:pl-0">
                <span
                  aria-hidden
                  className={`absolute top-0 left-0 flex size-6 items-center justify-center rounded-full border ${milestone.complete ? "metal-node border-polished/40" : "border-hairline-strong bg-oxide"}`}
                >
                  <span
                    className={`size-1 rounded-full ${milestone.complete ? "bg-oxide" : "bg-sterling-dim"}`}
                  />
                </span>
                <p className="font-mono text-xs text-sterling-dim md:mt-10">
                  {milestone.id}
                </p>
                <h3 className="display mt-3 text-[1.4rem] leading-tight tracking-[-0.04em]">
                  {milestone.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-sterling">
                  {milestone.body}
                </p>
                <p
                  className={`mt-5 text-xs leading-relaxed ${milestone.complete ? "text-verified" : "text-sterling-dim"}`}
                >
                  {milestone.label}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
