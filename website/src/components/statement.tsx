"use client";

import { motion } from "motion/react";
import { SilverAtom } from "@/components/silver-atom";
import { useReducedMotion } from "@/lib/use-reduced-motion";

export function Statement() {
  const reduce = useReducedMotion();
  return (
    <section
      aria-labelledby="statement-title"
      className="mx-auto max-w-[1320px] px-6 py-24 md:px-10 md:py-32"
    >
      <div className="grid items-center gap-10 md:grid-cols-12 md:gap-12">
        <motion.div
          className="min-w-0 md:col-span-7"
          initial={{ y: reduce ? 0 : 20 }}
          whileInView={{ y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ type: "spring", visualDuration: 0.7, bounce: 0 }}
        >
          <h2
            id="statement-title"
            className="display max-w-[16ch] text-[clamp(2.5rem,5.5vw,5rem)]"
          >
            Assign a task.
            <br />
            Review the changes.
          </h2>
          <p className="mt-8 max-w-[34rem] text-lg leading-[1.75] text-sterling md:text-xl">
            Give a coding agent a task, set its limits, and follow its progress
            from one desktop app. Review the code changes, test results and
            independent review before deciding what to merge.
          </p>
          <p className="mt-6 max-w-[34rem] text-base leading-[1.75] text-sterling-dim">
            That’s the planned workflow. Today’s local desktop prototype runs
            simulated tasks and verifies their saved artifacts. Real coding
            agents, repository checks and cloud workspaces are still in
            development.
          </p>
        </motion.div>
        <div className="min-w-0 md:col-span-5">
          <SilverAtom />
        </div>
      </div>
    </section>
  );
}
