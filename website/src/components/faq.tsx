"use client";

import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { ARCHITECTURE_URL, REPO_URL } from "@/lib/site";

const QUESTIONS: { question: string; answer: ReactNode }[] = [
  {
    question: "Can I download Argent?",
    answer: (
      <>
        The local macOS prototype is complete in the source repository. It uses
        simulated execution; signed public downloads are still planned. You can{" "}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          build the desktop prototype from source
        </a>{" "}
        or try the headless simulator below.
      </>
    ),
  },
  {
    question: "Does work keep running when I close my laptop?",
    answer: (
      <>
        Today’s local service survives quitting the desktop app, but your Mac
        must stay awake. Laptop-independent execution needs a remote service and
        worker. Persistent cloud workspaces are planned; the reconnect
        illustration shows that intended experience.
      </>
    ),
  },
  {
    question: "Which coding agents can I use today?",
    answer: (
      <>
        None yet: the prototype uses a scripted adapter, with no AI model or
        repository connected. Codex through its official interface is the first
        real-agent target. Claude Code follows, then Cursor and OpenCode.
      </>
    ),
  },
  {
    question: "What does “proof” mean in the prototype?",
    answer: (
      <>
        A separate verifier checks a generated JSON artifact and records its
        SHA-256. That proves the simulation’s artifact identity, not a
        repository’s correctness. Trusted tests of the exact commit and
        independent code review belong to the real-agent roadmap.
      </>
    ),
  },
  {
    question: "Who decides what gets merged?",
    answer: (
      <>
        You do. Human merge authority is a product requirement. The current
        prototype does not create pull requests; the planned workflow prepares a
        draft with evidence for your review.{" "}
        <a href={ARCHITECTURE_URL} target="_blank" rel="noreferrer">
          Read the architecture
        </a>{" "}
        for the execution and approval boundaries.
      </>
    ),
  },
];

function Question({
  question,
  answer,
  defaultOpen = false,
}: {
  question: string;
  answer: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();

  return (
    <details
      className="faq-item rounded-2xl border border-hairline px-5 sm:px-6"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-6 py-5 text-base font-medium text-polished sm:text-lg">
        {question}
        <motion.span
          aria-hidden
          className="shrink-0 text-xl font-normal text-sterling"
          animate={{ transform: open ? "rotate(45deg)" : "rotate(0deg)" }}
          transition={{
            type: "spring",
            visualDuration: reduce ? 0 : 0.28,
            bounce: 0,
          }}
        >
          +
        </motion.span>
      </summary>
      <motion.div
        initial={false}
        animate={{
          transform: open || reduce ? "translateY(0px)" : "translateY(4px)",
        }}
        transition={{ duration: reduce ? 0 : 0.2 }}
      >
        <p className="max-w-[42rem] pb-6 pr-4 text-[0.9375rem] leading-relaxed text-sterling [&_a]:text-polished [&_a]:underline [&_a]:decoration-hairline-strong [&_a]:underline-offset-4 hover:[&_a]:decoration-polished">
          {answer}
        </p>
      </motion.div>
    </details>
  );
}

export function FAQ() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="mx-auto max-w-[1320px] scroll-mt-24 px-6 py-20 md:px-10 md:py-24"
    >
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4">
          <h2
            id="faq-title"
            className="display text-[clamp(2.4rem,5vw,4.6rem)]"
          >
            Before you
            <br className="hidden lg:block" /> dive in.
          </h2>
          <p className="mt-6 max-w-[26rem] text-sterling">
            What you can try today, what comes next, and where you stay in
            control.
          </p>
        </div>
        <div className="grid content-start gap-3 lg:col-span-8">
          {QUESTIONS.map((item, index) => (
            <Question key={item.question} {...item} defaultOpen={index === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}
