"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { StatusTag } from "@/components/ui";
import { LOCAL_MVP_URL } from "@/lib/site";

/*
 * The local MVP workflow in three plates. Each plate carries a small object
 * that plays once when the list scrolls in (CSS keyframes keyed off
 * data-playing, so the page entrance can own the plates' own transforms).
 */

function BriefObject() {
  return (
    <div className="hiw-object hiw-brief">
      <p className="hiw-file font-mono">task.md</p>
      <p className="hiw-brief-title">Rate-limit the login endpoint.</p>
      <ul>
        {[
          "Five failed logins lock the account for 15 minutes",
          "A successful login resets the counter",
          "Locked responses return 429 with Retry-After",
        ].map((line, index) => (
          <li key={line} style={{ animationDelay: `${300 + index * 220}ms` }}>
            <span className="hiw-check" aria-hidden />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BranchObject() {
  const branches = [
    { d: "M 20 70 C 70 70, 80 26, 130 26 L 300 26", label: "rate-limit-login" },
    {
      d: "M 50 70 C 100 70, 110 70, 150 70 L 300 70",
      label: "flaky-upload-test",
    },
    { d: "M 80 70 C 130 70, 140 114, 190 114 L 300 114", label: "docs-typos" },
  ];
  return (
    <div className="hiw-object hiw-branches">
      <svg viewBox="0 0 320 140" fill="none" aria-hidden>
        <path
          d="M 0 70 L 80 70"
          stroke="rgb(214 220 230 / 0.35)"
          strokeWidth="2"
        />
        {branches.map((branch, index) => (
          <g key={branch.label}>
            <path
              d={branch.d}
              className="hiw-branch"
              style={{ animationDelay: `${200 + index * 260}ms` }}
              pathLength={1}
            />
            <path
              d={branch.d}
              className="hiw-pulse"
              style={{ animationDelay: `${1200 + index * 500}ms` }}
              pathLength={1}
            />
          </g>
        ))}
      </svg>
      <ul className="hiw-branch-labels font-mono">
        {branches.map((branch) => (
          <li key={branch.label}>argent/{branch.label}</li>
        ))}
      </ul>
    </div>
  );
}

function EvidenceObject() {
  return (
    <div className="hiw-object hiw-evidence">
      <div className="hiw-diff font-mono">
        <p className="hiw-del">- return login(user, password)</p>
        <p className="hiw-add">+ if (await locked(user)) return tooMany()</p>
        <p className="hiw-add">+ return login(user, password)</p>
      </div>
      <div className="hiw-checks">
        <span className="hiw-tick" aria-hidden />
        <p>
          Tests passed on <span className="font-mono">9b1e07d</span>
        </p>
      </div>
      <div className="hiw-merge">Merge is yours</div>
    </div>
  );
}

const STEPS: { title: string; body: string; object: ReactNode }[] = [
  {
    title: "Describe the work.",
    body: "Write the outcome you want and the checks that would prove it. Plain language is enough.",
    object: <BriefObject />,
  },
  {
    title: "Agents run side by side.",
    body: "Each task gets its own branch and Git worktree of your repository, so parallel agents never overwrite each other. Follow every session live, send follow-ups, or stop it.",
    object: <BranchObject />,
  },
  {
    title: "Review the evidence. Then merge.",
    body: "See the real diff and the test results recorded for the exact commit, separate from what the agent says. Argent opens a draft pull request; merging is always your call.",
    object: <EvidenceObject />,
  },
];

export function HowItWorks() {
  const list = useRef<HTMLOListElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setPlaying(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="lifecycle"
      aria-labelledby="lifecycle-title"
      className="mx-auto max-w-[1320px] scroll-mt-24 px-6 py-24 md:px-10 md:py-36"
    >
      <div className="grid gap-8 md:grid-cols-12 md:items-end">
        <h2
          id="lifecycle-title"
          className="display text-[clamp(2.4rem,5vw,4.6rem)] md:col-span-7"
        >
          Three steps.
          <br />
          You hold the baton.
        </h2>
        <p className="max-w-[34rem] text-sterling md:col-span-5">
          This is the workflow of the local MVP, the first release. It runs real
          agents on your own computer through their official command-line tools
          and your own sign-in: Claude Code first, then Codex, with the model of
          your choice.
        </p>
      </div>

      <ol
        ref={list}
        data-playing={playing}
        className="hiw-list mt-14 grid gap-5 lg:grid-cols-3"
      >
        {STEPS.map((step, index) => (
          <li key={step.title} className="hiw-plate silver-surface">
            {step.object}
            <div className="mt-8 flex items-baseline gap-3">
              <span className="font-mono text-xs text-sterling-dim">
                0{index + 1}
              </span>
              <h3 className="text-xl font-medium text-polished">
                {step.title}
              </h3>
            </div>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-sterling">
              {step.body}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="max-w-[44rem] text-[0.9375rem] text-sterling-dim">
          Illustrative example. Local mode is not a sandbox: an agent has the
          same access as running it in your terminal, and a worktree separates
          changes, not privileges.{" "}
          <a
            href={LOCAL_MVP_URL}
            target="_blank"
            rel="noreferrer"
            className="text-polished underline decoration-hairline-strong underline-offset-4"
          >
            Read the local MVP spec
          </a>
          .
        </p>
        <StatusTag status="next" subject="Local MVP" />
      </div>
    </section>
  );
}
