"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { M0, ROADMAP_URL, STATUS_LABEL, type Status } from "@/lib/site";

const MILESTONES: {
  id: string;
  title: string;
  body: string;
  status: Status;
}[] = [
  {
    id: "M0",
    title: "Durable engine",
    body: `Scripted runs, an independent worker, crash recovery and reconnect. ${M0.testsPassed} of ${M0.testsTotal} tests pass.`,
    status: "live",
  },
  {
    id: "P1",
    title: "Desktop prototype",
    body: "Install and launch Argent on macOS. Create workspaces, start tasks and reconnect to their history.",
    status: "next",
  },
  {
    id: "",
    title: "Downloads",
    body: "Signed, versioned builds with checksums, downloadable from this site.",
    status: "planned",
  },
  {
    id: "M1",
    title: "Cloud MVP",
    body: "One GitHub repository, one persistent cloud workspace, one real agent and a tested draft pull request.",
    status: "planned",
  },
  {
    id: "M2",
    title: "More agents",
    body: "Additional agents and tasks that wait on each other, each in its own worktree.",
    status: "planned",
  },
];

const ease = [0.22, 1, 0.36, 1] as const;

export function Roadmap() {
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });

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
          Early, and honest about it.
        </h2>
        <p className="max-w-[34rem] text-sterling md:col-span-5">
          Each milestone ends with evidence, not a date. Here is what exists and
          what comes next, in order.{" "}
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

      <ol
        ref={ref}
        className="relative mt-16 grid gap-10 md:grid-cols-5 md:gap-6"
      >
        {/* Track: filled through M0, with the present just past it. */}
        <div
          aria-hidden
          className="absolute top-[0.6875rem] left-0 hidden h-px w-full bg-hairline md:block"
        >
          <motion.div
            className="h-full origin-left bg-polished"
            initial={{ scaleX: 0 }}
            animate={inView ? { scaleX: 0.29 } : undefined}
            transition={{ duration: 1.6, ease, delay: 0.2 }}
          />
        </div>
        <div
          aria-hidden
          className="absolute top-0 bottom-0 left-[0.6875rem] w-px bg-hairline md:hidden"
        />

        {MILESTONES.map((milestone, index) => (
          <motion.li
            key={milestone.title}
            className="relative pl-10 md:pl-0"
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.6, ease, delay: 0.25 + index * 0.12 }}
          >
            <span
              aria-hidden
              className={`absolute top-0 left-0 flex size-[1.375rem] items-center justify-center rounded-full border ${
                milestone.status === "live"
                  ? "border-polished bg-polished"
                  : milestone.status === "next"
                    ? "border-running bg-oxide"
                    : "border-hairline-strong bg-oxide"
              }`}
            >
              {milestone.status === "next" && (
                <span className="size-2 rounded-full bg-running" />
              )}
            </span>
            <p className="text-[0.8125rem] text-sterling-dim md:mt-10">
              {milestone.id || "\u00a0"}
            </p>
            <h3 className="display mt-2 text-[1.75rem] leading-none">
              {milestone.title}
            </h3>
            <p className="mt-3 text-[0.9375rem] text-sterling">
              {milestone.body}
            </p>
            <p
              className={`mt-4 text-[0.8125rem] ${
                milestone.status === "live"
                  ? "text-verified"
                  : milestone.status === "next"
                    ? "text-running"
                    : "text-sterling-dim"
              }`}
            >
              {STATUS_LABEL[milestone.status]}
            </p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
