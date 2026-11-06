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
   and the local macOS prototype as complete on its review branch, using simulated
   execution. Public downloads and real cloud/agent capabilities remain planned.
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

## W0.1: founder visual refinement (6 November 2026)

Branch: `GregPat22/argent-landing-page-draft`. Preserve the approved Ag logo,
silver palette and general concept. Acceptance criteria for this revision:

- Replace the display/body typography throughout, preserving the logo artwork.
- Improve the interactive silver hero sculpture; provide a recognisable static
  fallback and stop decorative rendering offscreen or under reduced motion.
- Use “Argent is a good conductor” as the second heading, followed by concrete
  product meaning. Give every section a related silver/conductivity motif and
  deliberate Motion entrance/progress treatment, including the roadmap.
- Address the full-page Laws of UX audit: mobile navigation with keyboard and
  Escape support, readable copy, shorter workflow pacing, 44px targets, adjacent
  illustration labels and explicit prototype/planned-cloud boundaries.
- Verify desktop, 360px mobile, keyboard controls, reduced motion, WebGL fallback,
  clipboard feedback and full terminal output. Run website typecheck/build and
  root `npm run check`; review the actual diff and record evidence below.
- Do not merge, deploy or add private runtime packages/credentials. Record the
  fetched main/branch comparison accurately; a clean branch is not a main merge.

### W0.1 verification evidence

- Website strict typecheck and optimized production build passed.
- Eight Playwright browser tests passed against the production build (30.2s):
  all eight section headings and clean hydration; 360px mobile keyboard menu;
  360/768px section fit and complete evidence panel; keyboard slider endpoints;
  simulated reconnect and worker-loss blocking; reduced-motion static rendering;
  actual pause/resume drawing plus WebGL fallback; clipboard success/failure
  and scrollable terminal output. Desktop coverage uses 1440 × 900.
- Root `npm run check` passed all 22 M0 tests, typechecking and formatting.
  `.context/` is excluded from formatting because it contains ignored workspace
  attachments, snapshots and ad hoc tools, rather than maintained source.
- An independent Laws of UX agent audited the entire route and reviewed the
  actual implementation diff. Findings and changes are in
  [the UX report](../research/landing-ux-review.md). The implementing agent also
  reviewed the actual diff and ran `git diff --check`.
- Production screenshots are local evidence under `.context/refinement/`,
  including desktop hero/statement/roadmap and mobile hero/evidence. They are
  intentionally ignored by Git. Browser screenshots use Chromium/SwiftShader;
  real-device GPU performance and Safari have not been measured.

Initial browser failures exposed a real tablet artwork overflow, a reduced-motion
conditional-markup hydration mismatch and an unstable test locator. Those were
fixed before the complete eight-test pass. Initial engine formatting checks also
found ignored `.context` files; the maintained-source ignore boundary fixes that.
Motion AI/Motion+ tools were unavailable in this session; public Motion was used.
Main remained at `a5a96cb` when fetched: the preceding landing commit `c70cb4c`
is on the landing branch only. The separate desktop review branch also remains
unmerged. This refinement neither merges nor deploys either branch.
