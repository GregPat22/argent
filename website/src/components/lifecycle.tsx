"use client";

import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
} from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

type Step = { title: string; body: string; visual: () => ReactNode };

const ease = [0.22, 1, 0.36, 1] as const;

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="w-full max-w-[30rem] rounded-2xl border border-hairline-strong bg-pewter p-5 shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)]">
      <p className="font-mono text-[0.75rem] text-sterling-dim">{title}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Reveal({ index, children }: { index: number; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.09, duration: 0.5, ease }}
    >
      {children}
    </motion.div>
  );
}

function SpecVisual() {
  const criteria = [
    "Five failed logins lock the account for 15 minutes",
    "A successful login resets the counter",
    "Locked responses return 429 with Retry-After",
    "Existing login tests still pass",
  ];
  return (
    <Panel title="specs/rate-limit-login.md">
      <p className="display text-2xl">Rate-limit the login endpoint</p>
      <p className="mt-4 text-[0.8125rem] text-sterling-dim">
        Acceptance criteria
      </p>
      <ul className="mt-2 space-y-2">
        {criteria.map((item, index) => (
          <Reveal key={item} index={index}>
            <li className="flex items-start gap-3 text-[0.9375rem] text-polished">
              <span className="mt-1 size-3.5 shrink-0 rounded-[4px] border border-hairline-strong" />
              {item}
            </li>
          </Reveal>
        ))}
      </ul>
    </Panel>
  );
}

function WorkspaceVisual() {
  const files = [
    "src/auth/login.ts",
    "src/auth/limits.ts",
    "tests/login.test.ts",
    "node_modules/ (kept)",
  ];
  return (
    <Panel title="workspace / example/project">
      <div className="flex items-center justify-between rounded-xl border border-hairline bg-oxide/60 px-3 py-2.5">
        <span className="font-mono text-[0.8125rem] text-polished">
          argent/rate-limit-login
        </span>
        <span className="text-[0.8125rem] text-sterling-dim">own worktree</span>
      </div>
      <ul className="mt-4 space-y-1.5 font-mono text-[0.8125rem] text-sterling">
        {files.map((file, index) => (
          <Reveal key={file} index={index}>
            <li>{file}</li>
          </Reveal>
        ))}
      </ul>
      <div className="mt-5 grid grid-cols-2 gap-3 text-[0.8125rem]">
        <div className="rounded-xl border border-hairline p-3">
          <p className="text-sterling-dim">Compute</p>
          <p className="mt-1 text-polished">Asleep while idle</p>
        </div>
        <div className="rounded-xl border border-hairline p-3">
          <p className="text-sterling-dim">Files and dependencies</p>
          <p className="mt-1 text-polished">Still there</p>
        </div>
      </div>
    </Panel>
  );
}

function Meter({
  label,
  value,
  max,
  unit,
  index,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  index: number;
}) {
  return (
    <div>
      <div className="flex justify-between text-[0.8125rem]">
        <span className="text-sterling">{label}</span>
        <span className="tabular-nums text-sterling-dim">
          {value} of {max} {unit}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-oxide">
        <motion.div
          className="h-full origin-left rounded-full bg-gradient-to-r from-sterling-dim to-polished"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: value / max }}
          transition={{ delay: 0.2 + index * 0.12, duration: 1.1, ease }}
        />
      </div>
    </div>
  );
}

function RunVisual() {
  return (
    <Panel title="limits set before the agent starts">
      <div className="space-y-5">
        <Meter label="Wall time" value={12} max={30} unit="min" index={0} />
        <Meter label="Agent turns" value={18} max={60} unit="turns" index={1} />
        <Meter label="Spend" value={2} max={5} unit="USD" index={2} />
      </div>
      <p className="mt-6 rounded-xl border border-hairline bg-oxide/60 px-3 py-2.5 text-[0.875rem] text-sterling">
        No production credentials. Network limited to the package registry.
      </p>
    </Panel>
  );
}

function VerifyVisual() {
  const checks = [
    "Type check",
    "Unit tests, 38 of 38",
    "Integration tests, 6 of 6",
    "Format",
  ];
  return (
    <Panel title="checks from a policy the agent can’t edit">
      <div className="flex items-baseline justify-between">
        <p className="text-[0.8125rem] text-sterling-dim">Commit</p>
        <p className="font-mono text-[0.875rem] text-polished">4f2a9c1</p>
      </div>
      <ul className="mt-4 space-y-2">
        {checks.map((check, index) => (
          <Reveal key={check} index={index}>
            <li className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2 text-[0.9375rem]">
              {check}
              <span className="text-[0.8125rem] text-verified">Passed</span>
            </li>
          </Reveal>
        ))}
      </ul>
    </Panel>
  );
}

function ReviewVisual() {
  return (
    <Panel title="src/auth/login.ts">
      <pre className="overflow-hidden rounded-xl bg-oxide/70 p-3 font-mono text-[0.75rem] leading-relaxed">
        <span className="block text-sterling-dim">
          {" "}
          const attempts = await limits.get(user)
        </span>
        <span className="block text-verified/90">
          + if (attempts &gt;= 5) return locked(res, 900)
        </span>
        <span className="block text-verified/90">
          + await limits.increment(user)
        </span>
        <span className="block text-sterling-dim">
          {" "}
          const ok = await verify(password)
        </span>
      </pre>
      <Reveal index={1}>
        <div className="mt-4 rounded-xl border border-attention/30 bg-attention/[0.06] px-3 py-2.5 text-[0.875rem]">
          <p className="text-attention">Review finding</p>
          <p className="mt-1 text-polished">
            Resetting the counter after a successful login has no test.
          </p>
        </div>
      </Reveal>
      <Reveal index={3}>
        <p className="mt-3 text-[0.875rem] text-sterling">
          Repair 1 of 1 applied. Checks ran again on{" "}
          <span className="font-mono text-polished">9b1e07d</span>.
        </p>
      </Reveal>
    </Panel>
  );
}

function PullRequestVisual() {
  const evidence = [
    ["Checks", "39 of 39 passed on 9b1e07d"],
    ["Review", "1 finding, repaired"],
    ["Limits", "12 min, 18 turns used"],
  ];
  return (
    <Panel title="pull request">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-hairline-strong px-2 py-0.5 text-[0.75rem] text-sterling">
          Draft
        </span>
        <p className="text-[0.9375rem] text-polished">
          Add rate limiting to the login endpoint
        </p>
      </div>
      <dl className="mt-4 divide-y divide-hairline rounded-xl border border-hairline">
        {evidence.map(([label, value], index) => (
          <Reveal key={label} index={index}>
            <div className="flex justify-between gap-4 px-3 py-2.5 text-[0.875rem]">
              <dt className="text-sterling-dim">{label}</dt>
              <dd className="text-right text-polished">{value}</dd>
            </div>
          </Reveal>
        ))}
      </dl>
    </Panel>
  );
}

function MergeVisual() {
  const reduceMotion = useReducedMotion();
  return (
    <Panel title="the last step is yours">
      <p className="text-[0.9375rem] text-sterling">
        Argent prepares the pull request and stops. Merging, deploying and
        spending stay with people.
      </p>
      <motion.div
        className="mt-6 flex h-12 items-center justify-center rounded-full bg-polished text-[0.9375rem] font-medium text-oxide"
        initial={{ boxShadow: "0 0 0 0 rgb(238 241 245 / 0)" }}
        animate={
          reduceMotion
            ? undefined
            : {
                boxShadow: [
                  "0 0 0 0 rgb(238 241 245 / 0.35)",
                  "0 0 0 14px rgb(238 241 245 / 0)",
                ],
              }
        }
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
      >
        Merge pull request
      </motion.div>
      <p className="mt-3 text-center text-[0.8125rem] text-sterling-dim">
        Only a person can press this.
      </p>
    </Panel>
  );
}

const STEPS: Step[] = [
  {
    title: "Write the task as a spec",
    body: "Describe the outcome and how anyone could check it. The acceptance criteria become the bar the work has to clear.",
    visual: SpecVisual,
  },
  {
    title: "Give it its own workspace",
    body: "Each task gets an isolated branch or worktree in a persistent workspace. Files and dependencies survive while idle compute sleeps.",
    visual: WorkspaceVisual,
  },
  {
    title: "Run the agent within limits",
    body: "Wall time, turns, permissions and spend are bounded before the agent starts. It gets scoped credentials, never yours.",
    visual: RunVisual,
  },
  {
    title: "Verify the exact commit",
    body: "Trusted checks run against the commit the agent produced. The agent’s own report of success doesn’t count as evidence.",
    visual: VerifyVisual,
  },
  {
    title: "Review it independently",
    body: "A separate review reads the actual diff. One bounded repair is allowed, then the checks run again.",
    visual: ReviewVisual,
  },
  {
    title: "Draft the pull request",
    body: "The draft carries its evidence: which checks ran, on which commit, and what the review found.",
    visual: PullRequestVisual,
  },
  {
    title: "You decide to merge",
    body: "Argent never merges, deploys or spends money on its own. Dependent tasks wait for your decision.",
    visual: MergeVisual,
  },
];

function StepText({
  index,
  step,
  onActive,
}: {
  index: number;
  step: Step;
  onActive: (index: number) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { margin: "-45% 0px -45% 0px" });
  useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);

  const Visual = step.visual;
  return (
    <li
      ref={ref}
      className="flex min-h-[62vh] flex-col justify-center py-10 lg:min-h-[78vh]"
    >
      <motion.div
        animate={{ opacity: inView ? 1 : 0.28 }}
        transition={{ duration: 0.4 }}
        className="flex gap-6"
      >
        <span className="display w-10 shrink-0 text-[2.75rem] leading-none text-sterling-dim tabular-nums">
          {index + 1}
        </span>
        <div>
          <h3 className="display text-[clamp(1.9rem,3.2vw,2.9rem)] leading-[1.02]">
            {step.title}
          </h3>
          <p className="mt-4 max-w-[30rem] text-sterling">{step.body}</p>
        </div>
      </motion.div>
      <div className="mt-8 lg:hidden">
        <Visual />
      </div>
    </li>
  );
}

export function Lifecycle() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.5", "end 0.5"],
  });
  const rail = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 30,
    restDelta: 0.001,
  });
  const ActiveVisual = STEPS[active]!.visual;

  return (
    <section
      id="lifecycle"
      aria-labelledby="lifecycle-title"
      className="mx-auto max-w-[1320px] scroll-mt-24 px-6 py-24 md:px-10 md:py-32"
    >
      <div className="grid gap-8 md:grid-cols-12 md:items-end">
        <h2
          id="lifecycle-title"
          className="display text-[clamp(2.4rem,5vw,4.6rem)] md:col-span-7"
        >
          From spec to pull request, with a checkpoint at every step.
        </h2>
        <p className="max-w-[34rem] text-sterling md:col-span-5">
          This is the flow Argent is being built around. In M0, a scripted agent
          runs it as a simulation: the run, its limits and an independent
          artifact check work for real, without a repository or a model.
        </p>
      </div>

      <div
        ref={ref}
        className="relative mt-10 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-12"
      >
        <div
          aria-hidden
          className="absolute top-0 bottom-0 left-[1.15rem] w-px bg-hairline"
        >
          <motion.div
            style={{ scaleY: rail }}
            className="h-full w-full origin-top bg-polished"
          />
        </div>

        <ol className="min-w-0 pl-14 lg:col-span-6">
          {STEPS.map((step, index) => (
            <StepText
              key={step.title}
              index={index}
              step={step}
              onActive={setActive}
            />
          ))}
        </ol>

        <div className="hidden lg:col-span-6 lg:block">
          <div className="sticky top-0 flex h-[100svh] items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                className="flex w-full justify-center"
                initial={{
                  opacity: 0,
                  y: 24,
                  scale: 0.97,
                  filter: "blur(6px)",
                }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -16, scale: 0.98, filter: "blur(6px)" }}
                transition={{ duration: 0.45, ease }}
              >
                <ActiveVisual />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
