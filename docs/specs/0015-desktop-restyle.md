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
  `#f0a29b`, verified `#8ee6b5`. **Green means verified and nothing else**:
  the simulated artifact check, and checks that passed and match the current
  reading in the Checks dialog. A stale or unchecked pass, a run command and a
  Claude Code run stay silver; a Claude Code run is labelled "Recorded, not
  tested".
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

### Execution hardening integration

Preserve the [local hardening contract](0013-local-mvp.md#local-execution-hardening)
in the modular conversation view. Each turn retains all fetched events, with
500 visible events per page and earlier/later controls; polling must not move an
older page. Real interrupted turns explain why process reconciliation is needed
and cannot open the simulation abandonment flow. Repository creation remains
under one mutation lock even while a native dialog and refresh overlap. Tests
must exercise these behaviors through the compiled renderer modules.

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

## Desktop usability refinements in development

A heuristic review of main `9be273e` on 18 November 2026 found that first-launch
service notices were inside the hidden conversation, workspace buttons had their
native role overridden, and the repository's add-workspace button could retain
the folder picker's busy state. The service indicator also used verification
green for connectivity.

Acceptance criteria for the desktop renderer:

- First launch shows a message field over turned silver with Add repository
  and Scripted demo. The field and its controls fit at 900×620 and 1380×900.
  Enter opens the folder picker and sends the first message in the newly created
  workspace with the normal edits-only defaults. Cancelling keeps the draft.
  Selecting either repository action directly carries the draft into its composer
  for editing. Shift+Enter inserts a line break.
- Show offline and error notices before the first workspace exists. Reconnect
  uses the existing service action. Repository workspace creation becomes
  available when the folder picker finishes.
- Give search a visible label and shortcut. Preserve native workspace buttons
  inside list items, show keyboard focus in search results, and distinguish
  the selected branch, ordinary availability and verified evidence.
- Group the inspection actions and give the send and stop controls 40px targets.
  Opening activity details animates their contents. Polling must not replay
  the entrance of an existing turn. Reduced motion includes dialog backdrops.

On 18 November 2026, native Electron walkthroughs passed with a fixture CLI
and temporary repositories. Starting from the welcome field created one workspace
and one completed edits-only run. A renderer regression covered cancelling the
picker and resubmitting the preserved draft. Screenshots at both window sizes
showed the field and its three actions together. The walkthrough also exercised
first-launch reconnect, sidebar availability after repository selection, keyboard search,
reduced motion and command review. A renderer regression covered activity updates
during an existing turn. Two worker fixtures failed in the repository suite
and in focused comparisons on unchanged main `9be273e`. The healthy dispatch
job reached `needs_attention`, and the cancellation fixture missed its startup
deadline. Task completion time and screen-reader use still require observation
with users.

## Launch opens on the welcome screen (in development)

Against main `35ce8fb`, 18 November 2026. Reopening Argent previously returned
to the last selected workspace, or the newest one, so the welcome field only
appeared before the first workspace existed.

- Every launch, including a window reopened while the service keeps running,
  shows the welcome screen. Saved workspaces stay in the sidebar and open on
  selection; their runs and activity are read only then.
- The renderer no longer stores the selected workspace, and it removes the
  selection saved by earlier builds.
- Exception: an uncertain submission reopens its workspace, so its retry bar
  stays visible instead of silently disabling the welcome send.

Renderer regressions cover a launch with an earlier saved selection and a launch
with an uncertain submission. The native smoke closes the window during a run,
reopens it on the welcome screen, then selects the workspace and finds the
completed conversation.

## Desktop polish and motion (in development)

Against main `f748957`, 23 November 2026. A heuristic review of the native
smoke screenshots and the renderer found friction that changes no execution,
consent or evidence contract. The work lands in small steps, each with its own
acceptance criteria below.

### Step 1: transitions and consistent controls

- Dialogs and popovers transition out as well as in: 240ms entrance, 150ms
  exit for dialogs and their backdrop, 180ms/120ms for popovers. A closing
  dialog ignores the pointer. Reduced motion removes both directions.
- Menus, popovers and dialogs close on a click outside them, not only with
  Escape. A backdrop click takes the same path as Escape, so focus returns to
  the control that opened the dialog. Press and release must both land
  outside, so ending a text selection outside never closes a dialog. The
  commit, resolution and draft publication dialogs hold typed work and close
  only from their own controls or Escape. While any menu or dialog is open,
  the header and sidebar top stop moving the window, because macOS never
  delivers a click on a drag region to the page.
- Every inspection dialog closes from the same icon button in its header.
  "Back to review" remains the evidence preview's navigation back.
- Cancel check appears only while a check is queued or running.
- The conversation fades into the header and composer within its own padding,
  so content at rest is never dimmed.
- Every disclosure uses the app's chevron and eases its contents open. Activity
  notes that cannot expand show a dot instead of a chevron.
- Dialog text areas grow with their contents up to a bound instead of showing
  a resize grip.
- Selecting another workspace updates the existing sidebar rows, so the
  highlight and its silver sliver transition; a changed list still rebuilds.

### Step 2: live runs update in place

- While a run is working, new activity is appended to the turn's existing step
  list. Earlier rows, a text selection and hover survive polling; only rows
  that arrive while you watch rise in. The elapsed time keeps updating.
- A turn is rebuilt only when what it shows changes: its status, the
  connection, the event page, its record or its marks. A turn with more than
  one page of events keeps the paginated rebuild.
- A rebuilt turn keeps the disclosures a person opened, such as its steps or
  the raw record, without replaying their opening transition.

A renderer regression checks that the turn, its step list and its earlier
rows are the same elements after new events, that each row animates once,
and that a settled turn is rebuilt into its final form.

### Step 3: changes viewer

- Each changed file shows its status as a word in a badge, its quoted name
  with the folder dimmed, and its added and removed line counts. The status
  line totals them. Counts come from the diff Argent read; lines before the
  first hunk header are file metadata and never count. A binary file says so.
- The diff is drawn one line per text-only element: metadata, hunk headers,
  context, additions and removals are distinguished by weight, a light or dark
  band and a left edge, without hue, because green means verified. Old and new
  line numbers sit in a gutter that copying skips.
- The service returns each changed text file as one whole-file replacement
  hunk. The panel compares the two complete copies in it and shows only the
  lines that changed, with three lines of context; a longer unchanged run
  folds behind "Show N unchanged lines", which restores every line in place.
  The comparison is bounded: a gap up to 250,000 line pairs is compared
  exactly, a larger one is split at lines that occur once on each side, and a
  larger gap without such a line stays removed and re-added under a visible
  note. A missing final newline counts as a change. Hunks that already carry
  context are shown as they are. The service output is unchanged.
- Paths and diff text are still set only through `textContent`, with controls
  and bidi characters escaped.
- Up and down arrows move through the file list and show each diff.

The renderer tests assert that a file row and each diff line contain only
Argent's own text elements and that hostile content stays escaped text. A
model test covers line numbering, hunk headers, metadata and counts. Model
tests cover a small edit inside a whole-file hunk, the missing-newline rule,
two edits in a 900-line file and a labelled fallback. A renderer test folds
and restores unchanged runs. In a native walkthrough on a throwaway
repository, a three-line edit that the service returns as 22 removed and 24
added lines is shown as 2 removed and 4 added.

### Step 4: review, consent, check and commit dialogs

- The silver primary moves to the next step. In a commit review it marks
  consent until consent is recorded, then the run; in Commands it marks
  approval, then the commit review; in Commit it marks the staged review, then
  the commit. A recorded step reads as done in sterling, not as unavailable.
- A commit's base, commit and tree, and the staged commit's branch, parent,
  tree, author and message are labelled rows. The judging report shows each
  category with its files beneath.
- Changed files in the commit review and the staged commit use the readable
  diff from step 3, wrapped, with every unchanged line visible: nothing
  folds where a person consents or commits. Hidden characters stay escaped as
  before.
- The check result is one row. Checks that passed and match the current
  reading are green; a failure, an interruption or a setup failure uses the
  fault colour; anything else, including a stale or unchecked pass and every
  run command result, stays silver. Each phase shows its command on one line;
  output sizes and digests sit in a disclosure.
- Long safety notices in Commands and the commit review show their first two
  lines with "Show full notice", which expands them in place. The full text
  stays in the element and in the dialog's description, so a screen reader
  reads all of it. The control appears only when the text is cut.

### Step 5: workspace switching

- Opening a workspace shows nothing until its messages are read, instead of
  briefly claiming a workspace with history is a fresh branch. Its messages
  then fade in as one piece; only turns that arrive later rise in one by one.
- Each workspace returns to where its conversation was left in this window.
  One left at its end, or opened for the first time, opens at its end and
  keeps following new messages. Positions are not stored across launches.

A renderer regression switches between two workspaces: the empty state stays
hidden before the reading, an unvisited workspace opens at its end and a
visited one returns to its earlier position.

### Step 6: agent replies as Markdown

- What Claude Code says at the end of a turn is shown as Markdown: headings,
  bulleted and numbered lists with nesting, bold, italic, strikethrough,
  inline code, fenced code with its language label, quotes, rules and tables.
  Underscores inside words stay literal, and an unclosed mark stays as typed.
- A small parser in the renderer only chooses which of Argent's own elements
  hold the text. Every character still reaches the page through
  `textContent`: HTML in a reply stays literal text, and no element carries a
  link, source, style or handler. A link shows its label and its address as
  text and never navigates; an image is named with its address and never
  loads.
- Paragraphs over 20,000 characters keep their text without inline
  formatting, and lists nest at most four levels, so rendering stays bounded.
- The live step list and the raw record still show the text as recorded.

Renderer tests check the element tree for each construct, that hostile HTML,
script and link text stays literal with no attributes or handlers, that
unclosed marks stay literal, and that a 50,000-character reply of unmatched
marks renders in bounded time. A transcript test checks a finished turn's
reply.

### Step 7: check status at a glance

- The header's Checks button carries a dot for the latest check of the open
  workspace: green when it passed and matches the current reading, the fault
  colour when it failed and matches, the running colour, pulsing, while it is
  queued, running or cancelling, and silver for anything else, including a
  stale or unchecked result. No check shows no dot. The button's accessible
  name and tooltip say the outcome and the time of the reading.
- It reads when a workspace opens, after reconnecting and when an agent turn
  ends. While an agent works it does not read: the files are changing.
  Disconnecting or opening another workspace clears it until its own reading
  arrives.
- Queued, running and cancelling work is read again every three seconds until
  it ends, by the badge and by the open Checks or Run results dialog. The
  dialog redraws only when what it shows changes, and says the status updates
  on its own while the work runs. The dialog's status line and the badge's
  label show when the work started and how many minutes it has run, so a long
  check does not look stalled.
- Each reading stays point-in-time: no timer re-reviews a finished result and
  nothing watches the files. This amends the reading rule in
  [spec 0013](0013-local-mvp.md); see
  [DECISIONS](../DECISIONS.md#check-status-at-a-glance-in-the-desktop-in-development--25-november-2026).

Renderer tests cover the badge's reading on opening, a running check followed
to its outcome, a stale pass in silver, clearing on disconnect and workspace
change, and an open dialog following a running check without redrawing an
unchanged reading.

### Step 8: Changes docked beside the conversation

- Changes opens as a panel on the right of the conversation, which narrows to
  make room; the panel slides in and out as its column opens and closes. The
  Changes button toggles it and shows it is open. Its close button and Escape
  inside it close it and return focus to the button. This brings back the
  right-hand panel with real content, as decision 1 above anticipated.
- The file list sits above the diff. Everything from step 3 still applies:
  status badges, line counts, the readable diff, folding and arrow keys.
- While open, the panel reads when it opens, on Refresh, when another
  workspace is selected (it stays open and shows that workspace), after
  reconnecting, and once when an agent turn ends. A reading after a turn keeps
  the current content until the new one arrives, then keeps the selected file
  and its scroll position. It never reads while the agent works, while it is
  closed, or because of polling.
- Below 1,100 px wide the panel covers the conversation from the right over a
  dimmed backdrop, and a click on the backdrop closes it.

Renderer tests cover toggling, discarding a reply for a closed panel,
following a workspace switch, clearing on disconnect and reading on
reconnect, closing with Escape, and one reading after an agent turn ends that
keeps the selected file. The native smoke checks the panel stays within the
window at 900 and 1,380 px and sits beside the conversation when wide.
