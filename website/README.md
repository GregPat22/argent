# Argent website

Draft landing page for Argent. It is not deployed. See
[the W0 spec](../docs/specs/0005-website-landing-draft.md) for its acceptance criteria.

This is a separate package from the engine. It shares no code or dependencies with
`src/`, and the root `npm run check` does not build it.

## Stack

| Layer      | Technology                                             |
| ---------- | ------------------------------------------------------ |
| Framework  | Next.js 16 (App Router, static prerender), React 19    |
| Styling    | Tailwind CSS 4, tokens in `src/app/globals.css`        |
| Motion     | Motion for React (`motion/react`), Lenis smooth scroll |
| Hero       | A WebGL2 fragment shader, no 3D library                |
| Typography | Bodoni Moda, Schibsted Grotesk, JetBrains Mono         |

## Running it

```sh
cd website
npm ci
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

## Notes

- Copy must match the repository. Figures quoted from M0 live in `src/lib/site.ts`.
  Planned capabilities carry a status tag. Never add invented download links.
- `prefers-reduced-motion` turns off smooth scrolling and ambient motion, and the
  hero renders a still frame. Without WebGL2, a static gradient replaces the hero.
- Motion+ is not installed. Its install URL embeds a personal token, and this
  repository is public. Add it only through a mechanism that keeps the token out
  of tracked files.
