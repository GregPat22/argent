# Roadmap

Updated 6 November 2026 on `GregPat22/conductor-layout-create` after the founder
requested a familiar Conductor replacement, subscription breadth, mobile and cloud
migration. [P2 scope and evidence](docs/specs/0008-conductor-familiar-desktop.md)
supersedes the earlier sequencing where agent breadth/mobile came with teams.
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

## Milestones and exit evidence

| Milestone                               | Status / outcome                                                                                                  | Exit evidence                                                                                                                                                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 / P1 foundation                      | Implemented local durability, desktop and detached service; execution simulated.                                  | Existing state/process/claim/reconnect/verification tests and recorded native P1 evidence. No real agents/cloud or public signed build.                                                                                                                           |
| P2: familiar desktop shell              | Raw layout in this branch; original engine retained.                                                              | [Spec 0008](docs/specs/0008-conductor-familiar-desktop.md): real saved navigation/composer/evidence; honest planned panels; native smoke and `npm run check`.                                                                                                     |
| Customer/auth compatibility             | Begin now alongside M1a.                                                                                          | Dated provider/auth/deployment matrix; observe real workflows, subscription needs, mobile tasks, switching friction and willingness to pilot. No demand assumed.                                                                                                  |
| M1a: persistent cloud workspace         | Internal lifecycle/bootstrap/custody/recovery-cleanup simulations complete; real adapters next.                   | One GitHub App-scoped repository, isolated pinned checkout, retained files/dependencies after suspend/resume, audited uncertain cleanup. Concrete provider/budget approval precedes live provisioning. [Spec 0007](docs/specs/0007-cloud-workspace-lifecycle.md). |
| M1b: one real agent and visible control | First official agent integration; API-key pilot may prove the engine.                                             | Laptop-independent work, retained transcripts, second-client reconnect, freshness/location/input controls, acknowledged cancellation and conservative reconciliation. This alone is not a replacement launch.                                                     |
| M1c: tested draft pull request          | Trusted checks and independent review for the exact commit.                                                       | Tested SHA, retained output, bounded repair, timeout-safe PR deduplication and explicit human merge authority.                                                                                                                                                    |
| M1d: portable continuity and migration  | Design now; implement alongside the real-agent track before replacement launch.                                   | Versioned Argent export/restore independent of our hosted endpoints; integrity/secret/path checks; selected working files and readable history. Conductor importer follows a consented sample. Live-process resume is a separate capability.                      |
| P3: subscription and agent breadth      | Personal release requirement, moved ahead of team work.                                                           | Claude Code and Codex through official interfaces with a verified subscription route for each advertised environment; explicit quotas/revocation/no paid fallback. Cursor/OpenCode remain named parity targets with per-release support disclosure.               |
| P4: mobile companion / native iOS       | Early product track after safe remote access, ahead of teams/dependencies.                                        | Authenticated status/activity/diff/evidence, scoped input and acknowledged cancellation; desktop-offline/phone-reconnect, stale approval and duplicate-command tests. Native iOS delivery is a separate acceptance slice; a web preview is not the app.           |
| Personal replacement release            | Familiar daily workflow + real isolated execution + two-provider evidence + continuity + usable mobile companion. | Unassisted adoption/migration walkthroughs and actual tests for every advertised capability. Native app availability and remaining four-harness parity disclosed explicitly; no generic “full Conductor parity” claim.                                            |
| Managed release                         | Complete M1, continuity, remote-client and security contracts.                                                    | PostgreSQL before multiple control-plane hosts/tenants; remote authorization, isolation/credential review, enforced limits, cost/cleanup evidence, backup/restore and independent self-host operation.                                                            |
| Desktop distribution                    | Signed download/install/launch experience, alongside engineering tracks.                                          | Versioned artifacts, signing/notarization, checksums and verified updates. Publication separately authorized.                                                                                                                                                     |
| M2a: scoped team handoff                | Shared workflows after a useful personal replacement.                                                             | Actor/workspace authorization, attributed approvals, serialized writers and handoff without sharing credentials.                                                                                                                                                  |
| M2b: dependent tasks                    | Follow-on tasks and isolated worktrees after daily workflow adoption.                                             | Explicit dependencies, bounded concurrency/repair, recovery and review evidence.                                                                                                                                                                                  |
| Later                                   | Advanced enterprise controls, Android and broader editor capabilities as justified.                               | Separate product/acceptance decisions. No availability implied.                                                                                                                                                                                                   |

## Next actions and limits

1. Review the P2 desktop draft and verify adoption friction against the observed
   Conductor layout. Fixed widths, loaded-history Home/Search and simulator task
   sessions are deliberate raw-layout limits, not parity claims.
2. Complete the provider/auth matrix and live M1a access/isolated checkout plus
   audited live credential cleanup/inspection and production key custody. Internal
   recovery cleanup is simulated and does not satisfy live M1a gates. The current
   local adapter cannot execute repo code. The unwired read-only HTTP preflight
   has synthetic coverage; [live pilot gates](docs/specs/0010-live-repository-pilot-gates.md)
   remain required before live credentials or checkout.
3. Scope migration from a consented redacted export and build Argent continuity
   first. Preserve originals and distinguish files, readable history and process
   resumption. No original Conductor export schema was inspected in this pass.
4. Deliver the one-agent proof, then second-provider/subscription and mobile
   acceptance slices before team/dependency scope. Retain real verification and
   human control while making the daily experience familiar.

Retain Electron and the current API/store/worker/adapter boundaries. No upstream
fork, VM runtime rewrite, swarms or automatic merges. Never expose M0 beyond
loopback to accelerate mobile. No paid resources until concrete account/provider,
region, shape and budget authorization. No new customer interviews, account
connections, exports, cloud resources, deployment or binary release are implied
by this roadmap or UI preview.
