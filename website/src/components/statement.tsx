"use client";

import { motion, useReducedMotion } from "motion/react";
import { AgMark } from "@/components/ui";
import { SectionSignature } from "@/components/section-signature";

export function Statement() {
  const reduce = useReducedMotion();
  return (
    <section
      aria-labelledby="statement-title"
      className="mx-auto max-w-[1320px] px-6 py-24 md:px-10 md:py-32"
    >
      <SectionSignature number="01" label="The nature of Argent" kind="orbit" />
      <div className="grid items-center gap-12 md:grid-cols-12">
        <motion.div
          className="md:col-span-8"
          initial={{ opacity: 1, y: reduce ? 0 : 20 }}
          whileInView={{ y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ type: "spring", visualDuration: 0.7, bounce: 0 }}
        >
          <h2
            id="statement-title"
            className="display max-w-[15ch] text-[clamp(2.75rem,6.2vw,6rem)]"
          >
            Argent is a<br />
            good conductor.
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
        <motion.div
          aria-hidden
          className="relative mx-auto flex aspect-square w-full max-w-60 items-center justify-center md:col-span-4 md:max-w-72"
          initial={{ rotate: reduce ? 0 : -20 }}
          whileInView={{ rotate: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className="absolute inset-4 rounded-full border border-hairline-strong"
              style={{
                transform: `rotate(${index * 45}deg) scaleX(${0.35 + index * 0.16})`,
              }}
            />
          ))}
          <span className="absolute inset-1 rounded-full border border-hairline" />
          <span className="absolute inset-8 rounded-full bg-[radial-gradient(circle,rgb(238_241_245/0.07),transparent_70%)]" />
          <AgMark size={68} />
          <span className="metal-node absolute top-3 left-1/2 size-3 rounded-full" />
          <span className="absolute -bottom-3 font-mono text-[0.625rem] tracking-[0.16em] text-sterling-dim uppercase">
            Ag · connection by nature
          </span>
        </motion.div>
      </div>
    </section>
  );
}
