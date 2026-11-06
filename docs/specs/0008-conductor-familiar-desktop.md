# P2: familiar desktop workflow and replacement roadmap

6 November 2026 · `GregPat22/conductor-layout-create`, based on `origin/main`
`333d66201a2c56a556b239abfe9777a89a8c7cd4` (PR #8).
Status: raw desktop layout implemented; verification evidence is recorded in the
handoff. Real agent, cloud, migration and mobile work below remains planned.

The follow-on [P2.1 refinement](0009-desktop-ux-polish.md) replaces decorative
Unicode icons with bundled Lucide SVGs and improves desktop styling, keyboard
navigation, drafts, forms and motion. Its acceptance/evidence supersedes the raw
layout's original typography, keyboard and animation limits; integration limits
and execution boundaries remain.

## Product decision

The founder requests a Conductor-like replacement with low learning friction,
existing subscriptions, mobile access and cloud-file continuity. Familiarity is
now an explicit product requirement. Preserve Argent's independently owned
headless execution, desktop installation, MIT core and verification boundaries.
Use original implementation and Argent identity; no Conductor source, icons,
private account data or transcripts are imported. `ui/argent-icon.webp` is a
byte-for-byte copy of our approved `website/public/brand/argent-icon-96.webp`,
whose provenance is recorded in the website brand README. Desktop assets are
packaged from `ui/` independently of the website build.

This supersedes the earlier recommendation against prioritizing feature parity.
It does not require full parity before a useful release. Separate the one-agent
engineering proof from a replacement users can actually adopt. A single Codex
integration is a technical milestone, not a provider-neutral replacement launch.

## Evidence and interpretation

Direct read-only navigation of the installed Conductor on this date covered:

| Observed surface        | Pattern carried into the draft                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| Active workspace        | Left repository/workspace navigation, center session, bottom composer, right inspection panel |
| Inspection and terminal | Artifacts, All files, Changes, Checks; Setup, Run and Terminal below                          |
| Home                    | Searchable saved-workspace navigation                                                         |
| Settings / Agents       | Claude Code, Codex, Cursor and OpenCode tabs; connection choices vary by agent                |
| Claude Code / Codex     | CLI/API choices; Codex additionally displays ChatGPT authentication                           |

No account setting, credential or workspace content was changed. No cloud
workspace was created or exported. Home in Argent is a searchable dialog over
loaded durable workspaces, not Conductor's full global dashboard. Pane widths
are fixed, with a hide/show inspector control; draggable splitters, repository
hierarchies/branches, multiple live chat tabs and real terminal/diff/file views
remain follow-up work. Sessions currently represent durable simulator tasks,
not multi-turn agent conversations.

The [official announcement](https://www.conductor.build/announcement), rechecked
6 November, confirms cloud read-only on 13 November and shutdown on 20 November,
with transfer-to-local and account export. This gives preservation urgency;
it does not prove Argent can restore their live sessions. The
[official introduction](https://www.conductor.build/docs) identifies Claude Code,
Codex, Cursor and OpenCode as supported harnesses. These are the initial
compatibility targets, not proof of identical subscription entitlements.
[OpenCode's provider documentation](https://opencode.ai/docs/providers/) further
illustrates that harness and model provider are separate choices.

Grok's report and the [earlier review](../research/conductor-shutdown-analysis.md)
remain qualitative evidence. Mobile/migration/subscriptions are founder-selected
priorities, not a measured ranking of users' requests. No new demand, competitor
reliability or willingness-to-pay evidence was gathered in this pass.

## Raw layout acceptance criteria

1. The installed Electron client uses a compact warm dark three-column shell:
   workspace/session navigation, session activity with composer, and inspection
   with terminal placement. Preserve desktop packaging and the existing service.
2. Saved workspace/session lists use authoritative durable data; no fake projects,
   model output, file trees, passing checks or subscription connections are seeded.
   Existing create/select/submit/cancel/stop/reconnect/artifact flows remain usable.
3. Home/Search searches loaded saved workspaces and states its pagination limit.
   Create opens the existing workspace form. Cmd/Ctrl+K and Cmd/Ctrl+N work when
   no modal is open. Native keyboard focus and Escape-close remain available.
4. The composer opens the existing task-review form with the entered text. It
   cannot submit an agent turn, bypass runtime review, or overwrite an uncertain
   pending request. Existing idempotency/recovery semantics remain authoritative.
5. Inspector tabs switch between truthful artifact/check status and planned
   file/diff empty states. Evidence actions open the real verification view.
   Collapsing the inspector preserves access to a visible reopen control.
6. Settings previews Claude Code, Codex, Cursor and OpenCode individually, with
   explicit unavailable connection state and provider-dependent eligibility.
   No OAuth, key capture/storage or model selection is implied by the mockup.
7. Migration/mobile/terminal previews say they are planned and perform no effects.
   Simulation and local execution location stay visible. No repository command
   runs through this presentation work.
8. At 900px minimum desktop width and the normal 1380px window, navigation,
   composer and inspection controls remain accessible without horizontal overflow.
   Dialog contents can scroll. Use keyboard-visible focus, native dialogs and
   meaningful labels; no animation is required.
9. Run the existing automated suite plus native smoke of navigation, composer,
   inspector, provider switching and modal paths. Review the actual diff and
   record fresh `npm run check` results and any native evidence gaps.

## Replacement launch scope and acceptance design

### Subscription breadth

Initial targets: Claude Code and Codex, followed by Cursor and OpenCode parity.
Do not hard-code ChatGPT as Argent's identity or route all agents through OpenAI.
Before calling the personal release a replacement, prove two distinct official
agent integrations, including Claude Code and Codex, and a supported subscription
route for each advertised environment. All four remain the parity target;
unimplemented/unsupported combinations stay visible and unavailable.

Produce a dated provider × auth method × deployment matrix (local isolated,
customer-operated remote, Argent-managed). Each cell needs official interface,
allowed entitlement, renewal/revocation, quota behavior and actual contract tests.
A consumer chat subscription is not automatically agent/API access. API keys are
an explicit alternative and can remain the initial one-agent technical pilot.
No host-token extraction, automatic account rotation, or silent paid fallback.
Provider selection must not change an active run's identity or replay a session.

### Cloud continuity and migration

Split deliverables: (a) selected Git working tree/untracked files and dependencies,
(b) readable chats/events/diffs/evidence, (c) separately proven live-process/session
resume. First build Argent export/restore, then a Conductor importer after a
consented redacted sample. Never require migration just to start a fresh repository.

Preview source/destination, selected files, ignored/secret exclusions, conflicts,
missing data and runtime prerequisites. Preserve originals; verify hashes and
archive bounds/path/symlink safety; restore without executing scripts. Reconnect
credentials through official flows. A cloud transfer must verify files at the
destination after restart, distinguish compute from storage, and retain the
source until the user explicitly authorizes cleanup. Active/uncertain imported
operations reconcile or stay blocked; never replay external effects on import.

### Mobile companion and native app

Mobile is a named early product track, ahead of team/dependency orchestration.
First deliver a narrow authenticated companion: list workspaces, inspect durable
activity/diff/evidence, respond to a scoped input request, request cancellation
and see acknowledgment. Then package a native iOS app against that contract;
Android is uncommitted pending demand. A responsive preview is not a native app.
Delivery mechanics and notifications need a separate implementation spec.

Prerequisites: remote authorization, encrypted transport, per-workspace access,
server-owned execution, serialized commands, idempotency and stale-approval
rejection. Test desktop-disconnect/phone-reconnect, revoked sessions and duplicate
commands. The phone never owns a runner, inference credential or filesystem.
The existing loopback service cannot be exposed to supply this capability.

### Sequence and validation

1. P2 raw shell and compatibility/auth feasibility in parallel with M1a.
2. One real isolated cloud workspace and one agent, persistence/recovery and
   exact-commit verification/draft-PR proof (M1a–M1c).
3. Argent portability and consented migration; second provider/subscription
   evidence; authenticated mobile companion and native iOS delivery track.
4. Personal replacement release after its advertised capabilities actually pass,
   plus managed-release/distribution gates. Broader provider parity follows in
   explicit releases, then team handoff, then dependencies.

Compare on the same tasks and observe an unassisted Conductor user's ability to
create a workspace, choose an account, send a task, find a diff/check, respond on
mobile and export. Record observed friction and preservation gaps; do not claim
learnability or demand from visual similarity alone. Outreach, real exports,
provider spending and publishing remain separately authorized actions.
