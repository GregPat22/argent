"use client";

import {
  type HTMLMotionProps,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { useId, type ReactNode } from "react";
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

/** Silver's periodic-table tile. Ag is also the first two letters of "agent". */
export function AgMark({ size = 36 }: { size?: number }) {
  const gradient = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden role="img">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6f8fb" />
          <stop offset="0.45" stopColor="#9aa1ac" />
          <stop offset="0.7" stopColor="#e3e7ec" />
          <stop offset="1" stopColor="#6f7681" />
        </linearGradient>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width="35"
        height="35"
        rx="7"
        fill={`url(#${gradient})`}
      />
      <text
        x="5"
        y="10.5"
        fontSize="7"
        fontFamily="var(--font-sans)"
        fill="#08090c"
      >
        47
      </text>
      <text
        x="18"
        y="27"
        textAnchor="middle"
        fontSize="17"
        fontFamily="var(--font-logo)"
        fontWeight="600"
        fill="#08090c"
      >
        Ag
      </text>
    </svg>
  );
}

type LinkButtonProps = Omit<HTMLMotionProps<"a">, "children" | "style"> & {
  variant?: "primary" | "ghost";
  children: ReactNode;
};

/** A link styled as a button that leans toward the pointer. */
export function MagneticLink({
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

  const styles =
    variant === "primary"
      ? "bg-polished text-oxide hover:bg-white"
      : "border border-hairline-strong text-polished hover:border-polished/60";

  return (
    <motion.a
      {...rest}
      style={{ x: springX, y: springY }}
      onPointerMove={(event) => {
        if (reduceMotion || event.pointerType !== "mouse") return;
        const rect = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - rect.left - rect.width / 2) * 0.25);
        y.set((event.clientY - rect.top - rect.height / 2) * 0.35);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      whileTap={{ scale: 0.97 }}
      className={`inline-flex h-12 items-center justify-center gap-2.5 rounded-full px-6 text-[0.9375rem] font-medium transition-colors duration-200 ${styles} ${className}`}
    >
      {children}
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
