"use client";

import {
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useReducedMotion,
} from "motion/react";
import { useRef, useState } from "react";
import { AgMark, GitHubIcon } from "@/components/ui";
import { REPO_URL } from "@/lib/site";

const LINKS = [
  { href: "#reconnect", label: "Disconnect" },
  { href: "#lifecycle", label: "How it works" },
  { href: "#hallmark", label: "Proof" },
  { href: "#roadmap", label: "Roadmap" },
];

export function Nav() {
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 160,
    damping: 30,
    restDelta: 0.001,
  });
  const reduce = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [hidden, setHidden] = useState(false);
  const [solid, setSolid] = useState(false);

  useMotionValueEvent(scrollY, "change", (current) => {
    const previous = scrollY.getPrevious() ?? 0;
    setHidden(
      !reduce &&
        !menuOpen &&
        current > previous &&
        current > 240 &&
        !document.querySelector("header")?.contains(document.activeElement),
    );
    setSolid(current > 24);
  });

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: hidden ? "-100%" : "0%", opacity: 1 }}
      transition={{ type: "spring", visualDuration: 0.45, bounce: 0 }}
      onFocusCapture={() => setHidden(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          setMenuOpen(false);
          menuButton.current?.focus();
        }
      }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div
        className={`transition-[background-color,backdrop-filter,border-color] duration-300 ${
          solid || menuOpen
            ? "border-b border-hairline bg-oxide/70 backdrop-blur-xl"
            : "border-b border-transparent"
        }`}
      >
        <nav
          aria-label="Main"
          className="mx-auto flex h-[4.25rem] max-w-[1320px] items-center justify-between gap-6 px-6 md:px-10"
        >
          <a
            href="#top"
            className="flex min-h-11 items-center gap-3 rounded-lg"
            aria-label="Argent home"
          >
            <AgMark size={32} />
            <span className="logo-display text-[1.6rem] leading-none tracking-[-0.01em]">
              Argent
            </span>
          </a>

          <ul className="hidden items-center gap-8 text-[0.9375rem] text-sterling lg:flex">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-flex min-h-11 items-center transition-colors hover:text-polished"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <button
              ref={menuButton}
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen((value) => !value)}
              className="min-h-11 rounded-full border border-hairline-strong px-4 text-sm lg:hidden"
            >
              {menuOpen ? "Close" : "Menu"}
            </button>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-hairline-strong px-4 text-[0.875rem] text-polished transition-colors hover:border-polished/60"
            >
              <GitHubIcon />
              <span>GitHub</span>
            </a>
          </div>
        </nav>
        <div
          id="mobile-navigation"
          hidden={!menuOpen}
          className="border-t border-hairline bg-oxide px-6 py-4 lg:hidden"
        >
          <ul className="grid grid-cols-2 gap-2">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-12 items-center rounded-lg px-3 text-sm text-sterling hover:bg-pewter hover:text-polished"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <motion.div
          aria-hidden
          style={{ scaleX: progress }}
          className="h-px origin-left bg-gradient-to-r from-sterling-dim via-polished to-sterling-dim"
        />
      </div>
    </motion.header>
  );
}
