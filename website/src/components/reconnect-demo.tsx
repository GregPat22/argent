"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArgentMark, StatusTag } from "@/components/ui";

type Tone = "neutral" | "running" | "verified" | "attention";
type RunEvent = { type: string; text: string; tone: Tone };
type RunState = "running" | "awaiting" | "attention";

const FLOW: RunEvent[] = [
  {
    type: "run.queued",
    text: "Queued: add rate limiting to the login endpoint",
    tone: "neutral",
  },
  {
    type: "run.started",
    text: "Workspace ready on branch argent/rate-limit-login",
    tone: "running",
  },
  {
    type: "agent.log",
    text: "Reading the spec and its four acceptance criteria",
    tone: "neutral",
  },
  {
    type: "agent.log",
    text: "Editing src/auth/login.ts and tests/login.test.ts",
    tone: "neutral",
  },
  {
    type: "agent.log",
    text: "Agent says: done, all tests pass",
    tone: "neutral",
  },
  {
    type: "verification.recorded",
    text: "Trusted checks on 4f2a9c1: 38 of 38 passed",
    tone: "verified",
  },
  {
    type: "review.recorded",
    text: "Independent review: lockout reset has no test",
    tone: "attention",
  },
  {
    type: "repair.completed",
    text: "Repair 1 of 1 on 9b1e07d: 39 of 39 passed",
    tone: "verified",
  },
  {
    type: "pr.drafted",
    text: "Draft pull request prepared with the evidence attached",
    tone: "verified",
  },
  {
    type: "run.awaiting_human",
    text: "Waiting for you to review and merge",
    tone: "running",
  },
];

const LEASE_LOST: RunEvent[] = [
  {
    type: "lease.lost",
    text: "The worker stopped responding mid-run. Outcome unknown.",
    tone: "attention",
  },
  {
    type: "run.needs_attention",
    text: "Nothing is retried automatically. Inspect before continuing.",
    tone: "attention",
  },
];

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-sterling-dim",
  running: "bg-running",
  verified: "bg-verified",
  attention: "bg-attention",
};

const STATE_CHIP: Record<RunState, { label: string; className: string }> = {
  running: { label: "Running", className: "text-running border-running/30" },
  awaiting: {
    label: "Waiting for you",
    className: "text-verified border-verified/30",
  },
  attention: {
    label: "Needs attention",
    className: "text-attention border-attention/30",
  },
};

const EMIT_EVERY_MS = 1500;
const REPLAY_EVERY_MS = 230;

type Replay = { from: number; to: number };

export function ReconnectDemo() {
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { amount: 0.35 });
  const [log, setLog] = useState<RunEvent[]>([]);
  const [state, setState] = useState<RunState>("running");
  const [open, setOpen] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [replay, setReplay] = useState<Replay | null>(null);

  // The workspace produces events whether or not the app is open.
  useEffect(() => {
    if (!inView || state !== "running") return;
    const id = window.setInterval(() => {
      setLog((current) => {
        const next = FLOW[current.length];
        return next ? [...current, next] : current;
      });
    }, EMIT_EVERY_MS);
    return () => window.clearInterval(id);
  }, [inView, state]);

  useEffect(() => {
    if (state === "running" && log.length >= FLOW.length) setState("awaiting");
  }, [log.length, state]);

  // An open app reads forward from its cursor; after reconnecting it replays quickly.
  useEffect(() => {
    if (!open || cursor >= log.length) return;
    const id = window.setTimeout(
      () => setCursor((value) => Math.min(value + 1, log.length)),
      replay ? REPLAY_EVERY_MS : 60,
    );
    return () => window.clearTimeout(id);
  }, [open, cursor, log.length, replay]);

  useEffect(() => {
    if (!replay || cursor < replay.to) return;
    const id = window.setTimeout(() => setReplay(null), 5000);
    return () => window.clearTimeout(id);
  }, [replay, cursor]);

  const closeApp = () => {
    setOpen(false);
    setReplay(null);
  };
  const reopenApp = () => {
    setReplay({ from: cursor, to: log.length });
    setOpen(true);
  };
  const cutPower = () => {
    setLog((current) => [...current, ...LEASE_LOST]);
    setState("attention");
  };
  const restart = () => {
    setLog([]);
    setCursor(0);
    setReplay(null);
    setState("running");
    setOpen(true);
  };

  const missed = log.length - cursor;
  const read = log.slice(0, cursor);
  const chip = STATE_CHIP[state];

  return (
    <section
      ref={sectionRef}
      id="reconnect"
      aria-labelledby="reconnect-title"
      className="mx-auto max-w-[1320px] scroll-mt-24 px-6 py-24 md:px-10 md:py-36"
    >
      <div className="grid gap-10 md:grid-cols-12 md:items-end">
        <div className="md:col-span-7">
          <h2
            id="reconnect-title"
            className="display text-[clamp(2.4rem,5vw,4.6rem)]"
          >
            Close the app. The run doesn’t notice.
          </h2>
        </div>
        <div className="md:col-span-5">
          <p className="max-w-[34rem] text-sterling">
            In the planned cloud flow, a worker owns execution independently of
            the app. Switch machines and reconnect to saved history.
            Reconnecting only reads state; uncertain side effects require
            reconciliation. Today’s local prototype demonstrates this with
            simulated work.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <StatusTag status="live" subject="Local reconnect" />
            <StatusTag status="planned" subject="Cloud workspaces" />
          </div>
        </div>
      </div>

      <div className="mt-14 grid gap-4 lg:grid-cols-12">
        {/* The desktop client */}
        <div className="relative h-[27rem] lg:col-span-8">
          <AnimatePresence initial={false} mode="popLayout">
            {open ? (
              <motion.div
                key="window"
                initial={{
                  opacity: 0,
                  scale: 0.94,
                  y: 28,
                  filter: "blur(8px)",
                }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.9, y: 40, filter: "blur(8px)" }}
                transition={{
                  type: "spring",
                  visualDuration: 0.5,
                  bounce: 0.12,
                }}
                className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-hairline-strong bg-pewter shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)]"
              >
                <div className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-4">
                  <span className="size-3 rounded-full bg-pewter-2 ring-1 ring-hairline-strong" />
                  <span className="size-3 rounded-full bg-pewter-2 ring-1 ring-hairline-strong" />
                  <span className="size-3 rounded-full bg-pewter-2 ring-1 ring-hairline-strong" />
                  <span className="ml-3 text-[0.8125rem] text-sterling">
                    Argent
                  </span>
                  <span className="ml-auto text-[0.8125rem] text-sterling-dim">
                    Read up to event {cursor}
                  </span>
                </div>

                <div className="flex min-h-0 flex-1">
                  <aside className="hidden w-52 shrink-0 border-r border-hairline p-4 sm:block">
                    <p className="text-[0.8125rem] text-sterling-dim">
                      Workspace
                    </p>
                    <p className="mt-1 text-[0.9375rem] text-polished">
                      example/project
                    </p>
                    <p className="mt-6 text-[0.8125rem] text-sterling-dim">
                      Runs
                    </p>
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-pewter-2 px-2.5 py-2 text-[0.875rem]">
                      <span
                        className={`size-1.5 rounded-full ${TONE_DOT[state === "attention" ? "attention" : state === "awaiting" ? "verified" : "running"]}`}
                      />
                      Rate limiting
                    </div>
                  </aside>

                  <div className="flex min-w-0 flex-1 flex-col p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[0.9375rem] text-polished">
                        Add rate limiting to the login endpoint
                      </p>
                      <motion.span
                        key={state}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`rounded-full border px-2.5 py-1 text-[0.8125rem] leading-none ${chip.className}`}
                      >
                        {chip.label}
                      </motion.span>
                    </div>

                    <AnimatePresence>
                      {replay && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden text-[0.875rem] text-sterling"
                        >
                          <span className="mt-3 block rounded-lg border border-hairline bg-oxide/60 px-3 py-2">
                            {replay.to > replay.from
                              ? `Reconnected. Reading events ${replay.from + 1} to ${replay.to} from the saved history. Nothing ran twice.`
                              : "Reconnected. Nothing new happened while you were away."}
                          </span>
                        </motion.p>
                      )}
                    </AnimatePresence>

                    {/* A conveyor: the column is pinned to the bottom and slides up as one piece. */}
                    <div className="relative mt-4 min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_22%)]">
                      {read.length === 0 && (
                        <p className="absolute bottom-0 px-2.5 py-1.5 text-[0.875rem] text-sterling-dim">
                          Waiting for the first event
                        </p>
                      )}
                      <motion.ol
                        layout="position"
                        transition={{
                          type: "spring",
                          visualDuration: 0.32,
                          bounce: 0,
                        }}
                        className="absolute inset-x-0 bottom-0 flex flex-col gap-1"
                      >
                        {read.map((event, index) => {
                          const number = index + 1;
                          const replayed =
                            replay !== null &&
                            number > replay.from &&
                            number <= replay.to;
                          return (
                            <li
                              key={number}
                              className={`grid grid-cols-[2.25rem_1fr] items-baseline gap-x-3 rounded-lg px-2.5 py-1.5 transition-colors duration-700 sm:grid-cols-[2.25rem_11.5rem_1fr] ${
                                replayed ? "bg-polished/[0.06]" : ""
                              }`}
                            >
                              <span className="font-mono text-[0.75rem] text-sterling-dim">
                                {String(number).padStart(2, "0")}
                              </span>
                              <span className="hidden items-center gap-2 font-mono text-[0.75rem] text-sterling sm:flex">
                                <span
                                  className={`size-1.5 shrink-0 rounded-full ${TONE_DOT[event.tone]}`}
                                />
                                {event.type}
                              </span>
                              <span className="col-start-2 text-[0.875rem] text-polished sm:col-start-3">
                                {event.text}
                              </span>
                            </li>
                          );
                        })}
                      </motion.ol>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="closed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-hairline-strong text-center"
              >
                <motion.div
                  initial={{ scale: 1.4, y: -30, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  transition={{
                    type: "spring",
                    visualDuration: 0.5,
                    bounce: 0.3,
                  }}
                >
                  <ArgentMark size={56} />
                </motion.div>
                <p className="max-w-[22rem] text-sterling">
                  Argent is closed. The workspace has stored{" "}
                  <span className="text-polished">
                    {missed} new {missed === 1 ? "event" : "events"}
                  </span>{" "}
                  since you left.
                </p>
                <button
                  type="button"
                  onClick={reopenApp}
                  className="argent-control argent-control--primary"
                >
                  Reopen Argent
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* The workspace and its worker */}
        <div className="guilloche flex h-[27rem] flex-col rounded-2xl border border-hairline bg-pewter/40 p-5 lg:col-span-4">
          <div className="flex items-center justify-between">
            <p className="text-[0.9375rem] text-polished">Workspace</p>
            <span className="flex items-center gap-2 text-[0.8125rem] text-sterling">
              <span className="relative flex size-2">
                {state === "running" && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-running opacity-60 motion-reduce:hidden" />
                )}
                <span
                  className={`relative inline-flex size-2 rounded-full ${state === "attention" ? "bg-attention" : state === "running" ? "bg-running" : "bg-verified"}`}
                />
              </span>
              {state === "attention"
                ? "Worker lost"
                : state === "running"
                  ? "Worker running"
                  : "Worker idle"}
            </span>
          </div>
          <p className="mt-1 text-[0.875rem] text-sterling-dim">
            Owns execution. Keeps every event, whoever is watching.
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-hairline bg-oxide/50 p-3">
              <dt className="text-[0.8125rem] text-sterling-dim">
                Stored events
              </dt>
              <dd className="mt-1 text-4xl font-medium tracking-tight tabular-nums">
                {log.length}
              </dd>
            </div>
            <div className="rounded-xl border border-hairline bg-oxide/50 p-3">
              <dt className="text-[0.8125rem] text-sterling-dim">
                App has read
              </dt>
              <dd className="mt-1 text-4xl font-medium tracking-tight tabular-nums">
                {cursor}
              </dd>
            </div>
          </dl>

          <div className="relative mt-5 min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_30%)]">
            <motion.ol
              layout="position"
              transition={{ type: "spring", visualDuration: 0.32, bounce: 0 }}
              className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 font-mono text-[0.75rem]"
            >
              {log.map((event, index) => {
                const number = index + 1;
                return (
                  <li
                    key={number}
                    className={`flex items-center gap-2 transition-opacity duration-500 ${
                      number <= cursor
                        ? "text-sterling opacity-45"
                        : "text-polished"
                    }`}
                  >
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${TONE_DOT[event.tone]}`}
                    />
                    <span className="text-sterling-dim">
                      {String(number).padStart(2, "0")}
                    </span>
                    <span className="truncate">{event.type}</span>
                  </li>
                );
              })}
            </motion.ol>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={open ? closeApp : reopenApp}
          className="argent-control argent-control--primary"
        >
          {open ? "Close Argent" : "Reopen Argent"}
        </button>
        <button
          type="button"
          onClick={cutPower}
          disabled={state !== "running"}
          className="argent-control disabled:cursor-not-allowed"
        >
          Cut the worker’s power
        </button>
        <button type="button" onClick={restart} className="argent-control">
          Start over
        </button>
        <p className="w-full text-[0.875rem] text-sterling-dim md:ml-auto md:w-auto">
          An illustration of the planned cloud flow, not a live system.
        </p>
      </div>

      <p className="sr-only" aria-live="polite">
        {`Run status: ${chip.label}. Argent is ${open ? "open" : "closed"}.`}
      </p>
    </section>
  );
}
