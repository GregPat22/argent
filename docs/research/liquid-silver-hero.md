# Liquid silver hero: approach study

7 November 2026, for [spec 0005 W0.7](../specs/0005-website-landing-draft.md#w07-interactive-liquid-silver-beside-the-hero).
Question: what is the best way to put interactive 3D liquid metal, driven by the mouse,
beside the landing page headline?

## Approaches compared

| Approach                                                                                    | Look                                                                                                     | Cost                                                                                              | Verdict                                    |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Mesh + vertex noise (three.js / React Three Fiber, e.g. a distorted sphere with an env map) | One wobbling chrome ball. It cannot split or merge, so it reads as a "blob", not a liquid                | Adds three.js (~150 KB+ gzipped) and usually an HDR environment download                          | Rejected: generic look, heavy              |
| Raymarched signed-distance metaballs in one fragment shader                                 | Real liquid behaviour: smooth unions merge, necks stretch and droplets pinch off. Mirror-quality shading | No library. Cost scales with pixels, so it is bounded to the artwork's box and its pixel ratio    | **Chosen**                                 |
| Marching cubes mesh (three.js addon)                                                        | Merging metaballs as real geometry                                                                       | CPU/GPU polygonisation every frame plus three.js; faceting at low resolution                      | Rejected: heavier for the same shape       |
| WebGPU particle fluid (MLS-MPM/SPH + screen-space surface)                                  | Physically simulated liquid, the most impressive                                                         | WebGPU-only paths and fallbacks, ~100k particles, a multi-pass renderer. Overkill for an ornament | Rejected for now; noted as a future option |
| 2D Navier-Stokes "fluid" shaders                                                            | Smoke/ink in a plane, not a 3D metal object                                                              | Cheap                                                                                             | Rejected: wrong look                       |
| Embedded 3D tool export (Spline etc.) or video                                              | Can look good                                                                                            | Third-party runtime/scene download; video is not interactive                                      | Rejected: not code-owned / not interactive |

## What was built

- **Shape:** ten spheres combined with a polynomial smooth minimum. One core body,
  four inner bodies on slow Lissajous paths (so the silhouette keeps morphing), a
  pointer droplet with a three-sphere neck, and a small satellite that dips in and
  out. The droplet and neck use a tighter blend so they can actually separate.
- **Interaction:** the droplet follows the pointer over the artwork on an underdamped
  spring. The neck thins as it stretches, snaps past a threshold and reforms on
  contact (hysteresis). A press launches a travelling ripple in the distance field.
  The procedural studio rotates slightly with the pointer anywhere on the page, so
  highlights slide like a real reflective object.
- **Shading:** silver Fresnel (Schlick), a procedural studio of softboxes and a horizon
  line (no HDR file), four-sample occlusion, one secondary bounce so droplets reflect
  each other, ACES tone mapping, and a closest-approach silhouette for anti-aliasing
  without MSAA.
- **Cost controls:** a bounding-sphere test skips most pixels. The pixel ratio is capped
  at 1.75 and lowered automatically when frames run long. The loop stops offscreen
  and in hidden tabs. The shader compiles in parallel where the browser supports it.
  Reduced motion gets a single still frame.

## Sources

- [How to create interactive, droplet-like metaballs with Three.js and GLSL](https://tympanus.net/codrops/2025/06/09/how-to-create-interactive-droplet-like-metaballs-with-three-js-and-glsl/)
  (Codrops, 2025): full-screen raymarched spheres with mouse-trail elasticity.
- [Raymarching procedural terrain and metaballs in WebGL](https://cescg.org/?p=5783)
  (CESCG): environment-mapped raymarched metaballs as morphing mercury.
- [GPGPU points into metaballs](https://discourse.threejs.org/t/gpgpu-points-into-metaballs/65457)
  (three.js forum): raymarching cost is acceptable for a handful of metaballs.
- [Create an interactive liquid metal ball with WebGL](https://creativebloq.com/javascript/create-interactive-liquid-metal-ball-webgl-4126370)
  (Creative Bloq): the mesh-distortion approach.
- [Real-time 3D fluid simulation in WebGPU](https://80.lv/articles/check-out-this-real-time-3d-fluid-simulation-implemented-in-webgpu)
  and [MLS-MPM with WebGPU and three.js](https://discourse.threejs.org/t/mls-mpm-simulation-with-webgpu-and-threejs/77686):
  particle-fluid state of the art and its WebGPU dependency.

## Limits

Visual review and tests ran in Chromium only. The shader's frame cost on Safari,
Firefox, integrated laptop GPUs and phones is unmeasured. The physics is an artistic
spring model, not a fluid simulation.
