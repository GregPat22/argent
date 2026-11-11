"use client";

import { useReducedMotion } from "@/lib/use-reduced-motion";

import {
  AnimatePresence,
  type MotionValue,
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { GitHubIcon, LiquidLink } from "@/components/ui";
import {
  CONTRIBUTING_URL,
  DOCS_URL,
  LOCAL_MVP_URL,
  REPO_URL,
  X_URL,
} from "@/lib/site";

/*
 * The two closing sections. "Try it" comes first because it is what the
 * navigation and the hero promise: two honest ways to run Argent today, as
 * tabs above one terminal. "Join the build" is the page's single request.
 */

type Line = {
  kind: "command" | "comment" | "output";
  text: string;
  tone?: "verified";
};

type Way = {
  id: "desktop" | "engine";
  label: string;
  summary: string;
  needs: string[];
  commands: string[];
  after: Line[];
};

const SETUP = [`git clone ${REPO_URL}`, "cd argent && npm ci"];

const WAYS: Way[] = [
  {
    id: "desktop",
    label: "Desktop app",
    summary:
      "The real thing, early. Choose a repository and hand Claude Code a task in its own branch and worktree, signed in as you.",
    needs: [
      "A Mac with Apple silicon",
      "Git and Node 22.19 or a later Node 22",
      "The Claude Code command-line tool, up to date and signed in",
    ],
    commands: [...SETUP, "npm run desktop"],
    after: [
      { kind: "comment", text: "# what happens next, in the app" },
      { kind: "output", text: "1  Choose a local repository." },
      {
        kind: "output",
        text: "2  Argent creates branch argent/<id> in a private worktree.",
      },
      {
        kind: "output",
        text: "3  Describe a task. Claude Code runs there, signed in as you.",
      },
      {
        kind: "output",
        text: "4  Follow the session live, send follow-ups or stop it.",
      },
      {
        kind: "output",
        text: "5  Argent records the commit and what changed.   recorded, not tested",
        tone: "verified",
      },
      {
        kind: "output",
        text: "6  Open Changes for current files and a bounded diff.   live, not tested",
      },
      {
        kind: "output",
        text: "limitations   Not a sandbox. Trusted tests and pull requests are planned.",
      },
    ],
  },
  {
    id: "engine",
    label: "Engine demo",
    summary:
      "No agent needed. The demo starts a real API and worker, kills the API in the middle of a simulated run, starts a new one and reads the same history back.",
    needs: [
      "Git and Node 22.19 or a later Node 22",
      "No account, model key or cloud",
    ],
    commands: [...SETUP, "npm run demo"],
    // Condensed from the JSON that `npm run demo` prints at M0.
    after: [
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
    ],
  },
];

function useTypedLines(lines: Line[], start: boolean, instant: boolean) {
  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(0);

  // Reduced motion shows everything at once, after hydration so markup matches.
  useEffect(() => {
    if (instant) setLine(lines.length);
  }, [instant, lines]);

  useEffect(() => {
    if (!start || line >= lines.length) return;
    const current = lines[line]!;
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
  }, [start, line, chars, lines]);

  return { line, chars };
}

/** One terminal per way; remounted on a tab change so the typing restarts. */
function Terminal({ way, start }: { way: Way; start: boolean }) {
  const reduceMotion = useReducedMotion();
  const [lines] = useState<Line[]>(() => [
    ...way.commands.map((text) => ({ kind: "command" as const, text })),
    ...way.after,
  ]);
  const { line, chars } = useTypedLines(lines, start, Boolean(reduceMotion));
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  const copyCommands = async () => {
    try {
      await navigator.clipboard.writeText(way.commands.join("\n"));
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
    window.setTimeout(() => setCopy("idle"), 2200);
  };

  return (
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
          copy === "failed" ? "px-5 pt-3 text-sm text-attention" : "sr-only"
        }
      >
        {copy === "copied"
          ? "Commands copied to clipboard."
          : copy === "failed"
            ? "Clipboard unavailable. Select the commands in the terminal to copy them manually."
            : ""}
      </p>
      <pre className="sr-only">
        {lines
          .map((item) =>
            item.kind === "command" ? `$ ${item.text}` : item.text,
          )
          .join("\n")}
      </pre>
      <pre
        aria-hidden
        className="h-[25rem] overflow-auto p-5 font-mono text-[0.75rem] leading-[1.75] sm:text-[0.8125rem]"
      >
        {lines.map((item, index) => {
          if (index > line) return null;
          const text = index === line ? item.text.slice(0, chars) : item.text;
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
        {line >= lines.length && (
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
  );
}

function TryIt() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const way = WAYS[active]!;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? WAYS.length - 1
          : step
            ? (active + step + WAYS.length) % WAYS.length
            : -1;
    if (next < 0) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section
      id="run"
      aria-labelledby="run-title"
      className="mx-auto max-w-[1320px] scroll-mt-24 px-6 py-24 md:px-10 md:py-32"
    >
      <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-5">
          <h2
            id="run-title"
            className="display text-[clamp(2.2rem,4vw,3.6rem)]"
          >
            Run it on
            <br />
            your Mac today.
          </h2>
          <p className="mt-6 max-w-[32rem] text-sterling">
            There is no download yet, so today you build Argent from source. It
            takes three commands.
          </p>

          <div
            role="tablist"
            aria-label="Ways to run Argent"
            className="try-tabs mt-8"
            onKeyDown={onKeyDown}
          >
            {WAYS.map((item, index) => {
              const selected = index === active;
              return (
                <button
                  key={item.id}
                  ref={(element) => {
                    tabs.current[index] = element;
                  }}
                  type="button"
                  role="tab"
                  id={`try-tab-${item.id}`}
                  aria-selected={selected}
                  aria-controls="try-panel"
                  tabIndex={selected ? 0 : -1}
                  className="try-tab"
                  onClick={() => setActive(index)}
                >
                  {selected && (
                    <motion.span
                      layoutId="try-tab-pill"
                      className="try-tab-pill"
                      transition={{
                        type: "spring",
                        visualDuration: 0.3,
                        bounce: 0.15,
                      }}
                    />
                  )}
                  <span className="try-tab-label">{item.label}</span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={way.id}
              initial={{ opacity: 0, transform: "translateY(6px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0, transform: "translateY(-6px)" }}
              transition={{ duration: 0.18 }}
            >
              <p className="mt-6 max-w-[32rem] text-sterling">{way.summary}</p>
              <p className="mt-6 text-sm text-sterling-dim">You need</p>
              <ul className="try-needs mt-3">
                {way.needs.map((need) => (
                  <li key={need}>{need}</li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>

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
          <p className="mt-5 max-w-[32rem] text-[0.8125rem] leading-relaxed text-sterling-dim">
            Local mode is not a sandbox: the agent runs as you.{" "}
            <a
              href={LOCAL_MVP_URL}
              target="_blank"
              rel="noreferrer"
              className="text-polished underline decoration-hairline-strong underline-offset-4"
            >
              Read the security model
            </a>{" "}
            before pointing it at a repository you care about.
          </p>
        </div>

        <div
          ref={ref}
          role="tabpanel"
          id="try-panel"
          aria-labelledby={`try-tab-${way.id}`}
          className="lg:col-span-7"
        >
          <Terminal key={way.id} way={way} start={inView} />
        </div>
      </div>
    </section>
  );
}

const DROP_DEPTHS = [22, -16, 38, -30];

function Drop({
  depth,
  x,
  y,
}: {
  depth: number;
  x: MotionValue<number>;
  y: MotionValue<number>;
}) {
  const dx = useTransform(x, (value) => value * depth);
  const dy = useTransform(y, (value) => value * depth);
  return (
    <motion.span style={{ x: dx, y: dy }}>
      <i />
    </motion.span>
  );
}

function JoinTheBuild() {
  const reduce = useReducedMotion();
  // Pointer position across the band, -1 to 1; the drops lean toward it.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const x = useSpring(px, { stiffness: 60, damping: 16 });
  const y = useSpring(py, { stiffness: 60, damping: 16 });

  return (
    <section
      id="join"
      aria-labelledby="join-title"
      className="mx-auto max-w-[1320px] scroll-mt-24 px-6 pb-24 md:px-10 md:pb-32"
    >
      <div
        data-light
        className="cta-band silver-surface rounded-[2rem] px-6 py-20 text-center md:px-12 md:py-28"
        onPointerMove={(event) => {
          if (reduce || event.pointerType !== "mouse") return;
          const rect = event.currentTarget.getBoundingClientRect();
          px.set(((event.clientX - rect.left) / rect.width) * 2 - 1);
          py.set(((event.clientY - rect.top) / rect.height) * 2 - 1);
        }}
        onPointerLeave={() => {
          px.set(0);
          py.set(0);
        }}
      >
        <div aria-hidden className="cta-drops">
          {DROP_DEPTHS.map((depth) => (
            <Drop key={depth} depth={depth} x={x} y={y} />
          ))}
        </div>
        <div className="relative">
          <h2
            id="join-title"
            className="display mx-auto max-w-[14ch] text-[clamp(2.6rem,6vw,5.4rem)]"
          >
            Join the build.
          </h2>
          <p className="mx-auto mt-6 max-w-[36rem] text-lg leading-relaxed text-sterling">
            Argent is built in the open, one verified step at a time. Star and
            watch the repository to hear when signed downloads land, and follow
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
    </section>
  );
}

export function RunIt() {
  return (
    <>
      <TryIt />
      <JoinTheBuild />
    </>
  );
}
