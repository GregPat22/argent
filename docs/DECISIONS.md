# Decision register

**Accepted** means a product or engineering requirement; **provisional** means a
recommendation that still needs a practical check. Neither label proves that a
capability is implemented: see the [README](../README.md#what-works-today) for
what works today and the [roadmap](../ROADMAP.md) for sequencing.

| Decision                                                                | Status                                                                                                      | Rationale and consequence                                                                                                                                                                                                            | Revisit or completion evidence                                                                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Argent is desktop-first, downloaded from a website                      | Accepted product requirement                                                                                | The installed app is the primary interface. Browser access may complement it later.                                                                                                                                                  | Local package and hands-on desktop checks; signing, notarization and public distribution are separate.                                     |
| Cloud execution is foundational                                         | Accepted product requirement; sequenced after L1 and after a remote host the developer owns                 | A developer can close the client and reconnect elsewhere. Desktop delivery does not move remote execution into the client.                                                                                                           | A real remotely hosted worker, an isolated persistent workspace and disconnect/reconnect evidence.                                         |
| Evidence Argent collects itself is the reason the product exists        | Accepted 10 November 2026                                                                                   | Running agents side by side in separate branches is common; proof of what they did is not. Parallel workspaces and several agents are the means.                                                                                     | Checks recorded for the exact commit (L1.4) and the evidence record on the pull request (L1.5). Revisit if users do not value it.          |
| First public release with Claude Code only; Codex is the first update   | Accepted 10 November 2026 (was both agents inside the local MVP)                                            | A release people can use sooner, with the agent the maintainers use daily. The adapter boundary makes Codex an addition, not a redesign.                                                                                             | L1 exit evidence without Codex; L1.6 keeps its own two-agent evidence.                                                                     |
| A remote host the developer owns before a managed cloud                 | Accepted 10 November 2026                                                                                   | Work that continues with the laptop closed needs no hosted service of ours: the same API and worker run on the developer's own machine. A managed cloud becomes an optional convenience on the same core.                            | Its own spec and security review: authenticated, encrypted transport and never a raw exposed service.                                      |
| Local MVP before cloud workspaces                                       | Accepted 7 November 2026                                                                                    | Real agents in local worktrees are the shortest path to a usable product and exercise the contracts cloud needs. Not a sandbox.                                                                                                      | [Spec 0013](specs/0013-local-mvp.md) exit evidence; revisit if local execution blocks the cloud design.                                    |
| Open-source, independently usable core                                  | Accepted product requirement                                                                                | Self-hosting and model/provider independence are part of the product, not a lesser mode.                                                                                                                                             | Self-hosted control-plane instructions and a separately verified isolation runtime.                                                        |
| MIT license                                                             | Accepted                                                                                                    | Broad adoption and commercial use; competing commercial forks are accepted as a consequence.                                                                                                                                         | Review licensing and attribution before importing upstream code or adding modules.                                                         |
| One TypeScript package with separate boundaries                         | Implemented                                                                                                 | API, persistence, worker and adapters stay distinct without empty packages.                                                                                                                                                          | Split only when real deployment or ownership boundaries justify it.                                                                        |
| SQLite for one trusted local host                                       | Implemented                                                                                                 | Proves durability without provisioning a database. Never on a network filesystem.                                                                                                                                                    | Move to PostgreSQL before multiple control-plane hosts or managed tenancy.                                                                 |
| Atomic claims and transactional state/event writes                      | Implemented; required invariant                                                                             | Prevents duplicate dispatch and unrecorded transitions across processes.                                                                                                                                                             | Keep concurrent-claim, lock-contention and crash regression tests through future adapters.                                                 |
| Unknown outcomes require reconciliation                                 | Implemented blocking behavior; accepted policy                                                              | Avoids silently repeating external effects. Fencing a database writer does not fence provider actions.                                                                                                                               | Audited operator resolution and failure injection around every real external effect.                                                       |
| Independent evidence before success                                     | Simulation verification and local Git records implemented; tests planned                                    | Agent statements are not proof. A local worktree record is not a test result. Trusted checks must identify a policy and the exact commit.                                                                                            | Trusted test artifacts, actual diff review and exact-SHA draft-PR evidence.                                                                |
| Familiar desktop layout                                                 | Accepted product requirement                                                                                | Developers used to multi-agent desktop tools should be able to switch with little relearning. Original code and assets only.                                                                                                         | Observed first-use walkthroughs on real tasks; see [spec 0008](specs/0008-desktop-workspace-shell.md).                                     |
| Retain Argent's own core rather than adopt T3 Code for bounded M1a      | Decided; revisit on measured need                                                                           | Existing durable machinery may save effort, but adoption creates coupling and no runtime advantage was shown.                                                                                                                        | A pinned runtime spike only if measured complexity justifies it.                                                                           |
| E2B as first cloud candidate                                            | Provisional                                                                                                 | Its managed offering and open runtime may fit persistence and self-hosting goals.                                                                                                                                                    | Real persistence, crash, isolation, retention, cost and cleanup contract tests.                                                            |
| Claude Code via its official CLI as first real agent, then Codex        | Accepted 7 November 2026 (was Codex first, provisional); Codex moved after the first release on 10 November | The maintainers use it daily, it signs in on its own and its CLI streams structured events.                                                                                                                                          | Pinned CLI version; proven streaming, resume, cancellation and permission modes in spec 0013 tests.                                        |
| Subscription sign-in preferred; local mode uses the agent's own sign-in | Accepted direction; hosted eligibility unverified                                                           | Developers want to use the subscriptions they already pay for. Locally, the official CLI signs in on its own and Argent removes API-key variables; API keys remain the hosted-pilot baseline. Never a silent fallback to paid usage. | A dated provider/deployment authentication matrix; see [spec 0006](specs/0006-portable-continuity.md) and [0013](specs/0013-local-mvp.md). |
| Clean pre-token failures are retryable                                  | Accepted; simulated                                                                                         | A refusal before any GitHub token request changes nothing externally, so it is shown and retried instead of locking the work.                                                                                                        | Real GitHub App denial, missing-installation and org-approval cases surface clearly and retry.                                             |
| Repository identity is GitHub's numeric ID                              | Implemented in simulation                                                                                   | Owner/name changes on rename or transfer, so token scope pins only the ID the authority returned.                                                                                                                                    | Real GitHub App tokens for a renamed and a transferred test repository.                                                                    |
| Finite repair attempts and human merge authority                        | Accepted MVP policy                                                                                         | Bounds autonomous loops and keeps humans in control of integration.                                                                                                                                                                  | M1 permits at most one repair attempt; merges always need a separate human decision.                                                       |

## Choices deliberately left open

- Whether a later milestone warrants T3 Code or another foundation, after a
  measured runtime spike.
- Cross-platform desktop releases and automatic updates (the prototype uses
  Electron 45.2.3 on macOS). The first release is a signed and notarized macOS
  build for Apple silicon.
- The cloud region, resource shape, account, quotas and budget.
- Remote authentication, tenant authorization, secrets brokering and recovery UX.
- Evidence retention, artifact access, backup/restore and deletion policies.
- Commercial packaging, proprietary feature boundaries and contributor governance
  as the community grows.

Do not turn an open choice into an implied commitment in product copy or code.
Record the reason and evidence here when a choice is resolved.

## Engineering decisions

### Exact-commit observation before reviewed execution — 11 November 2026

In development against main `3feb50e`, within the accepted L1.4 security contract.
Keep exact-commit observation separate from consent and execution. Reuse the
bounded no-follow file reader to require raw index and tracked bytes/modes to
match the observed HEAD. Bind the workspace/base and the operator's freshly
matched configuration approval, and recheck previously read file identities at
the end. This is a point-in-time observation with ignored content excluded,
not a complete review diff, binary review policy, approval receipt or runnable
plan. Git executable mode follows owner execute consistently in candidate
inspection, live changes and untracked worktree manifests; group-only execute
must not hide a mode change. Existing dormant jobs remain forbidden to execute. See the
[acceptance contract](specs/0013-local-mvp.md#internal-exact-commit-candidate-observation-acceptance).

The Git audit found that `protocol.allow=never` is only a default and can be
superseded by [per-protocol configuration](https://git-scm.com/docs/git-config#Documentation/git-config.txt-protocolallow).
Use an empty `GIT_ALLOW_PROTOCOL` allowlist to deny all transports independently
of repository overrides, plus `GIT_NO_LAZY_FETCH=1` on versions supporting it.
Local owned helper fixtures reproduced the override and its refusal on Git
2.42.0 and 2.54.0 without network access. Optional index refresh remains disabled.
This preserves the existing no-helper/no-network boundary, raises no minimum
Git version and changes no product or accepted security requirement.
Implementation and validation evidence are pending.

### Dormant command ownership — 11 November 2026

Implemented at `f70dbf3240daa14e4a8240ba5aaf16694015e3dc`, with validation recorded
on 11 November 2026, within the
accepted L1.4 ownership and security contract. Keep internal command ownership in
the existing runs table so agent and command work share one workspace exclusion,
idempotency namespace and fenced lease transition. Store immutable approved
configuration detail separately. Explicitly label its version-1 payload dormant,
with execution forbidden; it lacks the reviewed execution plan needed by a
future runner. Duplicate requests return historical ownership, not renewed
permission.

Use a database CHECK requiring an explicit command claim version when entering
running or cancelling states. This prevents old claim SQL from dispatching
command rows through agent adapters, including statements prepared before
migration. Do not repurpose an unrelated schema component or claim graceful
downgrade: an older worker may fail closed with an error. New agent projections
and portable history also need explicit kind guards. Preserve cross-kind
uncertainty, cancellation acknowledgement and exact-expiry fencing. Completed
command results and agent evidence remain forbidden in this slice. See the
[acceptance contract](specs/0013-local-mvp.md#dormant-command-job-ownership-acceptance).
Focused integration tests and the full repository check passed. A separate probe
loaded the prior Store and Worker code alongside the new store: agent claims
still worked, while SQLite refused the older worker's command claim before
workspace preparation or adapter dispatch. It left the queued record and events
unchanged. This establishes claim refusal, not complete downgrade compatibility.
No accepted product decision, milestone scope or local security requirement
changes; command execution, candidate review and test evidence remain planned.

### Internal durable command approvals — 11 November 2026

Implemented at `268ed61759d50285d5a89d3319542caff6027ac4`, with validation recorded
on 11 November 2026, within the existing L1.4
requirement for reviewed per-repository commands. Share the existing SQLite
connection and keep approval snapshots, attributed events and idempotency
receipts separate from execution runs. Fresh service-owned configuration reads
supply authority; callers supply only the expected candidate identity. Scope
reuse to the approving operator and the existing repository/content/policy
identity, allowing unchanged configuration at sibling workspaces and newer bases.

Completed duplicate requests read their historical receipt, even when source
files are unavailable. A separate lookup must reread and compare the current
candidate before reporting a reusable approval. Neither a receipt nor this
point-in-time match starts work or fences later filesystem changes. Keep local
approvals outside the existing portable-history format; restoration must never
install execution authority. See the
[acceptance contract](specs/0013-local-mvp.md#internal-durable-command-approval-acceptance)
for transaction, corruption, concurrency and migration checks. Focused approval
tests and the complete repository check passed. Every snapshot read verifies a
stored checksum, including historical receipts; this detects corruption and
does not authenticate data against the local host owner. This changes no accepted
security or
product decision, and does not complete L1.4. Future execution still requires
independent ownership and review of command-defining and test changes.

### Base-bound command configuration groundwork — 11 November 2026

Implemented at `914323d962b031f4e44e9c0047c626c5800e6643`, with validation
recorded on 11 November 2026, within the accepted L1.4 contract. Read
only root `argent.json` at the workspace's recorded base, validate a bounded
versioned argv schema and return immutable source metadata. Bind the future
review candidate to exact bytes, interpretation policy and canonical repository
common-directory identity, including device and inode; omit workspace and base
IDs so unchanged configuration can share one repository approval later.

The candidate is not a grant and stores no approval. Real-Git regression
coverage is specified in the
[reader acceptance contract](specs/0013-local-mvp.md#internal-command-configuration-reader-acceptance);
the [implementation evidence](specs/0013-local-mvp.md#internal-reader-implementation-evidence)
records passing checks, two full-suite failures, passing unchanged-main focused
and full comparisons, and a controlled reproduction of the short test lease's
sensitivity. The [fixture correction](specs/0014-ci-test-determinism.md#local-worktree-process-fixture-lease-correction)
preserves production expiry rules; the original failures' precise cause remains
unconfirmed. This does not establish command
execution or the L1.4 exit, which remains in development. Approval persistence is
covered by the internal durable approval implementation above; execution and
test evidence remain planned. The accepted requirement to review
command-defining and test changes against the trusted base is unchanged: a
frozen command can still invoke a candidate-modified script. Local execution
remains unsandboxed and cannot resist arbitrary host-owner tampering.

### Proof first, one agent at release, and your own remote host — 10 November 2026

Three product decisions, taken together after a review of the project.

**What Argent is for.** Several free tools already run coding agents side by
side in separate branches. Argent's reason to exist is narrower: an agent's work
comes with evidence Argent collected itself, and nothing counts as verified
until a check Argent ran says so for the exact commit. Public copy leads with
that, and describes parallel workspaces and several agents as how it works. It
is a bet, not a finding: revisit it if people using Argent do not value the
evidence. Until L1.4 lands no check is ever run, so every surface keeps saying
that a finished run is recorded, not tested.

**The first public release ships with Claude Code only.** Codex and the per-run
model picker (L1.6) become the first update after the release instead of a
condition of it. This supersedes the release gate in "Agent and model choice in
the local MVP" below and the "two working official integrations" gate in
"Familiar workspace shell and personal release scope"; the design of agent and
model choice is unchanged. Before the release the work queue adds three gates:
a recorded run with the real CLI before anything else, process reconciliation
after a crash, and first-run guidance when the CLI is missing, too old or not
signed in.

**A remote host the developer owns comes before a managed cloud.** "Close the
laptop and the work continues" is first delivered by running the same API and
worker on a machine the developer owns, with the desktop connecting over an
authenticated, encrypted channel. A managed cloud (M1) follows as an optional
service on the same core. The rule that a remote or managed control-plane host
never executes repository code stays as written until the remote-host spec
defines, and a security review accepts, the developer-owned case. The local
service is still never exposed beyond loopback.

Also accepted as planned work after the release, with no availability implied:
starting a workspace from an existing local branch, history export from the
desktop app, an evidence record on a pull request that can be checked again
without the Argent app, reporting when the tests that judge a change were
removed or skipped, a read-only review by a second agent recorded as a review
and never as proof, and an export-and-restore drill repeated with each release.
The first release is not timed to another product's shutdown and promises no
replacement or migration. See the [roadmap](../ROADMAP.md).

### Deterministic timing tests and complete service teardown — 8 November 2026

Use controlled time for isolated heartbeat, deadline and event-volume assertions;
retain real-process crash and lock-contention tests. Desktop test teardown must
wait for process exit before deleting its data, since HTTP closure precedes
SQLite closure. CI failures at `6b49267`, `e57c4b7`, `2bdde47`, `ffbeef2` and
`93a2df9` motivate these test-only changes. Preserve production lease/deadline
checks and workflow failure notifications. Acceptance and validation limits are
in [spec 0014](specs/0014-ci-test-determinism.md). Implemented in main `32748a5`.

### Local MVP first, Claude Code first — 7 November 2026

The project had real cloud provisioning on the critical path while every run was
still simulated, so no real agent loop had been tried. The roadmap now delivers a
local MVP first ([spec 0013](specs/0013-local-mvp.md)): each workspace is a Git
branch in its own worktree of a local repository, and the agent runs through its
official CLI under the developer's own sign-in. Cloud workspaces (M1) follow on
the same engine; their simulations and gates are unchanged.

Local mode deliberately runs the agent as the developer, which is not isolation.
The rule against executing repository code now applies to remote and managed
control-plane hosts; local mode instead follows the spec 0013 security model: no
shell, validated paths, hook-free Argent Git commands, an allowlisted agent
environment without provider API keys, conservative default permissions and
bounded, cancellable runs. Claude Code replaces Codex as the first agent because
the maintainers use it daily and its CLI exposes structured streaming, resumable
sessions and permission modes; Codex is the second integration.

### Retain the current core for bounded M1a — 6 November 2026

The current core already proves transactional state/events, atomic claims,
conservative uncertain-outcome handling and desktop/service separation. The
[pinned T3 source review](research/t3-adoption-spike.md) found different retry,
retention and durability policies and substantial adoption coupling, and no
runtime advantage. Replacing the core now would add migration risk before the
provider contracts are exercised. Keep new lifecycle machinery narrow and test it
against fake-provider failure windows before real integrations.

### Familiar workspace shell and personal release scope — 6 November 2026

The desktop follows familiar multi-agent tool placement: workspaces on the left,
the session and composer in the centre, inspection and terminal on the right.
Breadth targets are Claude Code and Codex, then Cursor and OpenCode, all shown as
explicitly unavailable previews today. Two working official integrations and
verified subscription routes for each advertised environment are the proposed
personal-release gate. Migration means selected files and readable context first;
live-session resume needs separate provider/version proof. Mobile means a narrow
authenticated companion and a native iOS track on the independent service, never
public exposure of the local prototype. See the [roadmap](../ROADMAP.md) and
[spec 0008](specs/0008-desktop-workspace-shell.md).

### Lucide icon system — 6 November 2026

Lucide Static 1.70.0 was downloaded from the official npm registry and its
SHA-512 integrity verified. A curated 45-SVG subset is vendored unmodified with
its full ISC and Feather-derived MIT notices in `ui/icons/`, and packaging
includes the notices. Icons use CSS masks with shared sizing and current colour,
without a font, CDN or runtime package. See [spec 0009](specs/0009-desktop-ux-polish.md).

The same pass exposed a shutdown race: stopping an active simulated worker could
leave the stop HTTP socket answering keep-alive polls while `server.close` waited.
The stop response now closes that connection explicitly; a regression covers it,
and interrupted work remains `needs_attention` with no replay.

### Encrypted simulation custody — 6 November 2026

Keep opaque credential references and encrypted synthetic tokens inside the
existing single-host SQLite boundary. An explicitly injected, dedicated 256-bit
key stays outside SQLite; AES-256-GCM binds each ciphertext to its operation and
authorization identities. Capture precedes token acceptance or use, and an
acknowledged revocation or independently confirmed resolution removes the active
encrypted payload transactionally. This is for restart testing, not a choice of
production secret management. See
[spec 0007](specs/0007-cloud-workspace-lifecycle.md#fourth-implementation-slice-encrypted-simulated-credential-custody).

### Audited simulation cleanup — 6 November 2026

Allow one explicit cleanup reservation per uncertain repository bootstrap.
Persist intent before revoke, channel-clear or partial-checkout discard, stop on
uncertainty, and never reclaim or replay an attempt after a deadline or restart:
manual recovery is preferred over guessing whether a cleanup happened. A separate
fresh inspection must bind the cleanup ID and current event cursor and confirm
that every cleanup effect has settled before the workspace unlocks. See
[spec 0007](specs/0007-cloud-workspace-lifecycle.md#fifth-slice-acceptance-audited-simulated-recovery-cleanup).

### Read-only GitHub preflight before live bootstrap — 7 November 2026

Implement the GitHub protocol checks as a separate, unwired read-only component
rather than a live-capable adapter disguised as the simulation contract. A trusted
auth service supplies the operator/GitHub binding and credentials; the preflight
returns labelled metadata, never a durable grant. Origin and API version are
pinned, requests are bounded, and raw responses and errors are stripped. Opaque
stateless installation tokens up to 4,096 bytes are accepted without interpreting
their claims. Continue only through the
[live pilot gates](specs/0010-live-repository-pilot-gates.md).

### Memory-only device sign-in pilot — 7 November 2026

Prove user authentication and the read-only repository path through an explicit
local command before exposing it to the desktop or service API, using GitHub's
official App device flow and a single read-only test installation. Tokens live
only in memory and refresh credentials are discarded. See
[spec 0011](specs/0011-github-device-pilot.md).

### Offline history before importers — 7 November 2026

Implement [spec 0012](specs/0012-portable-history.md) as an independent
continuity slice while the live cloud gates remain open. Use an explicit read-only
source snapshot and a separate immutable history store, not restored execution
rows. Imported active or uncertain states stay `needs_attention`, and imported
verification stays historical and untrusted. Importing from other tools requires
consented sample data first.

### Agent and model choice in the local MVP — 7 November 2026

The local MVP includes both Claude Code and Codex, and the desktop lets each
workspace choose its agent and each run choose a model that agent offers under the
developer's own sign-in (Claude models through Claude Code, GPT models through
Codex). Argent passes the choice to the agent's official model option and records
it; it never calls, routes or proxies models, and never falls back to another
agent or to paid API usage. See
[spec 0013](specs/0013-local-mvp.md#agent-and-model-choice).

### The desktop shows only what works — 7 November 2026

The desktop app no longer reserves space for planned tools. The inspector, the
terminal preview, the mobile and migration pages and the provider tabs are
removed until they are real; the right panel returns with the changes view
(L1.3). This supersedes the right-hand inspection placement in
[spec 0008](specs/0008-desktop-workspace-shell.md). A workspace is shown as one
conversation, because follow-ups already resume the same Claude Code session.
The composer sends directly: edits only by default, full access confirmed once
per workspace and reset after every send. Green is reserved for verified
results, so a Claude Code run, which is recorded but not tested, ends in silver.
See [spec 0015](specs/0015-desktop-restyle.md).

### Name

The project is named **Argent**. Other software also uses the name; no exclusive
brand, domain or trademark is claimed. The name is kept for now and is reviewed
once more before the first signed release, because renaming after a release
costs more. See
[spec 0003](specs/0003-project-identity.md).

### Local execution ownership and hardening — 9 November 2026

Accepted safety requirements, implemented in main `82f180b`. A durable lease fences database writes, not a detached agent's writes
to a worktree. Real interrupted runs must remain blocked unless independent
process reconciliation proves quiescence; a resolution note is insufficient.
A live process supervisor owns the whole process group through normal exit,
cancellation and early reader failure. Unconfirmed cleanup remains uncertain.
See [spec 0013](specs/0013-local-mvp.md#local-execution-hardening)
for acceptance criteria and remaining recovery limits.

Cancellation follow-up implemented in main `707ae8b`, 10 November 2026: native fixtures at
main `a9bc431` exposed transient process-group `EPERM` during exit. Bounded
retries require a fresh successful signal/probe or confirmed absence; permission
denial alone never proves termination. Persistent failures retain the accepted
uncertainty policy, and existing blocked runs are not relabelled. See the
[regression acceptance criteria](specs/0013-local-mvp.md#cancellation-regression-acceptance).
The [development walkthrough](specs/0013-local-mvp.md#development-walkthrough-evidence)
records real cancellation and parallel-workspace results with that correction;
the implementation recorded at `87011a2` is integrated in main `707ae8b`.
Integration review confirmed identical supervisor code and regression tests,
closing work-queue item 1 using the recorded walkthrough evidence. L1.3 is next.
This does not change the accepted recovery policy or milestone order, and does
not establish the complete L1 exit.

Keep the modular monolith, single-host SQLite and official CLI adapters. Extract
process supervision, safe Git and evidence hashing into small shared modules;
do not replace the durable engine to address local execution defects. Submodules
remain unsupported until recursive safe inspection is designed. CLI events are
untrusted input with schema and byte limits. Desktop concurrency is bounded by
worker slots and the existing atomic claim invariant.

The delivery contract adds website build/browser checks and native development
and packaged smoke checks to CI. Packaging dependency overrides are narrow and
temporary: remove them when the upstream dependency ranges include patched
releases, with package compatibility and advisory checks repeated. See
[spec 0004](specs/0004-desktop-prototype.md#delivery-regression-gates).

### Claude Code failure summaries — 10 November 2026

Usability correction in development, based on main `a9bc431`; the accepted
execution and security contracts are unchanged. A CLI result subtype is untrusted
protocol metadata, not a user-facing outcome: `success` can accompany an error
flag and nonzero exit. Keep the provider explanation in the bounded transcript
and use "Claude Code failed (exit N)." as Argent's summary. Do not infer recovery
actions, change permissions or automatically retry from provider text. The
[regression acceptance criteria](specs/0013-local-mvp.md#failure-summary-regression-in-development)
require fake-CLI and renderer coverage; real walkthrough evidence remains a
separate pending gate.

### Bounded local changes inspection — 11 November 2026

Service implemented in main `1b9e4dd`, within the
accepted L1.3 scope. A read-only service operation compares the recorded base
with safely read current bytes, without delegating working-tree reads to Git
conversions. Whole-file replacement hunks and exact-content rename detection
keep the first implementation bounded and dependency-free. Oversized inputs
fail the complete request; live display data is never stored as verification.
The [service acceptance contract](specs/0013-local-mvp.md#read-only-changes-service-acceptance)
records limits and automated regression coverage. Desktop integration is
implemented at `37ea7804b1c024e6324b766951ab98329c7037b0`: an on-demand dialog
preserves the existing shell and prevents repository scans on transcript polling. A generation guard
discards stale reads; quoted filenames, visible control characters and literal
text preserve the untrusted-display boundary. The bridge validates one UUID and
the bounded response, with a dedicated twenty-second request timeout.
The [implementation evidence](specs/0013-local-mvp.md#l13-implementation-evidence)
records passing repository checks and native acceptance on 11 November 2026.
Trusted checks remain L1.4; no product, milestone or local security decision changes.
