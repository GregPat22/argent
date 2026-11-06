"use client";

import { useReducedMotion } from "@/lib/use-reduced-motion";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { AgMark } from "@/components/ui";
import { DOCS_URL, LICENSE_URL, REPO_URL, ROADMAP_URL } from "@/lib/site";

const LINKS = [
  { href: REPO_URL, label: "GitHub" },
  { href: DOCS_URL, label: "Project context" },
  { href: ROADMAP_URL, label: "Roadmap" },
  { href: LICENSE_URL, label: "MIT license" },
];

export function Footer() {
  const reduce = useReducedMotion();
  const pointer = useMotionValue(0.3);
  const smooth = useSpring(pointer, { stiffness: 60, damping: 20 });
  const sheen = useTransform(smooth, [0, 1], ["0%", "100%"]);

  return (
    <footer
      className="relative overflow-hidden"
      onPointerMove={(event) => {
        if (reduce) return;
        const rect = event.currentTarget.getBoundingClientRect();
        pointer.set((event.clientX - rect.left) / rect.width);
      }}
    >
      <div className="mx-auto max-w-[1320px] px-6 pt-20 pb-10 md:px-10">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="flex items-start gap-4 md:col-span-6">
            <span className="shrink-0">
              <AgMark size={44} />
            </span>
            <p className="max-w-[26rem] text-[0.9375rem] text-sterling">
              Argent blends <em>argento</em>, Italian for silver, with agent.
              Silver conducts electricity better than any other metal.
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-8 gap-y-3 text-[0.9375rem] text-sterling md:col-span-6 md:justify-end">
            {LINKS.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center transition-colors hover:text-polished"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <motion.p
          aria-hidden
          style={{ "--sheen": sheen } as Record<string, unknown>}
          className="logo-display silver-text mt-10 pb-[0.3em] text-center text-[clamp(6rem,27vw,26rem)] leading-[0.82] select-none"
        >
          Argent
        </motion.p>

        <p className="mt-8 text-[0.8125rem] text-sterling-dim">
          © 2026 Argent contributors. This page is a draft. Nothing here is a
          release announcement.
        </p>
      </div>
    </footer>
  );
}
