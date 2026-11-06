"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { useRef, useState } from "react";
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
  const reduce = useReducedMotion();
  const [paused, setPaused] = useState(false);
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
      className="relative isolate flex min-h-[100svh] items-end overflow-hidden pt-[40svh] pb-14 md:items-center md:pt-28 md:pb-0"
    >
      <motion.div
        style={reduce ? undefined : { y: mercuryY }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.8, ease }}
        className="absolute inset-x-0 top-0 -z-10 h-[46svh] [mask-image:linear-gradient(to_bottom,transparent_0%,black_22%,black_64%,transparent_100%)] md:inset-y-0 md:h-auto md:[mask-image:linear-gradient(to_right,transparent_34%,black_68%)]"
      >
        <Mercury className="size-full" paused={paused} />
      </motion.div>

      <button
        type="button"
        onClick={() => setPaused((value) => !value)}
        aria-pressed={paused}
        className="motion-reduce:hidden absolute top-[32svh] right-6 z-10 flex min-h-11 items-center gap-2 rounded-full border border-hairline bg-oxide/60 px-4 font-mono text-[0.625rem] tracking-wider text-sterling backdrop-blur-sm md:top-auto md:right-10 md:bottom-10"
      >
        {paused ? "Resume sculpture" : "Pause sculpture"}
        <span aria-hidden>{paused ? "▶" : "Ⅱ"}</span>
      </button>
      <motion.div
        style={reduce ? undefined : { y: copyY, opacity: copyOpacity }}
        className="mx-auto w-full max-w-[1320px] px-6 md:px-10"
      >
        <p className="mb-6 font-mono text-[0.6875rem] tracking-[0.16em] text-sterling uppercase">
          Open source. Independent by design.
        </p>
        <h1 className="display text-[clamp(2rem,10vw,4.5rem)] md:text-[clamp(2.7rem,6vw,6rem)] text-polished">
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
            An open-source desktop app being built to coordinate AI coding
            agents in persistent workspaces. Independent checks. A durable
            record. The final say stays with you.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <MagneticLink href={REPO_URL} target="_blank" rel="noreferrer">
              <GitHubIcon />
              View on GitHub
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
            Local desktop prototype complete · simulated execution. Real agents,
            cloud workspaces and public downloads are next.
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}
