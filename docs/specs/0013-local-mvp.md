# L1: local MVP with real agents in isolated worktrees

Recorded 7 November 2026, based on main `ffbeef2`.
Status: L1.1 (engine), L1.2 (desktop) and the local execution hardening are
implemented; L1.3 onward is planned. The real-CLI walkthrough gate is complete,
with its cancellation correction integrated in main `707ae8b`;
[development walkthrough evidence](#development-walkthrough-evidence) is recorded
below. Automated tests use a fake CLI. The order of the remaining work
is in the [roadmap's work queue](../../ROADMAP.md#work-queue).

## Product decision

The first release people can use for daily work runs real coding agents on the
developer's own computer. Each Argent workspace is a new Git branch checked out in
its own worktree of a local repository, so several tasks can run side by side
without overwriting each other. The agent runs through its official command-line
interface with the developer's own sign-in. The developer reviews the diff and
the recorded checks, and opens a draft pull request when satisfied.

This moves real execution ahead of cloud workspaces. It is the shortest path to a
usable product, and it exercises the agent, transcript, cancellation, diff,
check and pull-request contracts that [M1](0002-cloud-mvp.md) reuses later. The
cloud lifecycle, custody and GitHub pilot work stays as implemented.

The first public release of the local MVP runs Claude Code through its official
CLI. Codex and the per-run model picker (L1.6) are the first update after that
release, decided on 10 November 2026: each workspace then chooses its agent, and
each run can choose a model that the agent offers under the developer's own
sign-in, so the same desktop runs Claude models through Claude Code and GPT
models through Codex. Cursor and OpenCode remain later targets.

## User journey

Choosing the agent (step 2) and the model (step 3) arrives with L1.6; until
then every workspace runs Claude Code with its default model.

1. Add a local repository by choosing its folder.
2. Create a workspace and choose its agent: Argent creates branch
   `argent/<short-id>` from the current commit and checks it out in a private
   worktree.
3. Choose a model (or keep the agent's default) and describe a task. The agent
   works in that worktree; its messages and tool
   calls stream into the session view. Follow-up messages continue the same
   conversation. Cancel stops the agent and its child processes.
4. Inspect the changed files and diff, run the repository's test command, and see
   the result recorded against the exact commit.
5. Open a draft pull request through the developer's own `gh` sign-in. Merging is
   always a separate human action. Archive the workspace when done.

## Agent and model choice

1. **The agent is chosen per workspace.** A workspace's conversation belongs to
   one agent and is resumed only by that agent. Running another agent on the same
   change means a new workspace from the same base.
2. **The model is chosen per run.** Argent passes the choice to the agent's own
   model option (for example Claude Code's and Codex's `--model`) as a separate
   argument, never through a shell. Omitting it keeps the agent's default.
3. **No stale catalogue, no routing.** Argent offers the models each agent
   documents as a suggestion list and accepts a typed identifier matching
   `^[A-Za-z0-9._:-]{1,64}$`. Whether a model is available is decided by the
   agent and the developer's plan; a refusal fails the run visibly. Argent never
   calls models itself, never proxies them and never switches to another agent,
   provider or paid API usage on failure.
4. **Recorded.** Each run's events record the requested agent and model and,
   separately, the model the agent reports having used.

## Security model

Local execution is **not a sandbox**. The agent runs as the developer, with the
same file, network and credential access as running it in a terminal. A worktree
separates changes, not privileges. The desktop and documentation say this plainly
and never describe local mode as isolated execution.

What Argent guarantees in local mode:

1. **No shell.** Every process (Git, the agent, `gh`, configured actions) is
   started with an explicit executable and argument array, never a shell string.
   Task text reaches the agent on standard input, never as a command-line argument.
2. **Validated paths.** A repository path must be absolute, resolve to the top
   level of a non-bare Git repository and contain no NUL bytes. Worktrees are
   created only under Argent's private data directory, named by validated UUIDs.
   Argent never deletes a path it did not create and record.
3. **Argent's own Git commands do not run repository code.** They pass
   `core.hooksPath=/dev/null` and `core.fsmonitor=false`. (The agent's own
   commands are the agent's and the developer's responsibility.)
4. **Minimal agent environment.** The agent receives an allowlisted set of
   variables (`PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_*`, `TERM`,
   `TMPDIR`). Provider API-key and token variables are not passed, so a missing
   sign-in fails visibly instead of silently using billable API credits. Argent
   never reads, copies or stores the agent's sign-in.
5. **Conservative default permissions.** By default Claude Code may read and edit
   files in the worktree, and any action that would need approval is denied
   automatically. Full access (commands without approval) is an explicit per-run
   choice, labelled as such and recorded in the run's events.
6. **Bounded runs.** Each run has a deadline and bounded log events; cancellation
   and deadlines terminate the agent's whole process group.
7. **Untrusted output.** Agent statements are logged as agent output. Completion
   evidence comes from Argent's own inspection of the worktree (commit, diff hash,
   changed files) and, from L1.4, from checks Argent runs itself.
8. **Unchanged boundaries.** The service stays on loopback with its private
   credential; the renderer stays sandboxed without Node access. A remote or
   managed control plane must still never execute repository code on its host.

## Slices and acceptance criteria

### L1.1 worktree workspaces and Claude Code adapter (engine)

1. `POST /workspaces` with `{"source":"local","path":"/absolute/repo"}` validates
   the repository, records the base commit, creates branch `argent/<8 hex>` and its
   worktree, and persists a `local-worktree` workspace. A failure removes any
   worktree it created. The existing GitHub-URL simulation workspace is unchanged.
2. Runs in a `local-worktree` workspace use the Claude Code adapter: `claude -p
--output-format stream-json --verbose` with the security rules above. The first
   run creates the conversation; later runs in the same workspace resume it.
3. Assistant text, tool calls and the final result are stored as bounded log
   events. A real run's events and views carry `simulation: false`.
4. Completion requires the agent to exit successfully and Argent's independent
   worktree inspection: `HEAD` commit, branch, changed-file count and a SHA-256 of
   the working-tree diff against the base. The evidence says it is a worktree
   record, not a test result.
5. Cancellation, deadline and lost-worker behavior keep the existing state
   machine: cancel kills the process group and records `cancelled`; a service
   shutdown or lost lease becomes `needs_attention` and is never replayed.
6. Tests use a fake `claude` executable and real temporary Git repositories; they
   call no model and need no sign-in.

#### L1.1 implementation and evidence

- `src/local-worktree.ts` validates repositories, creates and rolls back the
  branch/worktree with hook-free Git, and records Argent's worktree evidence.
- `src/claude-code.ts` launches the CLI as its own process group with an
  allowlisted environment, maps its event stream to typed log lines
  (`text`, `tool`, `tool_error`, `status`) and resumes the workspace conversation.
- The store adds `local_worktrees`, per-run `simulation` and `permission_mode`
  columns (additive migration for existing databases) and allows real runs up to
  two hours and 2,000 log events. The worker uses the real adapters only for
  `local-worktree` workspaces and fails such runs safely when they are not
  configured. Only the desktop service enables them; the standalone API and
  worker do not.
- `tests/local-worktree.test.ts` covers path validation, hook suppression,
  rollback, the CLI contract (argv, standard-input task, environment allowlist,
  resume, permission modes), failure without evidence, process-group
  cancellation, the disabled path, API gating and the migration, using a fake CLI
  and real temporary repositories.
- Real-CLI evidence: see the [development walkthrough](#development-walkthrough-evidence)
  and its integration limits. No diff view, test command or archive; a
  conversation whose CLI process died before
  announcing its session is not recovered automatically.

#### Failure-summary regression (in development)

Acceptance criteria, 10 November 2026, based on main `a9bc431`:

1. A usage-limit result with subtype `success`, `is_error: true` and exit code
   1 must remain `failed`, with no verification record. The summary must read
   "Claude Code failed (exit 1)." without repeating the CLI's internal subtype.
2. The provider explanation and earlier conversation remain bounded, untrusted
   transcript text. Provider markup must not become executable UI content or
   part of Argent's failure summary.
3. A nonzero exit, an error result, a non-success subtype or a missing result
   must still fail. A successful run still requires independent worktree evidence.
4. Reading history or ticking the worker must not retry a failed run. An explicit
   follow-up resumes the same initialized session and keeps the earlier turn;
   edits-only defaults and explicit full-access permissions remain unchanged.

Regression coverage uses fake CLI processes in `tests/local-worktree.test.ts`
and the compiled renderer in `tests/renderer-safety.test.ts`. These fixtures
exercise contradictory result fields, stderr fallback, hostile subtype/text,
retained history and explicit follow-up permissions. They call no model and do
not replace the [real-CLI walkthrough](#development-walkthrough-evidence)
or complete the roadmap's first gate on their own.

### L1.2 desktop on real execution

Add-repository and create-workspace controls; the session view renders real
transcripts and follow-ups; a visible permission-mode choice; the local-execution
notice; real-agent labels replace simulation labels only for real workspaces.

#### L1.2 implementation and evidence

- **The renderer never supplies a path.** The bridge method
  `createLocalWorkspace(fromWorkspaceId?)` opens a native folder dialog in the
  main process, or reuses the repository recorded for an existing local workspace
  to start a parallel one. The service then applies the L1.1 path validation.
- The workspace dialog offers "Choose a local repository" first; GitHub-URL
  workspaces stay as labelled simulations. Local workspaces show the repository
  name, branch and worktree path, a "Claude Code · not a sandbox" notice and a
  "Parallel workspace" action.
- The task dialog for a local workspace has the permission choice (edits only by
  default, or full access with a warning), a limit in minutes up to two hours,
  and becomes "Continue the conversation" once the workspace has a run. A pending
  submission keeps its permission mode when retried. (Since
  [spec 0015](0015-desktop-restyle.md) these choices are composer chips: edits
  only by default, full access confirmed once per workspace and reset after each
  send.)
- The activity view labels agent text, tool calls, tool errors and status lines;
  the verification view shows the worktree record as "NOT TESTED".
- Resolving an interrupted real run records `abandon_run` with
  `simulation: false` instead of the simulation labels in the initial
  implementation. The hardening contract below removes this unsafe resolution
  path: a note does not prove that the previous process has stopped.
- The desktop service now receives `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_ALL`,
  `LC_CTYPE`, `TERM`, `CLAUDE_CONFIG_DIR` and `ARGENT_CLAUDE_PATH` from the app, so
  the CLI can find its sign-in when Argent is opened from Finder. The agent still
  receives only the allowlist above.
- Evidence: `tests/desktop.test.ts` drives the bridge against a real detached
  service with a fake CLI (cancelled dialog, parallel workspace, refusal of
  renderer paths and simulation sources, a full-access run completing with a
  worktree record in the right worktree only). `npm run desktop:smoke` drives the
  same flow through the Electron interface.

### L1.3 changes panel

The workspace's changed files and unified diff against its base, bounded in size,
read through the service. The service slice is implemented in main `1b9e4dd`,
11 November 2026. Desktop integration is in development and does not yet complete
the L1.3 acceptance gate.

#### Read-only changes service acceptance (in development)

Acceptance recorded 11 November 2026 against main `f4f2999`:

1. `GET /workspaces/{id}/changes` requires the existing operator bearer token,
   rejects browser origins and is enabled only by the local service's configured
   worktree root. No query parameters, paths, revisions or Git options are
   accepted. Simulation workspaces and unowned, replaced or misplaced worktrees
   are refused. The recorded branch, base commit and repository identity determine
   the read.
2. The response is typed `workspace-changes`, with `simulation: false`,
   `tested: false` and `consistency: live`. Its files describe the current content
   against the recorded base, combining committed, staged, unstaged and untracked
   changes. Ignored untracked files are excluded. Reading never changes the
   index, worktree, runs or verification history.
3. Added, modified, deleted, exact-content renamed, binary, empty, executable-mode
   and symlink changes are represented. Renames require identical bytes and mode;
   an edited rename is an addition and a deletion. Text uses bounded whole-file
   replacement hunks, including missing-final-newline markers, rather than a
   minimal line edit algorithm. Binary or invalid-UTF-8 content has metadata and
   `binary: true`, with no text diff. Symlinks show their target bytes, never the
   target file's contents. All returned text remains untrusted display data.
4. Trusted Git enumerates tree and index paths and reads base blobs by object ID.
   Replacement refs are disabled, alongside hooks, fsmonitor and command-producing
   filters. Git never computes a working-tree diff or runs textconv/external diff.
   Current content is read with bounded file descriptors, rejecting observed
   parent symlinks, final-link swaps, hardlinks and special files. Submodules,
   unsafe paths and invalid-UTF-8 path names fail closed.
5. Each request permits at most 1,000 enumerated paths, 4 MiB per input file,
   32 MiB of inspected current/base content and 1 MiB of diff text. Metadata
   commands also have bounded capture. Content/file-count/diff overflow returns
   HTTP 413 with no partial success. This first slice reads all tracked and
   nonignored untracked files: an unchanged oversized file or a large repository
   can therefore prevent inspection. Large binary files within the input limit
   do not consume the text-diff allowance. Diff size is checked before constructing
   line bodies, including newline-heavy input.
6. A single ten-second deadline covers ownership checks, enumeration and content
   reads; expiry returns HTTP 408. Cancellation and HTTP disconnect abort the
   operation and await supervised Git cleanup. The service does not start an
   agent, test command or other repository code.

Regression coverage in `tests/workspace-changes.test.ts` uses real temporary Git
repositories and authenticated foreground HTTP servers. It exercises mixed Git
states, literal unusual filenames, replacement refs, hostile command settings,
symlink/hardlink/FIFO refusal, unsupported submodules, input/output limits,
cancellation, disconnect and the global deadline. These fixtures call no model
and supply no desktop or trusted-test evidence.

Limits and next steps: this is a live observation, not an immutable snapshot.
Per-file identity checks and repeated branch/listing checks detect some concurrent
changes, but cannot fence a host owner rewriting directories or configuration
between filesystem operations. There is no staged-versus-unstaged split, rename
similarity search, pagination or partial oversized-file view. The desktop integration below connects the narrow bridge and changes panel;
its acceptance must verify the complete native journey. Trusted checks remain L1.4, and the L1.3 exit gate remains
open until the desktop panel and its evidence exist.

#### Desktop changes acceptance (in development)

Acceptance recorded 11 November 2026 against main `1b9e4dd`:

1. A Changes button opens an accessible dialog for the selected workspace. Local
   workspaces show current changed files and a selected unified diff against the
   recorded base, including untracked, renamed, deleted, binary and mode changes.
   A demo explicitly says that no repository is checked out and no real diff is
   available. Empty, loading, request-error, oversized and missing-worktree states
   never show a partial successful result.
2. Only opening the dialog or pressing Refresh reads changes. Transcript polling,
   reconnecting and selecting a file never trigger a repository scan. Refresh
   clears old content while loading and preserves the selected filename if it
   still exists. Closing, changing workspace or observing a disconnect clears
   content and invalidates pending success and error responses; reconnect requires
   explicit refresh. A queued close event cannot invalidate a reopened dialog.
3. The sandboxed preload exposes only `workspaceChanges(workspaceId)`. The main
   process rejects extra arguments and non-UUID identifiers, performs an
   authenticated GET with a twenty-second timeout, and validates workspace
   identity, SHA-1/SHA-256 hash format, flags, file shapes and byte/count bounds.
   The renderer additionally checks the selected workspace's recorded base.
   No paths, Git options, revisions, credentials or command capabilities are
   accepted from the renderer.
4. Every path and diff is rendered through `textContent`. Filename labels are
   quoted, with escaped backslashes, newlines, tabs and invisible controls;
   control and bidi-format characters in diff content are displayed as escapes.
   Binary or invalid-UTF-8 files show metadata without a text preview. The file
   list, selected diff and close/refresh controls are keyboard accessible; Escape
   closes the modal and returns focus. Long paths and diffs scroll within the
   existing dark desktop layout.
5. The view labels all reads as live observations, not tested or immutable
   snapshots. Inspection never creates a run, launches an agent, modifies source
   content or replaces a verification record. It inherits the service's whole-file
   hunks, exact-only rename detection and complete-request overflow limits.

Focused regressions are in `tests/desktop-changes.test.ts` and
`tests/renderer-changes.test.ts`. Native smoke coverage uses the fake CLI and real
throwaway Git repositories, checks empty and mixed changes, manual refresh,
quoted hostile content, binary previews, keyboard close/focus and unchanged run
and artifact records. These fixtures call no model. Full repository checks,
website checks and independent native acceptance remain required before marking
L1.3 complete. Trusted checks remain L1.4; this panel does not meet that gate.

### L1.4 setup, run and test actions

Commands read from a reviewed per-repository configuration file, run with the
same process rules, bounded output and deadlines. A test result is recorded as
evidence for the exact commit. This slice is the centre of the remaining local
work, because it is where a run can first end as verified instead of recorded.
The agent must not be able to change the checks that judge it: the
configuration is read from the workspace's base commit, never from the
worktree, the developer approves its commands once per repository, and a
changed configuration needs a fresh approval. A result counts only while its
recorded commit is the workspace's current commit and the worktree is clean;
any later change shows it as stale. This is the first time Argent itself
launches repository code, so it needs its own security review.

### L1.5 draft pull request and archive

Commit and push the workspace branch and open a draft pull request through `gh`,
recording the pull request URL. The pull request description carries Argent's
evidence record (commit, checks and their results, diff hash, agent, model and
permission mode), so the proof travels with the code. Archive removes the worktree only when it has no
uncommitted changes, unless the developer explicitly discards them; the branch is
kept.

### L1.6 Codex and model choice

The first update after the first public release, not a condition of it. The same
controls through Codex's official CLI. The create-workspace dialog
offers both agents, and the task dialog a per-run model choice for either agent,
following [agent and model choice](#agent-and-model-choice). A developer can then
run Claude and GPT models side by side in separate workspaces.

## Exit evidence for L1

Automated tests for every slice, a recorded desktop walkthrough, and maintainers
completing real tasks on this repository through Argent: two workspaces running in
parallel without interference, and at least one pull request created through
Argent and merged by a person. This gates the first public release, which ships
with Claude Code. L1.6 has its own evidence: at least one real task completed
with each of Claude Code and Codex.

## Out of scope for L1

Cloud workspaces, laptop-independent execution, mobile access, sandboxed
execution, team features, dependent tasks, automatic merges and any claim of
feature parity with other tools.

## Local execution hardening

Acceptance criteria, 9 November 2026, based on main `241e6e6`:

1. A note cannot resolve an interrupted real run or permit a replacement writer.
   Until independent process reconciliation is available, such workspaces remain
   blocked. Simulation abandonment remains available.
2. Every post-spawn operation, including the first emitted status, is covered by
   process cleanup. Cancellation waits for group quiescence and escalates even
   when the leader exits before a resistant descendant. Unconfirmed termination
   leaves the run in `needs_attention`. Zombie processes are quiescent; a PID
   from a previous service instance is never signalled without identity proof.
3. Trusted Git operations disable command-producing filters and remain
   asynchronous, bounded and cancellable so service requests and leases stay live.
4. Separate workspaces execute concurrently within a bounded service limit;
   one workspace still permits only one active or uncertain execution.
5. Evidence binds untracked content and file type as well as tracked changes.
   Unsafe or oversized inputs fail verification instead of producing partial proof.
6. Workspace creation has one mutation owner; refresh cannot permit duplicate
   dispatch. Every persisted transcript event remains reachable in the desktop.
7. Before task dispatch, the official CLI must report version 2.1.259 or newer,
   which introduced the required noninteractive permission setting in the
   [official release](https://github.com/anthropics/claude-code/releases/tag/v2.1.259).
   The probe has
   a five-second deadline and a 1 KiB output bound. A refusal dispatches no task.
8. JSONL input is validated before interpretation, with a 1 MiB event limit and
   64 MiB total stream limit. Malformed events or success results fail the run;
   every failure still waits for process cleanup before settlement.

A real model-backed walkthrough and durable process reconciliation after a hard
service crash remain separate requirements; fake-CLI tests do not prove them.

Hardening verification contract: version 2 worktree records hash the tracked
binary diff and a deterministic untracked manifest (path, Git file mode and
SHA-256 of bytes, or of a symlink target without following it). Reads are bounded
at 16 MiB per regular file, 64 MiB total and 10,000 untracked entries. Special
files supplied to the reader, hardlinks, parent symlinks and files changing during
inspection are rejected. This records Git-visible content, not ignored files or
an immutable filesystem snapshot. Existing versionless records remain historical.
Trusted Git ignores global/system configuration and clears configured local or
included clean/smudge/process filters per invocation; it does not alter repository
configuration. Like the rest of local mode, this is not protection against a
host owner concurrently rewriting configuration or filesystem state.
Submodules are rejected before workspace checkout, agent dispatch and evidence
inspection: a parent repository's filter overrides do not neutralize nested
configuration. No successful record may silently omit submodule content.

The desktop dispatcher uses two execution slots. Each slot makes
an atomic store claim; the workspace uniqueness constraint is unchanged. Shutdown
signals every slot and waits for all cleanup before closing the store. The
standalone simulation worker retains one slot. Regression coverage requires both
overlapping real-process fixtures and a third queued run at the concurrency limit.

Desktop hardening keeps all fetched events for each loaded conversation turn in
memory, with 500 visible events per turn page and explicit earlier/later controls.
Polling preserves an
older page until the user returns to the latest events. Workspace creation shares
the existing mutation lock, including native-dialog cancellation and refresh.
Renderer regressions cover duplicate synthetic clicks and access to both ends of
a transcript longer than one page.

### Cancellation regression acceptance

Implemented in main `707ae8b`; acceptance recorded against main `a9bc431` on
10 November 2026. Repeated local
process fixtures on macOS reproduced a transient `EPERM` from a process-group
liveness probe during termination, followed by `ESRCH` on a fresh probe. The
baseline treats the transient error as unconfirmed cleanup and blocks the
workspace. This can affect cancellation before the CLI emits its first event.
Apple's [process-group signal implementation](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_sig.c)
can return `EPERM` when a group exists but has no eligible signal recipients.

Acceptance for the follow-up:

1. The live supervisor retries a group probe or termination signal after
   `EPERM` at most three times, with a 25 ms delay between attempts. No other
   error is retried. `ESRCH` still confirms that the group is absent.
2. A successful signal is not itself proof of quiescence. Cancellation still
   inspects the whole group, distinguishes zombies and escalates for surviving
   descendants. Persistent permission denial or failed inspection remains
   `needs_attention`; no failure is silently treated as a stopped process.
3. Deterministic regressions cover transient denial while a process remains
   live, denial of a termination signal, and denial followed by confirmed
   absence. The existing persistent-denial and resistant-descendant cases must
   continue passing. Native fixture repetition exercises the actual exit race
   without calling a model.
4. This does not reconcile previously blocked runs or recover ownership after a
   service restart. Real-CLI cancellation requires separate walkthrough evidence;
   automated fixtures alone do not meet it.

### Development walkthrough evidence

Recorded 10 November 2026, based on main `a9bc43122b6cce37d4c09bf1f891449403b24436`
plus the cancellation implementation committed as
`87011a2cd774fd4cb06482246cd361818a6ea0a2`. The manual run exercised that
supervisor implementation before the unrelated failure-summary correction from
main `4767a29` was integrated for automated checks. The cancellation correction
is integrated in main `707ae8b64151fb2098025fd1d33a76e3d0b5ec20`. Integration
review on 10 November 2026 confirmed that `src/process-group.ts` and
`tests/process-group.test.ts` match the recorded implementation at `87011a2`
exactly. The recorded cases below and the integrated defect corrections satisfy
work-queue item 1. This is an integration review of existing walkthrough evidence,
not a new manual run against the combined revision.

The manual desktop walkthrough used the signed-in official Claude Code CLI
2.1.322 on macOS. Saved execution events and a separate read-only inspection of
the worktrees establish the following:

| Case                      | Observed result                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edits only                | A real task added a linked-worktree regression test. Argent recorded one changed file and no test evidence.                                                                                                                                                                                                                                  |
| Full access and follow-up | The same conversation resumed, ran commands and completed with the same diff hash. The agent reported passing repository checks; Argent correctly retained `tested: false`, because those are not trusted checks run by Argent.                                                                                                              |
| Permission denial         | A command requiring approval was denied in edits-only mode. The transcript identified the denial; the agent's successful conversational exit did not turn it into test evidence.                                                                                                                                                             |
| Cancellation              | With the supervisor correction, a foreground command was dispatched, cancellation was requested, and the persisted outcome became `cancelled` about 1.2 seconds later. No completion record was created. A subsequent task resumed the conversation successfully.                                                                            |
| Parallel workspaces       | Two full-access runs overlapped for approximately 126 seconds and both completed. Separate worktrees contained the same marker filename with distinct contents, `A` and `B`; each had exactly one untracked file and no tracked changes. Their independent version-2 worktree records had distinct diff hashes and remained `tested: false`. |

The cancellation and parallel cases used Haiku with low effort through a local
CLI launch override. This is test configuration, not an implemented model picker;
Argent's normal agent-selection and model-selection scope is unchanged.

Defects and limits:

- Early cancellation exposed transient process-group permission errors. The
  correction passed the real cancellation case above, deterministic regression
  tests, repeated native fixtures and the native smoke test. The original
  uncertain run remains blocked; no historical state was cleared.
- Provider quota failures surfaced a contradictory failure summary containing
  both an unsuccessful exit and the word "success". This defect was corrected
  separately in main `4767a29`.
  That correction has automated coverage, but was not part of the manual runs
  recorded here; quota refusal is not itself evidence of an Argent execution retry.
- Selecting a directory containing repositories, rather than a Git checkout,
  correctly failed validation. Model/effort controls and repository/workspace
  removal were unavailable during the walkthrough; the existing milestone scope
  is unchanged.
- This exercise does not verify durable process reconciliation, trusted checks,
  draft pull requests, archiving, signed distribution or the complete L1 exit.
  The next step is L1.3, the changes panel, as ordered in the work queue.

### Hardening evidence

Recorded 9 November 2026 at `8183ff8`, after integrating main `176384a`:
`npm run check` passes strict types, formatting and the complete suite. Real
temporary Git repositories and fake CLI processes exercise resistant descendants,
early-reader failures, uncertain cleanup, service death, bounded parallel runs,
unsafe filters/submodules, malformed output and content-bound evidence. Compiled
renderer tests cover retained history, keyboard paging, duplicate creation and
the blocked real-run recovery flow. The native Electron smoke passes the
restyled desktop, local fixture execution, cancellation and service reconnection.

These tests call no model. They do not establish recovery of a process that
escaped its original group, durable reconciliation after a hard service crash,
an immutable filesystem snapshot or production sandbox isolation. A real CLI
walkthrough remains required before claiming the complete local MVP exit gate.
