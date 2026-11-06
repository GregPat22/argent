"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import { useRef } from "react";
import { SectionSignature } from "@/components/section-signature";
import { AgMark } from "@/components/ui";
import { M0, ROADMAP_URL } from "@/lib/site";

const MILESTONES = [
  {
    id: "M0",
    title: "Durable engine",
    body: `Scripted runs, an independent worker, crash recovery and reconnect. ${M0.testsPassed} of ${M0.testsTotal} tests pass.`,
    label: "Works today · simulation",
    complete: true,
  },
  {
    id: "P1",
    title: "Desktop prototype",
    body: "A local macOS app with workspaces, tasks and retained history. Complete on the desktop review branch; execution is simulated.",
    label: "Prototype complete · review branch",
    complete: true,
  },
  {
    id: "Release",
    title: "Public downloads",
    body: "Signed, versioned builds with checksums, downloadable from this site.",
    label: "Planned",
    complete: false,
  },
  {
    id: "M1",
    title: "Cloud MVP",
    body: "One GitHub repository, one persistent cloud workspace, one real agent and an independently tested draft pull request.",
    label: "Planned",
    complete: false,
  },
  {
    id: "M2",
    title: "More agents",
    body: "Additional agents and dependent tasks, each in its own worktree.",
    label: "Planned",
    complete: false,
  },
];

export function Roadmap() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.65"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });
  return (
    <section
      id="roadmap"
      aria-labelledby="roadmap-title"
      className="mx-auto max-w-[1320px] scroll-mt-24 px-6 py-24 md:px-10 md:py-32"
    >
      <SectionSignature
        number="06"
        label="Conducting what comes next"
        kind="trace"
      />
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
          what comes next.{" "}
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
        ref={ref}
        className="silver-surface relative mt-12 overflow-hidden rounded-3xl border border-hairline-strong px-6 py-8 md:px-10"
      >
        <div className="mb-8 flex items-center justify-between border-b border-hairline pb-6">
          <div className="flex items-center gap-3">
            <AgMark size={32} />
            <p className="font-mono text-[0.6875rem] tracking-[0.14em] text-sterling uppercase">
              A continuous thread
            </p>
          </div>
          <span className="hidden text-xs text-sterling-dim sm:block">
            Built on evidence. Always.
          </span>
        </div>
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-y-6 left-[11px] w-px bg-hairline-strong md:inset-x-3 md:top-[11px] md:bottom-auto md:h-px md:w-auto"
          >
            <motion.div
              style={reduce ? { scale: 1 } : { scaleX: progress }}
              className="hidden h-full origin-left bg-gradient-to-r from-sterling-dim via-polished to-sterling md:block"
            />
            <motion.div
              style={reduce ? { scale: 1 } : { scaleY: progress }}
              className="h-full origin-top bg-gradient-to-b from-polished to-sterling md:hidden"
            />
          </div>
          <ol className="grid gap-8 md:grid-cols-5 md:gap-6">
            {MILESTONES.map((milestone, index) => (
              <motion.li
                key={milestone.id}
                className="relative pl-10 md:pl-0"
                initial={{ opacity: 1, y: reduce ? 0 : 24 }}
                whileInView={{ y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{
                  type: "spring",
                  visualDuration: 0.65,
                  bounce: 0,
                  delay: reduce ? 0 : index * 0.07,
                }}
              >
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
              </motion.li>
            ))}
          </ol>
        </div>
        <p className="mt-8 border-t border-hairline pt-5 text-xs text-sterling-dim">
          The silver trace follows your reading progress. Milestone labels show
          delivery status.
        </p>
      </div>
    </section>
  );
}
