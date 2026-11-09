# L1: local MVP with real agents in isolated worktrees

Recorded 7 November 2026, based on main `ffbeef2`.
Status: L1.1 (engine), L1.2 (desktop) and the local execution hardening are
implemented; L1.3 onward is planned. A recorded run against the real CLI is
still pending; automated tests use a fake CLI. The order of the remaining work
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

The local MVP ships two agents, both through their official CLIs: Claude Code
first, then Codex. Each workspace chooses its agent, and each run can choose a
model that the agent offers under the developer's own sign-in, so the same
desktop runs Claude models through Claude Code and GPT models through Codex.
Cursor and OpenCode remain later targets.

## User journey

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
- Not yet verified: a recorded run against the real CLI. Limits: no diff view, no
  test command, no archive; a conversation whose CLI process died before
  announcing its session is not recovered automatically.

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
read through the service.

### L1.4 setup, run and test actions

Commands read from a reviewed per-repository configuration file, run with the
same process rules, bounded output and deadlines. A test result is recorded as
evidence for the exact commit.

### L1.5 draft pull request and archive

Commit and push the workspace branch and open a draft pull request through `gh`,
recording the pull request URL. Archive removes the worktree only when it has no
uncommitted changes, unless the developer explicitly discards them; the branch is
kept.

### L1.6 Codex and model choice

The same controls through Codex's official CLI. The create-workspace dialog
offers both agents, and the task dialog a per-run model choice for either agent,
following [agent and model choice](#agent-and-model-choice). A developer can then
run Claude and GPT models side by side in separate workspaces.

## Exit evidence for L1

Automated tests for every slice, a recorded desktop walkthrough, and maintainers
completing real tasks on this repository through Argent: two workspaces running in
parallel without interference, at least one task completed with each of Claude
Code and Codex, and at least one pull request created through Argent and merged
by a person.

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
