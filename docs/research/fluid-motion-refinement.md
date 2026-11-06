# Fluid silver and interaction study — 6 November 2026

Branch: `GregPat22/argent-landing-page-draft`, following `1ec78e3`.
The founder requested simpler sections, a more convincing interactive silver
hero, animated “conductor” text, a moving atom and a rethink of the long workflow.
Acceptance criteria are in [W0.2](../specs/0005-website-landing-draft.md).

## Primary references studied

- [Yuki Kojima’s interactive droplets](https://github.com/koji014/interactive-droplets):
  the original creator’s ray-marched, smoothly joined distance fields and damped
  pointer response. The Codrops article returned 403, so the original repository
  and its own technical explanation were used. Its code was not imported.
- [Three.js metallic/roughness material documentation](https://threejs.org/docs/pages/MeshStandardMaterial.html):
  polished metal needs an environment to reflect. The implementation art-directs
  broad studio cards, narrow highlights and dark flags in an analytic environment;
  it does not claim to implement Three.js’s complete physically based material.
- [Paper’s liquid-metal reference](https://shaders.paper.design/liquid-metal):
  study of contour deformation, reflection softness, animation rate and pixel
  budgets. No Paper package, code or reference image was installed/copied.
- Live Motion MCP: `search-motion-docs` and the full `react-use-spring` resource.
  A pointer target should move through a spring rather than cause frame-by-frame
  React rerenders or jump directly to a new position.
- Live Motion+ MCP: `search-motion-source` and complete reads of
  `multifollow-pointer-with-spring` and `magnetic-filings`. The study informed
  pointer response; the implementation is original and uses public Motion springs.
  No premium source was copied into the repository and no private runtime import
  was substituted. The workflow hover uses the CSS spring previously generated
  by the authenticated `generate-css-easing` tool.
- [Royal Society of Chemistry: silver](https://periodic-table.rsc.org/element/47/Silver):
  atomic number 47 and configuration [Kr] 4d10 5s1. The atom uses 47 particles
  grouped 2/8/18/18/1. Orbital paths, sizes, speeds and trails are artistic choices;
  this is a classical visual metaphor, not a quantum or electrostatic simulation.

## Design and implementation decisions

The section signatures, numbers, kickers, icons and divider lines were removed.
The navbar and roadmap reading-progress traces and the workflow’s left rail were
removed too. Meaningful section headings, approved logo and functional panel
boundaries remain.

The hero combines a varying-thickness liquid loop with two smoothly joined
volumes. Slow changes in the distance field reshape the surface instead of
merely spinning a fixed mesh. A spring-following front lobe grows into the field
under hover and relaxes away on exit. Lighting and actual shape change together.
A bounding sphere, early ray termination, 30fps scheduling and a capped 1400px
long edge limit rendering work. Uniform updates sample Motion values without
React state updates. Layout is measured in pointer/resize handlers, outside the
render loop. Context loss and missing WebGL fall back to a static CSS material.
This is an art-directed implicit sculpture, not a fluid-dynamics solver.

“Conductor” remains legible as silver text throughout a one-shot highlight sweep
on arrival and hover. Painting is confined to that word. Reduced motion disables
the sweep. The atom projects five planes into depth, dims back particles and
gives front particles short trails. It renders at up to 30fps in a bounded 2D
canvas, pauses when hidden/offscreen, keeps a user pause control and draws a
still frame for reduced motion. Missing 2D canvas gets static SVG orbits.
The installed Motion 14.10 reduced-motion hook snapshots the preference at mount;
a small `useSyncExternalStore` adapter subscribes to live `matchMedia` changes
for the ambient renderers and shared Motion configuration. Browser verification
caught and now covers that runtime preference-change case.

The workflow is now three user-selected stages: define the work, run within
limits, review the evidence. Native buttons, roving tab focus, arrows and Home/End
support keyboard operation. Examples retain adjacent simulation labels. The
three stages still explain isolated workspaces, acceptance criteria, scoped
credentials, bounded execution, uncertainty handling, exact-commit verification,
independent review, at most one repair, draft PRs and human merge authority.

## Verification and limits

The browser suite checks actual framebuffer silhouette area with ambient time
held constant: hover must change the geometry, then pointer exit must restore
it. The atom checks compare rendered frames, pause/resume and offscreen/reduced
motion behavior. Other scenarios retain responsive, navigation, reconnect,
comparison-slider, clipboard and fallback coverage. Final results and screenshots
are recorded in the W0.2 spec and handoff.

Chromium/SwiftShader is browser evidence, not a real-device GPU benchmark.
Safari and mobile hardware still require hands-on checks. Product behavior is
unchanged: the local prototype simulates execution; cloud/real-agent workflows
and public downloads remain planned. No main merge or deployment occurred.
