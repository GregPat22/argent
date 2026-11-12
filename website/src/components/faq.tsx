"use client";

import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { ARCHITECTURE_URL, LOCAL_MVP_URL, REPO_URL } from "@/lib/site";

const QUESTIONS: { question: string; answer: ReactNode }[] = [
  {
    question: "Can I use Argent today?",
    answer: (
      <>
        Yes, if you{" "}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          build the desktop app from source
        </a>
        . It runs Claude Code on your local repositories, each workspace in its
        own branch and Git worktree, with your own sign-in. Follow-up tasks
        reuse that workspace. It is early and not a sandbox. Its changes panel
        shows current files and a bounded diff; trusted tests and pull requests
        are planned. Today it runs on Macs with Apple silicon; Windows, Linux
        and Intel Mac builds have not been made or tested. Star and watch the
        repository to hear when signed downloads land.
      </>
    ),
  },
  {
    question: "Which agents and models will it support?",
    answer: (
      <>
        Claude Code works in the desktop app today, and the first release ships
        with it. Codex is the first update after that, together with a model
        picker, so you can use Claude models and GPT models and choose the agent
        for each workspace and the model for each task. Cursor and OpenCode
        follow. Each agent runs with its own official sign-in, so you use the
        subscription you already have. Argent never reads or copies that
        sign-in. It does not pass provider API-key environment variables or
        automatically fall back to API billing. Local agents still have your
        filesystem and credential access.
      </>
    ),
  },
  {
    question: "Is it safe to let agents run on my computer?",
    answer: (
      <>
        Local mode is not a sandbox, and Argent says so. The agent runs as you,
        with the same access as running it in your terminal; a worktree
        separates changes, not privileges. What Argent adds is discipline: no
        shell strings, validated paths, Argent’s own Git commands that do not
        run repository hooks, a minimal environment for the agent, and a person
        in charge of every merge.{" "}
        <a href={LOCAL_MVP_URL} target="_blank" rel="noreferrer">
          Read the security model
        </a>
        .
      </>
    ),
  },
  {
    question: "Does work keep running when I close my laptop?",
    answer: (
      <>
        Not yet. Today the local service survives quitting the app, but your
        computer has to stay awake. Work that keeps running while you are away
        comes after the first release: first on a machine you own that stays on,
        running the same engine, then in an optional managed cloud, followed by
        the iPhone companion.
      </>
    ),
  },
  {
    question: "What happens to my work if Argent goes away?",
    answer: (
      <>
        It stays where it already is: on your computer. Every workspace is an
        ordinary Git branch and worktree of your own repository, so your code
        never lives inside Argent. The app and engine are MIT licensed and run
        without our servers, and your agents keep their own sign-in. The CLI
        exports and restores simulation history only. Export of real Claude Code
        history and Git changes is planned. No hosted service of ours sits
        between you and your work.
      </>
    ),
  },
  {
    question: "Will it cost anything?",
    answer: (
      <>
        The desktop app and engine are free and MIT licensed, and stay that way.
        We may later offer a paid managed cloud for people who would rather not
        run servers. It would run the same core, and self-hosting would remain a
        first-class option.
      </>
    ),
  },
  {
    question: "How is it different from running agents in a terminal?",
    answer: (
      <>
        Argent doesn’t replace your agent; it conducts it. Today it gives every
        workspace its own branch and worktree, keeps a durable record of every
        run and records what changed itself instead of trusting the agent. The
        changes panel shows current files and a bounded diff; it is not test
        evidence. Next are trusted tests for the exact commit and a draft pull
        request you merge yourself. It is open source, built for more than one
        agent, and designed to continue on a machine that stays on and on your
        phone.
      </>
    ),
  },
  {
    question: "Who decides what gets merged?",
    answer: (
      <>
        You do, always. Draft pull requests carrying Argent’s evidence are
        planned for the local MVP; merging remains a separate human action.{" "}
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
            Fair
            <br className="hidden lg:block" /> questions.
          </h2>
          <p className="mt-6 max-w-[26rem] text-sterling">
            What works today, what it will cost, and where you stay in control.
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
