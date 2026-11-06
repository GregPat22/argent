"use client";

import { SectionSignature } from "@/components/section-signature";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { StatusTag } from "@/components/ui";

const RECORD: [string, ReactNode][] = [
  [
    "Status",
    <span key="s" className="text-verified">
      Verified
    </span>,
  ],
  [
    "Commit",
    <span key="c" className="font-mono">
      9b1e07d
    </span>,
  ],
  ["Checks", "39 of 39, from the project’s policy"],
  ["Review", "1 finding, repaired once"],
  ["Verified by", "Argent’s verifier, not the agent"],
  ["Merge", "Waiting for you"],
];

function Comparison() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduceMotion = useReducedMotion();
  const position = useMotionValue(0.86);
  const smooth = useSpring(position, {
    stiffness: 380,
    damping: 40,
    restDelta: 0.0005,
  });
  const clipPath = useTransform(
    smooth,
    [0, 1],
    ["inset(0 0 0 0%)", "inset(0 0 0 100%)"],
  );
  const left = useTransform(smooth, [0, 1], ["0%", "100%"]);
  const handleOffset = useTransform(smooth, [0, 1], [28, -28]);
  const dragging = useRef(false);
  const [percent, setPercent] = useState(86);
  useMotionValueEvent(position, "change", (value) =>
    setPercent(Math.round(value * 100)),
  );

  // One hint on arrival: the divider glides to the middle.
  useEffect(() => {
    if (!inView) return;
    if (reduceMotion) position.set(0.5);
    else
      animate(position, 0.5, {
        type: "spring",
        visualDuration: 1.2,
        bounce: 0.15,
        delay: 0.3,
      });
  }, [inView, position, reduceMotion]);

  const setFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    position.set(
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowLeft: -0.05,
      ArrowRight: 0.05,
      PageDown: -0.2,
      PageUp: 0.2,
    };
    if (event.key in steps)
      position.set(
        Math.min(1, Math.max(0, position.get() + steps[event.key]!)),
      );
    else if (event.key === "Home") position.set(0);
    else if (event.key === "End") position.set(1);
    else return;
    event.preventDefault();
  };

  return (
    <div
      ref={ref}
      className="relative h-[30rem] cursor-ew-resize touch-pan-y overflow-hidden rounded-2xl border border-hairline-strong select-none sm:h-[22rem]"
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setFromPointer(event);
      }}
      onPointerMove={(event) => dragging.current && setFromPointer(event)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      {/* What the agent says */}
      <div className="absolute inset-0 bg-pewter p-6 sm:p-8">
        <p className="text-[0.875rem] text-sterling-dim">What the agent says</p>
        <div className="mt-6 max-w-[22rem] rounded-2xl rounded-tl-md bg-pewter-2 px-4 py-3.5 text-[1.0625rem] leading-snug text-polished">
          Done. I added rate limiting to the login endpoint and all tests pass.
          Ready to merge.
        </div>
        <p className="mt-4 max-w-[22rem] text-[0.875rem] text-sterling-dim">
          Self-reported. No commit, no check results, no review attached.
        </p>
      </div>

      {/* What Argent records */}
      <motion.div
        style={{ clipPath }}
        className="guilloche absolute inset-0 bg-[#101217] p-6 sm:p-8"
      >
        <div className="ml-auto max-w-[24rem]">
          <p className="text-right text-[0.875rem] text-sterling-dim">
            What Argent records
          </p>
          <dl className="mt-5 divide-y divide-hairline rounded-xl border border-hairline bg-oxide/60 backdrop-blur-sm">
            {RECORD.map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-6 px-4 py-2.5 text-[0.9375rem]"
              >
                <dt className="text-sterling-dim">{label}</dt>
                <dd className="text-right text-polished">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </motion.div>

      {/* Divider */}
      <motion.div
        style={{ left }}
        className="pointer-events-none absolute inset-y-0 w-0"
      >
        <div className="absolute inset-y-0 -left-px w-0.5 bg-gradient-to-b from-transparent via-polished to-transparent" />
        <motion.div
          style={{ x: handleOffset }}
          role="slider"
          tabIndex={0}
          aria-label="Compare the agent’s claim with Argent’s record"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}% shows the agent’s claim, ${100 - percent}% shows Argent’s record`}
          onKeyDown={onKeyDown}
          className="pointer-events-auto absolute top-1/2 left-0 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-polished text-oxide shadow-[0_10px_30px_rgb(0_0_0/0.5)]"
        >
          <svg
            viewBox="0 0 20 20"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <path d="M7 5 2 10l5 5M13 5l5 5-5 5" />
          </svg>
        </motion.div>
      </motion.div>
    </div>
  );
}

type Mark = { name: string; body: string; glyph: ReactNode };

const MARKS: Mark[] = [
  {
    name: "Maker’s mark",
    body: "Which agent did the work, and the limits it ran under.",
    glyph: (
      <>
        <path d="M10 14h60l6 12-6 12H10l-6-12z" />
        <text x="40" y="31.5" textAnchor="middle" fontSize="15">
          AI
        </text>
      </>
    ),
  },
  {
    name: "Standard mark",
    body: "The checks it had to pass, from a policy the agent can’t change.",
    glyph: (
      <>
        <ellipse cx="40" cy="26" rx="32" ry="17" />
        <path d="m29 26 7 7 15-15" strokeWidth="3.2" />
      </>
    ),
  },
  {
    name: "Assay office mark",
    body: "Who verified the result. Never the agent that produced it.",
    glyph: (
      <>
        <path d="M14 8h52v18c0 12-12 20-26 24-14-4-26-12-26-24z" />
        <text x="40" y="34" textAnchor="middle" fontSize="18">
          Ag
        </text>
      </>
    ),
  },
  {
    name: "Date letter",
    body: "The exact commit those checks ran against.",
    glyph: (
      <>
        <path d="M18 8h44l8 8v20l-8 8H18l-8-8V16z" />
        <text x="40" y="31.5" textAnchor="middle" fontSize="14">
          9b1e
        </text>
      </>
    ),
  },
];

function Hallmarks() {
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });

  return (
    <ol
      ref={ref}
      className="mt-20 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4"
    >
      {MARKS.map((mark, index) => (
        <li key={mark.name}>
          <motion.svg
            viewBox="0 0 80 52"
            className="h-16 w-auto text-polished"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            fontFamily="var(--font-display)"
            aria-hidden
            initial={{
              opacity: 0,
              scale: 1.7,
              rotate: -8,
              filter: "blur(4px)",
            }}
            animate={
              inView
                ? { opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)" }
                : undefined
            }
            transition={{
              type: "spring",
              visualDuration: 0.35,
              bounce: 0.35,
              delay: 0.2 + index * 0.22,
            }}
            style={{ originX: 0 }}
          >
            <g className="[&_text]:fill-current [&_text]:stroke-none">
              {mark.glyph}
            </g>
          </motion.svg>
          <h3 className="mt-5 text-[1.0625rem] font-medium text-polished">
            {mark.name}
          </h3>
          <p className="mt-2 max-w-[17rem] text-[0.9375rem] text-sterling">
            {mark.body}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function Hallmark() {
  return (
    <section
      id="hallmark"
      aria-labelledby="hallmark-title"
      className="mx-auto max-w-[1320px] scroll-mt-24 px-6 py-24 md:px-10 md:py-36"
    >
      <SectionSignature number="04" label="Proof, not promises" kind="seal" />
      <div className="grid gap-10 md:grid-cols-12">
        <h2
          id="hallmark-title"
          className="display text-[clamp(2.4rem,5vw,4.6rem)] md:col-span-7"
        >
          A silversmith can’t hallmark their own silver.
        </h2>
        <div className="md:col-span-5 md:pt-3">
          <p className="max-w-[34rem] text-sterling">
            For over seven hundred years, silver has gone to an independent
            assay office before it gets its stamp. Argent applies the same rule
            to code. The agent does the work, something else checks it, and the
            record says exactly what was checked.
          </p>
        </div>
      </div>

      <div className="mt-14">
        <p className="mb-4 text-sm text-sterling-dim">
          Illustrative planned workflow · example commit and simulated check
          results. Drag the divider or use arrow keys.
        </p>
        <Comparison />
      </div>

      <Hallmarks />

      <div className="mt-14 flex flex-col gap-4 border-t border-hairline pt-6 md:flex-row md:items-center md:justify-between">
        <p className="max-w-[40rem] text-[0.9375rem] text-sterling-dim">
          In M0, a separate verifier checks a simulated artifact’s identity and
          SHA-256 before a run can complete. Repository tests and exact-commit
          evidence arrive with M1.
        </p>
        <div className="flex flex-wrap gap-2">
          <StatusTag status="live" subject="Independent check" />
          <StatusTag status="planned" subject="Commit evidence" />
        </div>
      </div>
    </section>
  );
}
