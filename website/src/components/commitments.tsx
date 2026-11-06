import { StatusTag } from "@/components/ui";
import type { Status } from "@/lib/site";

const ITEMS: {
  title: string;
  body: string;
  status: Status;
  subject: string;
}[] = [
  {
    title: "Self-host all of it",
    body: "The core is MIT licensed and runs without our servers. A managed cloud, if we offer one, would run the same core, so self-hosting is never the lesser option.",
    status: "live",
    subject: "MIT core",
  },
  {
    title: "Stops when it isn’t sure",
    body: "If a worker vanishes mid-run, the run is marked as needing attention. Argent doesn’t retry something that may already have happened.",
    status: "live",
    subject: "Lost-worker handling",
  },
  {
    title: "Workspaces outlive compute",
    body: "Repositories, dependencies and settings persist while idle machines are suspended, so resuming doesn’t mean rebuilding.",
    status: "planned",
    subject: "Persistent cloud workspaces",
  },
  {
    title: "Bring your agent",
    body: "Codex comes first, through its official interface. Claude Code and OpenCode are on the roadmap. Model keys stay separate from GitHub and cloud credentials.",
    status: "planned",
    subject: "Real agents",
  },
];

export function Commitments() {
  return (
    <section
      aria-labelledby="commitments-title"
      className="mx-auto max-w-[1320px] px-6 py-24 md:px-10 md:py-32"
    >
      <div className="grid gap-12 lg:grid-cols-12">
        <h2
          id="commitments-title"
          className="display text-[clamp(2.4rem,5vw,4.6rem)] lg:col-span-5"
        >
          Yours to run, wherever you want.
        </h2>
        <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:col-span-7">
          {ITEMS.map((item) => (
            <article
              key={item.title}
              className="border-t border-hairline-strong pt-6"
            >
              <h3 className="display text-[1.85rem] leading-[1.05]">
                {item.title}
              </h3>
              <p className="mt-3 text-[0.9375rem] text-sterling">{item.body}</p>
              <StatusTag
                status={item.status}
                subject={item.subject}
                className="mt-5"
              />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
