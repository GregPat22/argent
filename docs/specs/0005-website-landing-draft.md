# W0: website landing page draft

Status: draft requested by the founder, 6 November 2026.

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
   and the macOS app as in development. Planned capabilities carry a visible status.
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
