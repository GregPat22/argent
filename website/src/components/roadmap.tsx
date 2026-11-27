"use client";

import { useEffect, useRef, useState } from "react";
import { ROADMAP_URL } from "@/lib/site";

/*
 * The one place on the page that says plainly what exists and what does not.
 * A rail runs through the milestones; when it scrolls in, polished silver
 * flows from the start to the "you are here" drop, and the road ahead stays
 * unpolished.
 */

type State = "done" | "now" | "next";

const MILESTONES: { title: string; body: string; state: State }[] = [
  {
    title: "Engine and desktop prototype",
    body: "Durable run history, reconnect and independent records of what changed, in a local macOS app you build from source. An interrupted agent run stays blocked until its process can be reconciled.",
    state: "done",
  },
  {
    title: "Local MVP",
    body: "Claude Code already runs in the app, each workspace in its own branch and worktree with a live session. The changes panel shows current files and a bounded diff. Argent runs approved checks for the exact commit. New check results include the number of changes the report flagged. You can publish a reviewed draft and archive a clean workspace while keeping its branch. The local MVP walkthrough still needs a pull request created through Argent and merged by a person.",
    state: "now",
  },
  {
    title: "Public downloads",
    body: "The first release: a signed build for Macs with Apple silicon, with Claude Code and a checksum, downloadable from this site.",
    state: "next",
  },
  {
    title: "Links, agents and rules",
    body: "A list showing which workspaces need you as the first update, then the checked links experiment, then Codex and a model picker and further project rules, then Cursor and OpenCode through their official tools.",
    state: "next",
  },
  {
    title: "Remote workspaces",
    body: "Hand off a task, close your laptop, and come back to a tested draft pull request. First on a machine you own that stays on, later in an optional managed cloud.",
    state: "next",
  },
  {
    title: "iPhone companion",
    body: "Check progress, review the evidence and steer your agents from your phone.",
    state: "next",
  },
];

const TODAY = [
  "Durable history and reconnect; an uncertain step is never repeated automatically",
  "Claude Code in the desktop app, one branch and worktree per workspace (early, not a sandbox)",
  "On task submission, the desktop explains what to do when Claude Code is missing, outdated or signed out",
  "After a service restart on the same boot, check whether the recorded agent process group is gone before starting a new task",
  "A local macOS desktop app, built from source",
  "Argent’s own record of what each run changed",
  "A changes panel with current files and a bounded diff (not tested)",
  "Approved checks in a fresh checkout of the exact commit",
  "A report of recognised changes to tests, check configuration, npm scripts and dependencies before consent",
  "GitHub draft pull requests containing the reviewed checks and judging-changes report",
  "Simulation-history export and read-only restore, from the command line",
];

const NOT_YET = [
  "Export of real Claude Code history and Git changes",
  "One list showing which workspaces need you and why (the first update after release)",
  "Checked links between workspaces (an experiment after that)",
  "Codex and the model picker, then further project rules",
  "Work that continues with your laptop closed, and the iPhone companion",
  "Signed downloads: today you build from source",
];

export function Roadmap() {
  const rail = useRef<HTMLOListElement>(null);
  const [lit, setLit] = useState(false);

  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setLit(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
          Each step ends with working evidence, not a date. After these come
          team handoff and dependent tasks.{" "}
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

      <div
        data-light
        className="silver-surface mt-12 rounded-3xl px-6 py-10 md:px-10"
      >
        <ol
          ref={rail}
          data-lit={lit}
          className="roadmap-rail grid gap-10 md:grid-cols-3 md:gap-8 xl:grid-cols-6 xl:gap-6"
        >
          {MILESTONES.map((milestone) => (
            <li
              key={milestone.title}
              className="roadmap-stop"
              data-state={milestone.state}
            >
              <span aria-hidden className="roadmap-node">
                {milestone.state === "now" && (
                  <span className="roadmap-here">You are here</span>
                )}
              </span>
              <p className="roadmap-label">
                {milestone.state === "done"
                  ? "Works today"
                  : milestone.state === "now"
                    ? "In development · Claude Code runs today"
                    : "Planned"}
              </p>
              <h3 className="display mt-2 text-[1.35rem] leading-tight tracking-[-0.04em]">
                {milestone.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-sterling">
                {milestone.body}
              </p>
            </li>
          ))}
        </ol>
      </div>

      <p className="mt-6 max-w-[60rem] text-sm leading-relaxed text-sterling">
        Planned checked links warn when two workspaces change the same paths and
        run approved tests on a trial merge of their exact commits. The result
        becomes stale when either commit changes. A link grants no access and
        carries no messages between agents.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div className="rounded-3xl border border-hairline p-7">
          <h3
            id="roadmap-today"
            className="flex items-center gap-2 text-base font-medium text-polished"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-verified" />
            Works today
          </h3>
          <ul
            aria-labelledby="roadmap-today"
            className="mt-4 grid gap-2.5 text-[0.9375rem] text-sterling"
          >
            {TODAY.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl border border-hairline p-7">
          <h3 className="flex items-center gap-2 text-base font-medium text-polished">
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-sterling-dim"
            />
            Not yet
          </h3>
          <ul className="mt-4 grid gap-2.5 text-[0.9375rem] text-sterling">
            {NOT_YET.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
