# W1: website restyle, proof first and one metal

Status: implemented. Based on main `a9bc431`. The hero headline and its liquid
silver field are unchanged. No capability, milestone or priority changes: this
spec changes how the page presents what [the roadmap](../../ROADMAP.md) already
says.

## Decisions

1. **Proof leads.** Section order is hero, statement, proof, how it works,
   agents, open source, journey, roadmap, FAQ, try it, join. What exists comes
   before what is planned, and the navigation follows the same order. The first
   of the three problems is the unproven claim, which the next section answers.
2. **The hero says one thing.** The paragraph states the promise once. Today's
   facts move to a status line under the actions: Claude Code runs today on
   Apple-silicon Macs; free and MIT; built from source, no download yet; the
   changes panel is live and trusted checks are planned.
3. **The main action stays in reach.** It is named "Try it locally" everywhere,
   with a down arrow because it scrolls. Compact navigation shows it as a pill
   at the top right, except where the page already offers it (hero, try it,
   join) and while the menu is open.
4. **Statuses sit on the thing they describe.** In proof, today's record and the
   planned checks are two labelled columns directly under the example. Each of
   the four hallmarks says whether the desktop app strikes it today
   ([spec 0015](0015-desktop-restyle.md#signature-moments)): the maker's mark
   and the date letter are struck, the standard and assay marks are blank
   plates. Each how-it-works step carries its own status.
5. **One metal.** Plates get a gradient edge; marked surfaces answer the pointer
   with an edge and face highlight; the hallmarks are punched silver plates; the
   drops in the closing band and in the hero's fallback are stills rendered
   from the hero's own shader (`website/scripts/render-liquid-drops.cjs`).
6. **Runtime stays on the public `motion` package.** No private package or
   credential enters the repository.

## Defects fixed

- On phones the compact logo sat on top of headings and body text. Content now
  fades out under a short gradient at the top of the page while the navigation
  is compact.
- On phones the journey's stage came after its three steps, so the steps lit up
  while the illustration was off screen. The stage now sticks under the header
  while the steps scroll beneath it.
- On phones the comparison stopped at the middle, where both full-width panels
  are cut in half. Its arrival hint now carries on to show the whole record.
- The navigation's action carried an "external link" arrow although it scrolls
  the page, and was worded differently from the hero's.
- The proof paragraph described checks in the present tense although checks are
  planned. It now describes the record, and the two columns below it separate
  what is recorded today from what is planned.
- A status tag read "Project rule: Project rule".
- The large drops in the closing band were soft CSS gradients that did not match
  the hero's metal.
- At tablet width the two agent status tags were squeezed beside their caption
  and broke onto two lines each. They now sit under it until there is room.

## Acceptance

1. `main > section` ids are, in order: `intro`, `statement`, `hallmark`,
   `lifecycle`, `agents`, `open`, `reconnect`, `roadmap`, `faq`, `run`, `join`.
2. The hero paragraph is the promise only; the status line carries the
   facts above, is a liquid keep-out zone and fits the first screen at 360 × 800.
3. Compact navigation has one button and one link. The pill links to `#run`, is
   at least 44 px tall, is absent over the hero, `#run` and `#join` and while
   the menu is open, and never overlaps the logo at 360 px.
4. Proof shows two labelled columns (works today, planned) and four plates with
   states struck, blank, blank, struck; plates are decorative and their meaning
   is in headings.
5. The three problem glyphs end fully drawn, and are visible without scripts.
6. How-it-works plates read works today, works today, in development.
7. At 390 px the journey stage stays pinned under the header while each step in
   turn becomes current, and nothing overflows horizontally.
8. A `data-light` plate receives the pointer position; the highlight never
   takes pointer events. The four stills are served as WebP.
9. Reduced motion, no-JavaScript and no-WebGL behaviour from earlier website
   work still holds: the existing tests for them pass unchanged.
10. No section is wider than the screen at 360, 390 and 768 px, before or after
    its entrance has played. The comparison's divider and the hallmark plates'
    strike are clipped inside their own boxes.
11. New looping or pointer-driven motion stays off layout and paint where it
    can: the hero's live dot animates a ring's transform and opacity, and the
    pointer's position is a registered, non-inheriting property that reaches
    the plate and its two lights but not the plate's content.

## Verification

### Capability copy acceptance — 12 November 2026

Based on main `f1a773c`. These corrections preserve the product direction,
headline and milestone order; they describe the implemented limits more precisely.

1. A branch and worktree belong to a workspace. Follow-up tasks reuse that
   workspace; copy never promises a new branch for each run or filesystem
   isolation between agents.
2. Current local results are recorded, not tested. Independent test checks and
   draft pull requests remain planned. The comparison card labels planned
   verification inside the illustration and contains no invented test totals or
   repair findings.
3. Every current history-export claim identifies the simulation-only CLI scope.
   Real-agent transcript and Git-history export remain planned, consistently
   with [spec 0012](0012-portable-history.md#limits-and-subsequent-slices).
4. Authentication claims describe the environment allowlist and absence of an
   automatic API fallback, without guaranteeing that an unsandboxed process
   cannot access credentials or incur charges.
5. The security policy describes real local Claude Code execution and simulated
   GitHub-URL/cloud work. README, vision, roadmap, documentation index, package
   metadata and website agree without claiming additional delivered capability.
6. Browser coverage checks the visible limitations and the self-contained
   illustration label, including with scripts disabled. Existing mobile layout,
   navigation and sharing-metadata checks continue to pass.

Validation on 12 November 2026 against main `f1a773c`: `npm run check` passes
541 tests, type checking and formatting. Website type checking, the production
build and all 59 browser checks pass, including capability limitations with
scripts enabled and disabled and the existing phone/tablet fit checks.
Publication and domain configuration require separate live checks; these local
results do not establish the deployed content or real-agent test execution.

### Restyle validation

On the final content, 10 November 2026:

- Website: type check and production build pass; 47 of 47 browser tests pass
  (38 from before this work, 9 new). The suite runs on software WebGL.
- Repository: `npm run check` passes, 461 of 461, after merging main
  `1b9e4dd` on 11 November.
- The first full run of the new suite failed 8 tests. Five came from real
  defects this work had introduced: removing the comparison's clipping let its
  divider widen the page at every width, and the statement's glow and the
  hallmark plates' strike overflowed on phones. Three were faults in the new
  tests: one wrong expected value, and two that measured an element while it
  was still moving. The defects were fixed in the page and the tests now wait
  for rest. The 38 earlier tests changed only where behaviour changed on
  purpose (navigation order and the action pill).
- On the hosted runner the action-pill test failed twice on the slower of two
  parallel runs. A software renderer draws very few frames after a window
  resize, and the test waited on a transition to finish. It reproduced locally
  under heavy processor load. The resting positions at phone and tablet width
  are now a separate test on a fresh page with motion reduced, and the
  behaviour test allows longer for each step; each passed 4 runs out of 4
  under that load.
- On one slow hosted run an earlier test (the atom's) reached its 30 second
  limit. Timed step by step under the same processor load, that test takes as
  long on main `1b9e4dd` as in the restyle validation (20 to 26 seconds against 22 to 24
  from a cold start), so the restyle did not slow the software-rendered page.
  The test is close to its limit on a slow runner either way.
- Looked at in headless Chromium at 1440, 768 and 390 px, every section, and
  compared with the page before the change.
- Motion: the new animations were classified by hand against Motion's
  performance method. Two were changed (criterion 11). One paints by nature:
  the problem glyphs draw with `stroke-dashoffset`, once, for about a second,
  on three small icons. A scripted scroll of the whole page and a pointer
  sweep across the plates, in headless Chromium on an Apple-silicon GPU, held
  16.7 ms at the 95th percentile, with one or two frames of 50 to 70 ms per
  full scroll, in the hero and the atom, which this work did not change. This
  is one machine and not a runtime audit by Motion's tool, which was not run.

## Limits

- The stills are fixed frames: they drift and lean toward the pointer but do
  not merge or ripple like the hero's metal.
- The pointer light needs a fine pointer; touch devices see the resting plates.
- At the restyle validation the site was not deployed. The landing page is now
  served at [argent.build](https://argent.build/); no desktop download exists.

## Website consistency and motion corrections (in development)

Review baseline: main `c05fbf7`, 14 November 2026. The website omitted the
accepted checked-links experiment and further project rules, and described
crash recovery without the real-process reconciliation limit. The local
terminal example also used verified green for an untested record. These
corrections preserve the accepted positioning, headline and milestone order.

Acceptance:

1. Website roadmap, FAQ and open-source principles reflect the README,
   roadmap and vision: Claude Code release, checked-links experiment,
   Codex/model picker, further rules, Cursor/OpenCode (order revised on
   14 November 2026), developer-owned remote host,
   optional managed cloud, then mobile. Links grant no access and carry no
   messages; rules distinguish guidance, checks, gates and prevention, with no
   prevention control offered today. Crash reconciliation stays planned.
2. Untested local records remain silver. Green may identify the explicitly
   labelled simulation integrity result or planned verification example.
3. The comparison divider follows input without spring travel when reduced
   motion is enabled, including a live preference change. Its clip and handle
   use the same position; normal-motion input keeps its existing spring.
4. Clipboard failure immediately reveals complete, selectable commands and
   retains the fallback message. Repeated copies reset their feedback timer;
   changing tabs clears the previous terminal's timer.
5. The journey meter keeps constant layout width and fills with a transform.
   Its pulse animates transform and opacity, pauses offscreen and stops under
   reduced motion. Agent preview changes use compositor-compatible transforms
   and omit their entrance/exit blur under reduced motion.
6. Focused browser regressions demonstrate the baseline defects and corrected
   behavior. Run the complete browser suite, website typecheck/build and root
   check, then inspect desktop and mobile layouts. Runtime performance scores
   are observations from the measured browser, not field performance guarantees.

Validation on 14 November 2026, based on main `c05fbf7`:

- Both reduced-motion regressions fail on an isolated unchanged-main build,
  including the live preference change, and pass with the correction. The
  baseline also fails the new roadmap, untested-record color, clipboard fallback
  and transform-meter assertions. All six focused regressions pass after the
  corrections.
- A follow-up review against main `c091bb8` reproduces an inherited CSS
  specificity defect: the active journey pulse overrides its offscreen pause.
  A browser regression reaches the active stage, scrolls away and observes
  `running` instead of `paused`. The offscreen selector now takes precedence;
  the regression also checks that returning to the section resumes the pulse.
- Website production build and typecheck pass. The complete repository check
  passes all 589 tests, strict types, compilation and formatting.
- The full browser run passes 65 checks and exposes three FAQ count assertions
  expecting eight answers after the rules-and-links answer makes nine. All
  three original tests pass on unchanged main. With the expected count updated
  and the added answer asserted, all three reruns pass, preserving every existing
  keyboard, rapid-toggle, no-script and content assertion. All 68 browser checks
  are covered by the full run and these focused reruns.
- Desktop and phone screenshots were inspected at 1440 and 390 px; neither
  viewport has horizontal overflow. The live GitHub description matches package
  metadata; the deployed website still contains the baseline copy omissions.

Motion's baseline runtime audit reports A (81/100), with 253 detected animations;
242 were classified S and 11 C. The final local audit reports S (88/100), with
260 S and nine C observations. These single runs differ in observed animation
counts and machine load, so they are not a controlled performance benchmark.
Static inspection identifies the meter's width
and pulse's shadow as avoidable layout and paint costs. Their replacements use
transform and opacity; this does not claim a measured global frame-rate gain.

These are local Chromium checks, not Safari, Firefox or field performance
validation. No deployed change, native app, account-backed agent run or new
product capability is established. Integration and publication remain separate.

## Navigation reopen regression (in development)

Recorded 12 November 2026 against main `864188a`. Closing and reopening the
mobile menu during its staggered exit can leave its links at opacity zero and
translated offscreen, even though the control reports expanded. A controlled
rapid-toggle probe reproduces this on unchanged main; ordinary opens and three
focused runs of the existing keyboard test pass, so the defect is intermittent.

Acceptance:

1. Closing navigation immediately retires its interactive links. Reopening
   mounts a fresh list and plays the existing entrance; an exiting list must
   never become the active menu again. The decorative scrim may fade separately.
2. Keyboard open, Escape, immediate reopen and anchor selection work with normal
   and reduced motion. Closed links are absent from keyboard and accessibility
   navigation as soon as the control reports collapsed.
3. Preserve compact navigation, focus transfer, action-pill behavior and the
   approved copy. Run the original browser regressions, a rapid-reopen regression,
   website typecheck/build and the repository check. No deployment is implied.

Validation on 12 November 2026, based on main `864188a`:

- The initial complete browser run passes 54 checks and fails mobile anchor
  selection: the reopened Roadmap link remains outside the viewport. A separate
  unchanged-main rapid-toggle probe confirms all six links stuck at opacity zero
  and `translateX(-72px)`, with no active animation.
- Both new regressions fail before the correction: a collapsed menu still exposes
  six links. After the correction, both pass with normal and reduced motion,
  alongside the original mobile navigation and scroll/focus-transfer tests.
  Website typecheck and production build also pass.
- The reported desktop/backend failures do not reproduce: all 20 reported groups
  pass on unchanged `3836760` (31 tests, including the public-content file's
  checks). The initial complete repository check at `864188a` passes 541 tests.
  These local runs have a Git checkout, loopback listeners and process control;
  they do not establish the exact cause of every earlier restricted-run failure.

After the correction, the same timing probe passes all ten rapid-reopen cases,
the complete website suite passes all 57 checks, and `npm run check` passes all
541 repository tests, strict types, formatting and compilation. The changed diff
and documentation links were reviewed. Hosted CI remains required before
integration. No hosted deployment, native GUI, packaged app or real signed-in
agent is validated by this correction.

## Reveal layout regression (in development)

Recorded 12 November 2026 against main `3f2181b`. Temporary split-text masks
use padding and negative block margins, which collapse through their wrappers.
The heading expands during its reveal, then contracts when its original nodes
return. A Chromium probe at 1440 px measures the statement heading contracting
by 50.6875 px and the roadmap heading by 11.515625 px at cleanup. Separate
word boxes also lose the font's comma/space kerning: after removing the vertical
jump, the roadmap's following words still shift horizontally by 0.765625 px.
Retain the following space while shaping each word, cancel its measured advance
so the external space owns wrapping, and remove it at the end of each line.

Acceptance:

1. Hero lines and every scroll-revealed heading retain the same text positions,
   dimensions and section geometry across cleanup at phone, tablet and desktop
   widths. No compensating animation or permanent fixed height hides the jump.
2. Keep the word-by-word reveal, balanced wrapping, explicit line breaks,
   gradient, ascender/descender clearance and original accessible markup.
   Reduced motion and the script-loading fallback remain supported.
3. Use a paint-only clip with vertical breathing room, without padding or margins
   on temporary line masks. Regression checks observe the actual restoration
   boundary; settled screenshots alone cannot establish absence of this defect.
4. Run the new geometry regressions on unchanged main and with the correction,
   the existing entrance/browser suite, website typecheck/build and the root
   repository check. Publication remains a separate step.

Validation on 12 November 2026, based on main `3f2181b`:

- All three new geometry regressions fail against the unchanged production
  build at 390, 768 and 1440 px. The first hero line contracts by 13.09375,
  23.03125 and 32.25 px respectively.
- The paint-only mask correction removes the vertical jumps. The first complete
  browser run passes 61 checks and fails the desktop geometry regression on the
  separate comma/space kerning defect. Preserving that shaping context resolves
  the remaining horizontal shift without relaxing the regression tolerance.
- The final production build, website typecheck and all 62 browser checks pass.
  The new checks measure every hero line and scroll-revealed heading across
  restoration, including individual word positions and containing section
  geometry; differences must stay below half a CSS pixel. Existing entrance,
  reduced-motion, glyph-clearance and script-fallback checks also pass.
- The final `npm run check` passes all 541 repository tests, strict types,
  formatting and compilation. The actual diff and new documentation anchors
  were reviewed.

These are local Chromium checks, including software WebGL, not deployed-site,
Safari or Firefox validation. Integration and publication remain separate steps;
no product capability or milestone status changes.

## Browser rendering cost (in development)

Use the production build at `9be273e` as the comparison point. Acceptance
requires identical visible copy, links, desktop and phone section geometry,
and settled artwork. Preserve the existing animation paths, timings, drawing
order, quality governor, live reduced-motion response and fallbacks.

Reuse fixed orbit geometry between atom frames and reuse liquid placements
when all viewport and keep-out bounds match. Defer the two largest closing images until
their band approaches the viewport. Preserve the initial loading of the smaller
drops, which WebKit samples differently when it first decodes them on scroll.
The hero fallback must be able to request its images immediately.

Local comparison on 18 November 2026 against `9be273e`, using cold Chromium
contexts, production builds and software WebGL. WebKit also ran the visual comparisons.

- At 1440 × 900 and 390 × 844, the 11 sections and footer matched pixel for
  pixel in Chromium and WebKit with reduced motion enabled. The visible text, links and measured
  section and heading rectangles also matched.
- Initial encoded response bodies fell from 460,175 to 417,326 bytes on desktop
  and from 446,409 to 403,560 on the phone viewport. JavaScript grew by 408
  compressed bytes. The two deferred images accounted for 43,286 bytes at both
  widths and loaded on approach. The request regression observed both loading
  at the top on the baseline.
- The page registered one live reduced-motion change listener instead of 26
  on a reduced-motion visit. The atom's settled draw made 630 sine and cosine
  calls, down from 6,904. All 36 sampled atom frames matched at the pixel level
  across multiple times, sizes and pixel ratios.
- A replay of 7,200 liquid simulation steps, including pointer presses and a
  viewport change, produced identical sphere buffers, engagement states and
  reflection and ripple inputs. Eight sampled shader frames also matched at
  the pixel level, including frames with an active ripple.

The website typecheck, production build and repository check passed. An initial
browser run timed out in five checks. The unchanged build also timed out in the
hydration check and passed the other four. All five passed on a focused rerun
of the refactor, followed by a full pass of all 71 browser checks at their
original deadlines.

These measurements cover the local production builds. Field load times,
hardware GPU performance and Firefox require separate measurement.
