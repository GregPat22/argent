"use client";

import { SilverAtom } from "@/components/silver-atom";

/*
 * Answers the hero's provocation. Silver (Ag, 47) conducts electricity better
 * than any other metal; a conductor also turns many players into one piece.
 * The three problems below are what agents sound like without one.
 */
const PROBLEMS = [
  {
    title: "A terminal per task",
    body: "Each agent wants its own window, its own branch and your attention. Run three and you spend the afternoon switching tabs.",
    glyph: (
      <>
        <rect x="6" y="12" width="40" height="28" rx="4" />
        <rect x="14" y="6" width="40" height="28" rx="4" />
        <path d="M21 16l4 4-4 4M29 24h8" />
      </>
    ),
  },
  {
    title: "“Done” is only a claim",
    body: "“All tests pass, ready to merge” is a sentence the agent wrote. Nothing attached to it shows which commit was tested, or whether anything was.",
    glyph: (
      <>
        <path d="M8 10h44a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H22l-10 8v-8H8a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4Z" />
        <path d="M18 23h24" strokeDasharray="3 4" />
      </>
    ),
  },
  {
    title: "Your laptop is the leash",
    body: "Close the lid and the work stops. Step away from your desk and you lose sight of what your agents are doing.",
    glyph: (
      <>
        <path d="M12 36V14a3 3 0 0 1 3-3h30a3 3 0 0 1 3 3v22" />
        <path d="M6 36h48l-3 6H9z" />
        <path d="M24 22l12 0" />
      </>
    ),
  },
];

export function Statement() {
  return (
    <section
      id="statement"
      aria-labelledby="statement-title"
      className="mx-auto max-w-[1320px] px-6 py-24 md:px-10 md:py-36"
    >
      <div className="grid items-center gap-10 md:grid-cols-12 md:gap-12">
        <div className="min-w-0 md:col-span-7">
          <h2
            id="statement-title"
            className="display max-w-[17ch] text-[clamp(2.5rem,5.5vw,5rem)]"
          >
            Silver conducts better than any metal.
          </h2>
          <p className="mt-8 max-w-[36rem] text-lg leading-[1.75] text-sterling md:text-xl">
            A conductor also turns a room full of players into one piece of
            music. Argent does both for your coding agents: every task flows
            through one place, each agent plays its part in its own branch, and
            you hold the baton when it’s time to merge.
          </p>
        </div>
        <div className="min-w-0 md:col-span-5">
          <SilverAtom />
        </div>
      </div>

      <div className="mt-20 border-t border-hairline pt-12 md:mt-28">
        <p className="text-sm text-sterling-dim">
          Without a conductor, agents are just noise:
        </p>
        <ul className="mt-8 grid gap-10 md:grid-cols-3 md:gap-8">
          {PROBLEMS.map((problem) => (
            <li key={problem.title} className="problem-card">
              <svg
                viewBox="0 0 60 48"
                className="problem-glyph h-12 w-auto"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                {problem.glyph}
              </svg>
              <h3 className="mt-6 text-xl font-medium text-polished">
                {problem.title}
              </h3>
              <p className="mt-3 max-w-[22rem] text-[0.9375rem] leading-relaxed text-sterling">
                {problem.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
