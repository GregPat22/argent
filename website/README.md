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
  reduced motion and falls back without WebGL.
- **Reduced motion.** `src/lib/use-reduced-motion.ts` reads and listens on
  separate `MediaQueryList`s: Chromium drops a list's queued `change` event when
  `.matches` was read on that list first.
- **Silver atom.** A stylized shell illustration, not a quantum simulation. Its
  2/8/18/18/1 electrons match neutral silver
  ([NIST data](https://physics.nist.gov/PhysRefData/Handbook/Tables/silvertable1.htm)).
  It stops offscreen and renders a still frame under reduced motion.
- **Sections.** Below the hero: the conductor statement (with the atom), the
  journey (desktop → cloud → phone), how it works, proof (hallmarks), the
  open-source manifesto, the roadmap (the one place that lists what works today
  and what doesn't), the FAQ and the final call to action. The journey is taller
  than the viewport, pins its stage on wide screens and opts out of the entrance
  with `data-entrance-skip`; it owns its scroll-linked reveal. Looping
  decorations pause while their section is off screen
  (`src/components/section-activity.tsx`).
- **Conversion.** The page asks for one thing: star and watch the repository
  (Watch → Custom → Releases), with following on X as the secondary action. No
  email capture or backend.
- **Navigation.** The borderless navbar compacts after 120 px of scrolling to a
  single logo at the top left, which reopens the links; it expands again near the
  top (48 px). Focus follows the logo when scrolling hides a focused control.
- **Motion.** The runtime uses only the public `motion` package. Some CSS springs
  were generated with Motion's tooling; there is no private package, and no
  credentials or private install URLs belong in this repository.

## Tests

Playwright launches the built site on loopback port 3100. The suite covers
keyboard navigation, responsive fit, the scroll-linked journey, the comparison slider,
the clipboard, reduced motion, the atom and liquid rendering and fallbacks, the
how-it-works objects, the FAQ (including without JavaScript), the entrance states and
the scripts-blocked failsafe, and icon delivery. Use the `visit()` helper, which
waits for the entrance to settle, and build before running the suite.
