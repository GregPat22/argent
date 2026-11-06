# Argent website

Draft landing page for Argent. It is not deployed. See
[the W0 spec](../docs/specs/0005-website-landing-draft.md) for its acceptance criteria.

This is a separate package from the engine. It shares no code or dependencies with
`src/`, and the root `npm run check` does not build it.

## Stack

| Layer      | Technology                                                       |
| ---------- | ---------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, static prerender), React 19              |
| Styling    | Tailwind CSS 4, tokens in `src/app/globals.css`                  |
| Motion     | Motion for React (`motion/react`), native anchor scrolling       |
| Hero       | WebGL2 flowing silver sculpture, hover deformation, CSS fallback |
| Typography | Space Grotesk, Manrope, JetBrains Mono (Bodoni logo retained)    |

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
- `prefers-reduced-motion` turns off smooth scrolling and ambient motion, and the
  hero renders a still frame. Without WebGL2, a static CSS silver loop replaces the hero.
- The sculpture is capped at 30fps with a bounded buffer, pauses offscreen and
  includes a pause button. The atom animates depth-shaded electron orbits; the
  “conductor” word gets a silver sweep. Section signatures and reading-progress
  traces were removed per founder feedback.
- The initial visual pass used the public Motion package. Motion AI/Motion+ MCP
  registration for Codex was subsequently repaired and authenticated; real docs,
  premium source retrieval and spring generation were verified. See the
  [setup record](../docs/briefs/landing-page.md#verified-codex-setup). This is
  machine-local tooling; the runtime still uses public Motion. Do not add
  credentials or private install URLs.
- Playwright tests launch the built site on loopback port 3100 and cover keyboard
  navigation, responsive fit, reconnect, comparison, clipboard, reduced motion,
  pause, WebGL fallback, actual hover geometry, atom rendering and the three-stage
  workflow. Run the build before the browser suite.
- Read the [full-page UX review](../docs/research/landing-ux-review.md) for findings,
  applied changes and the limits of this heuristic assessment.

The [fluid-motion study](../docs/research/fluid-motion-refinement.md) records the
primary sources, live Motion/Motion+ guidance, rendering decisions and limits.
The atom and sculpture are stylized illustrations rather than physics solvers.
