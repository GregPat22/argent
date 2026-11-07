# Conductor replacement: project and roadmap review

Reviewed 7 November 2026 on `GregPat22/conductor-replacement-roadmap-review`,
base main `5c258356ac2c66d62d5adfa24200b6cffd778a3f`. Read the preserved
[Grok report](sources/grok-conductor-report-2026-11-06.txt),
[previous evidence review](conductor-shutdown-analysis.md), project entry points,
roadmap, architecture, relevant acceptance contracts and actual store/worker,
adapter, desktop and GitHub-pilot boundaries. No upstream implementation is copied.

## Finding

The product direction makes sense: a downloadable desktop controlling durable
isolated execution, familiar daily workflows, supported agent authentication,
portable work and mobile control. Argent currently demonstrates desktop UI and
local orchestration durability, not the replacement product. More internal
simulation features cannot substitute for live isolation and a useful real task.
The cloud critical path must remain explicit while independent work progresses.

“Perfect replacement” needs a capability checklist and observed user journeys.
It cannot be declared from visual resemblance, marketing pages or test counts.
Personal replacement and full team/cloud replacement have different exit gates.

## Sources rechecked

- The [official announcement](https://www.conductor.build/announcement) and
  [0.93.0 release note](https://www.conductor.build/changelog/0.93.0-conductor-is-joining-meta)
  still state cloud read-only on 13 November, shutdown on 20 November, and local
  model/critical fixes until early 2027. They describe Transfer to local and account
  export. They do not establish portable live-session import into Argent.
- Official [workspace](https://www.conductor.build/docs/concepts/workspaces-and-branches),
  [worktree](https://www.conductor.build/docs/concepts/git-worktrees) and
  [workflow](https://www.conductor.build/docs/concepts/workflow) documentation
  confirms the repository → workspace/branch → run/test → diff/review → PR/archive
  journey. Basic worktrees and setup/run actions belong to daily replacement,
  before dependency orchestration. Git worktrees provide change separation;
  untrusted execution still needs an actual security boundary.
- [Boxes.dev](https://boxes.dev/) advertises cloud computers, existing Claude/Codex
  subscriptions, phone control and collaborative workflows. These are vendor
  claims, not hands-on reliability or entitlement tests. They defeat an unsupported
  claim that the cloud/mobile category is empty.
- [Paradev's migration guide](https://docs.paradev.com/migrate-from-conductor-cloud)
  describes mappings for cloud workspaces, setup/actions, automations and iOS.
  Advertised migration availability does not establish exact session fidelity.
- Direct retrieval of [the linked X post](https://x.com/manny4c/status/2118051955646030027)
  again returned 403. The founder's earlier verification remains recorded;
  independent post access, sampling prevalence, willingness to pay and competitor
  runtime quality remain unestablished. Grok's report supplies hypotheses, not
  measured feature priorities. No customer outreach was performed.

## Capability assessment and build decision

| Area                      | Actual repository evidence                                                               | Build decision / required proof                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop                   | Electron shell, narrow bridge, detached service and recorded native smoke                | Retain; implement real accounts, Git/file/diff and terminal surfaces behind the same boundaries. Signed distribution remains a gate.                                                                |
| Cloud                     | Durable internal lifecycle/bootstrap/recovery simulations; read-only GitHub device pilot | Highest engineering priority: production credential custody, approved isolated runner and live checkout/persistence/cleanup. No host-execution fallback.                                            |
| Worktrees                 | Workspace metadata only; no real Git checkout                                            | Put a pinned branch/worktree in isolated compute in M1a. Prove separate files/branches and conflict handling before parallel daily workflows.                                                       |
| Workflows                 | Simulated task queue/cancel/evidence; composer review                                    | Basic setup/run/test/review/draft-PR/archive before replacement launch. Separate task dependency scheduling from these essential workflows.                                                         |
| Agents/subscriptions      | No real agent connected to task execution                                                | One official agent end to end first, then Claude Code/Codex breadth. Verify each advertised auth/deployment combination; preserve explicit no-paid-fallback behavior.                               |
| Continuity/migration      | Previously only a planned contract                                                       | Implement bounded offline Argent export/read-only restore now. Original Conductor import requires consented redacted samples; worktrees, history and live process state are distinct.               |
| Mobile                    | Preview text only                                                                        | Define authenticated remote-client commands and stale/duplicate approval handling, then native iOS status/diff/input/cancel. An exposed loopback API or responsive preview does not satisfy mobile. |
| Teams                     | No actor/tenant model                                                                    | Full Conductor Cloud replacement needs attributed shared-session/handoff and writer arbitration. Personal replacement may precede it with explicit limits.                                          |
| Enterprise/editor breadth | Planned                                                                                  | Later, with separate need and acceptance evidence. No shell rewrite, full IDE, VM runtime or generic workflow engine now.                                                                           |

## Next development phase selected

[Spec 0012](../specs/0012-portable-history.md) implements a real offline continuity
slice over the existing simulator's actual history. This addresses the verified
vendor-continuity risk and can proceed without credentials, resource purchases,
public ingress or a fabricated Conductor importer. It does not move the cloud
critical path or mark M1d complete.

The format exports one consistent workspace snapshot, hashes and omission
inventory. Text is opt-in; executable authority and raw credential/event fields
are excluded. A separate history store restores only historical/untrusted views,
preserving uncertain statuses and preventing queue dispatch by construction.
CLI inspection survives source unavailability and process restart. This is useful
core functionality for later desktop migration and mobile history clients;
neither UI integration is implemented in this slice.

Next cloud implementation remains the bounded account/custody and live isolated
checkout contract in [spec 0010](../specs/0010-live-repository-pilot-gates.md),
with concrete account/provider/region/shape/runtime/storage/spend/cleanup limits.
Routine technical decisions are delegated by the founder; resource/account
actions still follow the existing explicit gates. No generic permission question
is needed for the local continuity work.

## Evidence and limits

Current validation and exact branch state are recorded in
[HANDOFF.md](../../HANDOFF.md) and spec 0012. The review uses primary source
documentation plus source inspection, not hands-on competitor comparisons or
new provider policy/entitlement verification. The original Grok report is unchanged.
No demand metric, complete parity, cloud execution, native mobile availability,
fresh-machine recovery or tested pull request is claimed.
