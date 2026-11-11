"use client";

import { useEffect } from "react";

/*
 * Polished metal answers the light in the room. Surfaces marked [data-light]
 * receive the pointer's position as two custom properties, and CSS draws a
 * highlight on their edge and face from them. One listener serves the whole
 * page, writes at most once per frame and only on devices with a real pointer.
 */
export function PointerLight() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches)
      return;
    let frame = 0;
    let surface: HTMLElement | null = null;
    let x = 0;
    let y = 0;

    const write = () => {
      frame = 0;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      surface.style.setProperty("--lx", `${Math.round(x - rect.left)}px`);
      surface.style.setProperty("--ly", `${Math.round(y - rect.top)}px`);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const target = event.target;
      surface =
        target instanceof Element
          ? target.closest<HTMLElement>("[data-light]")
          : null;
      if (!surface) return;
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(write);
    };

    document.addEventListener("pointermove", move, { passive: true });
    return () => {
      document.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
