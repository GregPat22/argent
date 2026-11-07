"use client";

import { useReducedMotion } from "@/lib/use-reduced-motion";

import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { GitHubIcon, LiquidLink } from "@/components/ui";
import { CONTRIBUTING_URL, DOCS_URL, REPO_URL, X_URL } from "@/lib/site";

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
      <div className="cta-band silver-surface relative overflow-hidden rounded-[2rem] border border-hairline-strong px-6 py-20 text-center md:px-12 md:py-28">
        <div aria-hidden className="cta-drops">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="relative">
          <h2
            id="run-title"
            className="display mx-auto max-w-[14ch] text-[clamp(2.6rem,6vw,5.4rem)]"
          >
            Join the build.
          </h2>
          <p className="mx-auto mt-6 max-w-[36rem] text-lg leading-relaxed text-sterling">
            Argent is built in the open, one verified step at a time. Star and
            watch the repository to hear when the local MVP is ready, and follow
            the build on X.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <LiquidLink href={REPO_URL} target="_blank" rel="noreferrer">
              <GitHubIcon />
              Star and watch on GitHub
            </LiquidLink>
            <LiquidLink
              href={X_URL}
              target="_blank"
              rel="noreferrer"
              variant="ghost"
            >
              Follow @Argent_build
            </LiquidLink>
          </div>
          <p className="mx-auto mt-6 max-w-[34rem] text-sm text-sterling-dim">
            On GitHub, choose Watch, then Custom, then Releases. Want to help
            build it?{" "}
            <a
              href={CONTRIBUTING_URL}
              target="_blank"
              rel="noreferrer"
              className="text-polished underline decoration-hairline-strong underline-offset-4"
            >
              Read the contributing guide
            </a>
            .
          </p>
        </div>
      </div>

      <div className="mt-20 grid gap-12 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-5">
          <h3 className="display text-[clamp(2rem,3.6vw,3.2rem)]">
            Or run the engine today.
          </h3>
          <p className="mt-6 max-w-[32rem] text-sterling">
            The demo starts a real API and worker, kills the API in the middle
            of a simulated run, starts a new one and reads the same history
            back. You need Git and Node 22.19 or a later Node 22. No account,
            model key or cloud.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LiquidLink
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              variant="ghost"
            >
              Read the README
            </LiquidLink>
          </div>
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
                className="argent-control relative ml-auto min-w-[8.5rem]"
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
