"use client";

import { GitHubIcon, LiquidLink } from "@/components/ui";
import { REPO_URL } from "@/lib/site";

export function Hero() {
  return (
    <section id="intro" aria-labelledby="hero-title" className="hero-section">
      <div className="hero-copy mx-auto w-full max-w-[1320px] px-6 md:px-10">
        <h1 id="hero-title" className="display hero-title">
          {["Delegate work.", "Keep control."].map((line, index) => (
            <span key={line} className="block overflow-hidden pb-[0.08em]">
              <span className={`block ${index === 1 ? "hero-proof" : ""}`}>
                {line}
              </span>
            </span>
          ))}
        </h1>
        <div>
          <p className="hero-description mt-6 max-w-[28rem] text-base leading-relaxed text-sterling md:mt-7 md:text-lg">
            An open-source desktop app for managing coding tasks, agent activity
            and verification results.
          </p>
          <div className="hero-actions mt-8 flex flex-wrap items-center gap-3">
            <LiquidLink href="#reconnect">
              See it in action{" "}
              <span aria-hidden className="button-arrow">
                ↗
              </span>
            </LiquidLink>
            <LiquidLink
              href={REPO_URL}
              aria-label="View on GitHub"
              target="_blank"
              rel="noreferrer"
              variant="ghost"
            >
              <GitHubIcon />
              <span>
                <span className="hidden sm:inline">View on </span>GitHub
              </span>
            </LiquidLink>
          </div>
          <p className="mt-6 flex max-w-[29rem] items-start gap-2.5 text-sm leading-relaxed text-sterling-dim">
            <span
              aria-hidden
              className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-running"
            />
            Local prototype · simulated execution. Real agents, cloud workspaces
            and public downloads are planned.
          </p>
        </div>
      </div>
    </section>
  );
}
