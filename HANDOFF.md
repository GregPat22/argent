# Argent development handoff

Audited 6 November 2026 for the founder's move to Conductor. This file records
the latest known state across the project chats and checkouts. Read it alongside
[START_HERE.md](START_HERE.md), [AGENTS.md](AGENTS.md) and the relevant specification.
Private chat access is not required to continue development.

**Current checkout:** `GregPat22/next-step-v4`, based on `origin/main` at
`86255f8` (PR #9). It adds audited simulated repository-bootstrap resolution.
Main contains the landing refinement, continuity research, lifecycle simulation
and reviewed repository bootstrap/hardening. Execution remains simulated and the
website is unpublished.

## Where the work is saved

| Location                                            | Current state                                                                                      | How to use it                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `origin/main` at `86255f8`                          | M0/P1, landing refinement, continuity plans, simulated lifecycle and reviewed repository bootstrap | Base of this branch; no live cloud execution or public release.       |
| `GregPat22/next-step-v4`                            | Audited simulated bootstrap resolution                                                             | Current branch; evidence is in the first section below.               |
| `GregPat22/code-review-v2`                          | Second bootstrap hardening review fixes integrated through PR #9                                   | Historical review evidence.                                           |
| `GregPat22/motion-landing-page-improve`             | W0.3–W0.6 landing refinement integrated through PR #8                                              | Historical landing evidence.                                          |
| `GregPat22/code-review`                             | Bootstrap hardening integrated through PR #7                                                       | Historical simulation review evidence.                                |
| `GregPat22/next-step-v3` / `GregPat22/next-step-v2` | Repository and lifecycle slices integrated through PRs #6/#5                                       | Historical simulated engine work.                                     |
| `codex/desktop-handoff` / `codex/p1-original`       | Earlier P1 review/provenance branches                                                              | Historical evidence; PR #1 is integrated.                             |
| `GregPat22/argent-landing-page-draft`               | Initial landing integrated through PR #3                                                           | Historical source; preserve any later worktree changes.               |
| `GregPat22/grok-conductor-shutdown-analysis`        | Research and roadmap integrated through PR #4                                                      | Current continuity/customer/authentication criteria remain preserved. |

Historical sections retain revision-specific evidence and branch states. The
Next.js landing remains separate from desktop packaging and the static download
preview. PR preparation does not authorize merging, deployment or binary release.

### Audited simulated bootstrap resolution — 6 November 2026

On unchanged branch `GregPat22/next-step-v4`, based on `origin/main` at
`86255f8a4e9a65fda6781ab58d799785df63c13c` (PR #9). Added internal
`resolveRepository` and schema version 3 resolution receipts. The original
authenticated operator may request bounded, read-only inspection through a
separately injected simulation-only recovery inspector. It has no mutating
adapter methods. Only a fresh, exact-identity observation confirming settled
effects, revoked/absent credentials, cleared/absent channels and no partial
checkout resolves a `needs_attention` operation.

Resolution changes the old attempt to `failed`, preserving its phase, identities
and original credential/channel history. An attributed receipt links directly to
its event cursor and commits with the status transition. Rejections persist only
fixed reasons and remain blocked. Completed duplicate keys only read; concurrent
read-only inspections settle atomically. A new bootstrap needs a new submission
key and fresh authorization. Lifecycle requests serialize with settlement, so
deletion and fresh bootstrap remain blocked until a successful resolution commits.
Versions 1/2 retain their old operations/events when upgraded to version 3;
older builds refuse the newer schema.

Evidence: `npm run check` passes strict types, formatting, compilation and
**156 tests, 0 failures, 0 skips**, including **25 new recovery simulation tests**.
These cover actor/state/input denial, identity/freshness/cleanup rejection,
restart and idempotency, competing connections, duplicate resolution races,
lifecycle serialization, event/receipt rollback, version 2 upgrade, timeout/late
observations, post-lock deadline checks and secret canaries in SQLite/WAL.
Existing version 1 upgrade and unsupported-schema tests now target version 3.
The full verification log is `.context/check.log`. The actual source/test/docs
diff was reviewed by the implementing agent; no external independent review or
measured coverage percentage is claimed.

Limits: all recovery evidence is synthetic. No real cleanup, durable secret
custody, crash-time revocation, late-worker cleanup receipt capture, authenticated
operator service, isolated checkout or live provider has been implemented. The
inspector contract must not be enabled for live work until it can independently
prove old mint/checkout requests cannot finish after resolution. No API/desktop
endpoint or service-loop integration was added. Native/package smoke, website
build/browser checks and live A1–A10 gates were not run; M1a remains incomplete.

Next: implement durable secret references and audited live cleanup/inspection
alongside server-side GitHub authorization and isolated checkout. Record concrete
account/provider/resource/budget limits before live tests. The work is local and
uncommitted; no branch rename, push, PR, merge, deployment, release, purchase or
billable provisioning was performed.

### Bootstrap resolution PR preparation — 6 November 2026

On unchanged branch `GregPat22/next-step-v4`, freshly fetched `origin/main`
remains `86255f8`; no integration changes were needed. The founder requested a
PR for the full workspace diff, authorizing commit, branch push and PR creation
against `main`. The prelaunch package version stays `0.0.1`; this repository has
no VERSION/CHANGELOG release scheme to bump for an internal simulation slice.

Independent read-only code/security and acceptance/coverage reviews found no
blocking issue in the bounded third slice. All six acceptance bullets are
implemented and exercised. No measured coverage percentage is claimed; direct
store calls with invalid inspection timestamps/rejection reasons lack focused
tests, while the resolver supplies validated bounds and its public failure paths
are covered. The actual source/test/documentation diff was reviewed against main.

Fresh `npm run check` passes **156 tests, 0 failures, 0 skips**, strict types,
formatting and compilation; log `.context/pr-check.log`. The first PR-preparation
run hit an intermittent failure in the unchanged 100 ms heartbeat test; that test
passed in isolation and the fresh full rerun passed. No production deadline or
lease behavior was changed to accommodate the timing-sensitive test.

All simulation/live-provider, secret-custody and crash-time cleanup limitations
above remain. No native/package smoke, website build/browser or live-provider
checks were run for this internal slice. Next is real audited cleanup/inspection
with durable secret references and isolated GitHub bootstrap under approved
limits. Merge, deployment, binary release and spending remain separate decisions.

### Repository bootstrap review fixes — 6 November 2026

On `GregPat22/code-review-v2`, based on freshly fetched `origin/main` at
`333d662`. A code review of PR #7 found four correctness issues, which are fixed:

- Token scope pins only GitHub's numeric repository ID. The `owner/name` check
  was removed because a rename or transfer changed it and, after mint intent,
  blocked the workspace permanently.
- A minted token must outlive the deadline plus one cleanup timeout, so
  revocation after a deadline abort never uses an expired token.
- The repository schema is versioned in a `schema_versions` table. A PR #6
  (version 1) table is rebuilt with all of its rows and events, including
  `needs_attention` obligations, instead of stopping with a manual-migration
  error; an unversioned PR #7 table is recorded as version 2; a newer version
  refuses to start. The constraint text is read only to fingerprint databases
  from before version tracking.
- `Store` closes its database handle when any schema step fails.

The retryable-versus-blocking rule now lives in one store method: the worker and
lease reconciliation both use it, and it decides from the persisted phase and
credential state (`settle` replaced `fail`/`markUncertain`). Event names are
unchanged.

Evidence: `npm run check` passes **131 tests, 0 failures, 0 skips**, strict
types, formatting and compilation (log `.context/check.log`). New tests cover a
renamed repository bootstrapping successfully, a token expiring inside the
post-deadline cleanup window, a version 1 migration preserving a
`needs_attention` row and its events, and unversioned/newer schema handling. The
"wrong name" rejection and manual-migration expectations were replaced.
Deliberately not changed: retries after `failed` are not rate-limited (rows grow
per attempt), and branch-ref validation still uses two regexes. All earlier open
items (operator-resolution workflow, lost-ownership cleanup, live A1–A10
evidence) remain open; all adapters remain simulated.

### Repository bootstrap hardening — 6 November 2026

On `GregPat22/code-review`, based on freshly fetched `origin/main` at `757f8eb`
(PR #6). A code review of PR #6 found eight issues. The founder chose to fix the
inexpensive correctness issues before the real GitHub adapter, and directed that
user-facing GitHub behavior follow Conductor: a refusal is shown and can be
retried rather than locking the workspace.

- Token scope compares GitHub's canonical `owner/name` case-insensitively and
  ignores a `.git` suffix in the workspace URL.
- Branch refs accept dots where Git allows them (`release-1.2`), still rejecting
  leading dots, `..`, a trailing dot and `.lock` components.
- A minted token must outlive the operation deadline; otherwise it is revoked
  before ref resolution. The later database re-read was removed.
- Any failure before mint intent, including authorization denial, timeout and
  lease expiry, ends as `failed` with a `repository.failed` event. No token or
  channel can exist, so lifecycle requests stay available and a new
  Idempotency-Key may retry. Everything from mint intent onward still becomes
  `needs_attention`. The repository table drops the per-workspace UNIQUE in
  favor of a partial index over non-failed rows; an empty first-version table is
  rebuilt automatically and a non-empty one stops with a manual-migration error.

Evidence: `npm run check` passes **129 tests, 0 failures, 0 skips**, strict
types, formatting and compilation (log `.context/check.log`); six tests are new
and four existing denial expectations changed from `needs_attention` to `failed`.
Still open from the review, deliberately: lost-ownership cleanup is not recorded
and there is no operator-resolution workflow (both belong to the planned audited
resolution work); token-format capture, the lifecycle store's dependency on the
repository table and duplicated `bounded`/`transaction` helpers. All adapters
remain simulated.

### Repository access/bootstrap slice — 6 November 2026

On the unchanged branch `GregPat22/next-step-v3`, based on freshly fetched
`origin/main` at `1424b92` (lifecycle PR #5). Added internal
`Store.repositories`, simulation-only authorization/GitHub/bootstrap contracts
and a bounded worker. Bootstrap enrollment serializes with lifecycle requests;
active/uncertain bootstrap blocks pause/delete. One bootstrap per workspace is
allowed, including after success. No API, desktop, website or dependency behavior
was changed.

The authority binds the authenticated operator, selected repository and allowed
ref before minting; callers cannot submit installation IDs or permission maps.
The broker requests one numeric repository ID and Contents read, validates
returned identity/scope/expiry, resolves a full SHA and checks a separate synthetic
checkout observation. Tokens are passed separately from the fixed checkout plan.
Known tokens are revoked and channels cleared on success/failure; both
acknowledgments are mandatory for success. Mint/checkout intent is transactional
with its event. Fenced leases, deadlines and uncertainty prevent automatic replay.
Only fixed event names and validated metadata are stored, never adapter exceptions
or raw tokens.

Fresh `npm run check` passed strict types, formatting, compilation and **118 tests,
0 failures, 0 skips**. The **50 new simulation tests** include scope/identity
rejections, secret canaries in SQLite/WAL and checkout plans, cleanup refusal/hangs,
heartbeat/ownership expiry, independent-process claim and pause/enrollment races,
worker death after mint intent, late checkout acknowledgment, lock contention,
transaction rollback and durable cursor/idempotent reconnect. Logs are local
`.context/check.log` and `.context/repository-tests.log`; tracked source/specs
remain the reproducible evidence. The actual source/test/documentation diff was
reviewed; this is not an external independent review or live security validation.
Diff review also found that an adapter could mutate the shared checkout plan
used as its verification baseline. The plan is now frozen, with a regression
confirming mutation blocks bootstrap and still cleans credentials.

Limits: all adapters and checkout observations are simulated. There is no real
GitHub App, authenticated operator service, live HTTP/token issuance, Git clone,
isolated runner, secret vault, dependency execution or provider resource. No
native/package smoke, website build/browser test or live-provider test was run.
After worker death, token/channel obligations remain blocked; process-memory
credentials cannot be recovered for automatic revocation. A denied authorization
also remains blocked conservatively. An audited resolution/cleanup workflow is
still missing. M1a is not complete, and these tests prove no live isolation,
credential erasure or tested pull request.

Next: implement the real server-side authorization/GitHub adapter and isolated
checkout/ephemeral-channel adapter with durable secret references and audited
uncertain-outcome cleanup. Establish concrete account/resource/budget approval
before live provider tests, then prove private-fixture checkout, persistence,
isolation and deletion against spec 0007. Continue provider/deployment auth and
customer validation in parallel when authorized. No branch rename, commit, push,
PR, merge, deployment, purchase or provisioning was performed in this task.

### Repository bootstrap PR preparation — 6 November 2026

On `GregPat22/next-step-v3`, fetched `origin/main` at `1424b92`; the feature
branch was already current. The founder requested a PR for this complete
workspace diff. Added five focused regression cases for malformed token responses
and heartbeat failure during outstanding authorization, bringing this slice to
**55 simulation tests** and the full `npm run check` to **123 passing tests,
0 failures, 0 skips**, with strict types, formatting and compilation.
The fresh verification log is `.context/pr-check.log`.

Independent read-only code/security and coverage reviews found no blocking issue
or incomplete acceptance claim within the explicitly simulated second slice.
No measured line/branch coverage percentage is claimed. The actual diff against
main, relative documentation links, whitespace and credential scan were checked
before publication. Existing prelaunch package version `0.0.1` is retained;
this repository has no VERSION/CHANGELOG release scheme to update for this slice.

All live-provider, isolation, credential-erasure and crash-time revocation limits
above remain. No native/package, website or live-provider checks were run.
Next is authorized live access/isolated bootstrap and audited credential cleanup,
not M1a completion. Authorization here covers commit, branch push and PR creation
against `main`; merging, deployment, binary release and spending remain separate.

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

The earlier M0/context publication passed **22 tests**, strict type checks and
formatting, with GitHub CI also passing. Earlier review repaired lease validation
using a pre-lock timestamp and demo cleanup. Those are historical results for the
recorded revision, not certification of all future changes.

### P1: local desktop prototype

The local desktop prototype is integrated on main at `fd60a5a`. It adds:

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

New general and desktop worktrees should start from current `origin/main`,
which includes P1. Do not base new work on the historical review/provenance
branches or the old empty commit.

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
update its status/copy to reflect the completed local prototype now integrated
on main, while keeping public distribution and real integrations unfinished.

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

1. Continue bounded M1a on the retained Argent core. The engineering agent owns
   routine technical choices; T3 runtime evaluation is deferred until measured need.
   Foundation replacement is not approved.
2. Lifecycle and repository brokerage/bootstrap simulation are implemented
   internally. Next implement live GitHub access and an isolated checkout adapter from
   [spec 0007](docs/specs/0007-cloud-workspace-lifecycle.md), alongside the
   provider/deployment authentication validation in the roadmap. Supported
   subscription onboarding remains preferred where permitted; API keys remain
   the controlled pilot/alternative. Never silently switch to billable usage.
3. Prove real M1a persistence, isolation and cleanup, then M1b/M1c observable
   control, one official agent, exact-commit verification, review and an authorized
   draft PR. Live tests require concrete provider/account/region/resource/budget approval.
4. Complete M1d portable export/restore, PostgreSQL, remote authorization,
   credential brokerage, enforced limits and backup/restore before managed release.
5. Stage additional agent support, scoped team handoff and lightweight mobile
   access before dependency orchestration, with separate acceptance contracts.
   Customer outreach and paid competitor trials require their own authorization.
6. The landing is integrated via PR #3. Keep Next.js separate from the static
   desktop preview; signing/notarization, verified updates and real public
   downloads remain release requirements.

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

### Post-merge M1a preparation, 6 November 2026 (historical gate)

On `GregPat22/next-step-v2`, based on `fd60a5a`, a fresh fetch confirmed PR #1
is already integrated in `origin/main`. Corrected the entry points and current
branch guidance; historical review/package evidence above remains historical.
No branch was renamed and the separate landing workspace was not modified.

Prepared [spec 0007](docs/specs/0007-cloud-workspace-lifecycle.md): proposed
read-only GitHub App access, credential/bootstrap boundaries, durable lifecycle
intent/acknowledgment, atomic operation ownership, quiescence, conservative
reconciliation, persistence manifests and cleanup inventory. Ten acceptance
criteria separate deterministic fixture coverage from required live evidence.
Official GitHub/E2B documentation was checked on this date and linked in the spec;
no SDK was installed and no provider integration was tested.

Fresh `npm run check` passed strict types, formatting, compilation and **41 tests,
0 failures, 0 skips**. The documentation diff was reviewed, relative Markdown
file targets resolved and whitespace checks passed. Native/package smoke was
not repeated because runtime and dependencies are unchanged. Local check output
is `.context/next-check.log`; the tracked results here are the durable summary.

Next decision: authorize the pinned isolated T3 runtime conformance spike or
explicitly retain the current core for bounded M1a implementation. Then build
lifecycle records/fake-provider failure tests and the read-only bootstrap broker.
Live tests still require concrete provider/account/region/resource/budget and
cleanup authorization. No cloud code, billable resources, remote publication,
website deployment or binary release is part of this preparation.

### Retained-core decision and lifecycle slice, 6 November 2026

On `GregPat22/next-step-v2`, continuing from `74068ae` (main base `fd60a5a`),
the founder delegated technical decisions to the engineering agent. Retain
Argent for bounded M1a; defer T3 runtime evaluation until measured need. This
supersedes the technical selection question in the previous entry. The rationale
and engineering ownership are in [DECISIONS.md](docs/DECISIONS.md#foundation-decision-for-bounded-m1a-6-november-2026).
Foundation replacement and billable provisioning remain separately controlled.

Implemented the first [spec 0007](docs/specs/0007-cloud-workspace-lifecycle.md)
slice: internal lifecycle tables/events on the existing SQLite connection,
idempotent operation intent, atomic fenced claims, quiescence acknowledgment,
dispatch receipts, deadlines/heartbeats and read-only outcome reconciliation.
Lifecycle enrollment serializes with M0 submission/claims and disables local
adapter execution for that workspace. Uncertain effects are never reclaimed or
replayed. Delete keeps its identity and `deleting` state until absence is observed.

The worker only accepts the simulation-only adapter contract and is not wired to
the desktop bridge, HTTP API or service loop. It runs no target repository code
and adds no SDK or runtime dependencies. Twenty-seven focused tests include
independent-process claims, enrollment versus M0 submission, actual worker
termination around simulated effects, lost acknowledgments for all four actions,
late/hung calls, post-lock expiry, invalid observations, event rollback and
preservation of old P1 data when lifecycle tables are introduced.

Fresh `npm run check` passed strict types, formatting, compilation and **68 tests,
0 failures, 0 skips**. Reviewed the actual implementation/test/documentation diff;
relative Markdown targets and whitespace checks pass. Local logs are
`.context/lifecycle-tests.log` and `.context/lifecycle-check.log`. Native/package
smoke was not repeated; desktop behavior is covered by the automated suite.

This is simulation evidence, not M1a completion or a tested PR. GitHub
credential brokerage, trusted checkout/bootstrap, filesystem retention manifests,
full resource/credential cleanup inventories, operator resolution, real isolation,
remote authorization and live budget/provider validation remain unimplemented.
Next: implement read-only GitHub bootstrap on the retained core, then exercise
real-provider persistence/cleanup only with concrete authorized limits. Technical
choices stay with the engineering agent. No remote push, merge, deployment,
binary release, real provider call or billable provisioning occurred here.

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

## Shutdown research PR preparation — 6 November 2026

On `GregPat22/grok-conductor-shutdown-analysis`, preserved research/roadmap commit
`1c00e97` and integrated latest main `b5e763f` (landing PR #3) into this feature
branch. Resolved the handoff, start-here, project-context and index overlaps by
retaining both evidence histories and correcting current integration status.
The actual diff against main contains 17 documentation/source-report files and
no engine, desktop, website-code or dependency changes.

Fresh `npm run check` passed strict types, formatting, compilation and **41 tests,
0 failures, 0 skips**. All **139 relative file links** in the PR's Markdown resolve;
conflict-marker and whitespace checks passed. Independent documentation review
was requested for the reconciled tree. No version bump: the existing prelaunch
`0.0.1` convention is retained. Evidence log: `.context/pr-check.log`.

Native/package smoke, website production/browser checks and real-provider tests
were not rerun for this documentation-only diff. Their earlier revision-specific
evidence remains in the preserved reports. The user authorized creating a PR
against main; merge, deployment and provisioning remain separate decisions.

## Lifecycle PR preparation — 6 November 2026

On the unchanged branch `GregPat22/next-step-v2`, preserved `74068ae` and
`b1082b7` and integrated freshly fetched main `13eb14e` (landing PR #3 and
shutdown/continuity PR #4). Resolved documentation overlaps by retaining both
histories, provider/authentication validation and continuity requirements, plus
the retained-core technical decision and implemented internal lifecycle slice.
Renumbered this branch's lifecycle contract to `0007-cloud-workspace-lifecycle.md`
because main already assigns 0006 to continuity/market validation.

Fresh integrated-tree `npm run check` passed strict types, formatting, compilation
and **68 tests, 0 failures, 0 skips**. Independent read-only pre-landing review
found no concrete correctness/security issue. Coverage review identified two
nonblocking unexercised timer paths: the periodic worker heartbeat callback and
read-only inspection timeout; store-level heartbeat expiry and hung mutating
calls are covered. No claim of measured full line/branch coverage is made.
The final diff against current main and relative Markdown targets were reviewed.
The log is `.context/pr-check.log`.

Website source, desktop UI and package dependencies are unchanged relative to
current main. Native/package smoke, website browser/build checks and live-provider
checks were not rerun for this internal engine slice. Retain the established
prelaunch package version `0.0.1`; no release metadata scheme is introduced for
this source-only PR. Next implementation is read-only GitHub bootstrap with the
remaining M1a limits above. The user authorized branch push and PR creation;
merging main, deployment, binary release and spending remain outside this task.

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

## Landing refinement PR preparation — 6 November 2026

On unchanged branch `GregPat22/motion-landing-page-improve`, preserved the full
W0.3–W0.6 landing pass in `8ce1d6e` and its documentation in `8dc3804`, then
integrated freshly fetched main `1cc0598` (PR #7) via `fbf262a`. Documentation
conflicts were resolved by preserving upstream continuity/lifecycle/repository
history alongside the landing decisions and updating current branch locations.
The final diff against main is confined to website assets/source/tests and
landing/context documentation; engine, desktop packaging and dependencies are
unchanged. Existing prelaunch version `0.0.1` is retained without introducing a
VERSION/CHANGELOG release scheme.

Independent coverage and source/design review found one actionable keyboard
regression: crossing a scroll threshold while the logo or a disclosure link had
focus could leave focus on the page body. The containment check now covers the
whole navigation, and focus moves to the remaining logo in either direction.
A focused browser regression covers both logo and open-disclosure transitions;
native PageDown waits for scroll completion before reversal. No outstanding
source-review finding remains; no measured line/branch coverage percentage is
claimed.

Fresh integrated-tree evidence: root `npm run check` passed strict types,
formatting, compilation and **129 tests, 0 failures, 0 skips**; website strict
types and optimized production build passed; **26 production Playwright tests
passed (35.8s)**. Logs are `.context/pr-checks/root.log` and
`.context/pr-checks/website.log`. Actual diff, conflict markers, whitespace and
all 98 relative file links in changed Markdown were checked. A credential scan
found no secret; its only medium classification was the public loopback FAQ
fixture URL in a browser test, not a private service or credential.

Limits: Chromium verification, not Safari/Firefox or real-device performance;
no measured conversion lift or native packaging rerun. An extra 320px probe
measured a 5px terminal-grid overflow without establishing an introduced cause;
360/768px automated responsive checks pass. Screenshots remain local under
`.context/plain-redesign/`. The founder has authorized commit, branch push and
PR creation against main. Next: review the PR and address reviewer findings;
merging, deployment, binary release and provisioning remain separate decisions.
Historical local/uncommitted statements above describe their original revisions.
