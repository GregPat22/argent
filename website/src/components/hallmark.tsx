"use client";

import { useReducedMotion } from "@/lib/use-reduced-motion";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
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
  // A full-width carrier moved by a percentage of its own width: the divider
  // travels on a transform instead of animating `left`, so it never lays out.
  const travel = useTransform(smooth, [0, 1], ["0%", "100%"]);
  const handleOffset = useTransform(smooth, [0, 1], [28, -28]);
  const dragging = useRef(false);
  const interacted = useRef(false);
  const hint = useRef<{ stop(): void } | null>(null);
  const takeControl = () => {
    interacted.current = true;
    hint.current?.stop();
    hint.current = null;
  };
  const [percent, setPercent] = useState(86);
  useMotionValueEvent(position, "change", (value) =>
    setPercent(Math.round(value * 100)),
  );

  // One hint on arrival: the divider glides to the middle. On a phone both
  // panels span the full width, so it glides on to show the whole record.
  useEffect(() => {
    if (!inView || interacted.current) return;
    const rest = window.matchMedia("(max-width: 639px)").matches ? 0.12 : 0.5;
    if (reduceMotion) position.set(rest);
    else {
      const animation = animate(position, rest, {
        type: "spring",
        visualDuration: 1.2,
        bounce: 0.15,
        delay: 0.3,
      });
      hint.current = animation;
      return () => {
        animation.stop();
        hint.current = null;
      };
    }
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
    if (!(event.key in steps) && event.key !== "Home" && event.key !== "End")
      return;
    takeControl();
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
      data-light
      className="proof-stage relative h-[30rem] cursor-ew-resize touch-pan-y rounded-3xl select-none sm:h-[24rem]"
      onPointerDown={(event) => {
        takeControl();
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setFromPointer(event);
      }}
      onPointerMove={(event) => dragging.current && setFromPointer(event)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      {/* What the agent says */}
      <div className="proof-claim absolute inset-0 p-6 sm:p-9">
        <p className="text-[0.875rem] text-sterling-dim">What the agent says</p>
        <div className="mt-6 max-w-[23rem] rounded-2xl rounded-tl-md bg-pewter-2 px-4 py-3.5 text-[1.0625rem] leading-snug text-polished shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] sm:text-[1.1875rem]">
          Done. I added rate limiting to the login endpoint and all tests pass.
          Ready to merge.
        </div>
        <p className="proof-unverified mt-5 max-w-[23rem] text-[0.875rem] text-sterling">
          Self-reported. No commit, no check results, no review attached.
        </p>
      </div>

      {/* What Argent records */}
      <motion.div
        style={{ clipPath }}
        className="proof-record guilloche absolute inset-0 p-6 sm:p-9"
      >
        <div className="ml-auto max-w-[25rem]">
          <p className="text-right text-[0.875rem] text-sterling-dim">
            What Argent records
          </p>
          <dl className="proof-sheet mt-5 divide-y divide-hairline rounded-xl">
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

      {/* Divider. The layer travels its own width, so it is clipped here
          rather than on the stage, whose edge light sits just outside it. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <motion.div style={{ x: travel }} className="absolute inset-0">
          <div className="proof-seam absolute inset-y-0 -left-px w-0.5" />
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
            className="proof-handle pointer-events-auto absolute top-1/2 left-0 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-oxide"
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
    </div>
  );
}

type Mark = {
  name: string;
  body: string;
  /** Struck in the app's record today, or still a blank plate. */
  struck: boolean;
  glyph: ReactNode;
};

/*
 * Each mark is punched into its own plate, the way hallmarks sit on silver:
 * the shape is the recess the punch leaves, the symbol stands proud inside it.
 * The desktop app strikes the maker's mark and the date letter today; the
 * standard and assay marks wait for checks, so their plates are only scribed.
 */
const MARKS: Mark[] = [
  {
    name: "Who did the work",
    body: "The maker’s mark: which agent ran, and the limits it ran under.",
    struck: true,
    glyph: (
      <>
        <path className="mark-punch" d="M10 14h60l6 12-6 12H10l-6-12z" />
        <text className="mark-relief" x="40" y="31.5" fontSize="15">
          AI
        </text>
      </>
    ),
  },
  {
    name: "What it had to pass",
    body: "The standard mark: checks from your project’s policy, which the agent can’t change.",
    struck: false,
    glyph: (
      <>
        <ellipse className="mark-punch" cx="40" cy="26" rx="32" ry="17" />
        <path className="mark-relief-line" d="m29 26 7 7 15-15" />
      </>
    ),
  },
  {
    name: "Who checked it",
    body: "The assay mark: an independent verifier, never the agent that produced the work.",
    struck: false,
    glyph: (
      <>
        <path
          className="mark-punch"
          d="M14 6h52v18c0 12-12 20-26 24-14-4-26-12-26-24z"
        />
        <text className="mark-relief" x="40" y="31" fontSize="18">
          Ag
        </text>
      </>
    ),
  },
  {
    name: "Which commit",
    body: "The date letter: the exact commit the record is tied to.",
    struck: true,
    glyph: (
      <>
        <path className="mark-punch" d="M18 8h44l8 8v20l-8 8H18l-8-8V16z" />
        <text className="mark-relief" x="40" y="31.5" fontSize="14">
          9b1e
        </text>
      </>
    ),
  },
];

function Hallmarks() {
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  let strikes = 0;

  // On a phone a plate starts its strike wider than the column, so the list
  // reaches the screen edge and clips there instead of widening the page.
  return (
    <ol
      ref={ref}
      data-struck={inView}
      className="mark-list mt-10 grid grid-cols-2 gap-x-6 gap-y-12 max-sm:-mx-6 max-sm:overflow-x-clip max-sm:px-6 lg:grid-cols-4 lg:gap-x-8"
    >
      {MARKS.map((mark) => {
        // Only real punches land with a blow; blank plates are simply there.
        const order = mark.struck ? strikes++ : 0;
        return (
          <li key={mark.name} className="flex flex-col">
            <motion.div
              className="mark-plate"
              data-state={mark.struck ? "struck" : "blank"}
              aria-hidden
              style={{ ["--strike" as string]: `${200 + order * 260}ms` }}
              initial={
                mark.struck
                  ? {
                      opacity: 0,
                      scale: 1.45,
                      rotate: -7,
                      y: -16,
                      filter: "blur(5px)",
                    }
                  : { opacity: 0 }
              }
              animate={
                !inView
                  ? undefined
                  : mark.struck
                    ? {
                        opacity: 1,
                        scale: 1,
                        rotate: 0,
                        y: 0,
                        filter: "blur(0px)",
                      }
                    : { opacity: 1 }
              }
              transition={
                mark.struck
                  ? {
                      type: "spring",
                      visualDuration: 0.32,
                      bounce: 0.38,
                      delay: 0.2 + order * 0.26,
                    }
                  : { duration: 0.6, delay: 0.1 }
              }
            >
              <svg viewBox="0 0 80 52" fontFamily="var(--font-display)">
                {mark.glyph}
              </svg>
            </motion.div>
            <h3 className="mt-6 text-[1.0625rem] font-medium text-polished">
              {mark.name}
            </h3>
            <p className="mt-2 mb-4 max-w-[17rem] text-[0.9375rem] text-sterling">
              {mark.body}
            </p>
            <StatusTag
              status={mark.struck ? "live" : "planned"}
              subject={mark.struck ? "Struck" : "Not struck"}
              className="mt-auto self-start"
            />
          </li>
        );
      })}
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
      <div className="grid gap-10 md:grid-cols-12">
        <h2
          id="hallmark-title"
          className="display text-[clamp(2.4rem,5vw,4.6rem)] md:col-span-7"
        >
          An agent’s word is not proof.
        </h2>
        <div className="md:col-span-5 md:pt-3">
          <p className="max-w-[34rem] leading-[1.75] text-sterling">
            Silversmiths have stamped hallmarks on their work for centuries, so
            anyone can check a piece without taking the maker’s word for it.
            Argent brings that idea to code: the record of a run is collected by
            Argent itself, tied to the exact commit and kept apart from what the
            agent says.
          </p>
        </div>
      </div>

      <div className="mt-14">
        <Comparison />
        <p className="mt-4 text-sm text-sterling-dim">
          Illustrative example · drag the divider or use the arrow keys.
        </p>
      </div>

      <div className="proof-ledger mt-14 grid gap-x-12 md:grid-cols-2">
        <div>
          <StatusTag status="live" subject="Commit record" />
          <p className="mt-4 max-w-[34rem] text-[0.9375rem] leading-relaxed text-sterling">
            Today, a Claude Code run completes only after Argent records the
            branch, the commit, the changed files and a checksum of the diff
            itself. That is a record of what changed, not a test result.
          </p>
        </div>
        <div>
          <StatusTag status="planned" subject="Test results" />
          <p className="mt-4 max-w-[34rem] text-[0.9375rem] leading-relaxed text-sterling">
            Checks that Argent runs itself against that exact commit, and a
            draft pull request that carries the result, arrive with the local
            MVP.
          </p>
        </div>
      </div>

      <div className="mt-20 md:mt-24">
        <p className="text-sm text-sterling-dim">
          The four marks of a complete record. The app strikes two of them
          today:
        </p>
        <Hallmarks />
      </div>
    </section>
  );
}
