"use client";

import {
  type MotionValue,
  motion,
  useScroll,
  useTransform,
} from "motion/react";
import { useRef } from "react";

const TEXT =
  "Most agent tools count how many terminals fit on a screen. Argent counts evidence. A run is finished when independent checks say so, not when the agent does.";

function Word({
  children,
  progress,
  range,
}: {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
}) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block">
      {children}&nbsp;
    </motion.span>
  );
}

export function Statement() {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.5"],
  });
  const words = TEXT.split(" ");

  return (
    <section
      aria-label="What makes Argent different"
      className="mx-auto max-w-[1320px] px-6 py-28 md:px-10 md:py-40"
    >
      <p
        ref={ref}
        className="display max-w-[21ch] text-[clamp(2.1rem,4.9vw,4.6rem)] leading-[1.04]"
      >
        <span className="sr-only">{TEXT}</span>
        <span aria-hidden>
          {words.map((word, index) => {
            const start = index / words.length;
            return (
              <Word
                key={index}
                progress={scrollYProgress}
                range={[start, start + 1 / words.length]}
              >
                {word}
              </Word>
            );
          })}
        </span>
      </p>
    </section>
  );
}
