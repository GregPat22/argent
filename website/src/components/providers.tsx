"use client";

import {
  ReducedMotionContext,
  useSystemReducedMotion,
} from "@/lib/use-reduced-motion";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const reduce = useSystemReducedMotion();
  return (
    <ReducedMotionContext value={reduce}>
      <MotionConfig reducedMotion={reduce ? "always" : "never"}>
        {children}
      </MotionConfig>
    </ReducedMotionContext>
  );
}
