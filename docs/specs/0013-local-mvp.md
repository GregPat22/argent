# L1: local MVP with real agents in isolated worktrees

Recorded 7 November 2026, based on main `ffbeef2`.
Status: planned; slice L1.1 is in development. Until a slice lands on `main`,
agent execution remains simulated and every surface says so.

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

The first agent is Claude Code, through its official CLI, then Codex. Cursor and
OpenCode remain later targets.

## User journey

1. Add a local repository by choosing its folder.
2. Create a workspace: Argent creates branch `argent/<short-id>` from the current
   commit and checks it out in a private worktree.
3. Describe a task. Claude Code works in that worktree; its messages and tool
   calls stream into the session view. Follow-up messages continue the same
   conversation. Cancel stops the agent and its child processes.
4. Inspect the changed files and diff, run the repository's test command, and see
   the result recorded against the exact commit.
5. Open a draft pull request through the developer's own `gh` sign-in. Merging is
   always a separate human action. Archive the workspace when done.

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

### L1.2 desktop on real execution

Add-repository and create-workspace controls; the session view renders real
transcripts and follow-ups; a visible permission-mode choice; the local-execution
notice; real-agent labels replace simulation labels only for real workspaces.

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

### L1.6 Codex

The same controls through Codex's official CLI.

## Exit evidence for L1

Automated tests for every slice, a recorded desktop walkthrough, and maintainers
completing real tasks on this repository through Argent: two workspaces running in
parallel without interference, and at least one pull request created through
Argent and merged by a person.

## Out of scope for L1

Cloud workspaces, laptop-independent execution, mobile access, sandboxed
execution, team features, dependent tasks, automatic merges and any claim of
feature parity with other tools.
