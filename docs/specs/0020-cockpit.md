# The cockpit: review by exception in the desktop

Status: **planned**. This is the interface of work-queue item 10,
[review by exception](../../ROADMAP.md#work-queue), which starts after the
first public release. Nothing in this spec is implemented. It was written
against the desktop at main `dd53c7b`; the renderer and the local service are
unchanged since `cfceae8`. It amends the layout of
[spec 0015](0015-desktop-restyle.md) and keeps every execution, consent,
evidence and accessibility rule of specs 0013 and 0015 unless a section below
says otherwise.

## Product decision

Argent already records what is true about each workspace: the commit an agent
turn ended on, what changed against the base, which approved checks ran on
which commit and whether that result still matches, whether a draft pull
request exists and for which commit. Today a person collects these facts from
a header badge, two dialogs, a docked panel and the end of each turn.

The cockpit gathers them into a still frame whose content follows the work.
Floating cards beside the conversation each say one true thing in one line.
When something is wrong, one click opens the reason, and a second opens the
file. The layout never rearranges; what changes is the text and the state
colour of a card, at the moments Argent records something new.

It follows the decisions of 27 November 2026 in the
[decision register](../DECISIONS.md#how-review-by-exception-is-presented--27-november-2026),
as refined there on 28 November. Six rules hold throughout:

1. **Every line is a view over a record Argent holds.** No card, progress line
   or next step contains, repeats or interprets the agent's own words. A
   missing record is said plainly: "No check recorded for `abc1234`".
2. **Green means verified and nothing else**: a passed check whose latest
   reading matches the workspace. A stale, unchecked or interrupted result, an
   agent run and anything the agent says are never green.
3. **Links go to files, not lines.** A reason opens the docked diff at the
   named file.
4. **Reading moments are unchanged.** Changes and check freshness are read
   only at the moments spec 0013 and spec 0015 allow. Check progress is read
   again only while a check is queued, running or cancelling. Nothing watches
   the files.
5. **No automatic check runs.** Consent to the exact commit stays a separate
   action; no card or next step starts one.
6. **Only what works is shown.** A card that has nothing true to say stays at
   one line; planned features are not shown, not even as disabled controls.

## Words used here

| Word         | Meaning                                                                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Record       | Something Argent stored or observed itself: a run and its events, a worktree record, a check result, a publication receipt.                                                                                                                                                                            |
| Reading      | One point-in-time observation the renderer requested, with the time it arrived, such as a changes reading or a check reading with its freshness.                                                                                                                                                       |
| Turn head    | The `headSha` of the newest completed agent turn's worktree record (`WorktreeEvidence`).                                                                                                                                                                                                               |
| Latest head  | The head in the newest, by the time Argent recorded or read it, of: the turn record, a changes reading (`WorkspaceChanges.headSha`), a check reading whose freshness is `current`, and a commit made through Argent's Commit dialog in this window. A stale check reading says nothing about the head. |
| Glance line  | A card's folded content: one line, from records only.                                                                                                                                                                                                                                                  |
| Island       | A rounded surface that floats over the textured background: the sidebar, the header and the card column.                                                                                                                                                                                               |
| In view      | The workspace whose conversation is open in this window.                                                                                                                                                                                                                                               |
| Short commit | The first seven characters of a commit, in the monospaced face. Its full value is the element's accessible description and is copied on click.                                                                                                                                                         |

## Layout

```
┌─────────┐ ┌────────────────────────────────────┐ ┌──────────────┐
│ Sidebar │ │ repository / branch ▾   state  ⋯   │ │ Roadmap      │
│ island  │ └────────────────────────────────────┘ │ Changes      │
│         │                                        │ Evidence  Ag │
│         │   you › message                        │ Pull request │
│         │   ▸ Worked 2m 14s · 9 tool calls        │              │
│         │   Claude Code says …                    │ Needs you    │
│         │   ▸ Argent recorded abc1234 · 5 files   │ (only when   │
│         │   Next  Review abc1234 for checks       │  needed)     │
│         │                                        │              │
│         │      ┌──────── composer ────────┐      │              │
│         │      └──────────────────────────┘      │              │
└─────────┘  engraved silver texture behind all   └──────────────┘
```

### Islands

- The sidebar, the header and the card column are islands: 14 px from the
  window edges and from each other, 14 px radius, a hairline border
  (`rgb(214 220 230 / .12)`), the raised surface at 78 % opacity over the
  texture with a background blur, one static drop shadow and a 1 px inner
  highlight along the top edge, like the bevel of polished metal. None of
  these properties is ever animated.
- The conversation is not an island. It sits directly on the texture, capped
  near 720 px as today, so the texture is visible behind the work itself.
- The composer is narrower than today, about 620 px, centred under the
  conversation. Its own surface is opaque enough for text to stay readable over
  any part of the texture.
- The card column is 296 px wide. Cards inside it are 10 px apart. When
  expanded cards do not fit, the column scrolls on its own; the window never
  scrolls and the composer stays in view.
- If the measurement in step 2 shows that the background blur costs more than
  the texture itself while a turn runs, the islands use an opaque fill instead.
  The layout does not change either way.

### The header

The header island holds what it holds today: `repository / branch`, the state
pill, the Changes, Checks, Run and Commands actions and the workspace menu.
One change: the branch opens **workspace details** instead of copying the
worktree path.

Workspace details is a popover with the records Argent holds for the
workspace: worktree path (with **Copy path**), branch, base commit, latest
head and where it was read, the permission mode of the latest turn and
"Local, not a sandbox: Claude Code runs as you." There is no separate
environment line under the composer.

### The rail

The sidebar can collapse to a 56 px rail with `⌘\` or its collapse control.
The rail keeps the brand mark, one state glyph per workspace (with the silver
sliver on the one in view), Add repository and Settings. Each glyph's tooltip
and accessible name give the branch and its reason line. The choice is a
local display preference that persists across launches. The expanded sidebar
remains the default.

### Window sizes

- **1,100 px and wider:** sidebar (or rail), conversation, card column.
- **Narrower than 1,100 px:** the card column becomes the header chip
  described below; the conversation takes its width.
- **900 × 620 and 1,380 × 900** show every surface without horizontal scroll,
  with the composer in view, as spec 0015 requires.

## Cards

### Rules for every card

- **Order is fixed:** Roadmap, Changes, Evidence, Pull request, then Needs you
  at the bottom. Needs you is present only when another workspace needs the
  person; because it is last, its arrival moves nothing above it.
- **Every card starts folded** to its title and glance line. A click or Enter
  on the header expands it; expanded cards stay expanded across workspace
  switches for the rest of the window's life.
- **Three depths.** Glance: the folded line. Reason: the expanded card. Source:
  the surface that already exists (Changes dock, Checks dialog, Commands, the
  publication status), opened from the expanded card.
- **Liquid content, still frame.** When a reading changes a glance line, the
  old text fades out in 90 ms and the new text rises 3 px and fades in over
  160 ms. Counters swap; they never count up. Digits use tabular figures so a
  changing number does not shift its neighbours. A changed tone shows as a
  state-coloured edge on the card that fades out over 1.6 s, drawn as an
  overlay whose opacity alone animates.
- **Nothing reorders under the pointer.** Content that would change the height
  of a card above the pointer waits until the pointer leaves the column or
  2 s have passed.
- **Expanding** changes the layout once, without animating height. The
  revealed content fades and rises 4 px in 180 ms, and the cards below glide to
  their new place by transform from their measured old position.
- **Card style.** The default style shows a small uppercase title (11 px,
  tracked) above the glance line. An optional _assay edge_ style drops the
  titles and marks each card with a 2 px state strip on its left edge; it
  appears as a setting only if it needs no other change to the cards.
- **Accessible names.** Each card header is a button whose name is its title
  and glance line ("Evidence: passed for abc1234, 0 judging changes") and which
  reports whether it is expanded. Only the arrival of Needs you is announced,
  politely.
- **Scripted demo workspaces** show no cards: they have no repository, changes,
  checks or pull request. The header keeps its "Demo" tag.

### Roadmap

A document the developer chooses in the repository, shown as written. The
[roadmap file rules](#roadmap-file-rules) define the choice, the reading and
the parsing.

| Record                                             | Glance line                                                   |
| -------------------------------------------------- | ------------------------------------------------------------- |
| No file chosen, a root `ROADMAP.md` at the base    | "Follow `ROADMAP.md`?" with **Choose…**                       |
| No file chosen, none suggested                     | "Choose a file to follow"                                     |
| Chosen file, checkbox items                        | progress track, then "Now · _first unchecked item_"           |
| Chosen file, all items checked                     | progress track, then "All 12 items checked"                   |
| Chosen file, headings only                         | "`ROADMAP.md` · 7 sections, no checkboxes"                    |
| Chosen file, no checkbox items and no headings     | "No checkboxes or headings in `ROADMAP.md`"                   |
| Chosen file absent at this workspace's base        | "`ROADMAP.md` is not in base `9f3c2e1`"                       |
| Unreadable: too large, not UTF-8, a link, an error | "`ROADMAP.md` could not be read: _the reason_" with **Retry** |

- The **progress track** is a fine engraved rule with one notch per item, up to
  24: checked notches are filled with polished silver, the "now" notch is a
  ring, open notches are hollow. A notch whose item changed on this branch
  carries a short silver underline. Beyond 24 items the track gives way to
  "9 of 31".
- **Expanded:** the items in document order, grouped under their headings,
  with "now" and "next" tags. An item checked or added on this branch says
  "Checked on this branch, not at base `9f3c2e1`" with **See the change**,
  which docks the diff at the roadmap file. The footer always reads "As written
  in `ROADMAP.md` at `9f3c2e1`, not checked by Argent" and offers
  **Change file…**.
- A file absent at the base but added on this branch, as a changes reading
  shows, is parsed from that reading and labelled "added on this branch".
- The roadmap is direction written by people or agents. Argent never treats an
  item as done because a box is checked, and no other card reads it.

### Changes

What changed in the workspace against its base.

| Record                                                       | Glance line                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| No completed turn and no reading                             | "No changes recorded yet"                                     |
| Turn record, no reading in this window                       | "5 files at `abc1234` · recorded at turn end"                 |
| Changes reading with files                                   | "5 files · +121 −19" (binary files count as files, not lines) |
| Changes reading with no files                                | "No changes against base `9f3c2e1`"                           |
| Reading refused: too large, missing worktree, timeout, error | the service's reason, with **Retry**                          |
| Archived workspace                                           | "Archived · branch kept at `abc1234`"                         |

- The turn-record line uses `WorktreeEvidence.changedFiles`. Line counts exist
  only in a changes reading, so they appear only after one.
- **Expanding the card is a request to read.** An expanded Changes card follows
  the reading rules of the open Changes panel (spec 0015, step 8): it reads
  when expanded, on Retry, when another workspace is selected, after
  reconnecting and once when an agent turn ends. A folded card never reads.
- **Expanded:** the file list with status words and line counts, exactly as the
  panel draws it. Selecting a file docks the diff at that file.
- The card labels every reading as live, with its time, never as a test result.

### Evidence

The latest check for the workspace (`LocalCheckView`) and its freshness, from
the same reading the header's Checks button uses, so the two never disagree.
Readings happen at the existing moments: when the workspace opens, after
reconnecting, when an agent turn ends, and every 3 s while the check is
queued, running or cancelling.

| Record and latest reading                       | Tone           | Glance line                                        | Hallmark |
| ----------------------------------------------- | -------------- | -------------------------------------------------- | -------- |
| No check, no turn record                        | silver         | "No commit recorded yet"                           | absent   |
| No check, latest head `abc1234`                 | silver         | "No check recorded for `abc1234`"                  | absent   |
| Queued                                          | running, pulse | "Check queued · `abc1234` · 0m 12s"                | absent   |
| Running                                         | running, pulse | "Checks running · `abc1234` · 1m 02s"              | absent   |
| Cancelling                                      | running        | "Stopping the check · `abc1234`"                   | absent   |
| Cancelled                                       | silver         | "Check cancelled · `abc1234`"                      | absent   |
| `needs_attention`                               | fault          | "Check interrupted · `abc1234` · needs inspection" | absent   |
| Failed without a result                         | fault          | "Check failed before a result · `abc1234`"         | absent   |
| Passed, freshness `current`                     | verified       | "Passed for `abc1234` · 0 judging changes"         | struck   |
| Passed, freshness `stale`                       | silver         | "Stale · passed on `abc1234`"                      | worn     |
| Passed, freshness `unknown`                     | silver         | "Passed on `abc1234` · freshness not read"         | absent   |
| Failed, freshness `current`                     | fault          | "Failed for `abc1234` · test exited 1"             | absent   |
| Failed, freshness `stale`                       | silver         | "Stale · failed on `abc1234`"                      | absent   |
| Failed, freshness `unknown`                     | silver         | "Failed on `abc1234` · freshness not read"         | absent   |
| Passed, an agent turn running in this workspace | silver         | "Passed on `abc1234` · read before this turn"      | worn     |
| Failed, an agent turn running in this workspace | silver         | "Failed on `abc1234` · read before this turn"      | absent   |

- "judging changes" uses the result's `judgingChangeCount`; a result recorded
  before the count existed says "judging changes not recorded".
- A stale line adds ", workspace at `def5678`" only when a turn record or a
  changes reading newer than the check reading shows a different latest head.
- The failed line names the first phase that did not exit zero and its
  recorded outcome: "setup exited 1", "test timed out", "test hit the output
  limit".
- **While an agent turn runs in this workspace**, the last reading cannot say
  whether the files still match, and Argent does not read while the agent
  works. The card keeps the outcome but drops green and wears the hallmark
  until the reading at turn end. This tightens step 7 of spec 0015 for the
  header's Checks button as well, so both stay one view.
- **Expanded:** the commit checked, the commands in order with each phase's
  outcome and duration, when the check started, the time of the latest reading
  and whether it matched, and the judging-changes count. The individual
  judging changes are not part of the check record; **Review this commit**
  opens the existing candidate review, which lists them and links each to its
  file. **Open Checks** opens the existing dialog.

#### The hallmark

When a passed check matches the latest reading, the Evidence card carries the
**assay mark**: the same "Ag" punch that the turn record draws, and leaves
unstruck, as "Not verified". The record is the turn's snapshot; the card is
where Argent's own check strikes the mark.

- **Struck:** a passed check whose latest reading is `current`. The mark is
  drawn in polished silver.
- **Worn:** the check passed on an earlier state: the reading is `stale`, or an
  agent turn is running in this workspace. The mark keeps its shape as a faint
  outline, as a hallmark wears on handled silver. Its description says what it
  passed on and why it is worn.
- **Absent:** no check, queued, running, cancelled, interrupted, failed, or
  freshness not read. There is no failed version of the mark.
- **The strike** plays only when this window sees a result become struck for
  the first time: the mark sets down from 1.12 × to its size and fades in over
  420 ms, then one light band crosses it. Reopening the workspace, a restart or
  a turn that left the files as they were shows it struck without playing
  again. Wearing is a 600 ms fade. There is no ripple across the window.
- The mark is an image with an accessible name, for example "Hallmark: checks
  passed for abc1234, matching the reading at 14:02".

### Pull request

The publication receipt (`PublicationStatus`) for the workspace, read when the
workspace opens, after reconnecting, when an agent turn ends and after a
publication action. Reading it needs neither the worktree nor GitHub.

| Record                                                                | Tone      | Glance line                                           |
| --------------------------------------------------------------------- | --------- | ----------------------------------------------------- |
| No receipt                                                            | silver    | "No draft"                                            |
| `needs_attention`, phase `push`                                       | attention | "Branch push outcome unknown · needs inspection"      |
| `needs_attention`, phase `draft`                                      | attention | "Draft creation outcome unknown · needs inspection"   |
| `published`, receipt head equals the latest head, or no head recorded | silver    | "Draft #123 · `abc1234`"                              |
| `published`, receipt head differs from the latest head                | attention | "Draft #123 shows `abc1234` · workspace at `def5678`" |

- The number comes from the recorded URL through the existing
  `publicationNumber` check; a URL that fails it shows "Draft · `abc1234`".
- A draft is never green: a pull request is not evidence.
- **Expanded:** repository, base and branch refs, the published commit, the
  latest head and where it was read, and the URL as text with **Copy URL**.
  Without a receipt: "A draft can be opened with or without a check; its
  description says which." **Draft publication status** opens the existing
  dialog.
- A merge control appears here only once the proposed
  [merge review](0013-local-mvp.md#human-triggered-merge-design-todo) is built.
  Merging stays a person's action.

### Needs you

The other workspaces that wait for the person. It appears only when at least
one does, and disappears when none does.

- **Glance:** "2 workspaces need you · `fix/login-redirect`" (the first in
  order).
- **Expanded:** each such workspace with its state glyph, branch and reason
  line, in order; selecting one switches to it.
- **Which workspaces, in which order,** follow the
  [attention rule](#the-attention-rule). Its records do not exist yet.

## Docked diff and the folded strip

- When Changes docks, it takes the card column's place at the width of the
  current panel. The other cards fold into a strip of one-line chips above it:
  Evidence, Pull request and Needs you, with their tones and glance lines. A
  chip opens its card over the dock.
- Closing the dock unfolds the cards from the strip in place.
- Below 1,100 px the dock covers the conversation over a dimmed backdrop, as it
  does today, and the strip sits at its top.

## The narrow-window chip

Below 1,100 px the header carries one chip in place of the card column:

- The Evidence tone dot and its glance line, shortened to the outcome and
  commit ("Passed · `abc1234`"), with a small hallmark when struck.
- When Needs you is present: " · 2 need you".
- The chip opens the cards as a popover under the header, the same cards in the
  same order, closed by Escape, a click outside or the chip.

## The conversation

### Progress lines

Each phase of work in the conversation is one line, expandable into what
exists today. Every count and time comes from Argent's records.

| Phase and record                       | Line                                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent run queued                       | "Queued"                                                                                                                                                                                |
| Agent run running                      | "Working 1m 12s", with the working light; expands into the live step list                                                                                                               |
| Agent run cancelling                   | "Stopping"                                                                                                                                                                              |
| Agent run completed                    | "Worked 2m 14s · 9 tool calls"; " · 2 tool errors" when any; expands into the step list                                                                                                 |
| Agent run failed                       | "Failed after 41s · _recorded reason_", fault tone                                                                                                                                      |
| Agent run cancelled                    | "Cancelled after 1m 02s"                                                                                                                                                                |
| Agent run `needs_attention`            | "Outcome unknown after 3m 10s · needs inspection", fault tone                                                                                                                           |
| Worktree record after a completed turn | "Argent recorded `abc1234` · 5 files · not tested", silver; expands into the existing hallmark record                                                                                   |
| Latest check, active                   | "Checks running · `abc1234` · 0m 41s", running tone                                                                                                                                     |
| Latest check, ended                    | "Checks passed for `abc1234` · 0 judging changes · 41s", or the Evidence card's failed, cancelled or interrupted wording with its duration; green only while the Evidence card is green |
| Publication receipt                    | "Draft #123 opened for `abc1234`", or its needs-inspection line                                                                                                                         |

- **Times** run from the run's `run.started` event to its terminal event. A
  running line advances once a second; a check's seconds advance locally
  between its 3 s readings.
- **Tool counts** are the run's `agent.log` events of kind `tool` and
  `tool_error`: requests the agent's CLI reported, not effects Argent
  observed. If the run reached its event limit, the counts read "at least".
  The line never says the agent "edited" or "ran" anything: file counts
  come only from Argent's worktree record, and in Edits only the CLI denies
  commands.
- **"Commands"** joins the line ("9 tool calls · 3 commands") only once the
  event records the kind of request as a field; parsing the recorded summary
  text is not allowed.
- **Placement.** The record line follows its turn. The check and publication
  lines follow the turn whose recorded head they name, or the last turn when
  none matches. Only the latest check and the latest receipt exist as records
  today, so earlier checks do not appear.
- The turn record itself keeps its snapshot ("No checks yet", "Not verified")
  as spec 0015 defines; the check line and the Evidence card say what
  happened after it.

### The next step

After the latest turn, one line says what to do next, chosen by the first
matching row below. It is computed from records only, never from the agent's
words, and names files only as links to the docked diff.

| Records                                                  | Next                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| An agent run or check is `needs_attention`               | "Check what happened before continuing", with the existing action for that record |
| Commit, publication or archive needs attention           | "Inspect the _commit/publication/archive_ outcome"                                |
| An agent run or check is queued, running or cancelling   | no line: the progress line shows the work                                         |
| The latest agent run failed or was cancelled             | "Send a follow-up or a new task"                                                  |
| Turn head equals base and the record lists changed files | "Commit the changes to check them"                                                |
| The base commands are not approved                       | "Approve the commands in Commands"                                                |
| No check for the latest head                             | "Review `abc1234` for checks"                                                     |
| The latest check failed and is current                   | "Read the failed phase in Checks, then send a follow-up"                          |
| The latest check is stale                                | "Review `def5678` for checks"                                                     |
| Passed and current, no receipt                           | "Open a draft pull request for `abc1234`"                                         |
| A receipt whose head differs from the latest head        | "The draft shows `abc1234`; the workspace is at `def5678`"                        |
| A receipt for the latest head                            | "Review the draft on GitHub; merging is yours"                                    |

Whether the base commands are approved comes from the existing command
configuration reading, taken once when a turn ends; it reads the base commit
and the stored approval, never the worktree, and the Commands dialog keeps its
own reading rules. The line is drawn with a hairline silver rule on its left
and the word "Next" in small capitals. It is replaced, not appended, when the
records change.

## The sidebar: one list of every workspace

Every workspace row keeps its branch and state glyph and gains one reason
line from the [attention rule](#the-attention-rule): "Claude Code working ·
3m", "Checks failed on `7d21f90`", "Draft #124 · `41ab0e2`", "`abc1234`
recorded · not tested". The rail shows the same line in each glyph's tooltip.
Today only the workspace in view shows live activity; this needs the summary
record below.

### The attention rule

**Not built; needs a record that does not exist on main.** A cheap summary of
every listed workspace, read from the store with the existing one-second
poll: the latest agent run's status and end time, the latest check's status,
outcome and checked commit without freshness, the publication status and the
workspace flags. It reads no repository and calls no network; a check's
freshness is never claimed for a workspace that is not in view.

A workspace is in exactly one state, chosen in this order:

1. **Needs you**, with the first matching reason:
   1. an agent run or check is `needs_attention`: "Outcome unknown · needs
      inspection";
   2. a commit, publication or archive needs attention: "Commit outcome
      unknown", "Draft publication needs inspection", "Archive needs
      inspection";
   3. the latest agent run failed: "Claude Code failed";
   4. the latest check failed and no agent turn has ended since: "Checks
      failed on `7d21f90`".
2. **Working:** an agent run or check is queued, running or cancelling.
3. **Ready for a decision:** anything else, with the most recent of the turn,
   check or publication lines as its reason.

Needs you lists only workspaces other than the one in view, ordered by reason
in the order above, then most recent first. Whether a finished turn the person
has not yet opened also counts as needing them is left to step 4.

## Roadmap file rules

### Choosing the file

- The choice is per repository, keyed by the repository identity the command
  approval already uses, and stored by the local service.
- **Choose…** lists text files tracked at the workspace's base commit: regular
  files ending in `.md`, `.markdown` or `.txt`, up to 256 KiB, at most 500
  entries, root first. The renderer sends back one listed path; the service
  accepts it only if it exactly matches an entry of that listing for that
  repository and base. No other path reaches the service.
- When nothing is chosen and a root `ROADMAP.md` exists, the card suggests it.
  Following it takes one click; Argent never adopts a file on its own.

### Reading it

- **At the base:** the chosen file's blob at the workspace's base commit,
  through Argent's own Git commands under the existing bounds for reading
  configuration at the base. The base never moves, so this is read once per
  workspace and window: when the workspace opens, after the file is chosen,
  and on Retry.
- **On this branch:** when the file is among the changed files of a changes
  reading, its new content comes from that reading's whole-file hunk. There is
  no separate read of the worktree, so the branch side updates only at the
  changes reading moments.
- The base is the commit the workspace started from, which Argent records. The
  card does not claim what any other branch holds.

### Parsing

The file is untrusted repository content. It is shown, never executed, never
obeyed, never sent to an agent and never used to decide anything.

1. **Bounds.** At most 256 KiB, valid UTF-8, at most 2,000 lines and 500
   items. Longer item text is cut at 300 characters with an ellipsis. A file
   over a bound says which bound.
2. **Skipped:** a leading front-matter block between `---` lines, fenced code
   blocks and HTML comments. A checkbox inside them is not an item.
3. **Checkbox items:** list lines whose marker (`-`, `*`, `+` or `1.`) is
   followed by `[ ]`, `[x]` or `[X]` and text. Indentation gives at most two
   levels; deeper items count at the second level.
4. **Headings:** ATX headings (`#` to `######`) group items. A file with no
   checkbox items lists its headings of the shallowest level that has more
   than one, as sections without a done state.
5. **Text:** item and heading text is shown through `textContent` with the
   visible escapes used for other repository text. Inline code keeps Argent's
   code style; links show their label and never navigate; images never load;
   other Markdown marks stay as typed.

### What "now" means

- **Now** is the first unchecked item in document order. **Next** is the
  unchecked item after it.
- Checked items after an unchecked one stay where they are, and the expanded
  list marks them "checked out of order"; Argent does not reorder the file.
- Several lists under different headings form one sequence in document order.
- All items checked: there is no now. No checkbox items: there is no now, and
  the card says so rather than choosing a heading.

### On this branch

Items are matched between the base and the branch version by their exact text
after collapsing white space. An item checked on the branch, added, removed or
reworded (one removed and one added) is listed as such, with **See the
change**. Two items with the same text are matched in order.

## Texture and motion

### The texture

- An engraved-line rendering of `ui/turned-silver.webp`: parallel lines about
  5 px apart, rising gently to the right with a slow wave, whose thickness
  follows the tone of the photograph. A 128 px grain tile prevents banding.
- It is drawn once per window size, off the main thread: a dedicated Worker
  draws into an OffscreenCanvas from a bitmap of the packaged image that the
  page passes in, and returns the result for display. The Worker loads nothing
  itself; the renderer's policy forbids it, and none is needed.
- The Worker draws the engraving twice: at rest, and lit, with brighter lines.
  Both are cached by width, height and pixel ratio, for at most two sizes. A
  resize waits 120 ms after the last change; until the new drawings arrive,
  the previous ones are scaled to fit, so no frame is blank. The pixel ratio is
  capped at 2.
- Light is a soft-edged window, shaped by a CSS gradient mask, that shows the
  lit drawing over the resting one. The window and the drawing inside it move
  by opposite transforms, so the lit lines stay registered with the resting
  lines: light falls only on the engraving, never on the surfaces above it.
  No image URL is created, so the renderer's content security policy stays as
  it is.

### Light that reports state

| State                                    | Light                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The workspace in view has a running turn | A soft sheen crosses the engraving, 5.5 s per pass, only while the turn runs                   |
| Another workspace needs the person       | The engraving warms faintly, and a light follows the pointer across it while the pointer moves |
| Anything else                            | Still. No frame is drawn                                                                       |

- The sheen follows only the workspace in view. With several workspaces,
  something is almost always working elsewhere; their state is in the sidebar
  and in Needs you, not in the background.
- The pointer light eases toward the pointer and stops a second after the
  pointer does. It never runs while the window is unfocused.

### Motion rules

- Everything that moves animates only `transform` and `opacity`. Nothing
  animates `box-shadow`, `background-position`, filters, colours, sizes or
  layout continuously.
- Two existing loops are measured and changed in step 2: the "Working" label
  sheen, which animates `background-position` on clipped text, becomes a light
  band translated across the label in its own clipped box; the running dot
  already animates only `opacity` and keeps a compositor-only pulse.
- Durations and easing follow spec 0015: 120 ms for hover and press, 180 ms
  for panels and card content, 240 ms for dialogs, `cubic-bezier(.22,1,.36,1)`.
- **Hidden window:** every animation pauses while the document is hidden.
  Electron's background throttling stays on.
- **Reduced motion:** one still frame. The texture is drawn; the sheen, the
  pointer light, glance transitions, the strike, the glide of cards and the
  tone edges do not run; the warm tint appears without a transition.

## Performance budget

Measured in the packaged macOS app built by `npm run desktop:package`, through
the DevTools protocol's performance metrics, three runs of ten seconds per
case, reporting the median. Step 2 records each number before and after, with
the commit and the machine.

| Case                                    | Budget                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| Idle: nothing working, pointer still    | No animation frames. A service poll that finds nothing new writes nothing to the page. |
| A turn running in the workspace in view | Motion adds at most 2 style recalculations and 3 ms of main-thread time per second     |
| Window hidden                           | No animation frames                                                                    |
| Resize                                  | At most 2 ms on the main thread per bake; the bake itself under 30 ms in the Worker    |
| Memory                                  | Drawings cached for at most two window sizes                                           |

The same report gives renderer and GPU-process CPU with and without the island
blur. "Motion adds" is the difference from the same build and case with
reduced motion turned on.

## Records that do not exist yet

| Needed for                               | Record                                                                                   | Step  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- | ----- |
| Needs you, sidebar reasons               | Summary of every workspace from the store, without repository reads                      | 4     |
| "Commands" in a progress line            | The kind of each tool request as a field of its `agent.log` event                        | 4     |
| Earlier checks in the conversation       | A list of a workspace's checks; today only the latest is read                            | later |
| Roadmap card                             | The chosen file per repository, the listing of candidates and the read at the base       | 5     |
| Judging changes inside the Evidence card | Today only the count is stored with a result; the entries come from the candidate review | open  |
| Merge from the Pull request card         | The proposed merge review                                                                | later |

Until a record exists, the card or line that needs it is not shown, or says
plainly what is missing. Nothing is guessed.

## Security and privacy

- New repository reads are limited to the roadmap file's listing and blob at
  the base commit, through Argent's own hook-free Git commands, with size and
  time bounds. They need a security review before step 5 lands.
- The only path the renderer sends is a roadmap entry it was offered, checked
  for an exact match by the service.
- The renderer's content security policy is unchanged. The Worker is one of
  the renderer's own packaged modules; the texture's image comes from the page.
- Roadmap text, file names and diff content stay literal text, escaped as
  today.

## Delivery

One pull request per step, in order, each reviewed before the next.

1. **This spec.**
2. **Visual foundation, no behaviour change:** the compositor-only loops, the
   islands, the centred composer, the texture Worker and its light layer, the
   rail, reduced motion and hidden-window pausing, with the measurements above.
3. **Card column:** Changes, Evidence with its hallmark, and Pull request from
   existing records; workspace details in the header; the docked diff and its
   strip; the narrow-window chip.
4. **Needs you and the end of each turn:** the summary record and the attention
   rule, Needs you, the sidebar's reason lines, progress lines and the next
   step.
5. **Roadmap card:** the file choice, its reading and parsing, the comparison
   with the base and the link to the diff.

## Acceptance

1. **Every glance line is a table row.** Renderer tests feed each record and
   reading state in the tables above, including every missing and refused
   state, and assert the exact glance text, tone and hallmark state.
2. **No agent text.** Tests run turns whose agent messages contain
   "all tests pass", commit names, file paths and Markdown, and assert that no
   card, progress line, next step, chip or sidebar reason contains them.
3. **Green.** Only a passed check with a `current` reading and no agent turn
   running in the workspace produces the verified tone or a struck hallmark.
4. **Reading moments.** Bridge spies assert that changes are read only when
   the Changes card or dock is open, at the moments listed; that check
   freshness is read only at the existing moments; that check progress is read
   every 3 s only while active; and that no changes or freshness reading
   happens while an agent turn runs.
5. **Still frame.** A glance change, the arrival of Needs you and the end of a
   turn never move a card above the pointer; the order of cards never changes.
6. **Hallmark.** The strike plays once per result in a window; reopening, a
   restart or a re-read with unchanged files shows it struck without playing.
7. **Roadmap.** Parser tests cover checkbox lists, nested items, headings-only
   files, items out of order, several lists, all checked, no items, front
   matter, fenced code, HTML comments, duplicate items, reworded items, every
   bound, invalid UTF-8, and hostile text (HTML, scripts, links, images,
   control and bidi characters) shown as literal text.
8. **Roadmap choice.** The service refuses a path it did not list, a symlink,
   a submodule entry and a file over the bound; the renderer cannot pass any
   other path.
9. **Sizes.** At 900 × 620 and 1,380 × 900 there is no horizontal scroll, the
   composer stays in view, cards collapse to the chip below 1,100 px, and the
   dock folds the cards into the strip.
10. **Motion.** A static test fails if any `@keyframes` used by the cockpit
    animates a property other than `transform` or `opacity`. The native smoke
    checks that reduced motion draws one still frame and that a hidden window
    produces no animation frames.
11. **Performance.** The step 2 report meets the budget in the packaged app,
    or the pull request says which number does not and why.
12. **Accessibility.** Every card, chip, hallmark and rail glyph has an
    accessible name built from the same records; Needs you is announced
    politely; keyboard focus reaches each card in order.
13. `npm run check` passes for every step, and the native smoke covers the
    cockpit at both sizes.

## Open questions for review

1. **The not-a-sandbox sentence.** Today the composer carries "Claude Code runs
   as you, with your files, network and credentials. Not a sandbox." This spec
   keeps it under the composer and repeats it in workspace details.
   Alternative: move it into workspace details only. Recommendation: keep it
   where it is.
2. **The roadmap's baseline.** This spec compares with the workspace's base
   commit, which Argent records. Alternative: read the repository's current
   default branch, a new read of a moving reference. Recommendation: the base.
3. **Green while a turn runs.** This spec drops green and wears the hallmark
   while an agent turn runs in the workspace, and applies the same rule to the
   header's Checks button. Alternative: keep the last reading green, as the
   Checks button does today. Recommendation: drop it.
4. **Judging changes in the Evidence card.** Store the entries with each check
   result, or keep the count and open the candidate review for the entries.
   Recommendation: keep the count and the link.
5. **Item 10 beyond the cockpit.** The work queue also lists a diff-line
   comment that becomes a drafted next instruction, and system notifications
   for work that needs a person. They are not in the five steps above.
   Recommendation: a sixth step, specified in an amendment to this spec after
   step 4, since both follow the attention rule.
6. **An unopened finished turn.** Whether a turn that ended in another
   workspace, and that the person has not opened since, counts as needing them.
   Recommendation: no; it is "ready for a decision", shown in the sidebar.

## What this does not change

The run state machine and its transitions; the security model of spec 0013;
consent to the exact commit; how checks run and what they record; what a draft
pull request carries; the turn record; the read-on-request rule for changes
and check freshness; and merge authority, which stays with a person.

The service gains only what the table of missing records lists: a read-only
summary of every workspace from the store (step 4), the kind of each tool
request as a field of its existing event (step 4), and the roadmap file's
listing, stored choice and read at the base commit (step 5). None of them
runs repository code. The roadmap reads use Argent's own Git commands and get a
security review; each addition comes with its own acceptance tests.
