"use client";

import { useEffect } from "react";

/*
 * Marks each landing section as on or off screen so CSS can pause looping
 * decorative animations (drifting drops, pulses, flowing branches) that
 * nobody can see. The hero manages its own canvas and is skipped.
 */
export function SectionActivity() {
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>(
      "main > section:not(#intro)",
    );
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          (entry.target as HTMLElement).dataset.onscreen = String(
            entry.isIntersecting,
          );
      },
      { rootMargin: "100px 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  return null;
}
