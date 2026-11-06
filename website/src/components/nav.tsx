"use client";

import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArgentMark, LiquidLink } from "@/components/ui";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const LINKS = [
  { href: "#lifecycle", label: "How it works" },
  { href: "#hallmark", label: "Proof" },
  { href: "#roadmap", label: "Roadmap" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  const { scrollY } = useScroll();
  const reduce = useReducedMotion();
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const compactButton = useRef<HTMLButtonElement>(null);
  const mobileButton = useRef<HTMLButtonElement>(null);
  const homeLink = useRef<HTMLAnchorElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const moveFocus = useRef(false);

  useEffect(() => {
    setCompact(window.scrollY > 120);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) setActive(`#${entry.target.id}`);
      },
      { rootMargin: "-15% 0px -65% 0px" },
    );
    document
      .querySelectorAll("main > section[id]")
      .forEach((section) => observer.observe(section));
    return () => observer.disconnect();
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
  const transition = reduce
    ? { duration: 0 }
    : { type: "spring" as const, visualDuration: 0.6, bounce: 0.08 };

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
        <motion.div layout transition={transition} className="nav-logo-dock">
          {compact ? (
            <button
              ref={compactButton}
              type="button"
              className="nav-logo-control"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              title={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen((value) => !value)}
            >
              <ArgentMark size={64} />
            </button>
          ) : (
            <a
              ref={homeLink}
              href="#top"
              aria-label="Argent home"
              className="nav-logo-control"
              onClick={() => setMenuOpen(false)}
            >
              <ArgentMark size={64} />
            </a>
          )}
        </motion.div>
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
            Try locally{" "}
            <span aria-hidden className="button-arrow">
              ↗
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
        <motion.div
          id="mobile-navigation"
          hidden={!menuOpen}
          initial={false}
          animate={{
            opacity: menuOpen ? 1 : 0,
            transform:
              menuOpen || reduce ? "translateY(0px)" : "translateY(-10px)",
          }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          className="nav-disclosure"
        >
          <ul className="grid gap-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  aria-current={active === link.href ? "location" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className="nav-disclosure-link"
                >
                  {link.label}
                  <span aria-hidden>↗</span>
                </a>
              </li>
            ))}
            <li>
              <a
                href="#top"
                onClick={() => setMenuOpen(false)}
                className="nav-disclosure-link"
              >
                Back to top <span aria-hidden>↑</span>
              </a>
            </li>
            <li className="mt-2">
              <LiquidLink
                href="#run"
                onClick={() => setMenuOpen(false)}
                className="w-full"
              >
                Try locally <span aria-hidden>↗</span>
              </LiquidLink>
            </li>
          </ul>
        </motion.div>
      </nav>
    </motion.header>
  );
}
