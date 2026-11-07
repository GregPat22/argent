"use client";

import { useReducedMotion } from "@/lib/use-reduced-motion";

import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent, useRef, useState } from "react";

const STAGES = [
  {
    tab: "Define the work",
    title: "A clear brief. A place to work.",
    body: "Describe the outcome and the checks that would prove it. Argent’s planned workflow gives the task its own branch or worktree in a persistent workspace.",
    details: [
      "Written acceptance criteria",
      "An isolated task branch",
      "Files and dependencies retained",
    ],
  },
  {
    tab: "Run within limits",
    title: "Room to work. Boundaries in place.",
    body: "The worker owns execution. Set time and turn limits and a spend budget before the agent starts. Close the app and return to the record; an unknown outcome stops for inspection.",
    details: [
      "Scoped credentials and permissions",
      "Explicit execution limits",
      "Reconnect reads saved history",
    ],
  },
  {
    tab: "Review the evidence",
    title: "The agent finishes. You decide.",
    body: "Trusted checks verify the exact commit. An independent review can request one bounded repair. The draft pull request carries that evidence, and the merge stays yours.",
    details: [
      "Exact-commit checks and separate review",
      "At most one repair, then recheck",
      "A draft pull request; human merge authority",
    ],
  },
];

function WorkspacePreview() {
  return (
    <div className="space-y-6">
      <p className="font-mono text-xs text-sterling-dim">
        specs / rate-limit-login.md
      </p>
      <p className="display max-w-[19ch] text-[1.9rem]">
        Rate-limit the login endpoint.
      </p>
      <ul className="space-y-3 text-sm text-sterling">
        {[
          "Five failed logins lock the account for 15 minutes",
          "Successful login resets the counter",
          "Locked responses return 429 with Retry-After",
        ].map((text) => (
          <li key={text} className="flex gap-3">
            <span
              aria-hidden
              className="mt-1.5 size-3 shrink-0 rounded-[3px] border border-hairline-strong"
            />
            {text}
          </li>
        ))}
      </ul>
      <div className="rounded-xl bg-oxide/70 p-4">
        <p className="text-xs text-sterling-dim">
          Task branch · persistent workspace
        </p>
        <p className="mt-2 break-all font-mono text-sm text-polished">
          argent/rate-limit-login
        </p>
      </div>
    </div>
  );
}

function ExecutionPreview() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-sterling-dim">
          workspace / example-project
        </p>
        <span className="text-xs text-running">Running</span>
      </div>
      <p className="display text-[1.9rem]">The work has a boundary.</p>
      <dl className="space-y-5">
        {[
          ["Wall time", "12 / 30 min", 0.4],
          ["Agent turns", "18 / 60 turns", 0.3],
          ["Budget used", "$2 / $5", 0.4],
        ].map(([label, value, ratio]) => (
          <div key={label}>
            <div className="flex justify-between gap-4 text-sm">
              <dt className="text-sterling">{label}</dt>
              <dd className="font-mono text-xs text-polished">{value}</dd>
            </div>
            <div aria-hidden className="mt-2 h-1 rounded-full bg-oxide">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sterling-dim to-polished"
                style={{ width: `${Number(ratio) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </dl>
      <p className="rounded-xl bg-oxide/70 p-4 text-sm text-sterling">
        The app can disconnect. The worker retains its record. Uncertain effects
        are inspected before another attempt.
      </p>
    </div>
  );
}

function EvidencePreview() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-sterling-dim">
          draft pull request
        </p>
        <span className="text-xs text-verified">Awaiting your review</span>
      </div>
      <p className="display text-[1.9rem]">A result you can inspect.</p>
      <dl className="divide-y divide-hairline">
        {[
          ["Commit", "9b1e07d"],
          ["Trusted checks", "39 / 39 passed"],
          ["Independent review", "1 finding, repaired"],
          ["Repair budget", "1 / 1 used"],
          ["Merge authority", "You"],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-5 py-3 text-sm">
            <dt className="text-sterling-dim">{label}</dt>
            <dd className="text-right text-polished">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-sterling">
        Inspect the diff, checks and review. Decide what lands.
      </p>
    </div>
  );
}
const PREVIEWS = [WorkspacePreview, ExecutionPreview, EvidencePreview];

export function Lifecycle() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const reduce = useReducedMotion();
  const stage = STAGES[active]!;
  const Preview = PREVIEWS[active]!;
  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (index + 1) % STAGES.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index + STAGES.length - 1) % STAGES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = STAGES.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section
      id="lifecycle"
      aria-labelledby="lifecycle-title"
      className="mx-auto max-w-[1320px] scroll-mt-24 px-6 py-24 md:px-10 md:py-32"
    >
      <div className="grid items-end gap-8 md:grid-cols-12">
        <h2
          id="lifecycle-title"
          className="display max-w-[16ch] text-[clamp(2.4rem,5vw,4.6rem)] md:col-span-7"
        >
          Your intent.
          <br />
          Your agents.
          <br />
          Your call.
        </h2>
        <p className="max-w-[34rem] text-sterling md:col-span-5">
          A shorter path from a clear task to a change you can trust. This is
          the planned workflow. Today’s local prototype runs Claude Code on your
          computer; diff review, repository checks and cloud workspaces are
          still ahead.
        </p>
      </div>
      <div
        role="tablist"
        aria-label="Explore the planned workflow"
        className="mt-12 grid gap-2 sm:grid-cols-3"
      >
        {STAGES.map((item, index) => (
          <button
            key={item.tab}
            ref={(el) => {
              tabs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`workflow-tab-${index}`}
            aria-controls="workflow-panel"
            aria-selected={active === index}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`workflow-tab min-h-14 rounded-xl px-5 text-left text-sm ${active === index ? "bg-polished text-oxide" : "bg-pewter/50 text-sterling hover:bg-pewter hover:text-polished"}`}
          >
            {item.tab}
          </button>
        ))}
      </div>
      <div
        id="workflow-panel"
        role="tabpanel"
        aria-labelledby={`workflow-tab-${active}`}
        tabIndex={0}
        className="mt-6 rounded-3xl bg-gradient-to-br from-pewter/80 to-oxide p-6 md:p-10"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -8 }}
            transition={{ duration: reduce ? 0 : 0.22 }}
            className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
          >
            <div>
              <h3 className="display max-w-[18ch] text-[clamp(1.8rem,3vw,2.8rem)]">
                {stage.title}
              </h3>
              <p className="mt-5 max-w-[30rem] text-sterling">{stage.body}</p>
              <ul className="mt-7 space-y-3 text-sm text-polished">
                {stage.details.map((detail) => (
                  <li key={detail} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-[.6em] size-1 shrink-0 rounded-full bg-sterling-dim"
                    />
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-hairline bg-pewter/60 p-5 md:p-7">
              <Preview />
            </div>
          </motion.div>
        </AnimatePresence>
        <p className="mt-8 text-xs text-sterling-dim">
          Illustrative planned workflow · example limits, commit and check
          results.
        </p>
      </div>
    </section>
  );
}
