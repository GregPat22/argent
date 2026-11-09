# Argent website

The Argent landing page. It is not deployed yet.

This package is separate from the engine: it shares no code or dependencies with
`src/`, and the root `npm run check` does not build it.

## Stack

| Layer      | Technology                                                       |
| ---------- | ---------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, static prerender), React 19              |
| Styling    | Tailwind CSS 4, tokens in `src/app/globals.css`                  |
| Motion     | Motion for React (`motion/react`), native anchor scrolling       |
| Hero       | Centered copy inside an interactive liquid-silver WebGL field    |
| Typography | Inter headings, Manrope body, JetBrains Mono code                |
| Brand      | The official silver A and wordmark; see `public/brand/README.md` |

## Running it

```sh
cd website
npm ci
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
npx playwright install chromium  # once per machine
npm run test:e2e                 # browser regression tests against the built site
```

The repository also keeps a static download preview in `website/index.html` and
`website/styles.css`. The root `npm run site:preview` serves it on port 4320 once
a local desktop package exists; Next.js neither serves nor overwrites those files.

## Copy rules

- The copy must match the repository. Say what works today and label everything
  else as planned; never add invented download links, metrics or integrations.
  Shared links and status labels live in `src/lib/site.ts`.
- When the roadmap or capabilities change, update the hero, the roadmap section
  and the FAQ together.

## Implementation notes

- **Entrance.** `src/components/entrance.tsx` and `src/lib/split-words.ts` run the
  first-load sequence: the header drops in, the headline rises word by word, the
  copy and actions follow, and the liquid forms last. Later sections reveal their
  headings on scroll. An inline script in `layout.tsx` sets
  `html[data-entrance="pending"]` before first paint, only when JavaScript runs
  and motion is allowed, with a 4 s failsafe. New sections are picked up
  automatically (`main > section`); mark a nested list with
  `data-reveal-children` to stagger its items. Don't add `whileInView` lifts to
  section content: the orchestrator owns them.
- **Liquid silver.** `src/components/liquid-silver.tsx` renders the hero field
  without a 3D library. Elements marked `data-liquid-avoid` are keep-out zones
  the metal never drifts behind. It pauses offscreen, holds a still frame under
  reduced motion and falls back without WebGL. A quality governor lowers the
  canvas resolution when frames run long, including runs of very long frames,
  and starts lower when the browser reports a software renderer
  (`data-renderer="software"`); if even the lowest resolution cannot animate, it
  holds a still frame (`data-resting`). Do not exempt slow frames from it again.
- **Headline.** Each hero line sits in a reveal mask. The gradient line paints
  only inside its own box, so both the mask and that box carry extra bottom
  padding (cancelled by a negative margin) to keep descenders whole.
- **Reduced motion.** `src/lib/use-reduced-motion.ts` reads and listens on
  separate `MediaQueryList`s: Chromium drops a list's queued `change` event when
  `.matches` was read on that list first.
- **Silver atom.** A stylized shell illustration, not a quantum simulation. Its
  2/8/18/18/1 electrons match neutral silver
  ([NIST data](https://physics.nist.gov/PhysRefData/Handbook/Tables/silvertable1.htm)).
  It stops offscreen and renders a still frame under reduced motion.
- **Sections.** Below the hero: the conductor statement (with the atom), the
  journey (desktop → cloud → phone), how it works, the agents, proof
  (hallmarks), the open-source manifesto, the roadmap (the one place that lists
  what works today and what doesn't), the FAQ, try it (`#run`) and the final
  call to action (`#join`).
- **Try it.** `#run` is where the hero's and the navigation's "try it" actions
  land. Two keyboard-operable tabs sit above one terminal: the desktop app
  (real Claude Code, from source) and the engine demo (simulated). Each tab
  lists what you need and copies its own commands. Keep the lines under the
  commands truthful: they describe the app's steps and its limits, not invented
  program output. The journey is taller
  than the viewport, pins its stage on wide screens and opts out of the entrance
  with `data-entrance-skip`; it owns its scroll-linked reveal. Looping
  decorations pause while their section is off screen
  (`src/components/section-activity.tsx`).
- **Conversion.** The hero offers the concrete action first (try it locally)
  with starring beside it. The page closes on its one request: star and watch
  the repository (Watch → Custom → Releases), with following on X as the
  secondary action. No email capture or backend. The drops in the closing band
  lean toward the pointer; they rest under reduced motion and on touch.
- **Navigation.** The borderless navbar compacts after 120 px of scrolling to a
  single logo at the top left, which reopens the links; it expands again near the
  top (48 px). Focus follows the logo when scrolling hides a focused control.
  Below about 1,416 px wide the compact logo floats over left-aligned copy, so
  it carries a feathered halo (a radial fade, not a panel or border).
- **Motion.** The runtime uses only the public `motion` package. Some CSS springs
  were generated with Motion's tooling; there is no private package, and no
  credentials or private install URLs belong in this repository.

## Tests

Playwright launches the built site on loopback port 3100. The suite covers
keyboard navigation, responsive fit, the scroll-linked journey, the comparison slider,
the try-it tabs and clipboard, reduced motion, the atom and liquid rendering,
fallbacks and software-renderer governor, the headline's descenders, the
how-it-works objects, the FAQ (including without JavaScript), the entrance states and
the scripts-blocked failsafe, and icon delivery. Use the `visit()` helper, which
waits for the entrance to settle, and build before running the suite.

## Navigation regression contract

The wordmark dock is 204×68 px when expanded and 68×68 px at top 12 px and
left 20 px when compact. These dimensions come from the design implemented in
main `241e6e6`; the earlier 64→48 px assertions described an obsolete icon-only
header. Tests require exact endpoints, an observed intermediate width, keyboard
focus continuity, deep links and live reduced-motion changes. Updating these
expectations must not remove those behavioral checks.

CI: the website job installs this package's lockfile and Chromium, then runs
typecheck, production build and the full browser suite. The separate desktop job
checks native and packaged smoke on macOS Apple Silicon. Neither job signs,
publishes or deploys artifacts. The first hosted run of the website job timed
out in the browser suite; the cause and fix are recorded in
[spec 0004](../docs/specs/0004-desktop-prototype.md#hosted-ci-evidence).

Navigation retains the full set of intersecting sections so
scrolling upward restores the preceding section even when the observer reports
only an exit. The compact menu also provides a Back to top link. The regression
suite checks this boundary reversal and seeks the actual CSS width transition to
its midpoint before checking the final compact geometry; it does not depend on
software rendering producing an intermediate frame inside a fixed time window.
