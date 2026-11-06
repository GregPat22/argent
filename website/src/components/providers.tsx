"use client";

import { useReducedMotion } from "@/lib/use-reduced-motion";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <MotionConfig reducedMotion={reduce ? "always" : "never"}>
      {children}
    </MotionConfig>
  );
}
