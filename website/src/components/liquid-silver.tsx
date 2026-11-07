"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/*
 * Interactive liquid silver: a single fragment shader ray-marches a smooth
 * union of spheres (metaballs) and shades it as polished silver reflecting a
 * procedural studio. Spring physics run on the CPU and only upload ten
 * spheres per frame, so there is no 3D library, mesh or texture download.
 *
 * Pointer: the nearest droplet follows the cursor over the artwork, stretches
 * a neck out of the main mass and pinches off past a threshold; pressing sends
 * a ripple through the surface. The reflections also follow the pointer
 * anywhere on the page. Touch works while a finger is down.
 */

const N = 10;
const CAM_Z = 4.2;
const HALF = 1.5; // half the visible world extent on the z = 0 plane
const CORE_R = 0.6;
const HEAD_R = 0.2;
const NECK_R = 0.13;
const MAX_REACH = 1.15;
const BREAK = 0.5; // neck length (anchor to droplet) at which it pinches off
const SMOOTH_K = 0.34;
const DROPLET_K = 0.17; // tighter blend so the pulled droplet can separate
const ACTIVE_MARGIN = 0.08;
const MAX_SCALE = 1.75;
const MIN_SCALE = 0.55;

type State = "loading" | "animating" | "paused" | "still";
type V3 = [number, number, number];
type Body = { p: V3; v: V3 };

const VERTEX = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define N ${N}
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uB[N];
uniform vec4 uRip;
uniform vec2 uEnv;

const float CAM_Z = ${CAM_Z.toFixed(2)};
const float TAN_HALF = ${(HALF / CAM_Z).toFixed(5)};
const float BOUND = 1.72;
const float K = ${SMOOTH_K.toFixed(2)};
const float DROPLET_K = ${DROPLET_K.toFixed(2)};

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float map(vec3 p) {
  float d = length(p - uB[0].xyz) - uB[0].w;
  for (int i = 1; i < N; i++) {
    // Bodies 5-8 are the pointer droplet and its neck.
    float k = (i >= 5 && i <= 8) ? DROPLET_K : K;
    d = smin(d, length(p - uB[i].xyz) - uB[i].w, k);
  }
  // Low surface-tension waves keep the mass alive between interactions.
  d += 0.011 * sin(p.x * 5.1 + uTime * 1.3) * sin(p.y * 4.3 - uTime * 1.1)
    * sin(p.z * 4.7 + uTime * 0.9);
  // A ring travelling outward from the last press.
  float r = length(p - uRip.xyz);
  float age = uRip.w;
  d -= 0.028 * exp(-age * 1.7) * exp(-pow((r - age * 0.9) * 3.2, 2.0))
    * sin(r * 24.0 - age * 18.0);
  return d;
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(
    e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) +
    e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 4; i++) {
    float h = 0.02 + 0.09 * float(i);
    occ += (h - map(p + n * h)) * sca;
    sca *= 0.7;
  }
  return clamp(1.0 - 2.2 * occ, 0.0, 1.0);
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}

// Soft rectangular light panel seen in direction r.
float panel(vec3 r, vec3 axis, vec2 size, float soft) {
  float f = dot(r, axis);
  if (f <= 0.0) return 0.0;
  vec3 u = normalize(cross(axis, vec3(0.0, 1.0, 0.0)));
  vec3 v = cross(u, axis);
  vec2 q = abs(vec2(dot(r, u), dot(r, v)) / f);
  vec2 m = 1.0 - smoothstep(size * soft, size, q);
  return m.x * m.y;
}

// Procedural studio: dark cyclorama, horizon line and cool softboxes.
vec3 env(vec3 r) {
  r.xz = rot(uEnv.x) * r.xz;
  r.yz = rot(uEnv.y) * r.yz;
  float y = r.y;
  vec3 col = mix(vec3(0.016, 0.018, 0.023), vec3(0.15, 0.16, 0.18),
    smoothstep(-0.05, 1.0, y));
  col *= mix(1.0, 0.4, smoothstep(0.02, -0.45, y));
  col += vec3(0.24, 0.26, 0.3) * exp(-abs(y + 0.03) * 20.0);
  col += vec3(3.6, 3.7, 3.9) *
    panel(r, normalize(vec3(-0.62, 0.6, 0.52)), vec2(0.44, 0.27), 0.5);
  col += vec3(1.7, 1.85, 2.15) *
    panel(r, normalize(vec3(0.93, 0.16, -0.28)), vec2(0.08, 0.8), 0.35);
  col += vec3(1.0, 1.03, 1.1) *
    panel(r, normalize(vec3(0.38, -0.22, 0.9)), vec2(0.55, 0.075), 0.3);
  col += vec3(0.42, 0.44, 0.48) *
    pow(max(dot(r, normalize(vec3(-0.1, 0.25, 1.0))), 0.0), 3.0);
  col += vec3(1.25) * smoothstep(0.8, 0.97, y);
  return col;
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14),
    0.0, 1.0);
}

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 ro = vec3(0.0, 0.0, CAM_Z);
  vec3 rd = normalize(vec3(uv * TAN_HALF, -1.0));

  // Skip every pixel whose ray misses the bounding sphere.
  float b = dot(ro, rd);
  float h = b * b - dot(ro, ro) + BOUND * BOUND;
  if (h < 0.0) { gl_FragColor = vec4(0.0); return; }
  h = sqrt(h);
  float t = max(-b - h, 0.0);
  float tFar = -b + h;

  float minD = 1e4;
  float tMin = t;
  bool hit = false;
  for (int i = 0; i < 90; i++) {
    float d = map(ro + rd * t);
    if (d < minD) { minD = d; tMin = t; }
    if (d < 0.0006 * t) { hit = true; break; }
    t += d * 0.8;
    if (t > tFar) break;
  }

  // Closest approach gives an anti-aliased silhouette without MSAA.
  float pixel = 2.0 * TAN_HALF / uRes.y;
  float alpha = hit ? 1.0 : 1.0 - smoothstep(0.0, pixel * tMin * 1.25, minD);
  if (alpha <= 0.0) { gl_FragColor = vec4(0.0); return; }
  if (hit) tMin = t;

  vec3 p = ro + rd * tMin;
  vec3 n = calcNormal(p);
  vec3 r = reflect(rd, n);
  float ndv = clamp(dot(n, -rd), 0.0, 1.0);
  vec3 F0 = vec3(0.9, 0.915, 0.94);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
  float ao = calcAO(p, n);

  // One secondary bounce so merging droplets mirror each other.
  vec3 refl = env(r);
  vec3 q = p + n * 0.02;
  float t2 = 0.06;
  for (int i = 0; i < 32; i++) {
    vec3 s = q + r * t2;
    float d = map(s);
    if (d < 0.0015) {
      vec3 n2 = calcNormal(s);
      refl = env(reflect(r, n2)) * F0 * 0.82;
      break;
    }
    t2 += d * 0.85;
    if (t2 > 3.2) break;
  }

  vec3 col = refl * F * mix(0.5, 1.0, ao);
  col = pow(aces(col), vec3(1.0 / 2.2));
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const lerp3 = (a: V3, b: V3, f: number): V3 => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
  a[2] + (b[2] - a[2]) * f,
];
const body = (p: V3 = [0, 0, 0]): Body => ({ p: [...p], v: [0, 0, 0] });
const spring = (b: Body, target: V3, k: number, c: number, dt: number) => {
  for (let i = 0; i < 3; i++) {
    b.v[i]! += (k * (target[i]! - b.p[i]!) - c * b.v[i]!) * dt;
    b.p[i]! += b.v[i]! * dt;
  }
};

/** Pointer input in canvas-relative normalized coordinates (y up). */
type Input = { x: number; y: number; present: boolean; active: boolean };

function createSimulation(introDelay = 0) {
  const core = body();
  const head = body([0.2, 0.1, 0.25]);
  const neck = [body(), body(), body()];
  const neckR = [0, 0, 0];
  const env: [number, number] = [0, 0];
  const ripple: [number, number, number, number] = [0, 0, 0, 1e3];
  const intro = { value: 0, velocity: 0 };
  const blobs = new Float32Array(N * 4);
  let connected = true;
  let time = 0;

  const restHead = (): V3 => [
    core.p[0] + 0.22 * Math.cos(time * 0.4),
    core.p[1] + 0.18 * Math.sin(time * 0.5),
    core.p[2] + 0.26,
  ];

  const step = (dt: number, input: Input) => {
    time += dt;
    ripple[3] += dt;
    if (time > introDelay) {
      intro.velocity += (55 * (1 - intro.value) - 8 * intro.velocity) * dt;
      intro.value += intro.velocity * dt;
    }

    let target: V3;
    if (input.active) {
      // Place the droplet so it projects under the cursor at its depth.
      const depth = 0.18;
      const scale = (HALF * (CAM_Z - depth)) / CAM_Z;
      let x = input.x * scale;
      let y = input.y * scale;
      const length = Math.hypot(x, y);
      if (length > MAX_REACH) {
        x *= MAX_REACH / length;
        y *= MAX_REACH / length;
      }
      target = [x, y, depth];
      spring(head, target, 75, 11, dt);
    } else {
      target = restHead();
      spring(head, target, 24, 8, dt);
    }

    const lean = input.active ? 0.1 : 0;
    spring(
      core,
      [head.p[0] * lean, head.p[1] * lean, head.p[2] * lean * 0.5],
      38,
      5.5,
      dt,
    );

    const dx = head.p[0] - core.p[0];
    const dy = head.p[1] - core.p[1];
    const dz = head.p[2] - core.p[2];
    const distance = Math.hypot(dx, dy, dz) || 1e-4;
    const dir: V3 = [dx / distance, dy / distance, dz / distance];
    const anchor: V3 = [
      core.p[0] + dir[0] * CORE_R * 0.78,
      core.p[1] + dir[1] * CORE_R * 0.78,
      core.p[2] + dir[2] * CORE_R * 0.78,
    ];
    const stretch = Math.hypot(
      head.p[0] - anchor[0],
      head.p[1] - anchor[1],
      head.p[2] - anchor[2],
    );
    // Hysteresis: the neck snaps when overstretched and reforms on contact.
    if (connected && stretch > BREAK) connected = false;
    else if (!connected && distance < CORE_R + HEAD_R + 0.08) connected = true;

    const thin = 1 - 0.6 * smoothstep(0.25, BREAK, stretch);
    for (let i = 0; i < neck.length; i++) {
      const f = (i + 1) / (neck.length + 1);
      let goal: V3;
      let radius: number;
      if (connected) {
        goal = lerp3(anchor, head.p, f);
        radius = NECK_R * thin * (1 - 0.35 * (1 - Math.abs(2 * f - 1)));
      } else if (i < 2) {
        goal = lerp3(core.p, anchor, 0.55);
        radius = 0.05;
      } else {
        goal = lerp3(head.p, core.p, 0.12);
        radius = 0.06;
      }
      spring(neck[i]!, goal, 160, 13, dt);
      neckR[i]! += (radius - neckR[i]!) * (1 - Math.exp(-dt * 14));
    }

    const envX = input.present ? Math.max(-2, Math.min(2, input.x)) : 0;
    const envY = input.present ? Math.max(-2, Math.min(2, input.y)) : 0;
    const ease = 1 - Math.exp(-dt * 3);
    env[0] += (envX * 0.3 + Math.sin(time * 0.07) * 0.25 - env[0]) * ease;
    env[1] += (envY * -0.14 - env[1]) * ease;
  };

  const press = (input: Input) => {
    const x = input.x * HALF;
    const y = input.y * HALF;
    const rx = x - core.p[0];
    const ry = y - core.p[1];
    const z = core.p[2] + Math.sqrt(Math.max(0, 0.7 * 0.7 - rx * rx - ry * ry));
    ripple[0] = x;
    ripple[1] = y;
    ripple[2] = z;
    ripple[3] = 0;
    const push = 0.9 / (Math.hypot(rx, ry) + 0.4);
    core.v[0] -= rx * push;
    core.v[1] -= ry * push;
  };

  const write = () => {
    const s = Math.max(0, intro.value);
    const put = (i: number, p: V3, r: number) => {
      blobs[i * 4] = p[0];
      blobs[i * 4 + 1] = p[1];
      blobs[i * 4 + 2] = p[2];
      blobs[i * 4 + 3] = r * s;
    };
    put(0, core.p, CORE_R * (1 + 0.02 * Math.sin(time * 1.3)));
    // Inner bodies drift on slow Lissajous paths so the silhouette morphs.
    const orbit = [0.38, 0.35, 0.33, 0.31];
    for (let i = 0; i < orbit.length; i++) {
      const phase = i * 1.9;
      put(
        i + 1,
        [
          core.p[0] + 0.3 * Math.sin(time * 0.51 + phase),
          core.p[1] + 0.27 * Math.sin(time * 0.67 + phase * 1.7),
          core.p[2] + 0.25 * Math.sin(time * 0.43 + phase * 2.3),
        ],
        orbit[i]!,
      );
    }
    put(5, head.p, HEAD_R);
    for (let i = 0; i < neck.length; i++)
      put(6 + i, neck[i]!.p, Math.max(neckR[i]!, 0.001));
    // A small satellite that periodically dips into the mass and peels away.
    const angle = time * 0.42;
    const reach = 1.0 + 0.16 * Math.sin(time * 0.23);
    put(
      9,
      [
        core.p[0] * 0.5 + Math.cos(angle) * reach,
        Math.sin(angle * 1.3) * 0.35 + 0.15,
        Math.sin(angle) * reach * 0.6,
      ],
      0.105,
    );
    return blobs;
  };

  /** Settled, fully formed pose for still frames. */
  const settle = (at: number) => {
    time = at;
    intro.value = 1;
    intro.velocity = 0;
    core.p = [0, 0, 0];
    head.p = restHead();
    for (const n of neck) n.p = [...core.p];
    ripple[3] = 1e3;
  };

  return {
    step,
    press,
    write,
    settle,
    env,
    ripple,
    get time() {
      return time;
    },
  };
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

export function LiquidSilver() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || fallback) return;
    const options: WebGLContextAttributes = {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      depth: false,
      stencil: false,
    };
    const gl = (canvas.getContext("webgl2", options) ??
      canvas.getContext("webgl", options)) as WebGLRenderingContext | null;
    if (!gl) {
      setFallback(true);
      return;
    }

    // During the page entrance the mass forms after the headline has landed.
    const entering = ["pending", "running"].includes(
      document.documentElement.dataset.entrance ?? "",
    );
    const sim = createSimulation(entering ? 0.75 : 0);
    const input: Input = { x: 0, y: 0, present: false, active: false };
    let client = { x: 0, y: 0, down: false, touch: false };
    let rect = canvas.getBoundingClientRect();
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let uniforms: Record<string, WebGLUniformLocation | null> = {};
    let frame = 0;
    let last = 0;
    let visible = false;
    let ready = false;
    let scale = Math.min(window.devicePixelRatio || 1, MAX_SCALE);
    let average = 16.7;
    let samples = 0;
    let state: State = "loading";
    let disposed = false;

    const setState = (next: State) => {
      if (state === next) return;
      state = next;
      canvas.dataset.state = next;
    };

    const fail = () => {
      if (!disposed) setFallback(true);
    };

    const resize = () => {
      rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(canvas.clientWidth * scale));
      const height = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      if (ready && state !== "animating") draw();
    };

    const draw = () => {
      if (!program) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.uRes!, canvas.width, canvas.height);
      gl.uniform1f(uniforms.uTime!, sim.time);
      gl.uniform4fv(uniforms.uB!, sim.write());
      gl.uniform4f(
        uniforms.uRip!,
        sim.ripple[0],
        sim.ripple[1],
        sim.ripple[2],
        sim.ripple[3],
      );
      gl.uniform2f(uniforms.uEnv!, sim.env[0], sim.env[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const readInput = () => {
      if (!rect.width || !rect.height) return;
      input.x = ((client.x - rect.left) / rect.width) * 2 - 1;
      input.y = -(((client.y - rect.top) / rect.height) * 2 - 1);
      const near =
        Math.abs(input.x) <= 1 + ACTIVE_MARGIN &&
        Math.abs(input.y) <= 1 + ACTIVE_MARGIN;
      const engaged = client.touch ? client.down : input.present;
      input.active = engaged && near;
    };

    // Lower the pixel ratio when frames run long; never raise it mid-session.
    const adapt = (interval: number) => {
      if (interval > 100) return;
      samples++;
      average += (interval - average) * 0.05;
      if (samples > 60 && average > 22 && scale > MIN_SCALE) {
        scale = Math.max(MIN_SCALE, scale * 0.8);
        samples = 30;
        average = 16.7;
        resize();
      }
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const interval = Math.max(0, now - last);
      last = now;
      adapt(interval);
      readInput();
      let dt = Math.min(interval / 1000, 1 / 15);
      while (dt > 1e-6) {
        const slice = Math.min(dt, 1 / 120);
        sim.step(slice, input);
        dt -= slice;
      }
      draw();
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const start = () => {
      if (!ready) return;
      if (reduce) {
        stop();
        sim.settle(3.1);
        draw();
        setState("still");
        return;
      }
      if (!visible || document.hidden) {
        stop();
        setState("paused");
        return;
      }
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
      setState("animating");
    };

    const init = () => {
      const parallel = gl.getExtension("KHR_parallel_shader_compile");
      const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
      const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
      program = gl.createProgram();
      if (!vertex || !fragment || !program) return fail();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      const finish = () => {
        if (disposed || !program) return;
        if (
          parallel &&
          !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)
        ) {
          frame = requestAnimationFrame(finish);
          return;
        }
        frame = 0;
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          if (gl.isContextLost()) return;
          console.warn(
            "Liquid silver shader unavailable:",
            gl.getShaderInfoLog(fragment) || gl.getProgramInfoLog(program),
          );
          return fail();
        }
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        gl.useProgram(program);
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 3, -1, -1, 3]),
          gl.STATIC_DRAW,
        );
        const location = gl.getAttribLocation(program, "a");
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
        uniforms = Object.fromEntries(
          ["uRes", "uTime", "uB", "uRip", "uEnv"].map((name) => [
            name,
            gl.getUniformLocation(program!, name),
          ]),
        );
        gl.clearColor(0, 0, 0, 0);
        ready = true;
        resize();
        start();
      };
      finish();
    };

    const onMove = (event: PointerEvent) => {
      client = {
        x: event.clientX,
        y: event.clientY,
        down: client.down,
        touch: event.pointerType === "touch",
      };
      input.present = true;
    };
    const onDown = (event: PointerEvent) => {
      onMove(event);
      client.down = true;
      readInput();
      if (input.active && !reduce) sim.press(input);
    };
    const onUp = (event: PointerEvent) => {
      client.down = false;
      if (event.pointerType === "touch") input.present = false;
    };
    const onLeave = () => {
      input.present = false;
      client.down = false;
    };
    const onScroll = () => {
      rect = canvas.getBoundingClientRect();
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      stop();
      ready = false;
      program = null;
      setState("paused");
    };
    const onRestored = () => init();

    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      start();
    });
    const resizeObserver = new ResizeObserver(resize);
    const visibility = () => start();

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("blur", onLeave);
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", visibility);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    observer.observe(canvas);
    resizeObserver.observe(canvas);
    init();

    return () => {
      disposed = true;
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("blur", onLeave);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (ready && !gl.isContextLost()) {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
      }
    };
  }, [reduce, fallback]);

  return (
    <div className="liquid-silver" data-liquid-silver aria-hidden>
      {fallback ? (
        <div className="liquid-fallback" data-liquid-fallback />
      ) : (
        <canvas
          ref={canvasRef}
          className="liquid-canvas"
          data-state="loading"
        />
      )}
    </div>
  );
}
