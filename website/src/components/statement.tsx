"use client";

import { SilverAtom } from "@/components/silver-atom";

export function Statement() {
  return (
    <section
      aria-labelledby="statement-title"
      className="mx-auto max-w-[1320px] px-6 py-24 md:px-10 md:py-32"
    >
      <div className="grid items-center gap-10 md:grid-cols-12 md:gap-12">
        <div className="min-w-0 md:col-span-7">
          <h2
            id="statement-title"
            className="display max-w-[16ch] text-[clamp(2.5rem,5.5vw,5rem)]"
          >
            Assign a task.
            <br />
            Review the changes.
          </h2>
          <p className="mt-8 max-w-[34rem] text-lg leading-[1.75] text-sterling md:text-xl">
            Give a coding agent a task, set its limits, and follow its progress
            from one desktop app. Review the code changes, test results and
            independent review before deciding what to merge.
          </p>
          <p className="mt-6 max-w-[34rem] text-base leading-[1.75] text-sterling-dim">
            That’s the planned workflow. Today’s local desktop prototype runs
            Claude Code in its own Git worktree for each task and records what
            changed. Diff review, repository checks, pull requests and cloud
            workspaces are still in development.
          </p>
        </div>
        <div className="min-w-0 md:col-span-5">
          <SilverAtom />
        </div>
      </div>
    </section>
  );
}
