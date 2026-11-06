"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { Mercury } from "@/components/mercury";
import { GitHubIcon, MagneticLink } from "@/components/ui";
import { REPO_URL } from "@/lib/site";

const LINES = [
  "Hand off the work.",
  "Close the laptop.",
  "Come back to proof.",
];
const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const mercuryY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const copyY = useTransform(scrollYProgress, [0, 1], ["0%", "-12%"]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section
      ref={ref}
      className="relative isolate flex min-h-[100svh] items-end overflow-hidden pt-[46svh] pb-14 md:items-center md:pt-28 md:pb-0"
    >
      <motion.div
        style={{ y: mercuryY }}
        initial={{ opacity: 0, scale: 1.06 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.8, ease }}
        className="absolute inset-x-0 top-0 -z-10 h-[52svh] [mask-image:linear-gradient(to_bottom,transparent_0%,black_22%,black_64%,transparent_100%)] md:inset-y-0 md:h-auto md:[mask-image:linear-gradient(to_right,transparent_34%,black_68%)]"
      >
        <Mercury className="size-full" />
      </motion.div>

      <motion.div
        style={{ y: copyY, opacity: copyOpacity }}
        className="mx-auto w-full max-w-[1320px] px-6 md:px-10"
      >
        <h1 className="display text-[clamp(2.9rem,7.6vw,7.6rem)] text-polished">
          {LINES.map((line, index) => (
            <span key={line} className="block overflow-hidden pb-[0.08em]">
              <motion.span
                className="block"
                initial={{ y: "105%" }}
                animate={{ y: "0%" }}
                transition={{ duration: 1.1, delay: 0.25 + index * 0.12, ease }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.85, ease }}
        >
          <p className="mt-8 max-w-[34rem] text-lg text-sterling md:text-xl md:leading-relaxed">
            Argent is an open-source desktop app for running AI coding agents in
            persistent workspaces. Runs keep going when you disconnect, results
            are checked independently, and nothing merges without your approval.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <MagneticLink href={REPO_URL} target="_blank" rel="noreferrer">
              <GitHubIcon />
              Star on GitHub
            </MagneticLink>
            <MagneticLink href="#run" variant="ghost">
              Run the simulator
            </MagneticLink>
          </div>

          <p className="mt-6 flex max-w-[34rem] items-start gap-2.5 text-[0.9375rem] text-sterling-dim">
            <span
              aria-hidden
              className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-running"
            />
            The macOS app is in development. Today you can run the durable
            engine as a local simulator.
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}
