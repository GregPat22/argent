# Argent development handoff

Audited 6 November 2026 for the founder's move to Conductor. This file records
the latest known state across the project chats and checkouts. Read it alongside
[START_HERE.md](START_HERE.md), [AGENTS.md](AGENTS.md) and the relevant specification.
Private chat access is not required to continue development.

## Where the work is saved

| Location                                             | State at this handoff                                                         | How to use it                                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `main`                                               | M0, P1 desktop prototype and initial landing integrated at `b5e763f`          | Starting point for new worktrees; PRs #1–#3 are merged.                                                   |
| `codex/desktop-handoff`                              | P1 source plus refresh fix `f929ae3` and edge-case tests `b888840`            | Historical desktop review source, integrated through [PR #1](https://github.com/GregPat22/argent/pull/1). |
| `codex/p1-original`                                  | Original completed P1 commit `a4f3d52`, preserved unchanged                   | Provenance/backup.                                                                                        |
| `GregPat22/argent-landing-page-draft` in Conductor   | Historical landing draft and W0.1/W0.2 refinements, integrated through PR #3  | Historical source; the landing is now in main and remains unpublished.                                    |
| `GregPat22/motion-landing-page-improve` in Conductor | W0.6 direct copy, supplied footer artwork and compact navigation on `b5e763f` | Current working branch; see the W0.6 update below for evidence and next steps.                            |

The desktop prototype is now part of main. Historical review records below retain
their original revision-specific evidence. The landing remains a separate
Next.js package alongside the desktop's static download preview in `website/`;
see the W0.6 update below for current checks and ownership. Do not
silently merge to main, deploy or publish a binary release.

## Product decisions already made

- **Name:** Argent, combining _argento_ (Italian for silver and a conductor) with
  _agent_. Other software uses Argent; the GitHub namespace is ours, but no domain
  registration or trademark clearance is established.
- **Primary experience:** visit a website, download/install the application and
  launch an installed desktop app, as with Conductor. A browser-only replacement
  does not satisfy the founder's requirement.
- **Execution:** a headless service owns work independently of the client.
  Persistent local and cloud environments are central. Desktop delivery does not
  make the developer's laptop the owner of remote execution.
- **Differentiator:** reliable, persistent, observable and controllable autonomous
  development with evidence, rather than simply more concurrent agent terminals.
- **Initial real-cloud MVP:** one GitHub repository, one isolated persistent
  workspace, one real agent, disconnect/reconnect, trusted exact-commit checks,
  independent review, bounded repair and an authorized draft PR.
- **Longer-term workflow:** specifications, task dependencies, isolated worktrees,
  additional agents and eligible follow-on work. A full IDE, swarms, billing,
  mobile apps and autonomous merging are outside the first MVP.
- **Open source:** independently usable local/self-hosted core and provider
  adapters. MIT is the selected license for the original code. Managed cloud
  execution, collaboration, enterprise capabilities and support are potential
  revenue sources; pricing and feature packaging are not approved.
- **Commercial tradeoff:** MIT allows commercial use by us and by others,
  including competing services and proprietary forks. Previously distributed
  versions remain available under their released terms. Future licensing changes
  require ownership and third-party/contribution review.

The original [founding brief](docs/FOUNDING_BRIEF.md),
[vision](VISION.md), [decision register](docs/DECISIONS.md) and
[project context](docs/PROJECT_CONTEXT.md) retain the broader reasoning. They are
linked from the [documentation index](docs/README.md).

## Completed work and actual evidence

### M0: durable local conformance

The main branch implements a loopback authenticated API, SQLite durable store,
independent worker, atomic claims, idempotent submission, fenced leases, ordered
events, cancellation, limits and independent JSON-artifact verification.
Expired/uncertain work blocks the workspace as `needs_attention` and is not
automatically repeated. The [M0 contract](docs/specs/0001-durable-local-run.md) and
[completion report](docs/milestones/0000-completion.md) record the behavior.

The main/context publication passed **22 tests**, strict type checks and
formatting, with GitHub CI also passing. Earlier review repaired lease validation
using a pre-lock timestamp and demo cleanup. Those are historical results for the
recorded revision, not certification of all future changes.

### P1: local desktop prototype

The local desktop prototype is complete on the review branch. It adds:

- Electron 45.2.3, sandboxed renderer, context isolation, a narrow validated IPC
  bridge and service credentials kept outside the renderer.
- A detached local service that survives desktop process exit, startup/ownership
  reconciliation, explicit stop/reconnect and persisted workspace/task selection.
- Keyset-paginated history, cancellation, retry-safe submission keys, error/offline
  states and audited abandonment of uncertain **simulated** runs.
- Inspection of real retained JSON artifacts against recorded SHA-256 evidence.
- macOS Apple Silicon packaging, a native smoke harness and static local
  download-page source with actual generated artifact links.

Fresh handoff verification on `22ef186`: `npm run check` passed **33 tests,
0 failures, 0 skips**, with strict type checks, formatting and compilation.
All **84 internal Markdown links** in that branch resolved. The public-source scan
found no live credential; its two findings were the example replacement token
and a synthetic URL validation fixture.

The implementation chat also recorded native packaged-app and detached-service
survival checks, archive checksum validation and local website/browser checks.
Those native/package checks were not repeated during this documentation handoff.
Read the pinned [P1 completion report](https://github.com/GregPat22/argent/blob/22ef186/docs/milestones/0001-completion.md),
[README](https://github.com/GregPat22/argent/blob/22ef186/README.md) and
[desktop acceptance spec](https://github.com/GregPat22/argent/blob/22ef186/docs/specs/0004-desktop-prototype.md).

**P1 still uses simulated execution.** Repository URLs are metadata. There is no
real repository checkout, agent/model call, cloud compute, GitHub authorization
or product-generated tested PR. The prototype requires its local Mac to remain
awake. Its passing tests are tests of Argent's simulator/control-plane code.

### Pinned upstream source evaluation

The [T3 source spike](https://github.com/GregPat22/argent/blob/22ef186/docs/research/t3-adoption-spike.md)
examines `pingdotgg/t3code` at
`6577c6b6185167c0e502fa01f9e8e8f2dee6ff25`. It records useful durable machinery
and coupling, including different retry, retention and SQLite durability policy.
No upstream code was installed, executed, forked or imported. Runtime conformance
and founder approval are still required before foundation replacement.

## Architecture and boundaries to preserve

Keep API, durable store, worker and provider adapters distinct in one package
until real deployment or ownership warrants a split. State transitions and their
events commit together; work is claimed atomically. Client reconnect reads state
and never replays an uncertain external side effect.

SQLite is for one trusted local host on local storage. PostgreSQL is required
before multiple control-plane hosts or managed tenancy. P1's detached local
service cohosts API and the bounded worker loop; the standalone API/worker mode
remains available. Neither arrangement establishes laptop-independent cloud work.

Keep workspace files, process/memory state, execution history and agent session
references distinct. A provider/session ID alone is not durable recovery state.
Suspend only after quiescence acknowledgment. Reconcile unknown external outcomes
before retrying a provider action, agent turn, Git push or PR request.

Agent statements and generated code are untrusted. Real verification must use
trusted policy, independently inspect the diff and test the exact proposed SHA.
Review changes to tests/policy themselves. The MVP repair budget is finite and
initially at most one repair attempt; merging requires a separate human decision.

The local JSON adapter is not an untrusted-code sandbox. Do not run arbitrary
repository code on the control-plane host, share host credentials with agents or
expose the local API beyond loopback. Real adapters need isolation, scoped
short-lived credentials, controlled egress and enforced resource/budget limits.
Do not reuse extracted consumer subscription credentials in hosted agents.

## Conductor and website coordination

Continue development in Conductor. Its base checkout was repaired from an
unrelated empty initial commit to the published main history. The empty commit
is retained on a local backup ref. Existing worktrees do not automatically update
when GitHub receives new commits: fetch and inspect the base before starting work,
and preserve local modifications when bringing an existing branch up to date.

New general worktrees should start from current `origin/main`. Desktop work that
depends on P1 should use `origin/codex/desktop-handoff` until PR #1 is integrated.
Do not base new work on the provenance branch or the old empty commit.

There are two website sources to coordinate: P1's static local download source
(`website/index.html`, `website/styles.css`, `site:preview`) and the active
Conductor Next.js landing design in `website/`. Neither is an approved deployed
site. Keep root engine checks intact and website dependencies isolated. Reconcile
the directory/preview ownership before merging both efforts, preserving real
download availability and the active landing agent's work.

Use [the landing-page brief](docs/briefs/landing-page.md) for product copy,
animation requirements and claim boundaries. It requests an impactful animated,
interactive draft. Final logo, palette, typography, language, CTA destination,
3D intensity, pricing and customer proof are not approved here. No customer
numbers, logos, testimonials or public download links may be fabricated.

The active Conductor spec `0005-website-landing-draft.md` was written against M0
and still calls the macOS app in development. That predates the P1 completion:
update its status/copy to reflect the completed local prototype on the review
branch, while keeping public distribution and real integrations unfinished.

## Motion tooling and machine-local state

The obsolete global Claude Motion stdio server using a `TOKEN` environment
variable was migrated through the official `npx motion-ai@latest --plus`
installer to hosted `motion` and `motion-plus` servers. The Motion skill was
updated and unrelated MCP servers were preserved. A private configuration backup
was kept outside the repository; no token was copied into source or dependencies.

The running agent may need to reload its MCP connections and sign in to
`motion-plus`. Sign-in and global agent settings are machine-local, not carried
by Git worktrees. Direct unauthenticated verification from this assistant's HTTP
client was blocked by Motion's Cloudflare browser-signature rule; live Conductor
tool calls were not verified by this audit. Do not equate that probe with a
product-context failure or claim premium tools worked without testing them.
Current setup references are in the landing brief; free Motion/docs can support
independent work while an optional tool is unavailable.

Never commit account configuration, a private install token, token-bearing
tarball URLs or private transcripts. Authentication is not a reason to make the
source repository private merely to hide a credential in a lockfile.

## Artifacts, reproducibility and remaining work

Development uses Node 22.19.0 and npm 10.9.3. Read the review branch README for
`npm run desktop`, `desktop:smoke`, `desktop:package` and `site:preview`.
The original local artifacts include `release/Argent-darwin-arm64/Argent.app`,
`release/Argent-0.0.1-macos-arm64.zip`, its `.sha256` file and
`.data/screenshots/argent-desktop.png`. Generated builds, screenshots, databases,
application profiles, dependencies and `.env` files are intentionally not Git
source and are not a public release. Rebuild them from the recorded source when
needed. Desktop application data lives in its local app-support profile;
`ARGENT_DESKTOP_DATA_DIR` selects an isolated test profile.

Next actions, in order:

1. Review the updated [draft PR #1](https://github.com/GregPat22/argent/pull/1),
   including refresh fix `f929ae3` and edge-case tests `b888840`, then obtain
   the explicit founder merge decision. Main remains M0 until that decision.
2. Continue the landing draft with the founder's unresolved design/CTA answers;
   reconcile the shared website directory and record completed work in Git.
3. Decide whether to run an isolated, pinned T3 runtime conformance spike before
   expanding the core. No fork or replacement without founder approval.
4. Specify GitHub App scopes and cloud workspace lifecycle/cleanup contracts,
   then pursue M1a persistent isolated workspaces and official agent integration.
5. Complete trusted exact-commit checks, independent review, draft-PR broker,
   PostgreSQL, remote user authorization, credential broker, budgets/quotas,
   audited resolution/cleanup and backup/restore evidence before a managed release.
6. Address Developer ID signing/notarization, update verification, other platforms
   and actual versioned public downloads before distributing a public installer.

No billable resources, domain purchase, cloud deployment, upstream adoption,
production service or binary release has been authorized by this handoff.

### PR #1 review follow-up, 6 November 2026

On `GregPat22/next-step`, based on main `a5a96cb`, reviewed desktop PR head
`6104961056d1123988a1fe6e2d76fcb3ed53897b` without integrating it. Fresh checks
passed all 33 tests, strict types and formatting. Development Electron smoke
passed, including detached-service survival after app exit. Packaged-executable
and archive checks were not repeated. A controlled compiled-renderer reproduction
confirmed that selected workspaces outside the newest 50 retain stale lifecycle
state after changes from another client. The review report records exact evidence,
dependency audit signals and remaining limits; desktop criterion 6 now captures
the missing refresh regression. Fix that issue before requesting integration.
No PR review comment was posted, branch renamed, merge performed or release made.
The main-based documentation branch passed `npm run check` with 22 tests;
all 34 relative links in the four changed documents resolve and diff whitespace
checks passed. The review finding is documented, not fixed in this branch.

### Selected-workspace refresh fix, 6 November 2026

On `GregPat22/next-step-request`, fix commit `f929ae3` is based on desktop
review head `6104961`, with main's review documentation replayed as `7aad6f1`.
The placeholder branch name was preserved. This workspace now contains P1; main
and PR #1 were not changed. Use this branch for review of the fix rather than
assuming the unchanged PR head includes it.

The renderer now reads the selected (or remembered) workspace on every refresh
when it is absent from the fresh first page. Retained history is not used as
proof of freshness. Existing epoch checks discard responses after selection
changes, and missing saved selections still fall back only after a 404.

The compiled-renderer regression first failed against the unmodified source
(four failures, one passing first-page control); all five cases pass with the fix.
Coverage includes external stop/start for restored and paged selections,
disconnect/reconnect, read failure/recovery, avoiding redundant first-page reads,
and a selection change during an outstanding read. These use a controlled bridge
and minimal DOM, not a live second desktop client.

Fresh `npm run check` at `f929ae3` passed strict types, formatting and **38 tests,
0 failures, 0 skips**. Native development smoke evidence is recorded in the
[review follow-up](docs/research/p1-pr-review.md#fix-verification-follow-up).
Packaged-executable/archive checks were not repeated. The existing install audit
still reports five moderate development packaging entries; dependencies were not
changed. All product execution remains simulation.

Next: carry these commits into the desktop review branch through an explicitly
reviewed integration, then obtain the founder's merge decision. Reconcile the
separate landing-page ownership before integrating both website sources. No
remote push, PR update, main merge, deployment or release was performed here.
Local reproducible logs are `.context/refresh-check.log` and
`.context/refresh-desktop-smoke.log`; generated data is not tracked evidence.

### Desktop PR update, 6 November 2026

Prepared on `GregPat22/next-step-request` for the existing draft PR #1 head
`codex/desktop-handoff`, without renaming the workspace branch. Main `9763f3a`
was merged into this continuation at `556584d`; documentation conflicts retained
the completed fix and evidence. Runtime fix `f929ae3` is unchanged. Test commit
`b888840` adds saved-selection 404 fallback, selected-workspace 404 reporting and
late rejected-read coverage; the renderer harness now has eight tests.

Independent read-only reviews found no correctness/security issues in the fix or
additional tests; the focused renderer suite passed 8/8. Fresh `npm run check`
at `b888840` passed strict types, formatting, compilation and **41 tests,
0 failures, 0 skips**. A local macOS Apple Silicon package was rebuilt from the
same runtime source; its packaged executable passed `desktop:smoke`, including
renderer isolation, cancellation, close/reopen, stop/reconnect and service survival
after application exit. The archive checksum validated with `shasum -a 256 -c`:
`8a42f54f40c7c150af303fa5752e4a6a60bb058dab04809137605f3606104e60`.
The smoke harness cleaned its temporary profile and owned service.

This supersedes the earlier package-check gap for this runtime. The package
remains an unsigned, unnotarized local simulation preview; nothing was uploaded
as a binary release. The specific external-client regression uses a controlled
bridge/minimal DOM. Five moderate packaging dependency audit entries remain;
no dependencies changed. Logs are ignored local files in `.context/` named
`pr1-update-check.log`, `pr1-package.log` and `pr1-packaged-smoke.log`.

Publication target: fast-forward the existing desktop PR branch, preserve its
draft status and replace its stale validation summary. No main merge, deployment,
release or billable provisioning is authorized. The founder's explicit decision
on PR #1 is next. Coordinate the separate landing branch before integrating its
website; this update does not touch that workspace or its files.

## Keep the context complete

This audit reconciled the original brief, subsequent desktop clarification,
both project chats, the completed local source and reports, the published context,
and Conductor's actual base/landing worktrees. It captures project knowledge and
source locations; it intentionally excludes unrelated chat history, credentials,
machine-specific authentication and generated runtime data.

Before completing each substantial task, update the relevant spec, decision,
milestone report and this handoff when status changes. Record branch/commit,
acceptance evidence, limitations and unresolved decisions. Run `npm run check`,
review the actual diff, and commit/push the intended work. Do not rely on a
private chat, ignored `context-log.md` or a session ID as the sole project memory.
Do not commit another active agent's unreviewed files. If sources disagree,
inspect the checkout and evidence and correct the documentation explicitly.

## W0.1 landing refinement — 6 November 2026

Branch: `GregPat22/argent-landing-page-draft`, based on landing commit `c70cb4c`.
A fresh fetch found `origin/main` at `a5a96cb`, with no main-only commits ahead
of this branch and one landing commit outside main before this refinement. The
initial working tree was clean. The landing source was committed/pushed on its
branch; it was not integrated into main. P1 remains on its separate desktop
review branch. No merge, deployment or public installer was performed.

The founder approved the Ag logo and overall silver concept, then requested a
better graphic, new typography, a complete Laws of UX agent audit and premium
animation throughout. The refinement preserves the Ag mark and serif wordmark,
uses Space Grotesk/Manrope elsewhere, replaces droplets with a connected silver
loop sculpture, adds “Argent is a good conductor” as the second heading, and
shares silver orbit/trace/seal details across sections and roadmap.

The UX audit and second independent diff review prompted mobile navigation,
44px targets, readable workflow copy, shorter pacing, explicit simulated-evidence
labels and corrected P1/planned-cloud claims. Native anchor scrolling replaces
Lenis, avoiding a motion-preference change remounting the page. The hero has a
30fps cap, bounded buffer, pause/resume, offscreen/hidden suspension, a static
reduced-motion frame and CSS fallback. Motion AI/Motion+ tools were not exposed;
no premium source, private dependency or credential was used.

Evidence: website typecheck and production build passed; **8 Playwright browser
tests passed** against that production build, covering desktop/mobile/tablet,
keyboard, reconnect, slider bounds, reduced motion, actual pause/resume rendering,
fallback and copy feedback. Root `npm run check` passed **22 tests**, typechecking
and formatting. `.context/` is excluded from formatting so ignored workspace
attachments/tools do not break source checks. Screenshots remain locally in
`.context/refinement/`. The [W0.1 spec](docs/specs/0005-website-landing-draft.md)
and [UX review](docs/research/landing-ux-review.md) record details and limits.

Next: founder visual feedback; optional Safari/real-device GPU checks; explicit
review and integration of the landing and desktop branches, reconciling their
shared `website/` ownership. Neither the typography proposal nor the passing
browser suite establishes a public release or validated conversion improvement.

## Motion AI/Motion+ Codex recovery — 6 November 2026

Branch: `GregPat22/argent-landing-page-draft`, following `012e45c`. The founder
requested autonomous investigation and setup after the visual pass reported
unavailable Motion tools. Root cause: the earlier installer had configured the
hosted servers in Claude Code's machine-local settings, while this workspace's
agent was Codex. Codex's machine-local configuration contained only its existing
node/computer tools, with neither Motion server registered.

Both hosted servers were added using the installed Codex CLI and authenticated
through their supported browser OAuth flow. An existing Motion+ account was
already available; no purchase, credential extraction or private package install
was required. Other MCP servers were preserved, and a private configuration
backup was saved outside the repository. Credentials remain in Codex's managed
authentication storage, not in repository files.

Verified using Codex's own app-server MCP client, without an inference/agent turn:

- Both servers report enabled and authenticated; tool discovery succeeds.
- `motion/search-motion-docs` returns real scroll/reveal matches, and
  `motion://docs/react/react-scroll-animations` reads successfully.
- `motion-plus/generate-css-easing` generates a 0.4s perceptual spring curve.
- `motion-plus/search-motion-source` returns premium source links, and
  `motion://examples/react/footer-reveal` reads the complete premium source.

The already-running chat's native tool catalogue did not hot-reload. A direct
connection through the official Codex app-server successfully exercised the
servers in the same session; later Codex sessions can load the registered
servers normally. Helpers/results are local ignored evidence in `.context/`.
The earlier statements about unavailable tools describe the visual pass, not
the current machine configuration. The website still uses the public Motion
runtime; MCP access and a premium runtime dependency are separate. No premium
example source was copied into the public repository. The site remains available
on loopback port 3000.

Acceptance: configured, OAuth authenticated, tools discovered and real free/paid
requests plus resource reads verified. Root `npm run check` passed 22 tests,
strict types and formatting for this documentation update. No site behavior,
engine, merge, deployment or spending changed.

## W0.2 simplification and fluid interaction — 6 November 2026

Branch: `GregPat22/argent-landing-page-draft`, following `1ec78e3`. Founder
feedback removed the W0.1 signature system: numbered labels, small icons and
section divider lines. Navbar/roadmap reading-progress traces and the long
workflow's left rail are also removed. Approved logo and meaningful headings
remain. The long seven-step scroll becomes three keyboard-selectable stages
(define, bounded execution, evidence/human decision) with adjacent illustration
labels and all original execution/verification authority boundaries retained.

The hero now uses a varying-thickness implicit silver loop with smoothly joined
volumes, studio reflections and an actual spring-following surface lobe under
hover. Pointer exit restores its rest geometry. “Conductor” gets a readable
silver sweep on arrival/hover. The atom renders 47 depth-shaded electrons across
five stylized shells, with trails, pause/resume, offscreen/hidden suspension,
reduced-motion still frame and SVG fallback. The atom is a visual metaphor, not
a quantum simulation. No new runtime dependency was added.

Research included primary creator/graphics sources and live authenticated Motion
AI/Motion+ documentation and example reads. Premium reference source remains
outside the public tree; a Motion+ generated CSS spring is used for workflow
hover. See [the study](docs/research/fluid-motion-refinement.md) and
[W0.2 spec/evidence](docs/specs/0005-website-landing-draft.md).

Website production build and strict types passed; **12 production browser tests
passed**. Hover is verified against rendered pixel area with ambient time held
constant. Atom tests compare actual frames, pause/resume, offscreen stop and
live reduced-motion changes. The latter caught Motion 14.10's snapshot-only
hook, now handled by a shared reactive media-query subscription. Root
`npm run check` passed **22 tests**, strict types and formatting. The actual
diff and production desktop/mobile screenshots in `.context/w02/` were reviewed.
The production preview on **localhost:3000** was restarted with the verified build.

Next: founder visual feedback, then optional real-device/Safari GPU evaluation.
The website/desktop branches still need explicit integration review; no main
merge, deployment or public download was performed. Engine and desktop packaging
are unchanged. `.context/` contains only local research/browser evidence and
helpers; it is not the sole durable handoff.

## Landing PR preparation — 6 November 2026

Branch: `GregPat22/argent-landing-page-draft`. Fetched main at `fd60a5a` and
integrated it into this feature branch in `e3e82f9`; main itself was not changed.
Resolved the handoff/index conflicts by preserving desktop and landing evidence.
Updated the current status references and roadmap copy because P1 is now on
main. Root `npm run site:preview` still serves the static desktop download page
on port 4320, with its existing local screenshot/archive prerequisites. The
separate Next.js package serves the landing on port 3000; neither entry point
imports or overwrites the other. No engine or packaging diff remains against main.

Independent actual-diff/coverage review found an arrival-animation race in the
comparison slider: early keyboard or pointer input could be overwritten by its
delayed spring. The hint now stops permanently on user input and cleans up on
preference changes/unmount. Acceptance: immediate keyboard and pointer selections
survive the hint's full duration and subsequent reduced-motion changes. Two new
normal-motion browser regressions cover this, and the focused fix was independently
reviewed with no remaining findings.

Fresh checks on the integrated tree: root `npm run check` passed **41 tests**,
strict types and formatting; website strict typecheck and production build passed;
**14 production Playwright tests passed (38.2s)**. Credential-pattern scanning and
`git diff --check` passed. The full PR diff was reviewed against `origin/main`.
Website checks are local evidence; the existing GitHub workflow runs root checks
only. Native Electron smoke/package/download streaming was not rerun: generated
screenshot/archive prerequisites are absent in this workspace. Their source is
unchanged from main. Safari and real-device GPU validation remain open.

Next: review the landing PR and founder visuals, then make an explicit integration
decision. This task authorizes branch push and PR creation, not a main merge,
website deployment or binary release. The package remains version `0.0.1`, matching
the repository's existing prelaunch convention.

## W0.3 landing refinement — 6 November 2026

Current branch: `GregPat22/motion-landing-page-improve`, based on main `b5e763f`
(the initial landing was merged through PR #3). The founder requested stronger
hero impact, whole-page polish and clearer next steps. Work remains local and
uncommitted on the original branch; no branch rename, push, PR, merge or
deployment was performed.

The hero has tighter copy, silver proof emphasis, mobile actions on one row and
an adjacent simulation/release qualifier. Its primary CTA opens the reconnect
illustration; GitHub is secondary. Tablet keeps the stacked composition through
1023px. Shader placement, pointer mapping and CSS fallback follow that breakpoint
instead of inferring layout from canvas aspect ratio. Shared CTA contents follow
the pointer gently while hit areas stay fixed, with live reduced-motion handling.
Headings use balanced wrapping. Navigation identifies the current section and
adds FAQ and a real local-demo entry point. A native five-question FAQ clarifies
prototype availability, local/remote execution, agent plans, verification and
human authority; it works without JavaScript.

Live Motion AI documentation and Motion+ source/easing tools were exercised.
Premium accordion source was evaluated, not copied. An original native disclosure
uses generated spring data with feature detection; Motion drives the small icon
and content transforms. No dependencies, private package URLs or credentials were
added. Existing engine and desktop/static-download source are unchanged.

Fresh evidence: website strict types and optimized build passed; **21 production
Playwright tests passed (1.1m)**. New checks cover mobile first-screen fit and CTA
destinations, section navigation, FAQ keyboard/rapid/reduced-motion/no-JavaScript
behavior, fixed magnetic hit areas and framebuffer-centroid placement across
resizing. Root `npm run check` passed **41 tests**, strict types and formatting.
Actual source/test diff and changed Markdown links were reviewed. Screenshots are
in `.context/landing-pass/`; the production preview for this workspace is
`http://127.0.0.1:3200`. Port 3000 was already occupied and was left untouched.

Limits: Chromium uses SwiftShader; Safari and real-device GPU checks remain open.
The visuals are a heuristic refinement, not measured conversion improvement.
Native desktop smoke/packaging and static archive streaming were not rerun.
Next: founder visual feedback on this concrete pass, optional device/Safari QA,
then separately authorized PR/release work. Product execution remains simulated;
real agents, cloud workspaces and public downloads remain planned.

## W0.4 official icon and liquid redesign — 6 November 2026

Branch: `GregPat22/motion-landing-page-improve`, continuing the local W0.3 changes
on `b5e763f`. The founder requested a completely new silver shape/animation,
shorter conversion copy, fluid Argent buttons and a properly restyled navbar,
always following Laws of UX. The supplied silver A is now the official icon,
superseding the Ag tile for branding. Source/provenance and faithful derivatives
are in `website/public/brand/`; all website marks and browser/touch icons use it.
Native desktop packaging/icons remain a separate follow-up.

The hero now says “Delegate work. Keep control.” and shows five rounded silver
volumes with coordinated drift, broad reflective ribbons and spring pointer
response. Pause, offscreen/hidden suspension, a bounded 30fps renderer, live
reduced motion and a five-globule fallback are retained. Hero copy stays readable
without scroll fades or delayed text entrances. The navbar is a persistent,
floating glass surface with four choices, an official-icon home link, a shared
selection surface and a native keyboard/Escape mobile disclosure. Primary and
secondary actions and native controls share a liquid silver treatment with fixed
targets; workflow tabs are also stationary. The mobile pause button is compact
so it leaves the artwork visible. Simulation/release boundaries remain adjacent.

Live Motion AI and Motion+ searches/resource reads and spring generation worked.
Premium magnetic-pull reference source was evaluated, not copied. Runtime remains
public Motion; no dependency or credential changes. The
[Laws of UX rationale](docs/research/landing-liquid-redesign.md),
[acceptance/evidence](docs/specs/0005-website-landing-draft.md) and
[official asset record](website/public/brand/README.md) preserve the decisions.

Verification: website strict types and optimized build passed; **26 production
browser tests passed (1.5m)**. New checks cover icon/favicon delivery, headline,
persistent navigation/48px targets, liquid hover/fixed bounds, actual bubble
center fill, five rounded fallback globules, offscreen suspension/resume and
bounded buffers. Root `npm run check` passed **41 tests**, types and formatting.
Actual source/test diff and changed Markdown links were reviewed. Production
localhost preview is running at `http://127.0.0.1:3200`; screenshots are under
`.context/liquid-redesign/`. Earlier W0.3 evidence is historical, not the current
hero design.

Limits: Chromium uses SwiftShader; Safari/real-device GPU testing remains open.
Copy and UX choices are not measured conversion-rate improvements. Native
desktop smoke/packaging and static archive streaming were not rerun. Work remains
local and uncommitted on the unchanged branch; no push/PR, merge, deployment or
paid provisioning. Next: founder visual feedback, optional Safari/device checks,
then separately authorized release work.

## W0.5 hero removal and atom follow-up — 6 November 2026

On unchanged branch `GregPat22/motion-landing-page-improve` (base `b5e763f`),
the founder requested removal of the hero animation from code, then removal of
the atom's pause control, a larger atom and a check of its scientific model.

Deleted `website/src/components/mercury.tsx`, its hero mounting/state/pause UI,
shader and CSS fallback/artwork styles. Mobile hero spacing no longer reserves
room for artwork. The official icon, headline, liquid buttons and floating
navigation remain. No hidden renderer or replacement still artwork was added.

The atom's pause UI/state is removed. It now reaches 480px on desktop (previously
320px), with more grid space, a larger central mark and a DPR-aware drawing
buffer. Automatic hidden/offscreen suspension and reactive reduced-motion still
rendering remain. Its 47-electron shell population 2/8/18/18/1 agrees with neutral
Ag's NIST configuration [Kr] 4d¹⁰ 5s¹. The visible/accessible labels identify the
depth projection as an illustrative shell model, not physical electron orbits or
a quantum visualization. Static SVG fallback now includes all 47 electron marks.
Primary sources and the exact distinction are recorded in
[the decision register](docs/DECISIONS.md) and
[W0.5 specification/evidence](docs/specs/0005-website-landing-draft.md).

Checks: website strict types/build passed; **22 production browser tests passed
(41.1s)**, including zero WebGL requests, no hero art/control, no atom pause UI,
larger actual atom dimensions, moving/static/offscreen frame evidence and 47
fallback markers. All applicable navigation, mobile, FAQ, slider, clipboard and
button checks remain. Root `npm run check` passed **41 tests**, types and
formatting. Actual diff, dead-reference scan and Markdown links were reviewed.
Preview remains `http://127.0.0.1:3200`; screenshots are in `.context/hero-removal/`.

Limits: this is an illustrative shell model. Safari/real-device canvas performance
and native desktop packaging were not tested. Changes remain local/uncommitted;
no branch rename, publication, merge, deployment or provisioning. Next: founder
visual feedback; prior W0.4 artwork evidence is historical.

## W0.6 direct copy, footer artwork and compact navigation — 6 November 2026

Branch: `GregPat22/motion-landing-page-improve`, continuing local W0.3–W0.5 work on
`b5e763f`. Founder requested removal of atom captions, explicit product paragraphs
with fewer silver metaphors, the supplied wide footer image, simpler borderless
navigation that compacts to its logo on scroll, and plain heading typography.

Inter replaces Space Grotesk on all h1/h2/h3 elements; unused Bodoni and typed
wordmark styling are removed. Hero/statement/verification copy explains coding
tasks, limits, review and merge authority directly, with current simulation and
planned integration boundaries nearby. Visible atom captions are removed; the
accurate scientific/stylized-model accessible description remains. The larger
automatic atom and absent hero renderer are preserved.

The supplied wide silver ARGENT image is retained byte for byte, with faithful
800/1600px WebP derivatives and recorded provenance in
[the brand asset record](website/public/brand/README.md). It replaces the typed
footer wordmark and is a large link back to the page top. Real resource links
remain independent; there is no name-origin paragraph or nested-anchor wrapper.

Navbar border and typed Argent name are removed. Beyond 120px of scrolling, the
navigation springs into a single 48px logo at viewport x=20/y=16; it expands again
below 48px. The compact logo opens a disclosure containing navigation, home and
local-demo links. Hidden expanded controls are inert; Escape restores focus,
deep links initialize correctly and reduced motion is instantaneous. Live Motion
scroll guidance and the previously read fixed-layout-root guidance informed the
original implementation; no premium source or runtime dependency was added.

Evidence: website strict types and production build passed; **25 production
browser tests passed**, including actual fonts, copy/caption changes, footer
artwork/home action, compact bounds and keyboard access, deep links, reverse
scroll and live reduced motion. Intermediate logo widths are sampled to verify
real normal-motion compaction. Root `npm run check` passed **41 tests**, types and
formatting. Actual source/test diff, dead font/metaphor references and changed
Markdown links were reviewed. Desktop/mobile/top/compact/footer screenshots are
in `.context/plain-redesign/`. Production preview is `http://127.0.0.1:3200`.

Limits: Chromium/heuristic review; no measured conversion lift, Safari or
real-device performance evidence. Native packaging was not rerun. Original
branch name and local uncommitted work are preserved; no push/PR, merge,
deployment or provisioning. Next: founder visual feedback on the concrete pass.
