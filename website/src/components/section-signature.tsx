"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";

/** A single material language: drawn silver traces, rather than ambient loops. */
export function SectionSignature({
  number,
  label,
  kind = "trace",
}: {
  number: string;
  label: string;
  kind?: "trace" | "orbit" | "seal";
}) {
  const gradient = useId();
  const reduce = useReducedMotion();
  const paths =
    kind === "orbit"
      ? [
          "M8 30C8 2 112 2 112 30S8 58 8 30Z",
          "M20 30C20 12 100 12 100 30S20 48 20 30Z",
          "M42 30C42 0 78 0 78 30S42 60 42 30Z",
        ]
      : kind === "seal"
        ? [
            "M60 4 84 12 104 30 84 48 60 56 36 48 16 30 36 12Z",
            "M60 12 78 18 92 30 78 42 60 48 42 42 28 30 42 18Z",
            "M48 30h24M60 18v24",
          ]
        : [
            "M0 30h26c20 0 20-20 40-20h54",
            "M0 30h26c20 0 20 20 40 20h54",
            "M0 30h120",
          ];
  return (
    <div className="mb-9 flex items-center gap-4 border-t border-hairline pt-5 md:mb-12">
      <span className="font-mono text-xs text-sterling-dim">{number}</span>
      <span className="text-[0.6875rem] font-medium tracking-[0.17em] text-sterling uppercase">
        {label}
      </span>
      <span
        aria-hidden
        className="ml-auto h-px max-w-40 flex-1 bg-gradient-to-r from-transparent to-hairline-strong"
      />
      <motion.svg
        aria-hidden
        viewBox="0 0 120 60"
        className="h-10 w-20 shrink-0 overflow-visible"
        initial="rest"
        whileInView="drawn"
        viewport={{ once: true, amount: 0.8 }}
      >
        <defs>
          <linearGradient id={gradient}>
            <stop stopColor="#616b79" />
            <stop offset=".45" stopColor="#f6f8fb" />
            <stop offset=".7" stopColor="#8993a1" />
            <stop offset="1" stopColor="#d6dfe9" />
          </linearGradient>
        </defs>
        {paths.map((d, index) => (
          <motion.path
            key={d}
            d={d}
            fill="none"
            stroke={`url(#${gradient})`}
            strokeWidth="1.15"
            variants={{
              rest: { pathLength: reduce ? 1 : 0, opacity: reduce ? 1 : 0 },
              drawn: { pathLength: 1, opacity: 1 },
            }}
            transition={{
              duration: reduce ? 0 : 1.2,
              delay: reduce ? 0 : index * 0.12,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        ))}
      </motion.svg>
    </div>
  );
}
