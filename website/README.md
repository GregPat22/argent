# Argent website

The Argent landing page at [argent.build](https://argent.build/). Public desktop
downloads are not available yet.

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
- A branch and worktree belong to a workspace; follow-up tasks reuse it. Local
  execution is not a sandbox. A finished local run is recorded, not tested.
- History export and read-only restore currently cover simulation history only.
  Export of real Claude Code transcripts and Git changes is planned.
- Planned verification examples carry an explicit label inside the card so a
  screenshot retains the limitation. Do not invent test totals or repair
  findings. See the [copy acceptance criteria](../docs/specs/0016-website-restyle.md#capability-copy-acceptance--12-november-2026).

## Implementation notes

- **Entrance.** `src/components/entrance.tsx` and `src/lib/split-words.ts` run the
  first-load sequence: the header drops in, the headline rises word by word, the
  copy and actions follow, and the liquid forms last. Later sections reveal their
  headings on scroll. An inline script in `layout.tsx` sets
  `html[data-entrance="pending"]` before first paint, only when JavaScript runs
  and motion is allowed, with a 4 s failsafe. New sections are picked up
  automatically (`main > section`); mark a nested list with
  `data-reveal-children` to stagger its items. Don't add `whileInView` lifts to
  section content: the orchestrator owns them. The
  [reveal layout correction](../docs/specs/0016-website-restyle.md#reveal-layout-regression-in-development)
  is in development: temporary line masks use a paint-only clip so restoring
  original text does not change heading height or shift neighboring content.
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
- **Sections.** Below the hero, proof leads and plans come last: the conductor
  statement (with the atom and the three problems, the unproven claim first),
  proof (the claim-versus-record slider, what is recorded today next to what is
  planned, and the four hallmarks), how it works, the agents, the open-source
  manifesto, the journey (desktop → remote workspace → phone), the roadmap
  (the one place that lists what works today and what doesn't), the FAQ, try
  it (`#run`) and the final call to action (`#join`). The navigation lists its
  links in the same order.
- **Proof.** The four hallmarks are plates of silver. The two the desktop app
  strikes today (maker's mark, date letter) land with a blow and a flash; the
  two that wait for checks (standard mark, assay mark) are blank plates with
  the mark only scribed. Keep them in step with the app's record
  ([spec 0015](../docs/specs/0015-desktop-restyle.md)). Each how-it-works step
  carries its own status for the same reason.
- **One metal.** Plates (`.silver-surface`) have a gradient edge instead of a
  flat hairline. Surfaces marked `data-light` receive the pointer's position
  from `src/components/pointer-light.tsx` (one listener, one write per frame,
  only with a fine pointer) and CSS draws an edge and face highlight from it.
  `--lx` and `--ly` are registered as non-inheriting and passed to the two
  light pseudo-elements only, so a pointer move never restyles a plate's
  content. Keep looping decoration on `transform` and `opacity`: the hero's
  live dot pulses a ring that scales and fades, not a shadow.
  The drops in the closing band and in the hero's no-WebGL fallback are stills
  rendered from the hero's own shader; see `public/liquid/README.md`.
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
- **Conversion.** The hero states the promise once, offers the concrete action
  first (try it locally) with starring beside it, and puts today's facts in a
  status line under the buttons. The action is named "Try it locally" wherever
  it appears, with a down arrow because it scrolls the page. Once the
  navigation is compact, a pill at the top right repeats it; the pill rests
  while the hero, `#run` or `#join` is on screen and while the menu is open.
  The page closes on its one request: star and watch the repository (Watch →
  Custom → Releases), with following on X as the secondary action. No email
  capture or backend. The drops in the closing band lean toward the pointer;
  they rest under reduced motion and on touch.
- **Navigation.** The borderless navbar compacts after 120 px of scrolling to a
  logo at the top left, which reopens the links, and the action pill at the top
  right; it expands again near the top (48 px). Focus follows the logo when
  scrolling hides a focused control. While compact, content fades out under a
  short gradient at the top of the page (no panel, border or blur), so it never
  collides with the logo or the pill; the logo keeps its feathered halo.
  The [reopen correction](../docs/specs/0016-website-restyle.md#navigation-reopen-regression-in-development)
  is in development: interactive links must retire immediately on close, with
  only the decorative scrim retaining its exit fade, so a rapid reopen cannot
  reuse an invisible list.
- **Journey on phones.** Below 900 px the stage sticks under the header while
  the three steps scroll beneath it, and the hand-off plays between the pin and
  its release. On wide screens the whole stage pins as before.
- **Motion.** The runtime uses only the public `motion` package. Some CSS springs
  were generated with Motion's tooling; there is no private package, and no
  credentials or private install URLs belong in this repository.

## Tests

Playwright launches the built site on loopback port 3100. The suite covers
the section order, the hero's promise and status line, the compact action pill,
the hallmarks and their statuses, the pointer light, the journey on phones,
keyboard navigation, responsive fit, the scroll-linked journey, the comparison slider,
the try-it tabs and clipboard, reduced motion, the atom and liquid rendering,
fallbacks and software-renderer governor, the headline's descenders, the
how-it-works objects, the FAQ (including without JavaScript), the entrance states and
the scripts-blocked failsafe, and icon delivery. Use the `visit()` helper, which
waits for the entrance to settle, and build before running the suite.

## Navigation regression contract

The wordmark dock is 204×68 px when expanded and 68×68 px at top 12 px and
left 20 px when compact. Compact navigation has exactly one button (the logo)
and one link (the action pill to `#run`). These dimensions come from the design implemented in
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

## Search and sharing

Search metadata is defined in `src/lib/site.ts`: the production URL is
`https://argent.build`, with one shared title and description. The home page
owns its canonical; new pages must supply their own. Keep schema in
`src/lib/seo.ts` aligned with visible capabilities. The technical SEO work is
specified in [spec 0017](../docs/specs/0017-website-seo.md) and integrated at
`864188a`. Check every production deployment independently.

The production build generates `/robots.txt`, `/sitemap.xml`, and a 1200 × 630
PNG at `/opengraph-image`. Next.js adds that image to both Open Graph and X
cards. No external image service, runtime package or account is required.
The navigation wordmark uses Next.js image optimization at its displayed size;
the source artwork is unchanged.

Production is indexable by default. Vercel preview/development builds emit
`noindex`, allow crawling so robots can read that directive, and omit sitemap
entries. For previews hosted elsewhere, set `ARGENT_SITE_NOINDEX=1` **before
building**. Rebuild when changing deployment environments; do not reuse a
production artifact for a publicly accessible staging host. Neither a robots
directive nor a canonical URL provides access control.

After publishing, check the canonical, crawl files, social image and 404 response
on the live domain. Validate JSON-LD, submit the sitemap in Search Console, and
inspect the home page once domain ownership is verified. Indexing, ranking and
field Core Web Vitals require live observations. The `www` hostname must use a
valid certificate and redirect to the apex domain while preserving paths and
query strings.

For a repository-root deployment on Vercel, select `website` as the Root
Directory, the Next.js framework preset and Node.js 22.x. Install with `npm ci`,
build with `npm run build`, and leave the output directory at the framework
default. The root package builds the desktop engine and is not the website build.
Publishing the static `website/index.html` preview does not publish the Next.js
site or its sharing metadata. Project configuration alone does not connect Git
or deploy future commits; verify the deployment source revision explicitly.
