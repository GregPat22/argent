"use client";

import { ReactLenis } from "lenis/react";
import { MotionConfig, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <MotionConfig reducedMotion="user">
      {reduceMotion ? (
        children
      ) : (
        <ReactLenis root options={{ lerp: 0.11, anchors: { offset: -72 } }}>
          {children}
        </ReactLenis>
      )}
    </MotionConfig>
  );
}
