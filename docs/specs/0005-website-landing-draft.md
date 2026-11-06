# W0: website landing page draft

Status: draft requested by the founder, 6 November 2026.

## Goal

A first landing page for the website that the desktop app will eventually be
downloaded from. It should explain Argent clearly and memorably: durable runs,
independent verification, persistent workspaces and human authority. It also
needs to show, in animation and interaction, why these matter.

The page lives in `website/`, a separate Next.js package. It does not import the
engine, share its dependencies or change its checks.

## Acceptance criteria

1. `website/` builds with `npm run build` and serves a single static landing route.
   The root `npm run check` still passes unchanged.
2. Copy states what works today. M0 is described as a local orchestration simulator,
   and the local macOS prototype as complete in the source repository, using simulated
   execution. Public downloads and real cloud/agent capabilities remain planned.
   No invented download links, prices, customers, metrics or integrations.
3. Interactive illustrations are labelled as illustrations. Any figures quoted
   from M0, such as event types and the 22 passing tests, match the repository.
4. The motion is interactive, not decorative. The cursor-reactive hero, the
   disconnect/reconnect demo and the claim-versus-evidence slider all respond to
   user input. The demo and the slider work from the keyboard; the hero is
   decorative and hidden from assistive technology.
5. `prefers-reduced-motion` disables smooth scrolling and ambient motion and
   renders the hero shader as a still frame. Without WebGL, a static fallback appears.
6. The layout works from 360 px wide up to large desktops, and keyboard focus is visible.
7. No secrets are committed. Motion+ (licensed) is not a dependency until a valid
   token can be installed without writing it into tracked files.
8. Nothing is deployed or published. Deployment needs separate founder approval.

## Out of scope

Docs pages, blog, analytics, a waitlist backend, real download artifacts and
deployment.

## W0.1: founder visual refinement (6 November 2026)

Branch: `GregPat22/argent-landing-page-draft`. Preserve the approved Ag logo,
silver palette and general concept. Acceptance criteria for this revision:

- Replace the display/body typography throughout, preserving the logo artwork.
- Improve the interactive silver hero sculpture; provide a recognisable static
  fallback and stop decorative rendering offscreen or under reduced motion.
- Use “Argent is a good conductor” as the second heading, followed by concrete
  product meaning. Give every section a related silver/conductivity motif and
  deliberate Motion entrance/progress treatment, including the roadmap.
- Address the full-page Laws of UX audit: mobile navigation with keyboard and
  Escape support, readable copy, shorter workflow pacing, 44px targets, adjacent
  illustration labels and explicit prototype/planned-cloud boundaries.
- Verify desktop, 360px mobile, keyboard controls, reduced motion, WebGL fallback,
  clipboard feedback and full terminal output. Run website typecheck/build and
  root `npm run check`; review the actual diff and record evidence below.
- Do not merge, deploy or add private runtime packages/credentials. Record the
  fetched main/branch comparison accurately; a clean branch is not a main merge.

### W0.1 verification evidence

- Website strict typecheck and optimized production build passed.
- Eight Playwright browser tests passed against the production build (30.2s):
  all eight section headings and clean hydration; 360px mobile keyboard menu;
  360/768px section fit and complete evidence panel; keyboard slider endpoints;
  simulated reconnect and worker-loss blocking; reduced-motion static rendering;
  actual pause/resume drawing plus WebGL fallback; clipboard success/failure
  and scrollable terminal output. Desktop coverage uses 1440 × 900.
- Root `npm run check` passed all 22 M0 tests, typechecking and formatting.
  `.context/` is excluded from formatting because it contains ignored workspace
  attachments, snapshots and ad hoc tools, rather than maintained source.
- An independent Laws of UX agent audited the entire route and reviewed the
  actual implementation diff. Findings and changes are in
  [the UX report](../research/landing-ux-review.md). The implementing agent also
  reviewed the actual diff and ran `git diff --check`.
- Production screenshots are local evidence under `.context/refinement/`,
  including desktop hero/statement/roadmap and mobile hero/evidence. They are
  intentionally ignored by Git. Browser screenshots use Chromium/SwiftShader;
  real-device GPU performance and Safari have not been measured.

Initial browser failures exposed a real tablet artwork overflow, a reduced-motion
conditional-markup hydration mismatch and an unstable test locator. Those were
fixed before the complete eight-test pass. Initial engine formatting checks also
found ignored `.context` files; the maintained-source ignore boundary fixes that.
Motion AI/Motion+ tools were unavailable in this session; public Motion was used.
Main remained at `a5a96cb` when fetched: the preceding landing commit `c70cb4c`
is on the landing branch only. The separate desktop review branch also remains
unmerged. This refinement neither merges nor deploys either branch.

## W0.2: fluid interaction and simpler composition

Branch: `GregPat22/argent-landing-page-draft`, following `1ec78e3`. Founder
feedback supersedes W0.1's section-signature direction. Acceptance criteria:

1. Remove every numbered section signature, its kicker, icon and horizontal
   divider; remove the navbar reading-progress bar and workflow left-hand rail.
   Preserve meaningful headings, the approved logo and functional panel borders.
2. Replace the rigid silver loop with an original flowing silver material, using
   researched smooth distance-field blending, studio reflections, antialiasing
   and spring-damped pointer deformation. Hover must visibly change geometry,
   beyond just changing the light. Pointer exit returns to rest.
3. Animate “conductor” with a legible silver highlight on arrival and hover.
4. Replace static atom artwork with depth-aware moving electrons, orbital traces
   and a pause control. This is a stylized silver atom, not a quantum simulation.
5. Rethink the workflow as three compact, keyboard-selectable stages: define,
   bounded execution, independent evidence and human decision. Keep planned-flow
   and simulated-evidence labels adjacent; retain all original control boundaries.
6. Both ambient visuals pause offscreen/when hidden, support reduced motion and
   have usable static fallbacks. Avoid hydration differences based on preferences.
7. Verify hover geometry, leave-to-rest, pause, atom motion, stage keyboard controls,
   360/768/1440px layouts, reduced motion and fallback. Run production build,
   browser suite and root `npm run check`; inspect actual diff and screenshots.
8. Use the configured Motion AI/Motion+ tools for live guidance, record research
   sources and limitations, and keep premium reference source/credentials out
   of the public repository. No merge, deployment or billable provisioning.

### W0.2 verification evidence

- Strict website typecheck and optimized production build passed.
- **12 production Playwright tests passed (34.6s)**: existing navigation,
  responsive layout, reconnect, slider, clipboard and fallback checks; new
  section/progress removal checks; compact workflow keyboard selection; actual
  atom frame changes, pause/resume, offscreen stop and live reduced-motion
  switching; plus framebuffer-area evidence of hover deformation and return.
- Hover verification fixes the ambient clock, samples rendered alpha coverage,
  requires a >1.5% geometry change and a return within 0.5% of rest. It does not
  infer interaction from an animation class, lighting change or agent statement.
- Initial browser testing passed 11 scenarios and caught one real issue: Motion
  14.10's hook did not notify React when the OS preference changed after mount.
  A shared reactive preference hook corrected this, then all 12 scenarios passed.
- Root `npm run check` passed 22 tests, strict types and formatting.
- Motion and Motion+ MCP guidance/source resources were actually searched/read.
  Original shader/canvas code and generated spring data are in the product;
  private example source and credentials are not.
- The [fluid-motion research](../research/fluid-motion-refinement.md) records
  primary references, implementation decisions and limits. The actual diff and
  production screenshots at `.context/w02/` were reviewed. The verified build
  serves on `http://localhost:3000`. No merge or deployment occurred.

Visual checks cover desktop 1440px, tablet 768px and mobile 360/390px. Chromium
with SwiftShader is not a real-device GPU or Safari benchmark. The silver form
and orbital artwork are stylized; they are not physical fluid/quantum solvers.

## PR integration verification — 6 November 2026

Branch: `GregPat22/argent-landing-page-draft`, main baseline `fd60a5a`, integrated
by merge `e3e82f9`. P1 is now part of main, so current website copy describes the
prototype as complete in the source repository. Preserve the static desktop
preview (`website/index.html`, `website/styles.css`, root `site:preview` on 4320)
alongside the separate Next.js landing package on 3000. Neither entry point may
overwrite or depend on the other's runtime; the actual diff confirms the desktop
source and packaging are unchanged against main.

Additional acceptance: immediate keyboard/pointer input must cancel the comparison
slider's arrival hint permanently, including after reduced-motion changes. The
independent review reproduced the race, and two normal-motion browser regressions
now verify the fix. Fresh production browser suite: **14 passed (38.2s)**; website
types/build passed; root `npm run check`: **41 passed**, types and formatting.
These supersede the earlier branch-local check totals, not the historical M0
completion evidence. The GitHub workflow still runs only root checks; website
checks were run locally. Native packaging, static artifact streaming, Safari and
real-device GPU checks were not rerun. No deployment or merge into main occurred.
