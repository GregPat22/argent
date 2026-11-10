"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/*
 * Interactive liquid silver: a single fragment shader ray-marches a smooth
 * union of spheres (metaballs) and shades it as polished silver reflecting a
 * procedural studio. Spring physics run on the CPU and only upload the sphere
 * list per frame, so there is no 3D library, mesh or texture download.
 *
 * W0.9 turns the single mass into a full-bleed field around the centered hero
 * copy: two masses (each the original body: a core, four drifting inner
 * bodies and a pointer droplet on a neck) sit at opposite corners, each with
 * an orbiting satellite, and free drops wander the space between them. Drops
 * are drawn to each other and to the masses, merge, then peel away again on
 * their own. Elements marked [data-liquid-avoid] are hard keep-out zones, so
 * the metal can graze the copy but never sits behind it.
 *
 * Pointer: near a mass, its droplet follows the cursor, stretches a neck out
 * of the mass and pinches off past a threshold, as before. Near a free drop,
 * that drop follows the cursor instead. Pressing sends a ripple through the
 * surface and splashes nearby drops. Reflections follow the pointer anywhere
 * over the hero. Touch works while a finger is down.
 */

const MASSES = 2;
const M = 9; // bodies per mass: core, four inner bodies, head, three neck
const SATELLITES = MASSES;
const FREE = 10;
const DROPS = SATELLITES + FREE;
const DROP0 = MASSES * M;
const N = DROP0 + DROPS;
const CAM_Z = 4.2;
const CORE_R = 0.6;
const HEAD_R = 0.2;
const NECK_R = 0.13;
const SAT_R = 0.105;
const MAX_REACH = 1.15;
const BREAK = 0.5; // neck length (anchor to droplet) at which it pinches off
const SMOOTH_K = 0.34;
const DROPLET_K = 0.17; // tighter blend so the pulled droplet can separate
const FREE_K = 0.16; // drop-to-drop blend: necks form just before contact
const DEPTH = 0.18; // pointer plane, slightly in front of the masses
const MASS_CLEAR = 0.84; // anchor distance kept from the copy
const MASS_ZONE = 1.35; // pointer radius around an anchor that engages a mass
const GRAB = 0.3; // pointer distance from a drop's surface that picks it up
const RELEASE = 0.95;
const COPY_MARGIN = 0.035; // how close a silhouette may graze the copy
const MAX_SCALE = 1.5;
const MIN_SCALE = 0.5;
// Without a GPU the browser ray-marches every pixel on the CPU. Those devices
// start soft and may go softer still, so the page stays responsive.
const SOFT_SCALE = 0.35;
const FLOOR_SCALE = 0.25;
const SOFTWARE_RENDERER =
  /swiftshader|llvmpipe|softpipe|software|basic render/i;
const LONG_FRAME = 100; // ms; a run of these means the device cannot keep up
const STALLED_FRAME = 250; // ms; slower than this at the floor is not motion

type State = "loading" | "animating" | "paused" | "still";
type Engaged = "none" | "mass" | "drop";
type V2 = [number, number];
type V3 = [number, number, number];
type Body = { p: V3; v: V3 };
/** Keep-out rectangle on the z = 0 plane, in world units. */
type Rect = { cx: number; cy: number; hx: number; hy: number };

/** Free drops: home position (fraction of the half extents), radius, depth. */
const FREE_DROPS: ReadonlyArray<{ at: V2; r: number; z: number }> = [
  { at: [-0.7, 0.56], r: 0.13, z: 0.1 },
  { at: [0.72, 0.18], r: 0.125, z: 0.05 },
  { at: [-0.86, 0.06], r: 0.075, z: 0.22 },
  { at: [0.8, -0.46], r: 0.1, z: -0.05 },
  { at: [-0.44, -0.8], r: 0.09, z: 0.15 },
  { at: [0.3, 0.8], r: 0.08, z: 0.2 },
  { at: [0.46, -0.84], r: 0.07, z: 0.25 },
  { at: [-0.26, 0.84], r: 0.06, z: 0.3 },
  { at: [0.06, -0.9], r: 0.055, z: 0.1 },
  { at: [-0.94, 0.86], r: 0.085, z: -0.1 },
];
/** Narrow screens keep fewer drops so the copy stays the focus. */
const FREE_NARROW = 7;

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
#define M ${M}
#define MASSES ${MASSES}
#define DROP0 ${DROP0}
uniform vec2 uRes;
uniform float uTan;
uniform float uTime;
uniform vec4 uB[N];
uniform vec4 uG[MASSES];
uniform vec4 uRip;
uniform vec2 uEnv;

const float CAM_Z = ${CAM_Z.toFixed(2)};
const float K = ${SMOOTH_K.toFixed(2)};
const float DROPLET_K = ${DROPLET_K.toFixed(2)};
const float FREE_K = ${FREE_K.toFixed(2)};

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float map(vec3 p) {
  float d = 1e3;
  for (int i = DROP0; i < N; i++) {
    d = smin(d, length(p - uB[i].xyz) - uB[i].w, FREE_K);
  }
  for (int g = 0; g < MASSES; g++) {
    // A mass further away than its blend radius cannot change the result,
    // so its bounding sphere stands in as a conservative distance.
    float bound = length(p - uG[g].xyz) - uG[g].w;
    if (bound > K + 0.05) {
      d = min(d, bound);
    } else {
      for (int i = 0; i < M; i++) {
        vec4 b = uB[g * M + i];
        // Bodies 5-8 of each mass are the pointer droplet and its neck.
        d = smin(d, length(p - b.xyz) - b.w, i >= 5 ? DROPLET_K : K);
      }
    }
  }
  // Low surface-tension waves keep the metal alive between interactions.
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

// Widen [tn, tf] to cover the ray's span inside sphere s.
void span(vec3 ro, vec3 rd, vec4 s, inout float tn, inout float tf) {
  vec3 oc = ro - s.xyz;
  float b = dot(oc, rd);
  float h = b * b - dot(oc, oc) + s.w * s.w;
  if (h < 0.0) return;
  h = sqrt(h);
  tn = min(tn, -b - h);
  tf = max(tf, -b + h);
}

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 ro = vec3(0.0, 0.0, CAM_Z);
  vec3 rd = normalize(vec3(uv * uTan, -1.0));

  // Most of the hero is empty: skip every pixel whose ray misses all bounds.
  float tn = 1e4;
  float tf = -1e4;
  for (int g = 0; g < MASSES; g++) {
    if (uG[g].w > 0.0) span(ro, rd, vec4(uG[g].xyz, uG[g].w + 0.12), tn, tf);
  }
  for (int i = DROP0; i < N; i++) {
    if (uB[i].w > 0.0) span(ro, rd, vec4(uB[i].xyz, uB[i].w + 0.1), tn, tf);
  }
  if (tf < tn) { gl_FragColor = vec4(0.0); return; }
  float t = max(tn, 0.0);

  float minD = 1e4;
  float tMin = t;
  bool hit = false;
  for (int i = 0; i < 90; i++) {
    float d = map(ro + rd * t);
    if (d < minD) { minD = d; tMin = t; }
    if (d < 0.0006 * t) { hit = true; break; }
    t += d * 0.8;
    if (t > tf) break;
  }

  // Closest approach gives an anti-aliased silhouette without MSAA.
  float pixel = 2.0 * uTan / uRes.y;
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

  // One secondary bounce so merging drops mirror each other.
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

/** Small seeded generator so the still frame and tests are repeatable. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Signed distance from (x, y) to a rounded rectangle, with outward normal. */
function rectDistance(x: number, y: number, r: Rect, round = 0.12) {
  const dx = x - r.cx;
  const dy = y - r.cy;
  const qx = Math.abs(dx) - (r.hx - round);
  const qy = Math.abs(dy) - (r.hy - round);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const outside = Math.hypot(ox, oy);
  if (outside > 0) {
    return {
      d: outside - round,
      nx: (ox / outside) * Math.sign(dx || 1),
      ny: (oy / outside) * Math.sign(dy || 1),
    };
  }
  return qx > qy
    ? { d: qx - round, nx: Math.sign(dx || 1), ny: 0 }
    : { d: qy - round, nx: 0, ny: Math.sign(dy || 1) };
}

/** Pointer input: world position on the pointer plane plus page state. */
type Input = {
  x: number;
  y: number;
  nx: number;
  ny: number;
  present: boolean;
  engaged: boolean;
};

/** One mass: the original W0.7 body, anchored anywhere in the field. */
function createMass(phase: number) {
  const anchor: V3 = [0, 0, 0];
  const core = body();
  const head = body([0.2, 0.1, 0.25]);
  const neck = [body(), body(), body()];
  const neckR = [0, 0, 0];
  let connected = true;

  const restHead = (time: number): V3 => [
    core.p[0] + 0.22 * Math.cos(time * 0.4 + phase),
    core.p[1] + 0.18 * Math.sin(time * 0.5 + phase),
    core.p[2] + 0.26,
  ];

  const place = (x: number, y: number) => {
    const dx = x - anchor[0];
    const dy = y - anchor[1];
    anchor[0] = x;
    anchor[1] = y;
    for (const b of [core, head, ...neck]) {
      b.p[0] += dx;
      b.p[1] += dy;
    }
  };

  const step = (dt: number, time: number, target: V3 | null) => {
    if (target) spring(head, target, 75, 11, dt);
    else spring(head, restHead(time), 24, 8, dt);

    const lean = target ? 0.1 : 0;
    spring(
      core,
      [
        anchor[0] + (head.p[0] - anchor[0]) * lean,
        anchor[1] + (head.p[1] - anchor[1]) * lean,
        head.p[2] * lean * 0.5,
      ],
      38,
      5.5,
      dt,
    );

    const dx = head.p[0] - core.p[0];
    const dy = head.p[1] - core.p[1];
    const dz = head.p[2] - core.p[2];
    const distance = Math.hypot(dx, dy, dz) || 1e-4;
    const dir: V3 = [dx / distance, dy / distance, dz / distance];
    const root: V3 = [
      core.p[0] + dir[0] * CORE_R * 0.78,
      core.p[1] + dir[1] * CORE_R * 0.78,
      core.p[2] + dir[2] * CORE_R * 0.78,
    ];
    const stretch = Math.hypot(
      head.p[0] - root[0],
      head.p[1] - root[1],
      head.p[2] - root[2],
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
        goal = lerp3(root, head.p, f);
        radius = NECK_R * thin * (1 - 0.35 * (1 - Math.abs(2 * f - 1)));
      } else if (i < 2) {
        goal = lerp3(core.p, root, 0.55);
        radius = 0.05;
      } else {
        goal = lerp3(head.p, core.p, 0.12);
        radius = 0.06;
      }
      spring(neck[i]!, goal, 160, 13, dt);
      neckR[i]! += (radius - neckR[i]!) * (1 - Math.exp(-dt * 14));
    }
  };

  const press = (x: number, y: number) => {
    const rx = x - core.p[0];
    const ry = y - core.p[1];
    const push = 0.9 / (Math.hypot(rx, ry) + 0.4);
    core.v[0] -= rx * push;
    core.v[1] -= ry * push;
  };

  /** Writes the mass into blobs and its bounding sphere into bounds. */
  const write = (
    blobs: Float32Array,
    bounds: Float32Array,
    index: number,
    time: number,
    s: number,
  ) => {
    const base = index * M;
    let reach = 0;
    const put = (i: number, p: V3, r: number) => {
      const o = (base + i) * 4;
      blobs[o] = p[0];
      blobs[o + 1] = p[1];
      blobs[o + 2] = p[2];
      blobs[o + 3] = r * s;
      reach = Math.max(
        reach,
        Math.hypot(p[0] - core.p[0], p[1] - core.p[1], p[2] - core.p[2]) +
          r * s,
      );
    };
    put(0, core.p, CORE_R * (1 + 0.02 * Math.sin(time * 1.3 + phase)));
    // Inner bodies drift on slow Lissajous paths so the silhouette morphs.
    const orbit = [0.38, 0.35, 0.33, 0.31];
    for (let i = 0; i < orbit.length; i++) {
      const p = i * 1.9 + phase;
      put(
        i + 1,
        [
          core.p[0] + 0.3 * Math.sin(time * 0.51 + p),
          core.p[1] + 0.27 * Math.sin(time * 0.67 + p * 1.7),
          core.p[2] + 0.25 * Math.sin(time * 0.43 + p * 2.3),
        ],
        orbit[i]!,
      );
    }
    put(5, head.p, HEAD_R);
    for (let i = 0; i < neck.length; i++)
      put(6 + i, neck[i]!.p, Math.max(neckR[i]!, 0.001));
    bounds[index * 4] = core.p[0];
    bounds[index * 4 + 1] = core.p[1];
    bounds[index * 4 + 2] = core.p[2];
    bounds[index * 4 + 3] = s > 0 ? reach + 0.02 : 0;
  };

  /** Settled, fully formed pose for still frames. */
  const settle = (time: number) => {
    core.p = [...anchor];
    core.v = [0, 0, 0];
    head.p = restHead(time);
    head.v = [0, 0, 0];
    for (const n of neck) n.p = [...core.p];
    connected = true;
  };

  return { anchor, core, place, step, press, write, settle };
}

type Mass = ReturnType<typeof createMass>;

type Drop = Body & {
  r: number;
  on: boolean;
  /** Designed home as a fraction of the half extents. */
  origin: V2;
  /** Home on the screen, before wandering; satellites orbit a mass instead. */
  base: V3;
  owner: number;
  amp: V3;
  freq: V3;
  phase: number;
  /** Merge target: another drop's index, MASSES-offset mass, or -1. */
  seek: number;
  seekUntil: number;
};

function createField(introDelay = 0) {
  const masses: Mass[] = [createMass(0), createMass(2.4)];
  const rand = random(0x5f3759df);
  const drops: Drop[] = [];
  for (let i = 0; i < DROPS; i++) {
    const free = FREE_DROPS[i - SATELLITES];
    drops.push({
      ...body(),
      r: free ? free.r : SAT_R,
      on: true,
      origin: free ? [...free.at] : [0, 0],
      base: free ? [free.at[0], free.at[1], free.z] : [0, 0, 0],
      owner: free ? -1 : i,
      amp: [0.16 + rand() * 0.22, 0.12 + rand() * 0.2, 0.08 + rand() * 0.1],
      freq: [0.13 + rand() * 0.16, 0.11 + rand() * 0.17, 0.09 + rand() * 0.1],
      phase: rand() * Math.PI * 2,
      seek: -1,
      seekUntil: 0,
    });
  }
  const env: [number, number] = [0, 0];
  const ripple: [number, number, number, number] = [0, 0, 0, 1e3];
  const intro = { value: 0, velocity: 0 };
  const blobs = new Float32Array(N * 4);
  const bounds = new Float32Array(MASSES * 4);
  let rects: Rect[] = [];
  let half: V2 = [2.6, 1.5];
  let time = 0;
  let nextMerge = 1.6;
  let engaged: { kind: Engaged; index: number } = { kind: "none", index: -1 };
  let placed = false;

  /** Smallest clearance from (x, y) to any keep-out rectangle. */
  const clearance = (x: number, y: number) => {
    let best = { d: 1e3, nx: 0, ny: 0 };
    for (const r of rects) {
      const hit = rectDistance(x, y, r);
      if (hit.d < best.d) best = hit;
    }
    return best;
  };

  /** Nearest point at least `clear` away from every rectangle. */
  /**
   * Shortest way out of the whole copy, not just the nearest edge of one box:
   * stacked boxes overlap, and one box's nearest edge can lead into the next.
   */
  const escape = (x: number, y: number, clear: number): V2 => {
    let best: V2 = [x, y];
    let reach = 6;
    for (let a = 0; a < 24; a++) {
      const dx = Math.cos((a / 24) * Math.PI * 2);
      const dy = Math.sin((a / 24) * Math.PI * 2);
      for (let s = 0.04; s < reach; s += 0.04) {
        if (clearance(x + dx * s, y + dy * s).d >= clear) {
          reach = s;
          best = [x + dx * s, y + dy * s];
          break;
        }
      }
    }
    return best;
  };

  /** Nearest point at least `clear` away from every rectangle. */
  const pushOut = (x: number, y: number, clear: number): V2 => {
    for (let pass = 0; pass < 4; pass++) {
      const c = clearance(x, y);
      if (c.d >= clear) return [x, y];
      if (c.d < 0) break;
      x += c.nx * (clear - c.d);
      y += c.ny * (clear - c.d);
    }
    return clearance(x, y).d >= clear ? [x, y] : escape(x, y, clear);
  };

  /** Screen position of a body: perspective moves raised bodies outward. */
  const toScreen = (p: V3): V2 => {
    const f = CAM_Z / (CAM_Z - p[2]);
    return [p[0] * f, p[1] * f];
  };

  /** Slide a mass anchor along `dir` until it clears the copy. */
  const resolve = (start: V2, dirs: V2[], limit: V2): V2 => {
    let best: { at: V2; d: number; s: number } | null = null;
    for (const dir of dirs) {
      for (let s = 0; s <= 3; s += 0.04) {
        const x = start[0] + dir[0] * s;
        const y = start[1] + dir[1] * s;
        if (Math.abs(x) > limit[0] || Math.abs(y) > limit[1]) break;
        const d = clearance(x, y).d;
        if (d >= MASS_CLEAR) {
          if (!best || best.d < MASS_CLEAR || s < best.s)
            best = { at: [x, y], d, s };
          break;
        }
        if (!best || (best.d < MASS_CLEAR && d > best.d))
          best = { at: [x, y], d, s };
      }
    }
    return best?.at ?? start;
  };

  const dropHome = (drop: Drop): V3 => {
    if (drop.owner >= 0) {
      // Satellites keep the original orbit around their own mass.
      const mass = masses[drop.owner]!;
      const angle = time * 0.42 + drop.owner * 2.1;
      const reach = 1.0 + 0.16 * Math.sin(time * 0.23 + drop.owner);
      return [
        mass.anchor[0] + Math.cos(angle) * reach,
        mass.anchor[1] + Math.sin(angle * 1.3) * 0.35 + 0.15,
        Math.sin(angle) * reach * 0.6,
      ];
    }
    return [
      drop.base[0] * half[0] +
        drop.amp[0] * Math.sin(time * drop.freq[0] + drop.phase),
      drop.base[1] * half[1] +
        drop.amp[1] * Math.sin(time * drop.freq[1] + drop.phase * 1.7),
      drop.base[2] +
        drop.amp[2] * Math.sin(time * drop.freq[2] + drop.phase * 2.3),
    ];
  };

  /** Keep a drop off the copy and roughly on screen; a hard constraint. */
  const constrain = (drop: Drop) => {
    const f = CAM_Z / (CAM_Z - drop.p[2]);
    const clear = drop.r * 0.8 + COPY_MARGIN;
    for (let pass = 0; pass < 3; pass++) {
      const [sx, sy] = toScreen(drop.p);
      const c = clearance(sx, sy);
      if (c.d >= clear) break;
      if (c.d < 0) {
        // Fully inside, e.g. after the copy reflowed over it: slide out fast
        // along the shortest clear path.
        const [ex, ey] = escape(sx, sy, clear);
        drop.p[0] += ((ex - sx) / f) * 0.3;
        drop.p[1] += ((ey - sy) / f) * 0.3;
        drop.v[0] *= 0.5;
        drop.v[1] *= 0.5;
        break;
      }
      const push = (clear - c.d) / f;
      drop.p[0] += c.nx * push;
      drop.p[1] += c.ny * push;
      const inward = drop.v[0] * c.nx + drop.v[1] * c.ny;
      if (inward < 0) {
        drop.v[0] -= c.nx * inward;
        drop.v[1] -= c.ny * inward;
      }
    }
    const lx = half[0] + 0.25;
    const ly = half[1] + 0.25;
    drop.p[0] = Math.max(-lx, Math.min(lx, drop.p[0]));
    drop.p[1] = Math.max(-ly, Math.min(ly, drop.p[1]));
    drop.p[2] = Math.max(-0.45, Math.min(0.45, drop.p[2]));
  };

  /** Lay the field out around the copy for the current canvas shape. */
  const setLayout = (halfW: number, halfH: number, copy: Rect[]) => {
    half = [halfW, halfH];
    rects = copy;
    const wide = halfW / halfH >= 1.15;
    const limit: V2 = [halfW + 0.2, halfH + 0.15];
    const anchors: V2[] = wide
      ? [
          resolve(
            [-halfW + 0.32, -halfH * 0.3],
            [
              [-1, 0],
              [0, -1],
            ],
            limit,
          ),
          resolve(
            [halfW - 0.3, halfH * 0.34],
            [
              [1, 0],
              [0, -1],
            ],
            limit,
          ),
        ]
      : [
          resolve(
            [-halfW * 0.5, -halfH + 0.5],
            [
              [0, -1],
              [-1, 0],
            ],
            limit,
          ),
          resolve(
            [halfW * 0.58, halfH - 1.1],
            [
              [0, -1],
              [1, 0],
            ],
            limit,
          ),
        ];
    anchors.forEach((a, i) => masses[i]!.place(a[0], a[1]));
    const count = wide ? FREE : FREE_NARROW;
    drops.forEach((drop, i) => {
      const was = drop.on && placed;
      drop.on = i < SATELLITES + count;
      if (!drop.on) return;
      if (drop.owner < 0) {
        // Homes that land on the copy slide to its nearest edge.
        const [x, y] = pushOut(
          drop.origin[0] * halfW,
          drop.origin[1] * halfH,
          drop.r + 0.18,
        );
        drop.base[0] = x / halfW;
        drop.base[1] = y / halfH;
      }
      // Drops appear where they live, never in the middle of the copy.
      if (!was) {
        const home = dropHome(drop);
        const [x, y] = pushOut(home[0], home[1], drop.r + COPY_MARGIN);
        drop.p = [x, y, home[2]];
        drop.v = [0, 0, 0];
      }
    });
    placed = true;
  };

  const findEngagement = (input: Input) => {
    if (!input.engaged || clearance(input.x, input.y).d < COPY_MARGIN * 2)
      return { kind: "none" as Engaged, index: -1 };
    if (engaged.kind === "drop") {
      const d = drops[engaged.index]!;
      if (Math.hypot(input.x - d.p[0], input.y - d.p[1]) < RELEASE)
        return engaged;
    }
    if (engaged.kind === "mass") {
      const a = masses[engaged.index]!.anchor;
      if (Math.hypot(input.x - a[0], input.y - a[1]) < MASS_ZONE + 0.15)
        return engaged;
    }
    let best = { kind: "none" as Engaged, index: -1, score: 1e3 };
    drops.forEach((d, i) => {
      if (!d.on) return;
      const score = Math.hypot(input.x - d.p[0], input.y - d.p[1]) - d.r;
      if (score < GRAB && score < best.score)
        best = { kind: "drop", index: i, score };
    });
    masses.forEach((m, i) => {
      const distance = Math.hypot(input.x - m.anchor[0], input.y - m.anchor[1]);
      const score =
        Math.hypot(input.x - m.core.p[0], input.y - m.core.p[1]) - CORE_R;
      if (distance < MASS_ZONE && score < best.score)
        best = { kind: "mass", index: i, score };
    });
    return { kind: best.kind, index: best.index };
  };

  /** Every few seconds one drop goes looking for a neighbour to merge with. */
  const scheduleMerge = () => {
    if (time < nextMerge) return;
    nextMerge = time + 1.8 + rand() * 2.6;
    const free = drops
      .map((d, i) => ({ d, i }))
      .filter(
        ({ d, i }) =>
          d.on &&
          d.seek < 0 &&
          !(engaged.kind === "drop" && engaged.index === i),
      );
    if (!free.length) return;
    const { d, i } = free[Math.floor(rand() * free.length)]!;
    const options: { target: number; distance: number }[] = [];
    drops.forEach((o, j) => {
      if (j === i || !o.on) return;
      const distance = Math.hypot(o.p[0] - d.p[0], o.p[1] - d.p[1]) - o.r - d.r;
      if (distance < 1.3) options.push({ target: j, distance });
    });
    masses.forEach((m, j) => {
      const distance =
        Math.hypot(m.core.p[0] - d.p[0], m.core.p[1] - d.p[1]) - CORE_R - d.r;
      if (distance < 1.2) options.push({ target: DROPS + j, distance });
    });
    if (!options.length) return;
    options.sort((a, b) => a.distance - b.distance);
    const pick = options[Math.floor(rand() * Math.min(2, options.length))]!;
    d.seek = pick.target;
    d.seekUntil = time + 1.3 + rand() * 1.7;
  };

  const step = (dt: number, input: Input) => {
    time += dt;
    ripple[3] += dt;
    if (time > introDelay) {
      intro.velocity += (55 * (1 - intro.value) - 8 * intro.velocity) * dt;
      intro.value += intro.velocity * dt;
    }

    engaged = findEngagement(input);
    const cursor: V2 =
      engaged.kind === "none"
        ? [input.x, input.y]
        : pushOut(input.x, input.y, HEAD_R + COPY_MARGIN);

    masses.forEach((mass, i) => {
      let target: V3 | null = null;
      if (engaged.kind === "mass" && engaged.index === i) {
        // Place the droplet under the cursor, within reach of its anchor.
        let x = cursor[0] - mass.anchor[0];
        let y = cursor[1] - mass.anchor[1];
        const length = Math.hypot(x, y);
        if (length > MAX_REACH) {
          x *= MAX_REACH / length;
          y *= MAX_REACH / length;
        }
        target = [mass.anchor[0] + x, mass.anchor[1] + y, DEPTH];
      }
      mass.step(dt, time, target);
    });

    scheduleMerge();
    drops.forEach((drop, i) => {
      if (!drop.on) return;
      let goal = dropHome(drop);
      let k = drop.owner >= 0 ? 30 : 6;
      let c = drop.owner >= 0 ? 7 : 2.6;
      if (drop.seek >= 0 && time > drop.seekUntil) drop.seek = -1;
      if (drop.seek >= DROPS) {
        const core = masses[drop.seek - DROPS]!.core.p;
        const dx = drop.p[0] - core[0];
        const dy = drop.p[1] - core[1];
        const l = Math.hypot(dx, dy) || 1;
        goal = [
          core[0] + (dx / l) * CORE_R * 0.7,
          core[1] + (dy / l) * CORE_R * 0.7,
          core[2] + 0.2,
        ];
        k = 9;
      } else if (drop.seek >= 0) {
        goal = [...drops[drop.seek]!.p];
        k = 9;
      }
      if (engaged.kind === "drop" && engaged.index === i) {
        goal = [cursor[0], cursor[1], DEPTH];
        k = 75;
        c = 11;
      }
      spring(drop, goal, k, c, dt);

      // Surface tension: nearby drops pull together and snap into contact.
      for (let j = i + 1; j < drops.length; j++) {
        const o = drops[j]!;
        if (!o.on) continue;
        const dx = o.p[0] - drop.p[0];
        const dy = o.p[1] - drop.p[1];
        const dz = o.p[2] - drop.p[2];
        const d = Math.hypot(dx, dy, dz) || 1e-4;
        const reach = drop.r + o.r + 0.14;
        if (d > reach || d < (drop.r + o.r) * 0.5) continue;
        const pull = (1.8 * (1 - d / reach) * dt) / d;
        const wi = o.r / (drop.r + o.r);
        const wj = 1 - wi;
        drop.v[0] += dx * pull * wi;
        drop.v[1] += dy * pull * wi;
        drop.v[2] += dz * pull * wi;
        o.v[0] -= dx * pull * wj;
        o.v[1] -= dy * pull * wj;
        o.v[2] -= dz * pull * wj;
      }
      constrain(drop);
    });

    const envX = input.present ? Math.max(-1.2, Math.min(1.2, input.nx)) : 0;
    const envY = input.present ? Math.max(-1.2, Math.min(1.2, input.ny)) : 0;
    const ease = 1 - Math.exp(-dt * 3);
    env[0] += (envX * 0.55 + Math.sin(time * 0.07) * 0.25 - env[0]) * ease;
    env[1] += (envY * -0.26 - env[1]) * ease;
  };

  const press = (input: Input) => {
    if (findEngagement(input).kind === "none") return;
    // Start the ripple on the surface of whatever sits under the pointer.
    let z = 0;
    let nearest = 1e3;
    for (const m of masses) {
      const rx = input.x - m.core.p[0];
      const ry = input.y - m.core.p[1];
      const gap = Math.hypot(rx, ry) - 0.7;
      if (gap < nearest) {
        nearest = gap;
        z = m.core.p[2] + Math.sqrt(Math.max(0, 0.49 - rx * rx - ry * ry));
      }
    }
    for (const d of drops) {
      if (!d.on) continue;
      const rx = input.x - d.p[0];
      const ry = input.y - d.p[1];
      const r = d.r + 0.05;
      const gap = Math.hypot(rx, ry) - r;
      if (gap < nearest) {
        nearest = gap;
        z = d.p[2] + Math.sqrt(Math.max(0, r * r - rx * rx - ry * ry));
      }
    }
    ripple[0] = input.x;
    ripple[1] = input.y;
    ripple[2] = z;
    ripple[3] = 0;
    for (const m of masses) {
      const a = m.anchor;
      if (Math.hypot(input.x - a[0], input.y - a[1]) < MASS_ZONE)
        m.press(input.x, input.y);
    }
    // Splash: nearby drops scatter away from the press.
    for (const d of drops) {
      if (!d.on) continue;
      const dx = d.p[0] - input.x;
      const dy = d.p[1] - input.y;
      const l = Math.hypot(dx, dy) || 1e-4;
      if (l > 1.1) continue;
      const push = (1.6 / (l + 0.35)) * (1 - l / 1.1);
      d.v[0] += (dx / l) * push;
      d.v[1] += (dy / l) * push;
    }
  };

  const write = () => {
    const s = Math.max(0, intro.value);
    masses.forEach((m, i) => m.write(blobs, bounds, i, time, s));
    drops.forEach((d, i) => {
      const o = (DROP0 + i) * 4;
      blobs[o] = d.on ? d.p[0] : 0;
      blobs[o + 1] = d.on ? d.p[1] : 0;
      blobs[o + 2] = d.on ? d.p[2] : -50;
      blobs[o + 3] = d.on ? d.r * s : 0;
    });
    return { blobs, bounds };
  };

  /** Settled, fully formed pose for still frames. */
  const settle = (at: number) => {
    time = at;
    intro.value = 1;
    intro.velocity = 0;
    engaged = { kind: "none", index: -1 };
    for (const m of masses) m.settle(at);
    for (const d of drops) {
      d.p = dropHome(d);
      d.v = [0, 0, 0];
      d.seek = -1;
      constrain(d);
    }
    ripple[3] = 1e3;
  };

  return {
    step,
    press,
    write,
    settle,
    setLayout,
    env,
    ripple,
    masses,
    get engaged() {
      return engaged.kind;
    },
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

/** Navigation controls that drops keep clear of, like the hero copy. */
const NAV_AVOID =
  ".site-header .nav-logo-dock, .site-header .nav-full > *, .site-header .nav-links > li";

/**
 * Fill the narrow gaps between stacked copy blocks: a drop that slipped into
 * a gap smaller than itself would be pushed back and forth between them.
 */
function bridgeGaps(rects: Rect[]) {
  const sorted = [...rects].sort((a, b) => b.cy - a.cy);
  const out = [...rects];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const top = a.cy - a.hy;
    const bottom = b.cy + b.hy;
    const left = Math.max(a.cx - a.hx, b.cx - b.hx);
    const right = Math.min(a.cx + a.hx, b.cx + b.hx);
    if (top - bottom > 0.6 || right <= left) continue;
    out.push({
      cx: (left + right) / 2,
      cy: (top + bottom) / 2,
      hx: (right - left) / 2,
      hy: Math.max(0, top - bottom) / 2 + 0.14,
    });
  }
  return out;
}

/** World units per CSS pixel: masses keep a sensible size on any screen. */
const unitsFor = (width: number, height: number) =>
  Math.min(height / 3.4, width / 3.1);

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

    // During the page entrance the metal forms after the headline has landed.
    const entering = ["pending", "running"].includes(
      document.documentElement.dataset.entrance ?? "",
    );
    const section = canvas.closest("section") ?? document.body;
    const sim = createField(entering ? 0.75 : 0);
    const input: Input = {
      x: 0,
      y: 0,
      nx: 0,
      ny: 0,
      present: false,
      engaged: false,
    };
    let client = { x: 0, y: 0, down: false, touch: false };
    // The section, not the canvas: the entrance scales the liquid layer, and a
    // transformed box would shift every keep-out zone while it plays.
    const frameRect = () => section.getBoundingClientRect();
    let rect = frameRect();
    let half: V2 = [2.6, 1.5];
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let uniforms: Record<string, WebGLUniformLocation | null> = {};
    let frame = 0;
    let measured = 0;
    let last = 0;
    let visible = false;
    let ready = false;
    let scale = Math.min(window.devicePixelRatio || 1, MAX_SCALE);
    let average = 16.7;
    let samples = 0;
    let long = 0;
    let stalled = 0;
    let resting = false;
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

    /** Measure the copy and re-lay the field around it. */
    // Navigation sits over the hero at the top of the page; its boxes are
    // kept from the last time the page was at the top so nothing jumps on scroll.
    let nav: DOMRect[] = [];
    const layout = () => {
      rect = frameRect();
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const ppu = unitsFor(width, height);
      half = [width / 2 / ppu, height / 2 / ppu];
      const toRect = (box: DOMRect, top = rect.top): Rect => ({
        cx: (box.left + box.width / 2 - rect.left - width / 2) / ppu,
        cy: -(box.top + box.height / 2 - top - height / 2) / ppu,
        hx: box.width / 2 / ppu,
        hy: box.height / 2 / ppu,
      });
      const copy = [
        ...section.querySelectorAll<HTMLElement>("[data-liquid-avoid]"),
      ].map((el) => toRect(el.getBoundingClientRect()));
      if (window.scrollY < 4)
        nav = [...document.querySelectorAll<HTMLElement>(NAV_AVOID)]
          .map((el) => el.getBoundingClientRect())
          .filter((box) => box.width > 0 && box.height > 0);
      const pageTop = rect.top + window.scrollY;
      sim.setLayout(half[0], half[1], [
        ...bridgeGaps(copy),
        ...nav.map((box) => toRect(box, pageTop)),
      ]);
      // Anchor positions in CSS pixels, for tests and debugging. Written only
      // when they change: an attribute write between two layout reads forces
      // the browser to recalculate style.
      const masses = sim.masses
        .map(
          (m) =>
            `${Math.round(width / 2 + m.anchor[0] * ppu)},${Math.round(height / 2 - m.anchor[1] * ppu)}`,
        )
        .join(" ");
      if (canvas.dataset.masses !== masses) canvas.dataset.masses = masses;
    };

    const resize = () => {
      layout();
      const width = Math.max(1, Math.round(canvas.clientWidth * scale));
      const height = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      if (ready && state !== "animating") {
        if (state === "still") sim.settle(3.1);
        draw();
      }
    };

    const draw = () => {
      if (!program) return;
      const { blobs, bounds } = sim.write();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.uRes!, canvas.width, canvas.height);
      gl.uniform1f(uniforms.uTan!, half[1] / CAM_Z);
      gl.uniform1f(uniforms.uTime!, sim.time);
      gl.uniform4fv(uniforms.uB!, blobs);
      gl.uniform4fv(uniforms.uG!, bounds);
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
      input.nx = ((client.x - rect.left) / rect.width) * 2 - 1;
      input.ny = -(((client.y - rect.top) / rect.height) * 2 - 1);
      const depth = (CAM_Z - DEPTH) / CAM_Z;
      input.x = input.nx * half[0] * depth;
      input.y = input.ny * half[1] * depth;
      const over = Math.abs(input.nx) <= 1 && Math.abs(input.ny) <= 1;
      input.engaged = (client.touch ? client.down : input.present) && over;
    };

    // Lower the pixel ratio when frames run long; never raise it mid-session.
    const lower = (factor: number, floor: number) => {
      if (scale <= floor) return false;
      scale = Math.max(floor, scale * factor);
      samples = 30;
      average = 16.7;
      long = 0;
      stalled = 0;
      resize();
      return true;
    };
    const adapt = (interval: number) => {
      if (interval > LONG_FRAME) {
        // One long frame is a hiccup (a tab switch, a garbage collection). A
        // run of them is a device that cannot keep up, which is exactly when
        // the quality has to drop, and quickly.
        if (interval > 2000) return;
        long++;
        if (interval > STALLED_FRAME) stalled++;
        else stalled = 0;
        if (long >= 3 && lower(0.6, FLOOR_SCALE)) return;
        // Already at the floor and still far from motion: hold a still frame
        // instead of pinning the processor for a slideshow.
        if (stalled >= 4) rest();
        return;
      }
      long = 0;
      stalled = 0;
      samples++;
      average += (interval - average) * 0.05;
      if (samples > 60 && average > 22) lower(0.8, MIN_SCALE);
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const interval = Math.max(0, now - last);
      last = now;
      adapt(interval);
      // The copy settles into place during the entrance; re-measure now and then.
      if (now - measured > 400) {
        measured = now;
        layout();
      }
      readInput();
      let dt = Math.min(interval / 1000, 1 / 15);
      while (dt > 1e-6) {
        const slice = Math.min(dt, 1 / 120);
        sim.step(slice, input);
        dt -= slice;
      }
      if (canvas.dataset.engaged !== sim.engaged)
        canvas.dataset.engaged = sim.engaged;
      draw();
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    /** Give up on animation for this visit and keep one finished frame. */
    const rest = () => {
      resting = true;
      canvas.dataset.resting = "true";
      start();
    };

    const start = () => {
      if (!ready) return;
      if (reduce || resting) {
        stop();
        layout();
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
          ["uRes", "uTan", "uTime", "uB", "uG", "uRip", "uEnv"].map((name) => [
            name,
            gl.getUniformLocation(program!, name),
          ]),
        );
        gl.clearColor(0, 0, 0, 0);
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        const renderer = String(
          gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ??
            "",
        );
        if (SOFTWARE_RENDERER.test(renderer)) {
          scale = Math.min(scale, SOFT_SCALE);
          canvas.dataset.renderer = "software";
        }
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
      if (input.engaged && !reduce && state === "animating") sim.press(input);
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
      rect = frameRect();
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
    for (const el of section.querySelectorAll("[data-liquid-avoid]"))
      resizeObserver.observe(el);
    void document.fonts?.ready.then(() => !disposed && resize());
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
        <div className="liquid-fallback" data-liquid-fallback>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="liquid-fallback-drop" />
          ))}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="liquid-canvas"
          data-state="loading"
          data-engaged="none"
        />
      )}
    </div>
  );
}
