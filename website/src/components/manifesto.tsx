"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useRef } from "react";
import { ArgentMark, StatusTag } from "@/components/ui";
import { LICENSE_URL, type Status } from "@/lib/site";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/*
 * The project's soul: open source as a set of promises rather than a badge.
 * The cast ingot tilts toward the pointer and catches a moving highlight; it
 * rests flat under reduced motion and on touch.
 */

const PROMISES: {
  title: string;
  body: string;
  status: Status;
  subject: string;
}[] = [
  {
    title: "MIT, all of it.",
    body: "The core is MIT licensed. Read it, fork it, change it and run it wherever you like.",
    status: "live",
    subject: "MIT core",
  },
  {
    title: "Self-hosting is not plan B.",
    body: "Argent runs without our servers. A managed cloud, if we offer one, would run the same core, so self-hosting is never the lesser option.",
    status: "policy",
    subject: "Same core",
  },
  {
    title: "Your agents, your sign-in.",
    body: "Agents run through their official tools under your own account. Argent never reads or copies that sign-in, and keeps API keys away from agents so you are never silently billed.",
    status: "live",
    subject: "Claude Code",
  },
  {
    title: "Your history leaves with you.",
    body: "Export your Argent history and restore it on another machine. No lock-in to us, to one model or to one vendor.",
    status: "live",
    subject: "Export and restore",
  },
  {
    title: "Stops when it isn’t sure.",
    body: "If a run’s outcome is unknown, Argent marks it for a person to inspect. It never repeats something that may already have happened.",
    status: "live",
    subject: "Lost-worker handling",
  },
  {
    title: "Nothing advertised before it works.",
    body: "Every claim on this page is labelled works today, in development or planned, and matches the code on GitHub.",
    status: "policy",
    subject: "Project rule",
  },
];

function Ingot() {
  const reduce = useReducedMotion();
  const area = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 120, damping: 18 });
  const sy = useSpring(py, { stiffness: 120, damping: 18 });
  const rotateY = useTransform(sx, [0, 1], [-16, 16]);
  const rotateX = useTransform(sy, [0, 1], [12, -12]);
  const sheen = useTransform(sx, [0, 1], ["20%", "80%"]);

  return (
    <div
      ref={area}
      className="ingot-area"
      onPointerMove={(event) => {
        if (reduce || event.pointerType !== "mouse") return;
        const rect = event.currentTarget.getBoundingClientRect();
        px.set((event.clientX - rect.left) / rect.width);
        py.set((event.clientY - rect.top) / rect.height);
      }}
      onPointerLeave={() => {
        px.set(0.5);
        py.set(0.5);
      }}
      aria-hidden
    >
      <motion.div
        className="ingot"
        style={
          reduce
            ? undefined
            : { rotateX, rotateY, ["--sheen" as string]: sheen }
        }
      >
        <div className="ingot-face">
          <ArgentMark size={56} />
          <p className="ingot-word">ARGENT</p>
          <p className="ingot-line font-mono">FINE · 999 · MIT</p>
        </div>
      </motion.div>
      <div className="ingot-shadow" />
    </div>
  );
}

export function Manifesto() {
  return (
    <section
      id="open"
      aria-labelledby="open-title"
      className="mx-auto max-w-[1320px] scroll-mt-24 px-6 py-24 md:px-10 md:py-36"
    >
      <div className="grid items-center gap-12 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <p className="text-sm text-sterling-dim">Open source</p>
          <h2
            id="open-title"
            className="display mt-4 text-[clamp(2.4rem,5vw,4.6rem)]"
          >
            Yours to run.
            <br />
            Yours to keep.
          </h2>
          <p className="mt-8 max-w-[34rem] text-lg leading-[1.75] text-sterling">
            Your code, your agents and your history should not depend on one
            company staying kind, including ours. So Argent is open source by
            design, not by marketing: these are the promises it is built around.
          </p>
        </div>
        <div className="lg:col-span-6">
          <Ingot />
        </div>
      </div>

      <ul className="mt-16 grid gap-x-8 gap-y-12 border-t border-hairline pt-12 sm:grid-cols-2 lg:grid-cols-3">
        {PROMISES.map((promise) => (
          <li key={promise.title}>
            <h3 className="text-xl font-medium text-polished">
              {promise.title}
            </h3>
            <p className="mt-3 max-w-[24rem] text-[0.9375rem] leading-relaxed text-sterling">
              {promise.body}
            </p>
            <StatusTag
              status={promise.status}
              subject={promise.subject}
              className="mt-4"
            />
          </li>
        ))}
      </ul>

      <div className="silver-surface mt-16 grid gap-8 rounded-3xl border border-hairline-strong p-8 md:grid-cols-2 md:p-10">
        <div>
          <h3 className="display text-[1.75rem] tracking-[-0.04em]">
            Free, for anyone who runs it.
          </h3>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-sterling">
            The desktop app and the engine are free and{" "}
            <a
              href={LICENSE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-polished underline decoration-hairline-strong underline-offset-4"
            >
              MIT licensed
            </a>
            , and you use the agent subscriptions you already have.
          </p>
        </div>
        <div>
          <h3 className="display text-[1.75rem] tracking-[-0.04em]">
            A managed cloud, later.
          </h3>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-sterling">
            For people who would rather not run servers, we may offer hosted
            workspaces as a paid service. It would run the exact same core, and
            your history would stay exportable. Nothing is for sale today.
          </p>
        </div>
      </div>
    </section>
  );
}
