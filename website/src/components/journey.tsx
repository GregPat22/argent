"use client";

import {
  type MotionValue,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { StatusTag } from "@/components/ui";
import type { Status } from "@/lib/site";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/*
 * Where Argent is going, told as one hand-off that follows the scroll: the
 * task starts on the desktop, the laptop closes while a cloud workspace keeps
 * going, and the phone hears about the result. A liquid thread draws itself
 * between the three objects and a silver drop travels along it. Everything is
 * illustrative and labelled; reduced motion shows the finished frame.
 *
 * The section opts out of the page entrance (data-entrance-skip) because it
 * is taller than the viewport and owns its own scroll-linked reveal.
 */

const STEPS: {
  title: string;
  body: string;
  subject: string;
  status: Status;
}[] = [
  {
    title: "Hand it off at your desk.",
    body: "Choose a repository, create a workspace and describe the task. Each workspace has its own branch and worktree; follow-up tasks continue there. Local execution is not a sandbox.",
    subject: "Local MVP",
    status: "next",
  },
  {
    title: "Close the lid. It keeps going.",
    body: "A remote workspace keeps the repository, dependencies and history alive while you are away, on the same open-source engine: first on a machine you own that stays on, later in an optional managed cloud.",
    subject: "Remote workspaces",
    status: "planned",
  },
  {
    title: "Check in from your phone.",
    body: "A native iPhone companion shows progress, the diff and the evidence, and lets you steer or stop the agent. Merging stays yours.",
    subject: "iPhone companion",
    status: "planned",
  },
];

// Stage coordinates match the SVG viewBox (600 × 500) so the thread meets
// the objects at any width.
const THREAD =
  "M 330 118 C 390 118, 455 92, 512 104 C 575 118, 560 230, 418 268";

const TRANSCRIPT = [
  "Reading src/auth/login.ts",
  "Adding a failed-attempt counter",
  "Running npm test",
];

function DesktopWindow({ stage }: { stage: number }) {
  const closed = stage >= 1;
  return (
    <div
      className="journey-desktop"
      data-active={stage === 0}
      data-closed={closed}
    >
      <div className="journey-desktop-bar">
        <span />
        <span />
        <span />
        <p>argent</p>
      </div>
      <div className="journey-desktop-body">
        <ul className="journey-sidebar">
          <li data-current="true">
            <i className="bg-running" /> rate-limit-login
          </li>
          <li>
            <i className="bg-running" /> flaky-upload-test
          </li>
          <li>
            <i className="bg-sterling-dim" /> docs-typos
          </li>
        </ul>
        <div className="journey-session">
          <p className="journey-branch">argent/rate-limit-login</p>
          <div className="journey-bubble">
            Lock an account for 15 minutes after five failed logins.
          </div>
          <ul className="journey-transcript">
            {TRANSCRIPT.map((line, index) => (
              <li key={line} style={{ transitionDelay: `${index * 160}ms` }}>
                <span aria-hidden>›</span> {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function CloudIngot({ stage }: { stage: number }) {
  return (
    <div
      className="journey-cloud"
      data-active={stage === 1}
      data-on={stage >= 1}
    >
      <div className="journey-cloud-face">
        <p className="journey-cloud-label">Remote workspace</p>
        <p className="journey-cloud-state">
          <i className="journey-pulse" /> still running
        </p>
        <div className="journey-meter" aria-hidden>
          <span />
        </div>
      </div>
    </div>
  );
}

function Phone({ stage }: { stage: number }) {
  return (
    <div className="journey-phone" data-active={stage === 2}>
      <div className="journey-phone-island" />
      <p className="journey-phone-time">9:41</p>
      <div className="journey-notice" data-shown={stage >= 2}>
        <p className="journey-notice-app">Argent</p>
        <p className="journey-notice-title">Draft pull request ready</p>
        <p className="journey-notice-body">
          Checks passed on <span className="font-mono">9b1e07d</span>. The merge
          is yours.
        </p>
      </div>
    </div>
  );
}

function Stage({
  stage,
  progress,
}: {
  stage: number;
  progress: MotionValue<number>;
}) {
  const path = useRef<SVGPathElement>(null);
  const length = useRef(0);
  // The drop moves on motion values, so following the scroll writes one
  // transform per frame and never re-renders the stage.
  const dropX = useMotionValue(330);
  const dropY = useMotionValue(118);

  const place = (value: number) => {
    const element = path.current;
    if (!element) return;
    if (!length.current) length.current = element.getTotalLength();
    const point = element.getPointAtLength(
      Math.min(1, Math.max(0, value)) * length.current,
    );
    dropX.set(point.x);
    dropY.set(point.y);
  };
  useMotionValueEvent(progress, "change", place);
  useEffect(() => place(progress.get()), [progress]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="journey-stage" aria-hidden>
      <svg
        viewBox="0 0 600 500"
        className="journey-thread"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="journey-metal" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#6f7987" />
            <stop offset="0.45" stopColor="#f5f8fc" />
            <stop offset="1" stopColor="#8e99a8" />
          </linearGradient>
          <radialGradient id="journey-drop" cx="0.35" cy="0.3" r="0.7">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.35" stopColor="#c9d1dc" />
            <stop offset="1" stopColor="#262b33" />
          </radialGradient>
        </defs>
        <path
          d={THREAD}
          stroke="rgb(214 220 230 / 0.12)"
          strokeWidth="2"
          strokeDasharray="2 7"
          strokeLinecap="round"
        />
        <motion.path
          ref={path}
          d={THREAD}
          stroke="url(#journey-metal)"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ pathLength: progress }}
        />
        <motion.g style={{ x: dropX, y: dropY }}>
          <circle cx="0" cy="0" r="9" fill="url(#journey-drop)" />
          <circle cx="-2.5" cy="-3" r="2.2" fill="#fff" opacity="0.85" />
        </motion.g>
      </svg>
      <DesktopWindow stage={stage} />
      <CloudIngot stage={stage} />
      <Phone stage={stage} />
    </div>
  );
}

export function Journey() {
  const track = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  // Wide screens pin the whole stage while the tall track scrolls past. Narrow
  // screens keep the stage stuck under the header while the steps scroll
  // beneath it, so the hand-off plays between the pin and its release.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 900px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const { scrollYProgress } = useScroll({
    target: track,
    offset: wide ? ["start start", "end end"] : ["start 0.1", "end 0.75"],
  });
  const eased = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 26,
    restDelta: 0.001,
  });
  // Progress only moves forward: once a visitor has scrolled through, the
  // hand-off stays finished instead of rewinding when they scroll back up.
  const peak = useRef(0);
  const reached = useTransform(eased, (value) => {
    peak.current = Math.max(peak.current, value);
    return peak.current;
  });
  // The thread finishes a little before the pin releases, so the last frame
  // holds. Each object lights when the drop reaches it.
  const thread = useTransform(reached, [0.04, 0.86], [0, 1]);
  const finished = useTransform(eased, () => 1);
  const progress = reduce ? finished : thread;
  const [stage, setStage] = useState(0);

  useMotionValueEvent(thread, "change", (value) =>
    setStage(value < 0.42 ? 0 : value < 0.97 ? 1 : 2),
  );
  const shown = reduce ? 2 : stage;

  return (
    <section
      id="reconnect"
      data-entrance-skip
      aria-labelledby="journey-title"
      className="relative mx-auto max-w-[1320px] scroll-mt-24 px-6 pt-24 md:px-10 md:pt-32"
    >
      <div className="grid gap-8 md:grid-cols-12 md:items-end">
        <div className="md:col-span-7">
          <p className="text-sm text-sterling-dim">Where Argent is going</p>
          <h2
            id="journey-title"
            className="display mt-4 text-[clamp(2.4rem,5vw,4.6rem)]"
          >
            Start at your desk.
            <br />
            Finish from anywhere.
          </h2>
        </div>
        <p className="max-w-[34rem] text-sterling md:col-span-5">
          One task, three places, one record. The desktop app is where work
          begins, a machine that stays on is where it keeps going, and your
          phone is where you hear it is done.
        </p>
      </div>

      <div ref={track} className="journey-track">
        <div className="journey-sticky">
          <ol className="journey-steps">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="journey-step"
                data-active={reduce || index === shown}
                aria-current={!reduce && index === shown ? "step" : undefined}
              >
                <span className="journey-step-index font-mono">
                  0{index + 1}
                </span>
                <div>
                  <h3 className="text-xl font-medium text-polished md:text-2xl">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-[28rem] text-[0.9375rem] leading-relaxed text-sterling">
                    {step.body}
                  </p>
                  <StatusTag
                    status={step.status}
                    subject={step.subject}
                    className="mt-4"
                  />
                </div>
              </li>
            ))}
          </ol>
          <Stage stage={shown} progress={progress} />
        </div>
      </div>

      <p className="pb-24 text-sm text-sterling-dim md:pb-32">
        An illustration of the planned experience, not a live system. Today, the
        desktop app runs Claude Code in local worktrees (early, and not a
        sandbox); Codex, remote workspaces and the iPhone companion are still
        ahead.
      </p>
    </section>
  );
}
