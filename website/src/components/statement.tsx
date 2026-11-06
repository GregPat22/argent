"use client";

import { useReducedMotion } from "@/lib/use-reduced-motion";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { SilverAtom } from "@/components/silver-atom";

export function Statement() {
  const reduce = useReducedMotion();
  const word = useRef<HTMLSpanElement>(null);
  const inView = useInView(word, { once: true, amount: 0.8 });
  return (
    <section
      aria-labelledby="statement-title"
      className="mx-auto max-w-[1320px] px-6 py-24 md:px-10 md:py-32"
    >
      <div className="grid items-center gap-10 md:grid-cols-12 md:gap-12">
        <motion.div
          className="min-w-0 md:col-span-8"
          initial={{ y: reduce ? 0 : 20 }}
          whileInView={{ y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ type: "spring", visualDuration: 0.7, bounce: 0 }}
        >
          <h2
            id="statement-title"
            className="display max-w-[15ch] text-[clamp(2.75rem,6.2vw,6rem)]"
          >
            Argent is a<br />
            good{" "}
            <span
              ref={word}
              className={`conductor-silver ${inView ? "is-revealed" : ""}`}
            >
              conductor
            </span>
            .
          </h2>
          <p className="mt-8 max-w-[34rem] text-lg text-sterling md:text-xl">
            Silver connects. Argent coordinates. From your intent to an
            independently checked change, with a clear record and you in
            control.
          </p>
          <p className="mt-5 max-w-[34rem] text-sm text-sterling-dim">
            That’s the direction. Today’s local prototype proves durable
            orchestration with simulated work. Real agents and cloud workspaces
            come next.
          </p>
        </motion.div>
        <div className="min-w-0 md:col-span-4">
          <SilverAtom />
        </div>
      </div>
    </section>
  );
}
