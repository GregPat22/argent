# P3: desktop restyle, one conversation per workspace

Status: implemented. Based on main `32748a5`. Supersedes the layout of
[spec 0008](0008-desktop-workspace-shell.md) and the visual system of
[spec 0009](0009-desktop-ux-polish.md); their execution, durability and
accessibility rules still apply.

## Decisions

1. **Only what works is shown.** Remove the inspector (Artifacts, All files,
   Changes, Checks), the terminal preview, the Mobile and Cloud settings pages,
   the provider tabs and the API-key card. The right panel returns only with real
   content (the L1.3 changes panel). Planned features stay on the website roadmap.
2. **A workspace is one conversation.** Follow-ups already resume the same Claude
   Code conversation, so the center shows every run as a turn, oldest first: the
   message, the agent's steps (collapsed once settled, the agent's own words kept
   visible), then Argent's record. The sidebar lists repositories and their
   workspaces only. Older turns sit behind "Show earlier messages".
3. **Send directly.** Enter sends, Shift+Enter adds a line, Cmd+Enter also sends.
   No review dialog. The composer holds the permission chip (local only) and the
   time-limit chip. The permission chip defaults to Edits only, needs one
   confirmation per workspace for Full access (shown in amber), and resets to
   Edits only after every send. While a run is active the send button becomes Stop.
   Unconfirmed submissions keep their idempotency key and show an inline Retry;
   the composer is locked to that text until it is confirmed or rejected.
4. **Fonts match the website**: Inter, Manrope and JetBrains Mono (Latin variable
   subsets), bundled from `@fontsource-variable/*@5.3.0` with registry integrity
   checked, OFL licenses in `ui/fonts/`. The asset allowlist in
   `src/desktop/main.ts` admits `fonts/*.woff2` and the renderer's own `*.js`
   modules by strict filename pattern; font-src falls back to `default-src 'self'`.
5. **Modular vanilla TypeScript**, no new runtime dependency: DOM builder, pure
   model (formatting, grouping, send gating, event-to-step mapping, unit tested in
   Node), and view modules (sidebar, header, transcript, record, composer,
   palette, settings).
6. **Copy worktree path only.** Reveal in Finder and Open in editor need a new
   bridge call and get their own security-reviewed change.

## Design language

- Tokens from the website: oxide `#08090c` canvas, `#0e1015` sidebar, pewter
  `#13151a` raised, pewter-2 `#1b1e25` hover, hairlines `rgb(214 220 230 / .12)`
  and `/.24`, text polished `#eef1f5`, sterling `#a9b0bb`, sterling-dim `#929aa7`.
- Hue only reports state: running `#a8bdff`, attention `#f5c26b`, fault
  `#f0a29b`, verified `#8ee6b5`. **Green means verified and nothing else**: on
  main only the simulated artifact check. A Claude Code run ends in silver,
  labelled "Recorded, not tested".
- Type (px): 11 labels, 12 meta, 13 base (Manrope), 15 section (Inter 600),
  20 run and header titles (Inter 600), 28 welcome (Inter 500, -0.035em);
  12 mono for SHAs and branches. Nothing below 11.
- Radii 4/6/8/10/14. Elevation by surface steps and hairlines; one dialog shadow.
- One silver primary per view, ported from the website's `.argent-control--primary`
  with its reflection sweep on hover or focus. Disabled is an outline, not a slab.
- Motion: 120ms hover and press, 180ms panels, 240ms dialogs, all
  `cubic-bezier(.22,1,.36,1)`. Only loops: the busy spinner and the "Working"
  sheen while a run is active. Reduced motion removes all of it.

## Signature moments

- **The hallmark record** ends every completed turn: four punches from the
  website's hallmark. Maker's mark (agent, permission, limit) and date letter
  (commit) are struck when the data exists. Standard mark ("No checks yet") and
  assay mark ("Not verified") stay unstruck for Claude Code runs; the assay mark
  is struck only for a passed simulated artifact check, labelled simulated. Below
  it, a guilloché record of branch, commit, changed files and diff SHA-256, with
  "Nothing was tested. Run your checks before you merge."
- **Says vs records**: the agent's last message is labelled as what Claude Code
  says; the record is labelled as what Argent recorded.
- **Peak**: when a run you are watching completes, the punches strike in once
  (60ms stagger). Reloaded history shows them still.
- **Welcome**: the silver wordmark and the site's line "Assign a task. Review the
  changes." One button, Add a repository (Cmd+O), opens the native folder picker
  directly. A quiet link offers a scripted demo (the simulation workspace).

## Layout

- Sidebar 232–248px, full height: traffic-light drag strip with Cmd+K search;
  repository groups (hover + for a new workspace from that repository) with
  workspace rows labelled by branch; footer with Add repository, a local-service
  status button (popover with Stop or Reconnect, Stop still confirms) and Settings.
- Main: 52px draggable header with `repository / branch` (click copies the
  worktree path), a state pill (Working, Needs review, Stopped) and a menu (copy
  path, new workspace from this repository, stop or start workspace). Transcript
  capped near 720px. Composer docked at the bottom with the offline, error,
  pending and needs-review notices directly above it.
- Status bar and titlebar tagline removed. Settings is one page: Claude Code's
  status and sign-in note, planned agents listed as planned, local data notes.
- Shortcuts: Cmd+K palette (workspaces and actions), Cmd+O add repository,
  Cmd+N new workspace from the current repository, Cmd+, settings, Cmd+L focus
  composer.

## Vocabulary

Repository, workspace, message, run, record. Statuses: Queued, Working, Stopping,
Finished, Failed, Cancelled, Needs review.

## Acceptance

1. Every surface above at 900×620 and 1380×900 with no horizontal scroll; the
   composer stays in view.
2. Renderer refresh, draft and pending tests keep their behavior; the composer
   tests change from "opens review" to "sends with Edits only, resets after send,
   keeps an unconfirmed key on retry". Native smoke is rewritten for the new
   flow, including full-access confirmation, Stop from the composer, offline,
   needs-review resolution, local workspace, parallel workspace and reduced motion.
3. `npm run check` passes; screenshots reviewed locally.

## Evidence

Laws of UX heuristic review (Hick, Tesler, Miller, serial position, Fitts, Jakob,
proximity, similarity, peak-end, aesthetic-usability) of main `e57c4b7`: the
welcome offered 17 controls for one decision, five controls opened the same task
dialog, a run took five clicks to start, and run status appeared in five places.
No measured usability gain is claimed.

Implementation evidence (9 November 2026, on top of main `32748a5`):

- Root suite: `npm run check` passes, including the renderer refresh tests on
  the new modules, composer tests (direct send, edits-only default, one
  confirmation per workspace, reset after send, unconfirmed key kept on retry,
  definite rejection clears it, stopped/blank/working cannot send, demos in
  seconds) and pure model tests (grouping, event mapping, send gating, limits).
- Native smoke (`npm run desktop:smoke`) passes on macOS with Electron 45: bundled
  fonts, icons and brand images load through the allowlist; welcome, settings
  with Escape focus return, demo form validation, search with arrows and Enter,
  900×620 and 1380×900 without horizontal scroll, reduced motion, direct sends,
  background completion after the window closes, Stop from the composer, service
  stop with needs-review resolution, a local Claude Code run with a fake CLI
  confirmed for full access and reset to edits only, a record with two struck
  and two unstruck marks labelled "Not tested", and a parallel workspace grouped
  under the same repository. Screenshots were reviewed locally.
- Limits: the record shows what Argent read from the worktree; there is still no
  changes view, test run or pull request. The sidebar shows live activity only
  for the open workspace.
