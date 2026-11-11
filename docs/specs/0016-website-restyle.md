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

On the final content, 10 November 2026:

- Website: type check and production build pass; 47 of 47 browser tests pass
  (38 from before this work, 9 new). The suite runs on software WebGL.
- Repository: `npm run check` passes, 461 of 461, after merging main
  `1b9e4dd` into the branch on 11 November.
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
  long on main `1b9e4dd` as on this branch (20 to 26 seconds against 22 to 24
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
- The site is still not deployed, and no download exists.
