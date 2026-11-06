# Argent development handoff

Audited 6 November 2026 for the founder's move to Conductor. This file records
the latest known state across the project chats and checkouts. Read it alongside
[START_HERE.md](START_HERE.md), [AGENTS.md](AGENTS.md) and the relevant specification.
Private chat access is not required to continue development.

**Current checkout correction, 6 November:**
`GregPat22/grok-conductor-shutdown-analysis` starts at
`fd60a5a878fdde3f129c0f276b74b647ea373760`, also the observed `origin/main`.
That commit integrates desktop PR #1, including the selected-workspace refresh
fix and tests. Older statements below that main is M0 and PR #1 awaits merge
are historical and superseded for this checkout. P1 remains simulation; no real
cloud execution or public signed release follows from that merge.

## Where the work is saved

| Location                                      | Current known state                                                                       | How to use it                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `origin/main` at `fd60a5a`                    | M0 plus the merged P1 desktop prototype and refresh regressions.                          | Base for new general/desktop work; execution remains simulated.                                          |
| `GregPat22/grok-conductor-shutdown-analysis`  | Shutdown research, founder follow-up, updated roadmap and continuity acceptance criteria. | Integrate this branch's documentation commit to carry the findings into main/other workspaces.           |
| `codex/desktop-handoff` / `codex/p1-original` | Earlier P1 review/provenance branches.                                                    | Historical evidence; PR #1 is already integrated in `fd60a5a`.                                           |
| `GregPat22/argent-landing-page-draft`         | Separate landing-page worktree.                                                           | Preserve its work. Recheck that branch's current status before reconciling the shared website directory. |

The PR review/package notes below preserve historical evidence and branch states.
Their earlier instructions to merge PR #1 are superseded by main `fd60a5a`.
This branch's documentation update does not merge, deploy or publish a binary.
Existing worktrees will not receive these findings automatically: integrate the
saved documentation commit through the normal reviewed Git workflow.

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

1. Read the updated [roadmap](ROADMAP.md), [decision register](docs/DECISIONS.md)
   and [continuity contract](docs/specs/0006-continuity-and-market-validation.md).
   Serve the overlapping audiences through a shared core and staged delivery.
2. Resolve the bounded pinned-T3 runtime/foundation gate and verify authentication
   by provider and local/customer-operated remote/managed deployment. Supported
   subscriptions are preferred for eventual onboarding; API keys remain the pilot
   path and alternative. No silent billable fallback or extracted credentials.
3. Specify GitHub App scopes and isolated cloud lifecycle/cleanup, then complete
   M1a–M1c: one real workspace/agent, observable control, trusted exact-commit
   checks, independent review and an authorized draft PR.
4. Complete M1d portable export/restore, plus PostgreSQL, remote authorization,
   credential brokering, limits, cleanup and backup/restore before managed release.
5. Stage additional agent support, scoped team handoff and lightweight mobile
   access before dependency orchestration. Native mobile/advanced enterprise
   features remain later; detailed acceptance contracts precede implementation.
6. Continue the separate landing effort and reconcile website ownership. Address
   signing/notarization, verified updates and real public downloads before release.

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

## Initial Grok shutdown analysis, 6 November 2026

Historical proposal stage: the roadmap/context integration section below records
the founder's subsequent authorization and supersedes proposal-status statements
in this initial review record.

On `GregPat22/grok-conductor-shutdown-analysis`, based on `fd60a5a`, reviewed the
founder's attachment, project context, architecture, current simulator adapters
and M1/P1 contracts. The [research review](docs/research/conductor-shutdown-analysis.md)
records verified official shutdown dates, existing cloud competition, direct-X
403 limits, subscription-authentication qualifications and conditional product
recommendations. No representative X sentiment count, customer demand, competitor
runtime quality or Argent provider eligibility was established.

The [proposal](docs/specs/0006-continuity-and-market-validation.md) adds reviewable
customer/authentication validation and export/restore criteria without changing
accepted M1 scope. Founder follow-up asks why all three audiences cannot be served,
requests an auth recommendation and confirms verifying the underlying X research.
The review recommends a common core with staged delivery, supported subscription
sign-in as preferred eventual onboarding, and API keys as an alternative/technical
pilot path. This does not establish managed provider eligibility or alter the
current API-key M1 contract. Next: define launch scope, prove the provider-specific
auth path and resolve the foundation runtime gate, then pursue isolated M1a with
existing authorization/security constraints. Do not rush a production migration
claim to match Conductor's read-only deadline.

Documentation only; no runtime/dependency changes, external outreach, fork,
credential transfer, remote publication, merge, deployment or paid provisioning.
Fresh `npm run check` passed strict types, formatting, compilation and **41 tests,
0 failures, 0 skips**. All 48 relative file links in the six changed documents
resolve; whitespace checks passed and the actual edits were reviewed. The local
check log is `.context/shutdown-analysis-check.log`. Native/package smoke and
real-provider checks were not run for this documentation change. Installation
reported the existing five moderate packaging dependency findings; no versions
or lockfile changed. These checks validate the prototype, not the market claims.

## Roadmap/context integration, 6 November 2026

The founder explicitly requested saving all findings and updating the roadmap so
future agents retain context. On `GregPat22/grok-conductor-shutdown-analysis`,
based on `fd60a5a`, the research proposals became adopted planning direction:
shared audiences with staged delivery; supported subscription onboarding subject
to verified provider/deployment eligibility; API-key pilot/alternative; visible
control and portable restore before managed release; agent breadth/team handoff
before dependency orchestration. No real capability is implemented by these docs.

Updated ROADMAP, START_HERE, project context, decisions, M1 and continuity specs,
architecture, README, Claude entry point and documentation index. Corrected stale
current-status references to PR #1; original milestone/review evidence remains
attributed to its tested revisions. Read the research for source links, founder
verification and independent-access/sampling limits. No market metrics, customer
validation or managed provider eligibility were established.

Save this documentation in a commit on the unchanged branch. Other workspaces
must integrate that commit; editing one worktree does not update them. No main
merge, customer outreach, deployment, provider sign-up, paid provisioning or
runtime/dependency change is authorized by this context update.

Validation: `npm run check` passed strict types, formatting, compilation and
**41 tests, 0 failures, 0 skips**. All **129 relative file links in 16 changed
Markdown documents** resolve. The original 7,820-byte Grok report is preserved
byte-for-byte in `docs/research/sources/` and linked from the research/index.
Credential-pattern and whitespace scans passed; the actual documentation diff
was reviewed. Current API/setup how-to coverage and architecture diagrams need
no changes because runtime boundaries/commands are unchanged. No version bump.
Native/package smoke and real-provider/customer/competitor validation were not
run for this documentation update. The local check log is
`.context/roadmap-context-check.log`; the existing five moderate packaging audit
findings remain outside this change. No dependency versions/lockfile changed.

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
