# Argent website

Draft landing page for Argent. It is not deployed. See
[the W0 spec](../docs/specs/0005-website-landing-draft.md) for its acceptance criteria.

This is a separate package from the engine. It shares no code or dependencies with
`src/`, and the root `npm run check` does not build it.

## Stack

| Layer      | Technology                                                    |
| ---------- | ------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, static prerender), React 19           |
| Styling    | Tailwind CSS 4, tokens in `src/app/globals.css`               |
| Motion     | Motion for React (`motion/react`), native anchor scrolling    |
| Hero       | WebGL2 silver-loop sculpture, static CSS fallback             |
| Typography | Space Grotesk, Manrope, JetBrains Mono (Bodoni logo retained) |

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

## Notes

- Copy must match the repository. Figures quoted from M0 live in `src/lib/site.ts`.
  Planned capabilities carry a status tag. Never add invented download links.
- `prefers-reduced-motion` turns off smooth scrolling and ambient motion, and the
  hero renders a still frame. Without WebGL2, a static gradient replaces the hero.
- The sculpture is capped at 30fps with a bounded buffer, pauses offscreen and
  includes a pause button. Section signatures draw once as they enter view.
- Motion AI/Motion+ MCP tools were unavailable in this session. Ordinary animation
  uses the public Motion package. Do not add credentials or private install URLs.
- Playwright tests launch the built site on loopback port 3100 and cover keyboard
  navigation, responsive fit, reconnect, comparison, clipboard, reduced motion,
  pause and WebGL fallback. Run the build before the browser suite.
- Read the [full-page UX review](../docs/research/landing-ux-review.md) for findings,
  applied changes and the limits of this heuristic assessment.
