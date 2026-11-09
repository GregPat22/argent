# Roadmap

Last reviewed 9 November 2026. Milestones are sequenced by demonstrated behavior,
not dates: each one ends with evidence, and nothing is advertised before it works.
Planning does not authorize spending, publication or foundation replacement.

## Product direction

Argent is an independently usable desktop app with a familiar layout:
repository and workspace navigation, agent sessions and a composer, files, diffs
and checks, and terminal tools in recognizable positions, all with original code
and identity. The website distributes the installed app; a headless service owns
execution. Portability, mobile access and users' existing subscriptions are core
product tracks, not decoration added after dependency orchestration.

**Local first, then cloud.** The first usable release runs real coding agents on
the developer's own computer: each workspace is an isolated Git branch and
worktree of a local repository, and the agent runs through its official
command-line interface under the developer's own sign-in. This is the fastest
route to a tool people can use for daily work, and it exercises the real agent,
worktree, diff, check and pull-request contracts that cloud workspaces need
later. Cloud workspaces (laptop-independent execution) follow on the same engine.

Each workspace chooses its agent, and each run can choose a model the agent
offers under the developer's sign-in: Claude models through Claude Code, GPT
models through Codex. Argent never routes or proxies models itself.
The first real agent is Claude Code through its official CLI, then Codex, then
Cursor and OpenCode, all through official interfaces. Subscriptions are validated
per provider and deployment: there is no universal "link every subscription"
promise. In local mode the agent uses its own official sign-in on the developer's
computer; Argent never reads or copies it, and removes provider API-key variables
from the agent's environment so that work is never silently switched to billable
API usage. Hosted workers never receive desktop subscription credentials.

Local execution is not a sandbox. The agent runs as the developer, with the same
access as running it in a terminal; a worktree separates changes, not privileges.
The desktop says so plainly. See [spec 0013](docs/specs/0013-local-mvp.md).

## Milestones and exit evidence

| Milestone                              | Status / outcome                                                                                   | Exit evidence                                                                                                                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 / P1 foundation                     | Implemented local durability, desktop and detached service; execution simulated.                   | Existing state/process/claim/reconnect/verification tests and recorded native P1 evidence.                                                                                                                                                                 |
| P2: familiar desktop shell             | Integrated P2/P2.1 shell and UX; original engine retained; execution simulated.                    | [Spec 0008](docs/specs/0008-desktop-workspace-shell.md) and [0009](docs/specs/0009-desktop-ux-polish.md). Git/terminal/account panels remain previews.                                                                                                     |
| **L1: local MVP** (critical path)      | In development. Real Claude Code in isolated local worktrees, end to end to a draft pull request.  | [Spec 0013](docs/specs/0013-local-mvp.md): the slices below, each with automated tests, and a maintainer completing real tasks on this repository through Argent, including two workspaces in parallel and one human-merged pull request.                  |
| L1.1 worktree workspaces + Claude Code | Implemented.                                                                                       | Create a branch/worktree from a local repository; run Claude Code in it with a live transcript, follow-up turns and acknowledged cancel; record the resulting commit and diff as evidence.                                                                 |
| L1.2 desktop on real execution         | Implemented; a recorded run with the real CLI is pending.                                          | Choose a local repository, create/select workspaces, see the agent's transcript, send follow-ups, choose the permission mode and cancel, in the desktop app.                                                                                               |
| L1.3 changes panel                     | Planned.                                                                                           | Real changed-file list and diff for the workspace against its base.                                                                                                                                                                                        |
| L1.4 setup, run and test actions       | Planned.                                                                                           | Per-repository reviewed commands with bounded output; a test result recorded for the exact commit as evidence, separate from what the agent says.                                                                                                          |
| L1.5 draft pull request and archive    | Planned.                                                                                           | Commit, push and open a draft pull request through the developer's own `gh`; merge stays a human action. Archive removes the worktree only when it is safe.                                                                                                |
| L1.6 Codex and model choice            | Planned.                                                                                           | Codex through its official CLI with the same controls; the agent chosen per workspace and the model per run, for both agents; two-agent evidence.                                                                                                          |
| Customer/auth compatibility            | Alongside L1.                                                                                      | Dated provider/auth/deployment matrix. No demand assumed.                                                                                                                                                                                                  |
| Desktop distribution                   | After L1.                                                                                          | Signed/notarized versioned artifacts, checksums and verified updates. Publication separately authorized.                                                                                                                                                   |
| M1: persistent cloud workspace         | After L1. Lifecycle/bootstrap/custody/cleanup simulations and read-only GitHub device pilot exist. | One App-scoped repository, isolated pinned checkout, files/dependencies retained across suspend/resume, laptop-independent agent run, audited cleanup. [Spec 0002](docs/specs/0002-cloud-mvp.md) and [0007](docs/specs/0007-cloud-workspace-lifecycle.md). |
| M1d: portable continuity and migration | First offline export/read-only restore slice implemented.                                          | [Spec 0012](docs/specs/0012-portable-history.md). Desktop preview, real transcripts/Git manifests, a fresh-machine drill and consented importers remain open.                                                                                              |
| P4: mobile companion / native iOS      | After cloud execution and safe remote access.                                                      | Authenticated status/activity/diff/evidence, scoped input and acknowledged cancellation; desktop-offline/phone-reconnect tests. A web preview is not the app.                                                                                              |
| Personal release                       | L1 + distribution + continuity; cloud and mobile per their own gates.                              | Unassisted adoption walkthroughs and actual tests for every advertised capability. No generic feature-parity claim.                                                                                                                                        |
| Managed release                        | Complete M1, continuity, remote-client and security contracts.                                     | PostgreSQL before multiple control-plane hosts/tenants; remote authorization, isolation/credential review, enforced limits, cost/cleanup evidence, backup/restore and independent self-host operation.                                                     |
| M2a: scoped team handoff               | After a useful personal release.                                                                   | Actor/workspace authorization, attributed approvals, serialized writers and handoff without sharing credentials.                                                                                                                                           |
| M2b: dependent tasks                   | After daily workflow adoption.                                                                     | Explicit dependencies, bounded concurrency/repair, recovery and review evidence.                                                                                                                                                                           |
| Later                                  | Advanced enterprise controls, Android and broader editor capabilities as justified.                | Separate product/acceptance decisions. No availability implied.                                                                                                                                                                                            |

## Work queue

This is the order of work for the local MVP. Take the first item that is not
done. Do not start a later item early, and do not add scope to an item: propose
it instead (see [AGENTS.md](AGENTS.md#9-when-to-stop-and-ask)). Each item is one
or more small pull requests with tests. Anything that launches a process,
builds a path or runs Git gets a dedicated security review against the
[security model](docs/specs/0013-local-mvp.md#security-model).

| #   | Item                                 | Status   | Depends on                                                     | Done when                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------ | -------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Real run with the official CLI       | **Next** | A maintainer's signed-in Claude Code CLI. Maintainer go-ahead. | A maintainer completes real tasks in the desktop app on this repository: one in edits-only mode, one in full access, one cancelled mid-run, two workspaces in parallel. The walkthrough is recorded in spec 0013 by commit, with every defect found either fixed or listed. |
| 2   | L1.3 changes panel                   | Planned  | Item 1.                                                        | The desktop shows the workspace's changed files and a bounded diff against its base, read through the service with trusted Git; untracked, renamed, deleted and binary files are handled; tests cover path traversal and oversized diffs.                                   |
| 3   | L1.4 setup, run and test actions     | Planned  | Item 2. Security review.                                       | Commands come from a reviewed per-repository configuration the agent cannot change; a test result is recorded as evidence for the exact commit, separate from what the agent says; a later change marks it stale.                                                           |
| 4   | L1.5 draft pull request and archive  | Planned  | Item 3. The developer's own `gh` sign-in.                      | Commit, push and a draft pull request through `gh`, with the URL recorded; an unknown outcome becomes `needs_attention` and is never retried; archive removes only a worktree Argent created, only when clean or explicitly discarded.                                      |
| 5   | Process reconciliation after a crash | Planned  | Items 1 to 4 may expose more cases.                            | After a hard service crash, Argent proves by process identity whether the earlier agent has stopped, and only then lets the developer continue the workspace. Required by the [hardening contract](docs/specs/0013-local-mvp.md#local-execution-hardening).                 |
| 6   | L1.6 Codex and model choice          | Planned  | Items 1 to 4. Codex installed and signed in for testing.       | Codex runs through its official CLI with the same controls; agent chosen per workspace, model per run, for both agents.                                                                                                                                                     |
| 7   | L1 exit evidence                     | Planned  | Items 1 to 6.                                                  | The [exit evidence](docs/specs/0013-local-mvp.md#exit-evidence-for-l1) in spec 0013, including one pull request created through Argent and merged by a person.                                                                                                              |
| 8   | Desktop distribution                 | After L1 | Item 7. Maintainer authorization for signing and publishing.   | Signed and notarized macOS build, checksum, versioned release; the website's claims match that release.                                                                                                                                                                     |

Already done and not to be redone: L1.1, L1.2, the
[local hardening](docs/specs/0013-local-mvp.md#local-execution-hardening) and
the [desktop restyle](docs/specs/0015-desktop-restyle.md).

## Limits

1. Keep the cloud simulations, custody and GitHub pilot code as they are; resume
   M1 after L1 with the live gates in
   [spec 0010](docs/specs/0010-live-repository-pilot-gates.md) unchanged.
2. Fake-CLI tests do not prove real behavior. A real CLI walkthrough and durable
   process recovery are separate evidence requirements (items 1 and 5).

Retain Electron and the current API/store/worker/adapter boundaries. No upstream
fork, swarms or automatic merges. Never expose the local service beyond loopback.
No paid resources until concrete account/provider, region, shape and budget
authorization. No deployment or binary release is implied by this roadmap.
