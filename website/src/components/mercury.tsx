"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/*
 * Liquid silver: 2D metaballs shaded as a chrome height field.
 * Each ball contributes (r^2/d^2)^2, so droplets stay separate until they touch.
 * For a single ball the height sqrt(1 - F^-1/2) is exactly a hemisphere, so the
 * blended surface reflects a studio environment like polished metal. One extra
 * droplet follows the pointer and the specular light tracks it.
 */

const MAX_BALLS = 10;

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;

uniform vec4 uBalls[${MAX_BALLS}];
uniform int uCount;
uniform vec2 uLight;
uniform float uTime;

out vec4 outColor;

vec3 environment(vec3 r) {
  float y = r.y;
  vec3 color = mix(vec3(0.012, 0.014, 0.02), vec3(0.11, 0.12, 0.14), smoothstep(-0.9, 0.9, y));

  // Horizon: the dark floor meeting a bright sky is what reads as chrome.
  color += vec3(0.62, 0.66, 0.72) * smoothstep(0.045, 0.0, abs(y - 0.06));
  color *= mix(0.55, 1.0, smoothstep(-0.05, 0.08, y));

  // Overhead softbox and a tall strip light on the left.
  float softbox = smoothstep(0.32, 0.52, y) * smoothstep(0.98, 0.72, y);
  color += vec3(0.86, 0.89, 0.94) * softbox * smoothstep(0.75, 0.1, abs(r.x));
  float strip = smoothstep(0.1, 0.0, abs(r.x + 0.58)) * smoothstep(-0.25, 0.45, y);
  color += vec3(0.72, 0.76, 0.82) * strip * 0.75;
  float rim = smoothstep(0.08, 0.0, abs(r.x - 0.72)) * smoothstep(0.6, -0.2, y);
  color += vec3(0.4, 0.43, 0.5) * rim * 0.5;

  // A light that follows the pointer.
  vec3 light = normalize(vec3(uLight, 0.85));
  float specular = pow(max(dot(normalize(r), light), 0.0), 70.0);
  color += vec3(1.0) * specular * 1.6;
  return color;
}

float grain(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 p = gl_FragCoord.xy;
  float field = 0.0;
  float weightedRadius = 0.0;
  vec2 gradient = vec2(0.0);

  for (int i = 0; i < ${MAX_BALLS}; i++) {
    if (i >= uCount) break;
    vec4 ball = uBalls[i];
    vec2 d = p - ball.xy;
    float dd = dot(d, d) + 1.0;
    float q = ball.z * ball.z / dd;
    float f = q * q;
    field += f;
    weightedRadius += f * ball.z;
    gradient += -4.0 * f / dd * d;
  }

  float edge = fwidth(field);
  float coverage = smoothstep(1.0 - edge, 1.0 + edge, field);
  if (coverage <= 0.0) {
    outColor = vec4(0.0);
    return;
  }

  float radius = weightedRadius / max(field, 1e-4);
  float inverseRoot = inversesqrt(max(field, 1e-4));
  float h = sqrt(max(1.0 - inverseRoot, 1e-4));
  vec2 slope = radius * gradient * inverseRoot / (4.0 * h * field);
  vec3 normal = normalize(vec3(-slope, 1.0));
  vec3 reflected = reflect(vec3(0.0, 0.0, -1.0), normal);

  vec3 color = environment(reflected);
  float fresnel = pow(1.0 - normal.z, 2.4);
  color = mix(color, color * 1.25 + 0.04, fresnel);

  // Faint temper colours, the thin-film tint silver takes on as it oxidises.
  vec3 temper = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + fresnel * 1.1 + uTime * 0.015));
  color += temper * fresnel * 0.07;
  color += (grain(p + uTime) - 0.5) * 0.025;

  outColor = vec4(color * coverage, coverage);
}`;

type Ball = {
  ax: number;
  ay: number;
  radius: number;
  amplitudeX: number;
  amplitudeY: number;
  speedX: number;
  speedY: number;
  phase: number;
  x: number;
  y: number;
};

/** Anchors are fractions of the canvas; radii are fractions of its short side. */
const LAYOUT_WIDE: [number, number, number][] = [
  [0.76, 0.45, 0.16],
  [0.89, 0.27, 0.09],
  [0.65, 0.72, 0.075],
  [0.9, 0.67, 0.12],
  [0.73, 0.13, 0.055],
  [0.8, 0.86, 0.065],
  [0.62, 0.68, 0.05],
  [0.97, 0.45, 0.075],
  [0.8, 0.62, 0.09],
];

const LAYOUT_NARROW: [number, number, number][] = [
  [0.52, 0.5, 0.2],
  [0.8, 0.34, 0.12],
  [0.2, 0.62, 0.11],
  [0.74, 0.72, 0.09],
  [0.12, 0.36, 0.065],
  [0.94, 0.58, 0.08],
  [0.4, 0.78, 0.07],
  [0.62, 0.26, 0.065],
  [0.3, 0.4, 0.07],
];

function createBalls(width: number, height: number): Ball[] {
  const layout = width / height > 1.1 ? LAYOUT_WIDE : LAYOUT_NARROW;
  const short = Math.min(width, height);
  return layout.map(([ax, ay, r], index) => ({
    ax: ax * width,
    ay: ay * height,
    radius: r * short,
    amplitudeX: short * (0.04 + (index % 3) * 0.025),
    amplitudeY: short * (0.035 + (index % 4) * 0.02),
    speedX: 0.17 + index * 0.031,
    speedY: 0.13 + ((index * 7) % 5) * 0.029,
    phase: index * 1.7,
    x: ax * width,
    y: ay * height,
  }));
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function Mercury({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      premultipliedAlpha: true,
    });
    if (!gl) {
      setSupported(false);
      return;
    }

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      setSupported(false);
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setSupported(false);
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uBalls = gl.getUniformLocation(program, "uBalls");
    const uCount = gl.getUniformLocation(program, "uCount");
    const uLight = gl.getUniformLocation(program, "uLight");
    const uTime = gl.getUniformLocation(program, "uTime");
    const ballData = new Float32Array(MAX_BALLS * 4);

    let width = 1;
    let height = 1;
    let dpr = 1;
    let balls: Ball[] = [];

    // Pointer state in CSS pixels relative to the canvas.
    const pointer = { x: 0, y: 0, inside: false, seen: false };
    const cursor = { x: 0, y: 0, vx: 0, vy: 0, radius: 0, radiusVelocity: 0 };
    const light = { x: 0.25, y: 0.35 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      balls = createBalls(width, height);
      if (!pointer.seen) {
        cursor.x = width * 0.72;
        cursor.y = height * 0.5;
      }
    };

    let elapsed = 0;
    const step = (dt: number) => {
      elapsed += dt;
      const short = Math.min(width, height);

      // Cursor droplet: a damped spring toward the pointer, sized by presence.
      const targetRadius = pointer.inside ? short * 0.075 : 0;
      const k = 120;
      const c = 2 * Math.sqrt(k) * 0.9;
      cursor.vx += ((pointer.x - cursor.x) * k - cursor.vx * c) * dt;
      cursor.vy += ((pointer.y - cursor.y) * k - cursor.vy * c) * dt;
      cursor.x += cursor.vx * dt;
      cursor.y += cursor.vy * dt;
      cursor.radiusVelocity +=
        ((targetRadius - cursor.radius) * 90 - cursor.radiusVelocity * 12) * dt;
      cursor.radius = Math.max(0, cursor.radius + cursor.radiusVelocity * dt);

      const lightTargetX = pointer.seen ? (pointer.x / width) * 2 - 1 : 0.25;
      const lightTargetY = pointer.seen ? 1 - (pointer.y / height) * 2 : 0.35;
      light.x += (lightTargetX * 0.9 - light.x) * Math.min(1, dt * 4);
      light.y += (lightTargetY * 0.9 - light.y) * Math.min(1, dt * 4);

      const reach = short * 0.32;
      for (let i = 0; i < balls.length; i++) {
        const ball = balls[i]!;
        let x =
          ball.ax +
          Math.sin(elapsed * ball.speedX + ball.phase) * ball.amplitudeX;
        let y =
          ball.ay +
          Math.cos(elapsed * ball.speedY + ball.phase * 0.7) * ball.amplitudeY;
        if (pointer.inside) {
          const dx = cursor.x - x;
          const dy = cursor.y - y;
          const pull = Math.exp(-(dx * dx + dy * dy) / (reach * reach)) * 0.22;
          x += dx * pull;
          y += dy * pull;
        }
        ball.x += (x - ball.x) * Math.min(1, dt * 3);
        ball.y += (y - ball.y) * Math.min(1, dt * 3);
      }
    };

    const draw = () => {
      let count = 0;
      for (let i = 0; i < balls.length && count < MAX_BALLS - 1; i++) {
        const ball = balls[i]!;
        ballData[count * 4] = ball.x * dpr;
        ballData[count * 4 + 1] = (height - ball.y) * dpr;
        ballData[count * 4 + 2] = ball.radius * dpr;
        count++;
      }
      if (cursor.radius > 0.5) {
        ballData[count * 4] = cursor.x * dpr;
        ballData[count * 4 + 1] = (height - cursor.y) * dpr;
        ballData[count * 4 + 2] = cursor.radius * dpr;
        count++;
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform4fv(uBalls, ballData);
      gl.uniform1i(uCount, count);
      gl.uniform2f(uLight, light.x, light.y);
      gl.uniform1f(uTime, elapsed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    resize();

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.inside =
        event.pointerType === "mouse" &&
        pointer.x >= 0 &&
        pointer.x <= rect.width &&
        pointer.y >= 0 &&
        pointer.y <= rect.height;
      pointer.seen = true;
    };
    const onPointerLeave = () => {
      pointer.inside = false;
    };
    const onPointerDown = () => {
      if (pointer.inside)
        cursor.radiusVelocity += Math.min(width, height) * 1.6;
    };

    if (reduceMotion) {
      elapsed = 4;
      for (const ball of balls) {
        ball.x = ball.ax;
        ball.y = ball.ay;
      }
      draw();
      const observer = new ResizeObserver(() => {
        resize();
        draw();
      });
      observer.observe(canvas);
      return () => {
        observer.disconnect();
        gl.deleteProgram(program);
        gl.deleteBuffer(buffer);
      };
    }

    let frameId = 0;
    let last = performance.now();
    let visible = true;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      step(dt);
      draw();
      frameId = requestAnimationFrame(loop);
    };
    const start = () => {
      if (frameId || !visible || document.hidden) return;
      last = performance.now();
      frameId = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frameId);
      frameId = 0;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const visibility = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) start();
      else stop();
    });
    visibility.observe(canvas);
    const onVisibilityChange = () => (document.hidden ? stop() : start());

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibilityChange);
    start();

    return () => {
      stop();
      resizeObserver.disconnect();
      visibility.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.documentElement.removeEventListener(
        "pointerleave",
        onPointerLeave,
      );
      document.removeEventListener("visibilitychange", onVisibilityChange);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };
  }, [reduceMotion]);

  return (
    <div aria-hidden className={className}>
      {supported ? (
        <canvas ref={canvasRef} className="size-full" />
      ) : (
        <div className="size-full bg-[radial-gradient(circle_at_70%_45%,#e9edf2_0,#7d848f_9%,transparent_22%),radial-gradient(circle_at_84%_30%,#f6f8fb_0,#6f7681_6%,transparent_14%)]" />
      )}
    </div>
  );
}
