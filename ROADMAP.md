# Roadmap

Reviewed 7 November 2026 on `GregPat22/conductor-replacement-roadmap-review`,
base main `5c25835`, after the founder requested a careful full-replacement review
and autonomous next-phase development. The [capability assessment](docs/research/replacement-roadmap-review-2026-11-07.md)
rechecks Grok against primary sources and actual implementation.
[P2 scope and evidence](docs/specs/0008-conductor-familiar-desktop.md) retains
subscription breadth, migration and mobile before dependency scheduling.
Sequence by demonstrated behavior, not dates. Planning does not authorize spending,
publication, foundation replacement or copying proprietary implementation.

## Product direction

Build Argent as a familiar, independently usable Conductor-style desktop app:
repository/workspace navigation, agent sessions/composer, files/diffs/checks and
terminal tools in recognizable positions. Keep our original implementation and
identity. The website distributes the installed desktop; a headless service owns
execution. Portability, mobile access and users' existing subscriptions are core
product tracks, not optional decoration after dependency orchestration.

Distinguish the one-agent engineering proof from the personal replacement release.
Target Claude Code, Codex, Cursor and OpenCode through their official interfaces.
Validate subscriptions per provider and deployment. A universal “link every
subscription” promise is not established; API keys remain an explicit alternative
and first technical-pilot route. Never silently switch to billable API usage.
Grok's qualitative findings support investigation, not measured demand or a feature
ranking. Follow the [research](docs/research/conductor-shutdown-analysis.md).

Basic branch/worktree creation and setup/run/test/review/archive are part of the
daily replacement workflow, not deferred to dependent-task orchestration. Prove
one isolated workspace first, then bounded independent workspaces. Full Conductor
Cloud replacement additionally needs shared sessions/team handoff; the personal
release is an explicitly smaller product gate. No release may advertise parity
for unimplemented controls or providers.

## Milestones and exit evidence

| Milestone                               | Status / outcome                                                                                              | Exit evidence                                                                                                                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 / P1 foundation                      | Implemented local durability, desktop and detached service; execution simulated.                              | Existing state/process/claim/reconnect/verification tests and recorded native P1 evidence. No real agents/cloud or public signed build.                                                                                                                                                   |
| P2: familiar desktop shell              | Integrated P2/P2.1 shell and UX; original engine retained; execution simulated.                               | [Spec 0008](docs/specs/0008-conductor-familiar-desktop.md) and [0009](docs/specs/0009-desktop-ux-polish.md): recorded native smoke plus real saved navigation/composer/evidence. Git/terminal/account panels remain previews.                                                             |
| Customer/auth compatibility             | Begin now alongside M1a.                                                                                      | Dated provider/auth/deployment matrix; observe real workflows, subscription needs, mobile tasks, switching friction and willingness to pilot. No demand assumed.                                                                                                                          |
| M1a: persistent cloud workspace         | Internal lifecycle/bootstrap/custody/cleanup simulations and read-only GitHub device pilot implemented.       | One App-scoped repository, isolated pinned branch/worktree checkout, retained files/dependencies after suspend/resume and audited live cleanup. Production custody and concrete provider/budget approval precede provisioning. [Spec 0007](docs/specs/0007-cloud-workspace-lifecycle.md). |
| M1b: one real agent and visible control | First official agent integration; API-key pilot may prove the engine.                                         | Laptop-independent work, retained transcripts, second-client reconnect, freshness/location/input controls, acknowledged cancellation and conservative reconciliation. This alone is not a replacement launch.                                                                             |
| M1c: tested draft pull request          | Trusted checks and independent review for the exact commit.                                                   | Tested SHA, retained output, bounded repair, timeout-safe PR deduplication and explicit human merge authority.                                                                                                                                                                            |
| M1d: portable continuity and migration  | First offline Argent history export/read-only restore slice implemented; all archived work remains simulated. | [Spec 0012](docs/specs/0012-portable-history.md) proves bounded metadata/selected text/artifacts and separate historical storage. Desktop preview, Git changes, real transcripts, fresh-machine drill and consented Conductor importer remain open.                                       |
| W1: daily workspace workflows           | Implement with real execution, before personal replacement launch.                                            | Create/select isolated branches/worktrees; reviewed setup/run/test actions, file/diff inspection, bounded terminal, exact-commit checks, human-controlled draft PR and safe archive. Two independent workspaces cannot overwrite each other or share secrets.                             |
| P3: subscription and agent breadth      | Personal release requirement, moved ahead of team work.                                                       | Claude Code and Codex through official interfaces with a verified subscription route for each advertised environment; explicit quotas/revocation/no paid fallback. Cursor/OpenCode remain named parity targets with per-release support disclosure.                                       |
| P4: mobile companion / native iOS       | Early product track after safe remote access, ahead of teams/dependencies.                                    | Authenticated status/activity/diff/evidence, scoped input and acknowledged cancellation; desktop-offline/phone-reconnect, stale approval and duplicate-command tests. Native iOS delivery is a separate acceptance slice; a web preview is not the app.                                   |
| Personal replacement release            | W1 daily workflows + real isolated execution + two-provider evidence + continuity + usable mobile companion.  | Unassisted adoption/migration walkthroughs and actual tests for every advertised capability. Native app availability and remaining four-harness parity disclosed explicitly; no generic “full Conductor parity” claim.                                                                    |
| Managed release                         | Complete M1, continuity, remote-client and security contracts.                                                | PostgreSQL before multiple control-plane hosts/tenants; remote authorization, isolation/credential review, enforced limits, cost/cleanup evidence, backup/restore and independent self-host operation.                                                                                    |
| Desktop distribution                    | Signed download/install/launch experience, alongside engineering tracks.                                      | Versioned artifacts, signing/notarization, checksums and verified updates. Publication separately authorized.                                                                                                                                                                             |
| M2a: scoped team handoff                | Shared workflows after a useful personal replacement.                                                         | Actor/workspace authorization, attributed approvals, serialized writers and handoff without sharing credentials.                                                                                                                                                                          |
| Full team/cloud replacement             | Personal release plus managed security and M2a shared sessions/handoff.                                       | Multiple authenticated actors, laptop-offline/phone-reconnect, concurrent workspace isolation, attributed steering/review and practical independent restore. All advertised Conductor workflows require observed acceptance evidence.                                                     |
| M2b: dependent tasks                    | Follow-on task scheduling after daily workflow adoption; basic worktrees ship earlier in M1a/W1.              | Explicit dependencies, bounded concurrency/repair, recovery and review evidence.                                                                                                                                                                                                          |
| Later                                   | Advanced enterprise controls, Android and broader editor capabilities as justified.                           | Separate product/acceptance decisions. No availability implied.                                                                                                                                                                                                                           |

## Next actions and limits

1. Keep live M1a as the critical path: production account/key custody, isolated
   pinned checkout and trustworthy cleanup under the concrete resource limits in
   [spec 0010](docs/specs/0010-live-repository-pilot-gates.md). The GitHub pilot
   proves sign-in/read access only. No repository code runs on the control host.
2. Complete the provider/auth/deployment matrix alongside that work. Then deliver
   one real agent, visible progress/input/cancel, exact-commit verification and an
   authorized draft PR. Integrate W1 workflows incrementally around that journey.
3. The independent next phase in this branch is [offline continuity](docs/specs/0012-portable-history.md).
   Next add desktop preview/history controls and real transcript/Git manifests;
   a consented redacted sample must precede Conductor import. Preserve originals;
   do not equate readable history with resumed processes. No source export was
   inspected in this pass.
4. Define safe remote-client authentication and command/approval semantics before
   native iOS implementation. Prove desktop-offline/phone-reconnect behavior, then
   second-provider/subscription and personal replacement acceptance. Keep team
   handoff ahead of task dependencies; full cloud replacement includes team gates.

Retain Electron and the current API/store/worker/adapter boundaries. No upstream
fork, VM runtime rewrite, swarms or automatic merges. Never expose M0 beyond
loopback to accelerate mobile. No paid resources until concrete account/provider,
region, shape and budget authorization. No new customer interviews, account
connections, exports, cloud resources, deployment or binary release are implied
by this roadmap or UI preview.
