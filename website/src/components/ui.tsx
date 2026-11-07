"use client";

import { useReducedMotion } from "@/lib/use-reduced-motion";

import {
  type HTMLMotionProps,
  motion,
  useMotionValue,
  useSpring,
} from "motion/react";
import { useEffect, type ReactNode } from "react";
import { STATUS_LABEL, type Status } from "@/lib/site";

const STATUS_DOT: Record<Status, string> = {
  live: "bg-verified",
  next: "bg-running",
  planned: "bg-sterling-dim",
  policy: "bg-polished",
};

export function StatusTag({
  status,
  subject,
  className = "",
}: {
  status: Status;
  subject?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-hairline px-2.5 py-1 text-[0.8125rem] leading-none text-sterling ${className}`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${STATUS_DOT[status]}`}
      />
      {subject && (
        <span className="text-polished">
          {subject}
          <span className="sr-only">:</span>
        </span>
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Faithful web derivative of the official Argent icon. */
export function ArgentMark({ size = 40 }: { size?: number }) {
  return (
    <img
      src="/brand/argent-icon-96.webp"
      srcSet="/brand/argent-icon-96.webp 1x, /brand/argent-icon-192.webp 2x"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="argent-mark shrink-0 object-contain"
      decoding="async"
    />
  );
}

type LinkButtonProps = Omit<HTMLMotionProps<"a">, "children" | "style"> & {
  variant?: "primary" | "ghost";
  children: ReactNode;
};

/** A button-like link whose contents follow the pointer within a fixed hit area. */
export function LiquidLink({
  variant = "primary",
  className = "",
  children,
  ...rest
}: LinkButtonProps) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 260, damping: 18, mass: 0.6 });
  const springY = useSpring(y, { stiffness: 260, damping: 18, mass: 0.6 });

  useEffect(() => {
    if (reduceMotion) {
      x.jump(0);
      y.jump(0);
    }
  }, [reduceMotion, x, y]);

  return (
    <motion.a
      {...rest}
      onPointerMove={(event) => {
        if (reduceMotion || event.pointerType !== "mouse") return;
        const rect = event.currentTarget.getBoundingClientRect();
        x.set(((event.clientX - rect.left) / rect.width - 0.5) * 8);
        y.set(((event.clientY - rect.top) / rect.height - 0.5) * 4);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      onFocus={() => {
        x.set(0);
        y.set(0);
      }}
      className={`argent-button argent-button--${variant === "primary" ? "primary" : "secondary"} ${className}`}
    >
      <motion.span
        style={reduceMotion ? undefined : { x: springX, y: springY }}
        className="argent-button-label relative z-10 inline-flex items-center justify-center gap-2.5"
      >
        {children}
      </motion.span>
    </motion.a>
  );
}

export function GitHubIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.34c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
