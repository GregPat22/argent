# Argent website

Draft landing page for Argent. It is not deployed. See
[the W0 spec](../docs/specs/0005-website-landing-draft.md) for its acceptance criteria.

This is a separate package from the engine. It shares no code or dependencies with
`src/`, and the root `npm run check` does not build it.

## Stack

| Layer      | Technology                                                              |
| ---------- | ----------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, static prerender), React 19                     |
| Styling    | Tailwind CSS 4, tokens in `src/app/globals.css`                         |
| Motion     | Motion for React (`motion/react`), native anchor scrolling              |
| Hero       | Static headline and actions; no hero canvas, shader or fallback artwork |
| Typography | Inter headings, Manrope body, JetBrains Mono code                       |
| Icon       | Founder-supplied official silver A, faithful web/favicon derivatives    |

## Running it

```sh
cd website
npm ci
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
npx playwright install chromium  # once per test environment
npm run test:e2e                 # production browser regression checks
```

The desktop package also keeps its static download preview at `website/index.html`
and `website/styles.css`. Root `npm run site:preview` serves those files on port
4320 after its local screenshot/archive prerequisites exist; Next.js does not
serve or overwrite them. Keep that preview separate from this landing package.

## Notes

- Copy must match the repository. Figures quoted from M0 live in `src/lib/site.ts`.
  Planned capabilities carry a status tag. Never add invented download links.
- The hero bubble renderer, shader, fallback artwork and pause controls have been
  deleted per W0.5. Its headline, official icon, liquid buttons and navbar remain.
- The larger silver atom uses a responsive 480px maximum with a matching DPR-aware
  buffer. It animates automatically, stops offscreen/when hidden and renders a
  still frame under reduced motion. There is no manual pause control. Its
  2/8/18/18/1 electrons match neutral Ag. Its scientific/stylized-model description
  is available to assistive technology; visible captions were removed in W0.6.
  The static SVG fallback also has 47 electron markers.
- The initial visual pass used the public Motion package. Motion AI/Motion+ MCP
  registration for Codex was subsequently repaired and authenticated; real docs,
  premium source retrieval and spring generation were verified. See the
  [setup record](../docs/briefs/landing-page.md#verified-codex-setup). This is
  machine-local tooling; the runtime still uses public Motion. Do not add
  credentials or private install URLs.
- The W0.3 pass adds section-aware navigation, a direct local-demo CTA and a
  native FAQ disclosure with Motion icon/content transitions. The FAQ still
  works without JavaScript; browsers with `interpolate-size` also animate its
  height with a Motion+ generated CSS spring. Reduced motion disables it.
  Shared magnetic links keep a fixed hit area and only move their contents.
- Playwright tests launch the built site on loopback port 3100 and cover keyboard
  navigation, responsive fit, reconnect, comparison, clipboard, reduced motion,
  atom rendering/fallback, workflow stages, FAQ behavior and no-JavaScript answers.
  They also verify that no WebGL context is requested, the hero has no rendering
  controls, the larger atom has no pause button, and icon/favicon delivery,
  logo-only scroll compaction, keyboard disclosure access, 48px targets,
  plain Inter headings, footer navigation and liquid hover feedback still work.
  Run the build before the browser suite.
- The official silver A is used in the navbar, illustrations and browser/touch
  icons. The footer uses the separately supplied wide silver wordmark. See [the brand asset record](public/brand/README.md). Shared
  `LiquidLink` actions and native controls retain their fixed hit areas and
  Motion+ generated hover spring. The
  [W0.4 Laws of UX rationale](../docs/research/landing-liquid-redesign.md) records
  that visual pass; W0.5 removes its hero animation and W0.6 replaces the
  metaphorical copy, typed footer branding and bordered navbar.
- The borderless navbar compacts after 120px of scrolling to one logo at the
  viewport top-left; click it to reopen the navigation. It expands again near the
  page top (48px threshold), with instant changes under reduced motion. The
  supplied footer artwork is a normal home anchor, and resource links remain
  separate, avoiding nested click targets.
- Read the [full-page UX review](../docs/research/landing-ux-review.md) for findings,
  applied changes and the limits of this heuristic assessment.

The [fluid-motion study](../docs/research/fluid-motion-refinement.md) records the
primary sources, live Motion/Motion+ guidance, rendering decisions and limits.
The atom is a stylized shell illustration rather than a quantum simulation.
Its configuration was checked against [NIST atomic data](https://physics.nist.gov/PhysRefData/Handbook/Tables/silvertable1.htm).
