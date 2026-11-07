# Roadmap

Last reviewed 7 November 2026. Milestones are sequenced by demonstrated behavior,
not dates: each one ends with evidence, and nothing is advertised before it works.
Planning does not authorize spending, publication or foundation replacement.

## Product direction

Argent is an independently usable desktop app with a familiar layout:
repository and workspace navigation, agent sessions and a composer, files, diffs
and checks, and terminal tools in recognizable positions, all with original code
and identity. The website distributes the installed app; a headless service owns
execution. Portability, mobile access and users' existing subscriptions are core
product tracks, not decoration added after dependency orchestration.

The one-agent engineering proof is separate from the personal release that people
can adopt for daily work. The first real agent is Codex through its official
interface (provisional). The personal release targets Claude Code and Codex, with
Cursor and OpenCode as further targets, all through official interfaces.
Subscriptions are validated per provider and deployment: there is no universal
"link every subscription" promise, API keys remain an explicit alternative and the
first technical-pilot route, and Argent never silently switches to billable API
usage.

Basic branch/worktree creation and setup/run/test/review/archive actions are part
of the daily workflow, not deferred to dependent-task orchestration. Prove one
isolated workspace first, then bounded independent workspaces running in parallel.
A full team and cloud release additionally needs shared sessions and team handoff;
the personal release is an explicitly smaller gate. No release may advertise
parity for unimplemented controls or providers.

## Milestones and exit evidence

| Milestone                               | Status / outcome                                                                                              | Exit evidence                                                                                                                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 / P1 foundation                      | Implemented local durability, desktop and detached service; execution simulated.                              | Existing state/process/claim/reconnect/verification tests and recorded native P1 evidence. No real agents/cloud or public signed build.                                                                                                                                                   |
| P2: familiar desktop shell              | Integrated P2/P2.1 shell and UX; original engine retained; execution simulated.                               | [Spec 0008](docs/specs/0008-desktop-workspace-shell.md) and [0009](docs/specs/0009-desktop-ux-polish.md): recorded native smoke plus real saved navigation/composer/evidence. Git/terminal/account panels remain previews.                                                                |
| Customer/auth compatibility             | Begin now alongside M1a.                                                                                      | Dated provider/auth/deployment matrix; observe real workflows, subscription needs, mobile tasks, switching friction and willingness to pilot. No demand assumed.                                                                                                                          |
| M1a: persistent cloud workspace         | Internal lifecycle/bootstrap/custody/cleanup simulations and read-only GitHub device pilot implemented.       | One App-scoped repository, isolated pinned branch/worktree checkout, retained files/dependencies after suspend/resume and audited live cleanup. Production custody and concrete provider/budget approval precede provisioning. [Spec 0007](docs/specs/0007-cloud-workspace-lifecycle.md). |
| M1b: one real agent and visible control | First official agent integration (Codex, provisional); an API-key pilot may prove the engine.                 | Laptop-independent work, retained transcripts, second-client reconnect, freshness/location/input controls, acknowledged cancellation and conservative reconciliation. This alone is not the personal release.                                                                             |
| M1c: tested draft pull request          | Trusted checks and independent review for the exact commit.                                                   | Tested SHA, retained output, bounded repair, timeout-safe PR deduplication and explicit human merge authority.                                                                                                                                                                            |
| M1d: portable continuity and migration  | First offline Argent history export/read-only restore slice implemented; all archived work remains simulated. | [Spec 0012](docs/specs/0012-portable-history.md) proves bounded metadata/selected text/artifacts and separate historical storage. Desktop preview, Git changes, real transcripts, fresh-machine drill and consented importers from other tools remain open.                               |
| W1: daily workspace workflows           | Implement with real execution, before the personal release.                                                   | Create/select isolated branches/worktrees; reviewed setup/run/test actions, file/diff inspection, bounded terminal, exact-commit checks, human-controlled draft PR and safe archive. Two independent workspaces cannot overwrite each other or share secrets.                             |
| P3: subscription and agent breadth      | Personal release requirement, moved ahead of team work.                                                       | Claude Code and Codex through official interfaces with a verified subscription route for each advertised environment; explicit quotas/revocation/no paid fallback. Cursor/OpenCode remain named parity targets with per-release support disclosure.                                       |
| P4: mobile companion / native iOS       | Early product track after safe remote access, ahead of teams/dependencies.                                    | Authenticated status/activity/diff/evidence, scoped input and acknowledged cancellation; desktop-offline/phone-reconnect, stale approval and duplicate-command tests. Native iOS delivery is a separate acceptance slice; a web preview is not the app.                                   |
| Personal release                        | W1 daily workflows + real isolated execution + two-provider evidence + continuity + usable mobile companion.  | Unassisted adoption/migration walkthroughs and actual tests for every advertised capability. Native app availability and remaining four-harness parity disclosed explicitly; no generic feature-parity claim.                                                                             |
| Managed release                         | Complete M1, continuity, remote-client and security contracts.                                                | PostgreSQL before multiple control-plane hosts/tenants; remote authorization, isolation/credential review, enforced limits, cost/cleanup evidence, backup/restore and independent self-host operation.                                                                                    |
| Desktop distribution                    | Signed download/install/launch experience, alongside engineering tracks.                                      | Versioned artifacts, signing/notarization, checksums and verified updates. Publication separately authorized.                                                                                                                                                                             |
| M2a: scoped team handoff                | Shared workflows after a useful personal release.                                                             | Actor/workspace authorization, attributed approvals, serialized writers and handoff without sharing credentials.                                                                                                                                                                          |
| Full team and cloud release             | Personal release plus managed security and M2a shared sessions/handoff.                                       | Multiple authenticated actors, laptop-offline/phone-reconnect, concurrent workspace isolation, attributed steering/review and practical independent restore. Every advertised team workflow requires observed acceptance evidence.                                                        |
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
3. The first [offline continuity](docs/specs/0012-portable-history.md) slice is
   implemented. Next add desktop preview/history controls and real transcript/Git
   manifests; a consented redacted sample must precede any importer from another
   tool. Preserve originals; do not equate readable history with resumed processes.
4. Define safe remote-client authentication and command/approval semantics before
   native iOS implementation. Prove desktop-offline/phone-reconnect behavior, then
   second-provider/subscription and personal release acceptance. Keep team
   handoff ahead of task dependencies; the full cloud release includes team gates.

Retain Electron and the current API/store/worker/adapter boundaries. No upstream
fork, VM runtime rewrite, swarms or automatic merges. Never expose M0 beyond
loopback to accelerate mobile. No paid resources until concrete account/provider,
region, shape and budget authorization. No new customer interviews, account
connections, exports, cloud resources, deployment or binary release are implied
by this roadmap or UI preview.
