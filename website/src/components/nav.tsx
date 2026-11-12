"use client";

import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArgentMark, LiquidLink } from "@/components/ui";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const LINKS = [
  { href: "#hallmark", label: "Proof" },
  { href: "#lifecycle", label: "How it works" },
  { href: "#roadmap", label: "Roadmap" },
  { href: "#faq", label: "FAQ" },
];

/** Links are squeezed out of the A: narrow, blurred and pulled back into it, then released. */
const SQUEEZE = {
  hidden: {
    opacity: 0,
    x: -72,
    scaleX: 0.12,
    scaleY: 1.25,
    filter: "blur(8px)",
    transition: { duration: 0.28, ease: [0.64, 0, 0.78, 0] as const },
  },
  shown: {
    opacity: 1,
    x: 0,
    scaleX: 1,
    scaleY: 1,
    filter: "blur(0px)",
    transition: {
      type: "spring" as const,
      stiffness: 260,
      damping: 15,
      mass: 0.9,
      opacity: { duration: 0.2 },
      filter: { duration: 0.35 },
    },
  },
};
const FADE = {
  hidden: { opacity: 0 },
  shown: { opacity: 1 },
};
/** Where the page already offers the action, so the pill steps aside. */
const ACTION_SECTIONS = "#intro, #run, #join";

export function Nav() {
  const { scrollY } = useScroll();
  const reduce = useReducedMotion();
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [atAction, setAtAction] = useState(true);
  const compactButton = useRef<HTMLButtonElement>(null);
  const mobileButton = useRef<HTMLButtonElement>(null);
  const homeLink = useRef<HTMLAnchorElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const moveFocus = useRef(false);

  useEffect(() => {
    setCompact(window.scrollY > 120);
    const sections = Array.from(
      document.querySelectorAll("main > section[id]"),
    );
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        // Entries contain changes, not all matches. An exit-only notification
        // must restore the preceding section when scrolling upward.
        const current = sections.findLast((section) => visible.has(section));
        setActive(current ? `#${current.id}` : null);
      },
      { rootMargin: "-15% 0px -65% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    // The compact pill repeats the page's main action; it rests while the
    // hero, the try-it section or the closing band is already on screen.
    const actions = new Set<Element>();
    const actionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) actions.add(entry.target);
          else actions.delete(entry.target);
        }
        setAtAction(actions.size > 0);
      },
      { rootMargin: "-20% 0px -20% 0px" },
    );
    document
      .querySelectorAll(ACTION_SECTIONS)
      .forEach((section) => actionObserver.observe(section));
    return () => {
      observer.disconnect();
      actionObserver.disconnect();
    };
  }, []);

  useMotionValueEvent(scrollY, "change", (value) => {
    const next = compact ? value > 48 : value > 120;
    if (next === compact) return;
    moveFocus.current = Boolean(
      navigation.current?.contains(document.activeElement),
    );
    setCompact(next);
    setMenuOpen(false);
  });

  useEffect(() => {
    if (moveFocus.current) {
      (compact ? compactButton.current : homeLink.current)?.focus({
        preventScroll: true,
      });
      moveFocus.current = false;
    }
  }, [compact]);

  const closeMenu = () => {
    setMenuOpen(false);
    (compact ? compactButton.current : mobileButton.current)?.focus({
      preventScroll: true,
    });
  };

  return (
    <motion.header
      layoutRoot
      initial={false}
      data-compact={compact}
      className={`site-header ${compact ? "is-compact" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) closeMenu();
      }}
    >
      <nav ref={navigation} aria-label="Main">
        <div className="nav-logo-dock">
          <Image
            src="/brand/argent-wordmark-800.webp"
            alt=""
            aria-hidden="true"
            width={204}
            height={68}
            sizes="(max-width: 767px) 180px, 204px"
            preload
            className="nav-wordmark"
            decoding="async"
          />
          <span className="nav-mark" aria-hidden="true">
            <motion.span
              className="nav-mark-pulse"
              animate={
                reduce
                  ? undefined
                  : menuOpen
                    ? { scaleX: [1, 0.78, 1.08, 1], scaleY: [1, 1.12, 0.96, 1] }
                    : { scaleX: 1, scaleY: 1 }
              }
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <ArgentMark size={64} />
            </motion.span>
          </span>
          {compact ? (
            <button
              ref={compactButton}
              type="button"
              className="nav-logo-control"
              data-open={menuOpen}
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              title={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen((value) => !value)}
            ></button>
          ) : (
            <a
              ref={homeLink}
              href="#top"
              aria-label="Argent home"
              className="nav-logo-control"
              onClick={() => setMenuOpen(false)}
            ></a>
          )}
          <AnimatePresence>
            {menuOpen && (
              <>
                <motion.div
                  key="scrim"
                  className="nav-scrim"
                  aria-hidden="true"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => closeMenu()}
                />
                <motion.ul
                  key="row"
                  id="mobile-navigation"
                  className="nav-squeeze"
                  initial="hidden"
                  animate="shown"
                  exit="hidden"
                  variants={{
                    hidden: {
                      transition: {
                        staggerChildren: reduce ? 0 : 0.04,
                        staggerDirection: -1,
                      },
                    },
                    shown: {
                      transition: {
                        delayChildren: reduce ? 0 : 0.08,
                        staggerChildren: reduce ? 0 : 0.07,
                      },
                    },
                  }}
                >
                  {LINKS.map((link) => (
                    <motion.li
                      key={link.href}
                      variants={reduce ? FADE : SQUEEZE}
                    >
                      <a
                        href={link.href}
                        aria-current={
                          active === link.href ? "location" : undefined
                        }
                        onClick={() => setMenuOpen(false)}
                        className="nav-squeeze-link"
                      >
                        {link.label}
                      </a>
                    </motion.li>
                  ))}
                  <motion.li variants={reduce ? FADE : SQUEEZE}>
                    <a
                      href="#top"
                      onClick={() => setMenuOpen(false)}
                      className="nav-squeeze-link"
                    >
                      Back to top
                    </a>
                  </motion.li>
                  <motion.li variants={reduce ? FADE : SQUEEZE}>
                    <LiquidLink
                      href="#run"
                      onClick={() => setMenuOpen(false)}
                      className="nav-cta"
                    >
                      Try it locally <span aria-hidden>↓</span>
                    </LiquidLink>
                  </motion.li>
                </motion.ul>
              </>
            )}
          </AnimatePresence>
        </div>
        <motion.div
          className="nav-full"
          inert={compact}
          aria-hidden={compact}
          initial={false}
          animate={{
            opacity: compact ? 0 : 1,
            transform: compact
              ? "translateY(-28px) scale(0.96)"
              : "translateY(0px) scale(1)",
          }}
          transition={
            reduce
              ? { duration: 0 }
              : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
          }
        >
          <ul className="nav-links">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  aria-current={active === link.href ? "location" : undefined}
                  className="nav-section-link"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <LiquidLink href="#run" className="nav-cta">
            Try it locally{" "}
            <span aria-hidden className="button-arrow button-arrow--down">
              ↓
            </span>
          </LiquidLink>
          {!compact && (
            <button
              ref={mobileButton}
              type="button"
              className="nav-menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? "Close" : "Menu"}
              <span aria-hidden>{menuOpen ? "×" : "+"}</span>
            </button>
          )}
        </motion.div>
        <AnimatePresence>
          {compact && !atAction && !menuOpen && (
            <motion.div
              key="pill"
              className="nav-pill"
              initial={
                reduce
                  ? { opacity: 0 }
                  : { opacity: 0, y: -14, scale: 0.92, filter: "blur(6px)" }
              }
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={
                reduce
                  ? { opacity: 0 }
                  : { opacity: 0, y: -10, scale: 0.94, filter: "blur(4px)" }
              }
              transition={
                reduce
                  ? { duration: 0 }
                  : { type: "spring", visualDuration: 0.4, bounce: 0.22 }
              }
            >
              <LiquidLink href="#run" className="nav-cta nav-cta--pill">
                Try it locally{" "}
                <span aria-hidden className="button-arrow button-arrow--down">
                  ↓
                </span>
              </LiquidLink>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </motion.header>
  );
}
