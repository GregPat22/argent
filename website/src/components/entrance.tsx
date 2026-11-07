"use client";

import { animate, inView, stagger } from "motion/react";
import { useEffect } from "react";
import { carryGradient, splitWords, type SplitText } from "@/lib/split-words";

/*
 * First-load and scroll-in choreography for the whole landing page, adapted
 * from the Motion UI "Hero: Split text reveal" and "Editorial stagger hero"
 * sections: headings rise word by word out of masked lines, then their
 * content follows with a short staggered lift, fade and focus pull.
 *
 * The layout's inline script marks <html data-entrance="pending"> before first
 * paint (only when JavaScript runs and motion is allowed) so nothing flashes
 * before hydration. This component hands each element its own hidden state,
 * plays the hero immediately and every later section when it scrolls in.
 * Inline styles and split text are removed as soon as each reveal settles.
 */

// Springs from the Motion+ "eased" theme: physical, interruptible, no overshoot.
const GENTLE = { type: "spring", stiffness: 65, damping: 15 } as const;
const FOLLOW = { type: "spring", stiffness: 99, damping: 19.2 } as const;
const fade = (duration: number) =>
  ({ type: "tween", duration, ease: "easeIn" }) as const;

const RISE_FROM = "translateY(110%)";
const LIFT = ["translateY(28px)", "translateY(0px)"];
const DROP = ["translateY(-14px)", "translateY(0px)"];
const FOCUS = ["blur(6px)", "blur(0px)"];

type Controls = ReturnType<typeof animate>;

let generation = 0;

const visible = (el: Element): el is HTMLElement =>
  el instanceof HTMLElement &&
  !el.classList.contains("sr-only") &&
  getComputedStyle(el).display !== "none";

const expandable = (el: HTMLElement) =>
  (el.tagName === "UL" ||
    el.tagName === "OL" ||
    el.classList.contains("grid")) &&
  el.children.length >= 2 &&
  el.children.length <= 12;

/** Content blocks that follow a section heading, in reading order. */
function followersOf(root: HTMLElement, heading: HTMLElement | null) {
  const out: HTMLElement[] = [];
  const visit = (el: HTMLElement) => {
    for (const child of Array.from(el.children)) {
      if (child === heading || !visible(child)) continue;
      if (heading && child.contains(heading)) visit(child);
      else if (expandable(child))
        out.push(...Array.from(child.children).filter(visible));
      else out.push(child);
    }
  };
  // Descend through a lone wrapper so its blocks stagger individually.
  let start = root;
  while (
    start.children.length === 1 &&
    start.firstElementChild instanceof HTMLElement
  )
    start = start.firstElementChild;
  visit(start);
  // Nested lists marked for it stagger inside their already-rising block.
  for (const block of [...out])
    block
      .querySelectorAll<HTMLElement>("[data-reveal-children]")
      .forEach((list) =>
        out.push(...Array.from(list.children).filter(visible)),
      );
  return out;
}

function clearNow(elements: HTMLElement[]) {
  for (const el of elements) {
    el.style.opacity = "";
    el.style.transform = "";
    el.style.filter = "";
    el.style.willChange = "";
  }
}

/** Remove reveal styles, again next frame after Motion commits final values. */
function clear(elements: HTMLElement[]) {
  clearNow(elements);
  requestAnimationFrame(() => clearNow(elements));
}

export function Entrance() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.entrance !== "pending") return;
    const id = ++generation;
    const running = new Set<Controls>();
    const cleanups = new Set<() => void>();
    const stops: VoidFunction[] = [];
    const hidden = new Set<HTMLElement>();
    let cancelled = false;

    const play = (
      elements: HTMLElement[],
      keyframes: Parameters<typeof animate>[1],
      transition: Parameters<typeof animate>[2],
    ) => {
      if (!elements.length) return Promise.resolve();
      const controls = animate(elements, keyframes, transition);
      running.add(controls);
      return controls.finished.then(
        () => void running.delete(controls),
        () => void running.delete(controls),
      );
    };

    const hide = (elements: HTMLElement[]) => {
      for (const el of elements) {
        el.style.opacity = "0";
        hidden.add(el);
      }
    };

    /** Split a heading and park its words below their masks. */
    const prepareHeading = (heading: HTMLElement) => {
      const split = splitWords(heading, { label: true });
      for (const word of split.words) word.style.transform = RISE_FROM;
      return split;
    };

    const finish = (
      split: SplitText | null,
      extra: () => void,
      elements: HTMLElement[],
    ) => {
      const done = () => {
        split?.restore();
        extra();
        clear(elements);
        elements.forEach((el) => hidden.delete(el));
        cleanups.delete(done);
      };
      cleanups.add(done);
      return done;
    };

    const boot = () => {
      if (cancelled) return;

      // Header and hero: one sequence on first load.
      const navItems = [
        ...root.querySelectorAll<HTMLElement>(
          ".site-header .nav-logo-dock, .site-header .nav-links > li, .site-header .nav-full > a, .site-header .nav-full > button",
        ),
      ].filter(visible);
      const hero = root.querySelector<HTMLElement>("#intro");
      const title = hero?.querySelector<HTMLElement>("h1") ?? null;
      const lines = title
        ? [...title.querySelectorAll<HTMLElement>(":scope > span > span")]
        : [];
      const copy = hero?.querySelector<HTMLElement>(".hero-copy > div") ?? null;
      const followers = copy
        ? [...copy.children].flatMap((child) =>
            child.classList.contains("hero-actions")
              ? [...child.children].filter(visible)
              : visible(child)
                ? [child]
                : [],
          )
        : [];
      const liquid = hero?.querySelector<HTMLElement>("[data-liquid-silver]");

      const splits = lines.map((line) => splitWords(line));
      const heroWords = splits.flatMap((split) => split.words);
      const gradients = lines.map((line, index) =>
        line.classList.contains("hero-proof")
          ? carryGradient(line, splits[index]!.words)
          : () => {},
      );
      if (title && heroWords.length)
        title.setAttribute("aria-label", title.textContent?.trim() ?? "");
      for (const word of heroWords) word.style.transform = RISE_FROM;
      hide([...navItems, ...followers, ...(liquid ? [liquid] : [])]);

      // Later sections and the footer wait for the viewport.
      const sections = [
        ...root.querySelectorAll<HTMLElement>(
          "main > section:not(#intro), .site-footer",
        ),
      ];
      const prepared = sections.map((section) => {
        const heading = section.querySelector<HTMLElement>("h2");
        const blocks = followersOf(section, heading);
        hide([...blocks, ...(heading ? [heading] : [])]);
        return { section, heading, blocks };
      });

      // Every element now owns its hidden state; drop the blanket CSS hide.
      root.dataset.entrance = "running";

      const heroDone = finish(
        null,
        () => {
          splits.forEach((split) => split.restore());
          gradients.forEach((undo) => undo());
          title?.removeAttribute("aria-label");
        },
        [...navItems, ...followers, ...(liquid ? [liquid] : []), ...heroWords],
      );
      const heroStart = 0.18;
      const wordBeat = 0.1;
      const followStart = heroStart + heroWords.length * wordBeat + 0.12;
      void Promise.all([
        play(
          navItems,
          { opacity: [0, 1], transform: DROP, filter: FOCUS },
          {
            ...FOLLOW,
            delay: stagger(0.06),
            opacity: { ...fade(0.45), inherit: true },
          },
        ),
        play(
          heroWords,
          { transform: [RISE_FROM, "translateY(0%)"] },
          { ...GENTLE, delay: stagger(wordBeat, { startDelay: heroStart }) },
        ),
        play(
          followers,
          { opacity: [0, 1], transform: LIFT, filter: FOCUS },
          {
            ...FOLLOW,
            delay: stagger(0.09, { startDelay: followStart }),
            opacity: { ...fade(0.5), inherit: true },
          },
        ),
        liquid
          ? play(
              [liquid],
              {
                opacity: [0, 1],
                transform: ["scale(0.86)", "scale(1)"],
                // Kept under 10px: the canvas redraws every frame beneath it.
                filter: ["blur(8px)", "blur(0px)"],
              },
              { ...GENTLE, delay: 0.5, opacity: { ...fade(0.8), delay: 0.5 } },
            )
          : Promise.resolve(),
      ]).then(() => {
        if (cancelled) return;
        heroDone();
        root.dataset.entrance = "done";
      });

      // A single light sweep across the primary action once it has landed.
      const primary = followers.find((el) =>
        el.classList.contains("argent-button--primary"),
      );
      if (primary) {
        const timer = window.setTimeout(
          () => primary.classList.add("is-shining"),
          (followStart + 0.45) * 1000,
        );
        const end = () => primary.classList.remove("is-shining");
        primary.addEventListener("animationend", end, { once: true });
        cleanups.add(() => {
          window.clearTimeout(timer);
          end();
        });
      }

      for (const { section, heading, blocks } of prepared) {
        const stop = inView(
          section,
          () => {
            stop();
            const split = heading ? prepareHeading(heading) : null;
            if (heading) heading.style.opacity = "";
            const words = split?.words ?? [];
            const done = finish(split, () => {}, [...blocks, ...words]);
            const start = 0.2 + Math.min(words.length, 8) * 0.06;
            void Promise.all([
              play(
                words,
                { transform: [RISE_FROM, "translateY(0%)"] },
                { ...GENTLE, delay: stagger(0.06) },
              ),
              play(
                blocks,
                { opacity: [0, 1], transform: LIFT, filter: FOCUS },
                {
                  ...FOLLOW,
                  delay: stagger(0.08, { startDelay: start }),
                  opacity: { ...fade(0.5), inherit: true },
                },
              ),
            ]).then(() => !cancelled && done());
          },
          { amount: 0.18 },
        );
        stops.push(stop);
      }
    };

    // Jump to the end state if the visitor turns on reduced motion mid-reveal.
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settle = () => {
      if (!query.matches) return;
      running.forEach((controls) => controls.complete());
      stops.forEach((stop) => stop());
      cleanups.forEach((cleanup) => cleanup());
      clear([...hidden]);
      hidden.clear();
      root.dataset.entrance = "done";
    };
    query.addEventListener("change", settle);

    // Split against the final fonts so line breaks match the settled text.
    const fonts = document.fonts?.ready ?? Promise.resolve();
    void Promise.race([fonts, new Promise((r) => setTimeout(r, 1200))]).then(
      boot,
    );

    return () => {
      cancelled = true;
      query.removeEventListener("change", settle);
      running.forEach((controls) => controls.stop());
      stops.forEach((stop) => stop());
      cleanups.forEach((cleanup) => cleanup());
      clear([...hidden]);
      hidden.clear();
      // React's development double-invoke remounts immediately: hand the page
      // back to the pre-paint state so the next run replays the entrance.
      // A real unmount reveals everything on the next task.
      root.dataset.entrance = "pending";
      setTimeout(() => {
        if (generation === id) root.dataset.entrance = "done";
      }, 0);
    };
  }, []);

  return null;
}
