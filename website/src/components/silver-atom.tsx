"use client";

import { useReducedMotion } from "@/lib/use-reduced-motion";

import { useEffect, useRef, useState } from "react";
import { ArgentMark } from "@/components/ui";

// Neutral Ag: [Kr] 4d10 5s1 (NIST), giving shells 2, 8, 18, 18, 1.
// https://physics.nist.gov/PhysRefData/Handbook/Tables/silvertable1.htm
// Positions, paths and depths are artistic, not quantum orbital probabilities.
const SHELLS = [2, 8, 18, 18, 1];
const TAU = Math.PI * 2;

export function SilverAtom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const time = useRef(0);
  const reduce = useReducedMotion();
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas) return;
    if (!ctx) {
      setSupported(false);
      return;
    }
    let frame = 0;
    let last = 0;
    let visible = false;
    const project = (
      angle: number,
      shell: number,
      out: { x: number; y: number; z: number },
    ) => {
      const radius = 47 + shell * 20;
      const phase = shell * 0.74 + time.current * 0.025;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const tilt = 0.78 + shell * 0.21;
      const z = y * Math.sin(tilt);
      const flatY = y * Math.cos(tilt);
      const depth = 1 + z / 750;
      out.x = (x * Math.cos(phase) - flatY * Math.sin(phase)) * depth;
      out.y = (x * Math.sin(phase) + flatY * Math.cos(phase)) * depth;
      out.z = z;
    };
    const point = { x: 0, y: 0, z: 0 };
    const draw = () => {
      ctx.clearRect(0, 0, 320, 320);
      const halo = ctx.createRadialGradient(160, 160, 15, 160, 160, 135);
      halo.addColorStop(0, "rgba(210,225,245,.075)");
      halo.addColorStop(1, "rgba(210,225,245,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, 320, 320);
      for (let shell = 0; shell < SHELLS.length; shell++) {
        ctx.beginPath();
        for (let sample = 0; sample <= 100; sample++) {
          project((sample / 100) * TAU, shell, point);
          if (sample === 0) ctx.moveTo(160 + point.x, 160 + point.y);
          else ctx.lineTo(160 + point.x, 160 + point.y);
        }
        ctx.strokeStyle = "rgba(184,199,218,.18)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
      // Back electrons are dimmed; front electrons cast a short luminous trail.
      for (const front of [false, true]) {
        for (let shell = 0; shell < SHELLS.length; shell++) {
          const count = SHELLS[shell]!;
          const speed = (shell % 2 ? -1 : 1) * (0.6 - shell * 0.075);
          for (let electron = 0; electron < count; electron++) {
            const angle =
              (electron / count) * TAU + time.current * speed + shell;
            project(angle, shell, point);
            if (point.z >= 0 !== front) continue;
            const alpha = front ? 0.9 : 0.24;
            const radius = shell === 4 ? 2.8 : front ? 1.75 : 1.15;
            if (front) {
              ctx.beginPath();
              for (let sample = 0; sample < 10; sample++) {
                project(
                  angle - sample * 0.018 * Math.sign(speed),
                  shell,
                  point,
                );
                if (sample === 0) ctx.moveTo(160 + point.x, 160 + point.y);
                else ctx.lineTo(160 + point.x, 160 + point.y);
              }
              ctx.strokeStyle = `rgba(205,222,245,${shell === 4 ? 0.36 : 0.12})`;
              ctx.lineWidth = radius * 0.8;
              ctx.stroke();
              project(angle, shell, point);
            }
            ctx.beginPath();
            ctx.arc(160 + point.x, 160 + point.y, radius, 0, TAU);
            ctx.fillStyle = `rgba(225,236,250,${alpha})`;
            ctx.fill();
            if (shell === 4) {
              ctx.beginPath();
              ctx.arc(160 + point.x, 160 + point.y, 6, 0, TAU);
              ctx.fillStyle = "rgba(180,210,255,.12)";
              ctx.fill();
            }
          }
        }
      }
    };
    const resize = () => {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const size = Math.min(canvas.getBoundingClientRect().width, 480);
      canvas.width = Math.max(1, Math.round(size * ratio));
      canvas.height = canvas.width;
      const scale = canvas.width / 320;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      draw();
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - last < 1000 / 30) return;
      time.current += Math.min((now - last) / 1000, 1 / 15);
      last = now;
      draw();
    };
    const start = () => {
      if (frame || !visible || document.hidden || reduce) return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) start();
      else stop();
    });
    const resizeObserver = new ResizeObserver(resize);
    const visibility = () => (document.hidden ? stop() : start());
    resize();
    observer.observe(canvas);
    resizeObserver.observe(canvas);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [reduce, supported]);

  return (
    <div className="relative mx-auto w-full max-w-[30rem]" data-silver-atom>
      <div
        role="img"
        aria-label="Silver (Ag): 47 electrons in five shells, 2, 8, 18, 18, 1. Stylized depth-projected shell model, not a quantum orbital visualization."
        className="relative aspect-square"
      >
        {supported ? (
          <canvas ref={canvasRef} aria-hidden className="size-full" />
        ) : (
          <svg
            aria-hidden
            viewBox="0 0 320 320"
            className="size-full"
            data-atom-fallback
          >
            {SHELLS.map((count, index) => (
              <g key={index} transform={`rotate(${index * 37} 160 160)`}>
                <ellipse
                  cx="160"
                  cy="160"
                  rx={47 + index * 20}
                  ry={25 + index * 9}
                  fill="none"
                  stroke="#8997ab"
                  strokeOpacity=".3"
                  strokeWidth=".8"
                />
                {Array.from({ length: count }, (_, electron) => {
                  const angle = (electron / count) * TAU;
                  return (
                    <circle
                      key={electron}
                      data-atom-electron
                      cx={160 + (47 + index * 20) * Math.cos(angle)}
                      cy={160 + (25 + index * 9) * Math.sin(angle)}
                      r={index === 4 ? 2.8 : 1.75}
                      fill="#e1ecfa"
                      opacity={Math.sin(angle) > 0 ? 0.9 : 0.35}
                    />
                  );
                })}
              </g>
            ))}
          </svg>
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <ArgentMark size={72} />
        </span>
      </div>
    </div>
  );
}
