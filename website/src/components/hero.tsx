"use client";

import { LiquidSilver } from "@/components/liquid-silver";
import { GitHubIcon, LiquidLink } from "@/components/ui";
import { REPO_URL } from "@/lib/site";

/*
 * W0.9: centered copy inside a full-bleed field of liquid silver. Elements
 * marked data-liquid-avoid are keep-out zones the metal never drifts behind.
 */
export function Hero() {
  return (
    <section id="intro" aria-labelledby="hero-title" className="hero-section">
      <LiquidSilver />
      <div className="hero-layout mx-auto w-full max-w-[1320px] px-6 md:px-10">
        <div className="hero-copy">
          <h1 id="hero-title" className="display hero-title" data-liquid-avoid>
            {["Argent is a", "good conductor."].map((line, index) => (
              <span
                key={line}
                className="-mb-[0.12em] block overflow-hidden pb-[0.2em]"
              >
                <span className={`block ${index === 1 ? "hero-proof" : ""}`}>
                  {line}
                </span>
                {index === 0 ? " " : null}
              </span>
            ))}
          </h1>
          <div>
            <p
              className="hero-description mt-6 text-base leading-relaxed text-sterling md:mt-7 md:text-lg"
              data-liquid-avoid
            >
              We’re building the open-source desktop app for your coding agents:
              every task in its own branch, and nothing merged until you’ve seen
              the proof. Claude Code runs on your Mac today, from source. Codex,
              remote workspaces and your phone come next. Diff review is in
              development; trusted checks are planned.
            </p>
            <div
              className="hero-actions mt-8 flex flex-wrap items-center justify-center gap-3"
              data-liquid-avoid
            >
              <LiquidLink href="#run">
                Try it locally{" "}
                <span aria-hidden className="button-arrow button-arrow--down">
                  ↓
                </span>
              </LiquidLink>
              <LiquidLink
                href={REPO_URL}
                aria-label="Star Argent on GitHub"
                target="_blank"
                rel="noreferrer"
                variant="ghost"
              >
                <GitHubIcon />
                <span>
                  Star<span className="hidden sm:inline"> on GitHub</span>
                </span>
              </LiquidLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
