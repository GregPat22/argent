# W0: website landing page draft

Status: draft requested by the founder, 6 November 2026.

## W0.6: direct copy, plain headings and compact navigation

Branch: `GregPat22/motion-landing-page-improve`, continuing local work on
`b5e763f`. Founder requested removal of atom captions/metaphorical copy, the
supplied footer image, a simpler borderless navbar that compacts to its logo
on scroll, and plainer headings.

Acceptance criteria:

1. Remove visible text below the atom while retaining accurate accessible
   description. Explain coding tasks, limits, review and current prototype status
   directly in hero/statement copy; remove silver/conductor/name-origin metaphors.
2. Replace Space Grotesk headings with Inter and remove unused serif wordmark
   typography. Preserve readable hierarchy, focus, contrast and mobile fit.
3. Use the supplied wide Argent artwork faithfully in the footer, with retained
   source/provenance and optimized derivatives. The wordmark links back to the
   top; footer resource links have real destinations. No nested interactive
   elements or entire-footer click interception.
4. Remove navbar border and typed Argent name. Expanded navigation shows the logo
   and familiar links; scrolling compacts to a single logo at viewport top-left.
   The compact logo opens a keyboard-accessible navigation disclosure, including
   a home link. Escape returns focus to its trigger. Use interruptible Motion
   transitions and instant state changes under reduced motion.
5. Verify top/scrolled/reversed navbar states, deep links, keyboard and mobile
   disclosure, footer click/asset delivery, actual fonts, atom caption absence
   and responsive layout. Run website types/build/browser tests and root
   `npm run check`; review actual diff and update the tracked handoff.

### W0.6 verification evidence

- Website strict typecheck and optimized production build passed; **25 production
  browser tests passed**. New/revised checks cover actual Inter heading fonts,
  direct task/review copy, absent atom captions, footer image delivery/home action,
  all viewport widths, compact-logo bounds and keyboard focus, deep links, reverse
  scroll and live reduced motion. A normal-motion check samples intermediate logo
  widths during compaction rather than inferring animation from component props.
- Browser verification caught a few small proof-section headings still inheriting
  Manrope. The base heading rule now applies Inter to all h1/h2/h3 elements.
  Prototype/planned-workflow boundaries and all prior non-hero interaction tests
  remain intact.
- The supplied 2172 × 724 footer source is preserved byte for byte; its SHA-256
  matches the attachment. Faithful 800/1600px WebP derivatives retain alpha.
  The footer is a server-rendered landmark with a normal wordmark/home anchor
  and separate resource links; no nested click targets.
- Root `npm run check` passed **41 tests**, strict types and formatting. Actual
  source/test diff and changed Markdown links were reviewed. Production preview
  remains `http://127.0.0.1:3200`; reviewed desktop/mobile/top/compact/footer
  screenshots are in `.context/plain-redesign/`.

Limits: Chromium browser/heuristic visual checks, not a conversion study or
Safari/real-device performance evidence. Native desktop packaging was not rerun.
Work remains local on the unchanged branch. Next: founder visual feedback.

## W0.5: remove the hero animation

Branch: `GregPat22/motion-landing-page-improve`, continuing local W0.4 on
`b5e763f`. Founder requested complete removal of the hero animation from code;
the rest of the design is accepted for this pass.

Acceptance criteria:

1. Delete the bubble renderer, shader, hero mounting/state/pause controls and
   fallback artwork/styles. Do not leave a hidden renderer or static replacement.
2. Remove the mobile artwork spacing. Preserve the official icon, headline,
   liquid buttons, navbar, atom and other interactive sections.
3. Replace obsolete hero-rendering tests with a regression proving the hero has
   no canvas/pause controls and the page never requests a WebGL context. Retain
   atom fallback coverage and all other applicable browser tests.
4. Run website types/build/browser checks and root `npm run check`, inspect the
   actual diff and update this specification and the tracked handoff.

Founder follow-up in the same pass:

- Remove the atom's pause button and manual pause state. Keep automatic
  offscreen/hidden suspension and reduced-motion still rendering.
- Increase the desktop atom from a 320px maximum to 480px, with a larger grid
  column and a pixel buffer sized to its displayed dimensions (DPR capped at 2).
  Keep it responsive without overflow on mobile/tablet.
- Verify the neutral silver configuration against primary sources. The existing
  2/8/18/18/1 population is consistent with Ag, Z=47, [Kr] 4d¹⁰ 5s¹. Clearly label
  the drawing as an illustrative shell model, not a literal quantum orbital
  visualization. Static fallback must also include all 47 electron markers.

### W0.5 verification evidence

- Website strict typecheck and production build passed; **22 production browser
  tests passed (41.1s)**. Removed four obsolete hero-rendering scenarios, replaced
  remaining hero/fallback checks with zero-WebGL/no-hero-art and atom fallback
  regressions, and retained all other interactive coverage.
- Enlarged atom renders at least 440px wide in the desktop test, animates through
  actual frame comparisons, stops offscreen and becomes static on live reduced
  motion changes. No atom pause control exists. Its fallback has 47 electron
  markers; responsive layout checks pass at 360/768px.
- Scientific verification: [NIST neutral-Ag data](https://physics.nist.gov/PhysRefData/Handbook/Tables/silvertable1.htm)
  confirms atomic number 47 and the ground-state configuration. The shell counts
  are derived by grouping NIST's configuration by principal shell. The
  [DOE electron explanation](https://www.energy.gov/science/doe-explainselectrons)
  supports distinguishing the artistic paths from quantum probability clouds.
- Root `npm run check` passed **41 tests**, strict types and formatting. Actual
  diff, dead-reference scan and changed Markdown links were reviewed. Source
  contains no bubble renderer, shader, fallback styles or manual atom pause state.
  Local preview remains on `http://127.0.0.1:3200`; screenshots are under
  `.context/hero-removal/`.

The atom is a depth-projected illustration, not a quantum simulation. Safari and
real-device canvas performance remain unmeasured. Native packaging was not rerun;
the branch is unchanged and all work remains local. Next: founder visual feedback.

## W0.4: official icon and liquid silver redesign

Branch: `GregPat22/motion-landing-page-improve`, continuing local W0.3 work on
`b5e763f`. Founder requested a complete hero-shape/animation replacement, a shorter
conversion-oriented headline, fluid Argent buttons and a redesigned navbar.
The supplied silver A image supersedes the earlier Ag brand mark.

Acceptance criteria:

1. Use the supplied image faithfully as the official website icon, including
   navigation, footer, illustrated app marks and favicon. Retain its source,
   document provenance and generate only faithful size/format derivatives.
2. Replace the loop with a harmonious cluster of silver bubbles: coordinated slow
   motion, spring pointer response, pause/resume, offscreen/hidden suspension,
   reactive reduced motion and a matching static non-WebGL fallback.
3. Use “Delegate work. Keep control.” as the concise hero proposal with clear
   product explanation and adjacent prototype/simulation/release boundaries.
   CTA destinations remain real. No conversion-rate improvement is claimed
   without measurement.
4. Restyle primary/secondary actions and functional controls with a shared liquid
   silver treatment. Keep stationary hit areas, visible focus and at least 48px
   targets. Motion respects user preferences; no custom cursor or scroll hijack.
5. Restyle navigation as a persistent floating bar with clear brand/action
   hierarchy, current-section feedback and a keyboard/Escape/mobile disclosure.
6. Apply Laws of UX: choice reduction, related content/actions grouped together,
   familiar navigation patterns, consistent button hierarchy and readable copy.
   Verify actual rendering at mobile/tablet/desktop widths and browser interaction,
   icon assets, fallback, pause and reduced motion. Run website types/build/browser
   tests and root `npm run check`; inspect the actual diff and update the handoff.

### W0.4 verification evidence

- Strict website typecheck and optimized production build passed, including
  browser/touch-icon routes. **26 production Playwright tests passed (1.5m)**.
  All prior interactive scenarios remain covered. New checks verify supplied-icon
  rendering/favicon delivery, exact shorter headline, persistent navigation and
  48px targets, actual hover reflection with fixed target geometry, central
  bubble fill versus the former ring, five rounded fallback globules, offscreen
  suspension/resume and the 1400px buffer bound.
- Existing framebuffer checks still verify hover geometry change and return to
  rest, plus responsive positioning. Pause/resume and reactive reduced motion
  pass for both ambient visuals. Mobile hero actions/status fit at 360/390px;
  tablet and desktop rendering remain covered.
- The supplied 1254px RGBA source is retained byte for byte. Its SHA-256 matches
  the attachment; derivatives preserve transparency and only resize/re-encode.
  Navigation, footer, app/atom illustrations and favicon/touch icons use it.
- Motion AI documentation, Motion+ reference retrieval and spring generation
  succeeded. Premium reference source was evaluated, not copied; no private
  runtime dependency or credential entered the repository. See the
  [UX/rendering rationale](../research/landing-liquid-redesign.md) and
  [brand provenance](../../website/public/brand/README.md).
- Root `npm run check` passed **41 tests**, strict types and formatting. The
  actual source/test diff, whitespace and changed Markdown links were reviewed.
  Production preview: `http://127.0.0.1:3200`. Screenshots are local evidence under
  `.context/liquid-redesign/`.

Limits: Chromium/SwiftShader and heuristic UX review, not measured conversion
lift, Safari or real-device GPU certification. Native desktop packaging/icons
were not rebuilt. Branch name is preserved and changes remain local; no merge,
publication, deployment or provisioning. Next: founder visual feedback and
optional Safari/device checks before separately authorized release work.

## W0.3: hero, polish and clearer next steps

Branch: `GregPat22/motion-landing-page-improve`, based on main `b5e763f`.
The founder requested all three directions: stronger hero, whole-page polish,
and clearer conversion. Preserve the silver identity and existing claim limits.

Acceptance criteria for this pass:

1. Tighten the hero hierarchy and mobile spacing; make the interactive reconnect
   illustration the primary next step, with a real GitHub secondary destination.
   Keep current simulation/public-release limits visible alongside those actions.
2. Navigation identifies the current section, includes FAQ and a direct local-demo
   entry point on desktop, and retains keyboard/Escape/mobile support. Do not
   restore decorative section numbering, rails or reading-progress traces.
3. Add a compact FAQ before the local-demo CTA covering current availability,
   desktop ownership versus cloud plans, agent availability and human authority.
   Disclosure controls work with keyboard, rapid input and reduced motion.
4. Use live Motion AI/Motion+ guidance and generated spring data where useful.
   Keep premium example source, private packages and credentials out of Git.
5. Verify production desktop/mobile/tablet rendering, anchor destinations,
   navigation state, FAQ behavior and existing interactive regressions. Run
   website types/build/browser tests, root `npm run check`, and review actual diff.
   Record evidence and limits in this spec and the tracked handoff.

### W0.3 verification evidence

- Website strict typecheck and production build passed. **21 production browser
  tests passed (1.1m)**, retaining all 14 existing scenarios and adding seven
  checks for mobile hero destinations/status fit, current-section navigation,
  FAQ keyboard/rapid toggling in both motion modes, no-JavaScript answers,
  stable magnetic hit areas and actual rendered sculpture placement on resize.
- The placement regression samples the framebuffer's opaque-silhouette horizontal
  centroid at 640/768/1024/390px, waiting for a draw at each new viewport. Layout
  follows the 1024px composition breakpoint rather than canvas aspect ratio.
  Tablet retains the stacked hero; fallback and pointer mapping agree with it.
- Visual review caught the wrapped mobile GitHub label and tablet artwork/copy
  collision; both were corrected. A test initially measured button movement
  during the hero's delayed arrival; it now waits for the actual settled transform.
- Motion MCP documentation for AnimatePresence and useSpring was searched/read.
  Motion+ accordion source was retrieved for evaluation; no premium source was
  copied. The original native-details FAQ uses a Motion+ generated critically
  damped CSS spring (0.28s perceptual, 550ms settle) with feature detection and an
  explicit reduced-motion override for `::details-content`.
- Root `npm run check` passed **41 tests**, strict types and formatting. Actual
  diff/whitespace and changed Markdown links were reviewed. Evidence screenshots
  live in `.context/landing-pass/`; the local production preview uses
  `http://127.0.0.1:3200` because port 3000 was already occupied.

These are Chromium/SwiftShader and heuristic visual checks, not conversion data
or a Safari/real-device GPU benchmark. Native desktop packaging was not rerun.
The branch name is preserved, changes remain local, and nothing was merged,
published, deployed or provisioned. Next: founder visual feedback, then optional
Safari/device checks and separately authorized PR/release work.

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
