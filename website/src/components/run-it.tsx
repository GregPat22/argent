"use client";

import { SectionSignature } from "@/components/section-signature";

import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { GitHubIcon, MagneticLink } from "@/components/ui";
import { DOCS_URL, REPO_URL } from "@/lib/site";

type Line = {
  kind: "command" | "comment" | "output";
  text: string;
  tone?: "verified";
};

const COMMANDS = [
  `git clone ${REPO_URL}`,
  "cd argent && npm ci",
  "npm run demo",
];

// Condensed from the JSON that `npm run demo` prints at M0.
const LINES: Line[] = [
  ...COMMANDS.map((text) => ({ kind: "command" as const, text })),
  { kind: "comment", text: "# condensed from the JSON the demo prints" },
  { kind: "output", text: "milestone     M0, simulation" },
  { kind: "output", text: "apiRestarted  true" },
  { kind: "output", text: "1  run.queued" },
  { kind: "output", text: "2  run.started" },
  {
    kind: "output",
    text: "3  agent.log   Scripted adapter started; no repository or model is connected.",
  },
  {
    kind: "output",
    text: "4  agent.log   Writing a simulation artifact to the persistent local workspace.",
  },
  {
    kind: "output",
    text: "5  agent.log   Artifact written; independent verification follows.",
  },
  {
    kind: "output",
    text: "6  verification.recorded   passed, sha256 c82fc8e7…",
    tone: "verified",
  },
  {
    kind: "output",
    text: "7  run.completed   simulation_passed",
    tone: "verified",
  },
  {
    kind: "output",
    text: "limitations   No real repository, AI agent, cloud compute or pull request.",
  },
];

function useTypedLines(start: boolean, instant: boolean) {
  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(0);

  // Reduced motion shows everything at once, after hydration so markup matches.
  useEffect(() => {
    if (instant) setLine(LINES.length);
  }, [instant]);

  useEffect(() => {
    if (!start || line >= LINES.length) return;
    const current = LINES[line]!;
    if (current.kind === "command" && chars < current.text.length) {
      const id = window.setTimeout(() => setChars((value) => value + 1), 26);
      return () => window.clearTimeout(id);
    }
    const pause = current.kind === "command" ? 420 : 110;
    const id = window.setTimeout(() => {
      setLine((value) => value + 1);
      setChars(0);
    }, pause);
    return () => window.clearTimeout(id);
  }, [start, line, chars]);

  return { line, chars };
}

export function RunIt() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduceMotion = useReducedMotion();
  const { line, chars } = useTypedLines(inView, Boolean(reduceMotion));
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  const copyCommands = async () => {
    try {
      await navigator.clipboard.writeText(COMMANDS.join("\n"));
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
    window.setTimeout(() => setCopy("idle"), 2200);
  };

  return (
    <section
      id="run"
      aria-labelledby="run-title"
      className="mx-auto max-w-[1320px] scroll-mt-24 px-6 py-24 md:px-10 md:py-32"
    >
      <SectionSignature number="07" label="An open invitation" kind="trace" />
      <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-5">
          <h2
            id="run-title"
            className="display text-[clamp(2.4rem,5vw,4.6rem)]"
          >
            Built in the open. Run the engine today.
          </h2>
          <p className="mt-6 max-w-[32rem] text-sterling">
            The M0 demo starts a real API and worker, kills the API in the
            middle of a run, starts a new one and reads the same history back.
            You need Git and Node 22.19 or later within Node 22. No account,
            model key or cloud.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <MagneticLink href={REPO_URL} target="_blank" rel="noreferrer">
              <GitHubIcon />
              View on GitHub
            </MagneticLink>
            <MagneticLink
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              variant="ghost"
            >
              Read the project context
            </MagneticLink>
          </div>
          <p className="mt-8 max-w-[32rem] border-t border-hairline pt-5 text-[0.9375rem] text-sterling-dim">
            The local desktop prototype is complete with simulated execution.
            Signed public downloads are still ahead.
          </p>
        </div>

        <div ref={ref} className="lg:col-span-7">
          <div className="overflow-hidden rounded-2xl border border-hairline-strong bg-[#0c0d11] shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)]">
            <div className="flex min-h-14 items-center gap-2 border-b border-hairline px-4">
              <span className="size-3 rounded-full bg-pewter-2 ring-1 ring-hairline-strong" />
              <span className="size-3 rounded-full bg-pewter-2 ring-1 ring-hairline-strong" />
              <span className="size-3 rounded-full bg-pewter-2 ring-1 ring-hairline-strong" />
              <span className="ml-3 text-[0.8125rem] text-sterling-dim">
                Terminal
              </span>
              <button
                type="button"
                onClick={copyCommands}
                className="relative ml-auto h-11 min-w-[8.5rem] overflow-hidden rounded-full border border-hairline-strong px-3 text-[0.8125rem] text-polished transition-colors hover:border-polished/60"
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={copy}
                    className="block"
                    initial={{ y: 14, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -14, opacity: 0 }}
                    transition={{
                      type: "spring",
                      visualDuration: 0.25,
                      bounce: 0,
                    }}
                  >
                    {copy === "copied"
                      ? "Copied"
                      : copy === "failed"
                        ? "Copy unavailable"
                        : "Copy commands"}
                  </motion.span>
                </AnimatePresence>
              </button>
            </div>

            <p
              role="status"
              className={
                copy === "failed"
                  ? "px-5 pt-3 text-sm text-attention"
                  : "sr-only"
              }
            >
              {copy === "copied"
                ? "Commands copied to clipboard."
                : copy === "failed"
                  ? "Clipboard unavailable. Select the commands in the terminal to copy them manually."
                  : ""}
            </p>
            <pre className="sr-only">
              {LINES.map((item) =>
                item.kind === "command" ? `$ ${item.text}` : item.text,
              ).join("\n")}
            </pre>
            <pre
              aria-hidden
              className="h-[25rem] overflow-auto p-5 font-mono text-[0.75rem] leading-[1.75] sm:text-[0.8125rem]"
            >
              {LINES.map((item, index) => {
                if (index > line) return null;
                const text =
                  index === line ? item.text.slice(0, chars) : item.text;
                if (index === line && item.kind !== "command") return null;
                return (
                  <motion.span
                    key={index}
                    className={`block whitespace-pre-wrap ${
                      item.kind === "command"
                        ? "text-polished"
                        : item.kind === "comment"
                          ? "text-sterling-dim"
                          : item.tone === "verified"
                            ? "text-verified"
                            : "text-sterling"
                    }`}
                    initial={item.kind === "command" ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {item.kind === "command" && (
                      <span className="text-sterling-dim">$ </span>
                    )}
                    {text}
                    {index === line && (
                      <span
                        aria-hidden
                        className="ml-px inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] animate-pulse bg-polished"
                      />
                    )}
                  </motion.span>
                );
              })}
              {line >= LINES.length && (
                <span className="block text-polished">
                  <span className="text-sterling-dim">$ </span>
                  <span
                    aria-hidden
                    className="inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] animate-pulse bg-polished"
                  />
                </span>
              )}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
