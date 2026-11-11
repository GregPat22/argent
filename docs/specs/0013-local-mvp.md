# L1: local MVP with real agents in isolated worktrees

Recorded 7 November 2026, based on main `ffbeef2`.
Status: L1.1 (engine), L1.2 (desktop), L1.3 (changes panel) and the local
execution hardening are implemented; trusted checks (L1.4) and later slices are
planned. L1.3 implementation evidence is recorded below. The real-CLI walkthrough
gate is complete,
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
  and its integration limits. L1.3 now provides the diff view; test commands
  and archiving remain planned. A conversation whose CLI process died before
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
11 November 2026. The desktop panel is implemented and independently exercised
at `37ea7804b1c024e6324b766951ab98329c7037b0`; see the
[implementation evidence](#l13-implementation-evidence).

#### Read-only changes service acceptance

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
similarity search, pagination or partial oversized-file view. The desktop
integration below connects the narrow bridge and changes panel. Native
acceptance is recorded below; trusted checks remain L1.4.

#### Desktop changes acceptance

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
and artifact records. These fixtures call no model. Trusted checks remain L1.4;
this panel does not meet that gate.

#### L1.3 implementation evidence

Recorded 11 November 2026 against implementation commit
`37ea7804b1c024e6324b766951ab98329c7037b0`. An independent validation run passed
`npm run check`, including strict types, formatting and all 467 automated tests.
Service regressions cover path traversal, unsafe filesystem inputs and oversized
inspection/diff refusal; bridge and renderer regressions cover response validation,
stale selection, close/reopen, disconnect, literal untrusted text and explicit
refresh.

The native Electron smoke passed with a fake CLI and real temporary Git
repositories. It displayed empty and mixed changed-file lists, untracked text,
exact-content renames, deletion and binary metadata; selected diffs and manual
refresh showed the expected current bytes. Escape closed the dialog and returned
focus. Hostile markup remained literal text, and inspection left run and
verification records unchanged. Screenshot review confirmed the usable file list,
selected diff and existing dark desktop layout. This proves the inspection flow
with real Git, not a new model-backed run or trusted test execution.

Website typecheck and build passed at that revision; this evidence does not
claim a completed browser suite at that commit. Integration additionally requires
the complete website browser suite and the delivery regression gates. No new
real-account walkthrough, trusted checks, pull-request flow or cloud execution
is established by this evidence.

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

#### Internal command-configuration reader acceptance

Acceptance recorded 11 November 2026 against main `9ddf9d7`; the internal reader
is implemented at `914323d962b031f4e44e9c0047c626c5800e6643`. This groundwork does
not execute commands, store approvals or test evidence, or expose an API or
desktop control. L1.4 remains incomplete and in development.

1. The reader accepts a stored workspace identifier and the service's worktree
   root. It derives the repository, owned worktree, branch and exact base commit
   from the store, validates their canonical paths and common Git directory,
   and rechecks filesystem identity before returning. Callers cannot select a
   file or revision. Trusted Git reads only root `argent.json` at the stored
   base, never the current worktree, index or `HEAD`. Missing configuration means
   not configured; a directory, symlink, gitlink, malformed object or oversized
   blob fails closed. No repository or execution state is mutated.
2. The version-1 shape is, for example,
   `{"version":1,"commands":{"test":{"argv":["npm","test"]}}}`. Only `version`
   and `commands` are accepted at the root, with one or more optional `setup`,
   `run` and `test` actions. Each action has only `argv`, a nonempty array of
   strings. Unknown keys, unsupported versions,
   shell strings, an empty executable, NUL, invalid UTF-8 and unpaired Unicode
   surrogates are rejected. Environment, working-directory and runtime overrides
   are not accepted. Parsed commands and returned metadata are immutable.
3. Limits are 64 KiB of configuration bytes, 64 arguments per action and 4 KiB
   per argument. Blob size is bounded before content is read. One ten-second
   deadline and cancellation signal cover validation and every Git read;
   cancellation awaits supervised Git cleanup. Errors never disclose file
   contents or raw process output.
4. The descriptor records the source base SHA, fixed path, blob ID and SHA-256 of
   the exact bytes. Its approval-candidate identity hashes a versioned structured
   encoding of the canonical repository common-directory path, device and inode,
   content digest and interpretation-policy version. The same bytes in sibling
   workspaces or at a newer base have the same candidate identity. Changed bytes,
   repository identity or interpretation policy require a different identity.
   This is not an approval grant, and local mode is not tamper-resistant against
   the host owner.
5. Real temporary Git fixtures cover base-versus-current content, identity
   stability and changes, strict schema/byte bounds, unsafe blob modes,
   replacement refs, hostile hooks/filters, cancellation and the shared deadline.
   Reads leave store records, events, index and working files unchanged and never
   execute a configured action. These fixtures call no model.

Later execution must compare command-defining and test changes against the trusted
base and surface them for human review, as required by the
[verification architecture](../../ARCHITECTURE.md#evidence-and-external-actions).
Freezing an `npm test` argument array alone does not prevent candidate code from
changing what that command tests. Approval persistence is covered by the
[internal durable approval contract](#internal-durable-command-approval-acceptance)
below. Process execution, exact-commit results and stale-result UI remain
separate work.

#### Internal reader implementation evidence

Recorded 11 November 2026 for implementation commit
`914323d962b031f4e44e9c0047c626c5800e6643`. `npm run check` passed strict types,
formatting, build and all 484 automated tests. The fifteen reader regressions in
`tests/local-command-config.test.ts` cover the acceptance criteria above with
real temporary Git repositories, including linked source worktrees, ordinary
common-directory replacement and cancellation of an active supervised Git read.
The cancellation fixture publishes its PID by atomic rename before requesting
cancellation. Scoped diff, public-content and documentation link checks passed.

An earlier full-suite check passed 483 of 484 tests and failed the existing
slow-Git verification test: it observed `running` where `completed` was expected.
Two independent focused comparisons on unchanged main `9ddf9d7` passed that test.
A later independent full check at `00de4a7` also passed 483 of 484 tests, failing
the unchanged ordinary CLI-completion case with the same unexpected state.
A full unchanged-main check passed all 469 baseline tests. A controlled 250 ms
scheduler stall after claim reproduced the ordinary failure in an instrumented
build of main, retaining
the token with expired ownership and `lease_lost`. This demonstrates the shared
200 ms test lease's sensitivity and the safe refusal to settle expired ownership;
it does not establish the precise cause of either uninstrumented failure.
The [test-only fixture correction](0014-ci-test-determinism.md#local-worktree-process-fixture-lease-correction)
uses the production lease for ordinary process cases and explicitly controlled
heartbeat timing for the real-Git responsiveness case. With the same main runtime
and controlled stall, ordinary completion passed using the corrected fixture.
Production execution and reader code remain unchanged.

This evidence establishes the internal reader and its refusal boundaries only.
It establishes no real-account agent run, command execution, persisted approval,
trusted test result, desktop control or completed L1.4 exit. The approval candidate
remains a descriptor rather than a grant, and local host-owner tampering remains
outside the protection claimed. The durable approval implementation below adds
persistence separately. Reviewed command/test changes, bounded execution and
exact-commit evidence with stale-result handling are still required.

#### Internal durable command-approval acceptance

Implemented at `268ed61759d50285d5a89d3319542caff6027ac4`, based on main
`f9a85f32e5444079b738980e28a2d0971429a331`.
This implements internal storage within the accepted L1.4 contract. It does not
expose approval controls, create a command job or execute configured code. The
complete L1.4 exit remains open.

1. The internal approval operation accepts a stored workspace ID, expected
   candidate identity and idempotency key. The service supplies its worktree root
   and authenticated operator identity; neither comes from untrusted request
   content. The operation freshly invokes the existing base-commit reader. It
   never accepts caller-provided command arrays or configuration descriptors as
   authority. Missing configuration or an unexpected candidate rejects without
   recording approval. No public API or desktop bridge is added.
2. One immutable approval snapshot per operator and candidate retains the parsed
   commands, source base/blob/content hashes, policy, originating workspace and
   approval timestamp. The candidate binds the canonical common Git directory's
   path, device and inode as well as exact configuration bytes and interpretation
   policy. A sibling workspace or later base with identical bytes can reuse the
   same operator's approval. Another repository, changed bytes (including
   whitespace), changed policy or another operator cannot reuse it.
3. Approval, an attributed ordered event and the request receipt commit in one
   `BEGIN IMMEDIATE` transaction on the existing SQLite connection. A new request
   that reuses an approval records its own attributed reuse event and receipt;
   it does not replace the original snapshot or timestamp. The transaction
   rechecks duplicates and the stored workspace binding after the asynchronous
   Git read. Concurrent writers serialize; any failed write rolls back the entire
   request. Schema initialization is additive and rejects unsupported versions.
4. The idempotency fingerprint binds workspace, operator and expected candidate.
   An identical completed request returns its original historical receipt,
   including after restart or loss of the workspace files, without reading Git
   or adding an event. Changed request content with the same key conflicts.
   A receipt is explicitly historical: it is never a current authorization,
   command request or portable execution grant.
5. Reusable-approval lookup always freshly reads the service-owned candidate and
   compares its identity, current policy, source content/blob hashes and parsed
   command snapshot with the stored approval. Missing approval returns no match;
   unsafe reads and malformed or inconsistent stored snapshots fail closed.
   Every snapshot read, including historical receipt reads, verifies its stored
   checksum. This detects accidental corruption; the host owner can replace it.
   Returned records are deeply immutable. This is only a point-in-time match.
   Future execution must independently revalidate under its own ownership rules;
   no database transaction makes the filesystem immutable. Local host-owner
   tampering remains outside the protection claimed.
6. Approval has no effect on workspace execution state, runs, leases or worker
   dispatch. Portable history retains its existing version and field allowlist:
   local worktree exports remain unsupported, approval records are excluded from
   unrelated simulation exports, and restore creates only read-only history
   tables. An imported bundle cannot install approvals or execution authority.
7. Automated fixtures cover fresh-source binding, expected-digest rejection,
   repository/operator separation, sibling and newer-base reuse, invalid inputs,
   cancellation, snapshot corruption, rollback at event and receipt insertion,
   migration, independent-process contention, duplicate/conflicting requests,
   restart and portable-history exclusion. Configured marker commands remain
   unexecuted, and the normal worker has no job to claim.

Validation recorded on 11 November 2026 for implementation
`268ed61759d50285d5a89d3319542caff6027ac4`: all thirteen focused approval tests
passed, as did `npm run check` with strict types, formatting, build and all 499
automated tests. Diff review found no remaining blockers. Independent final
checkout verification and hosted integration checks remain required.
These fixtures use local temporary Git repositories and no actual agent account.
Command execution,
review of candidate changes to command-defining files and tests, exact-commit
results, stale-result display and the complete L1.4 exit remain separate work.
Configuration approval alone does not approve later changes to a test script.

#### Dormant command-job ownership acceptance

Acceptance recorded 11 November 2026 against main `0ad0caf`. Internal ownership
is implemented at `f70dbf3240daa14e4a8240ba5aaf16694015e3dc`.
It adds no command runner, public enqueue
operation, desktop control, command completion or test evidence. L1.4 remains
incomplete.

1. Command jobs share the existing `runs` table, active-work uniqueness,
   idempotency keys, fencing tokens, deadlines and uncertainty exclusion with
   agent runs. An additive kind defaults old rows to agent work. A command job
   requires a running local workspace, no lifecycle enrollment and no active or
   uncertain job of either kind. Its immutable detail and queue event commit
   with the run in one transaction.
2. Internal enqueue freshly looks up the approving operator's service-owned
   configuration and binds the expected approval and candidate identity, action,
   source base/blob/content/policy, command snapshot and bounded runtime. It
   accepts no argv or caller descriptor. Identical request keys read the existing
   job without source access or another event; changed requests and cross-kind
   reuse conflict. Snapshots are checked and deeply frozen on reads and claims.
3. The payload is explicitly versioned as dormant, ownership-only and forbidden
   to execute. It is not a reviewed candidate or complete execution plan, and a
   future runner must never silently dispatch it. The normal worker claims only
   agents and additionally checks the kind before choosing any adapter. Internal
   command claims acquire ownership only; malformed detail cannot become an
   agent task, an agent log, command completion or verification evidence.
4. SQLite requires an explicit command-claim protocol version in the same update
   as the running state and fence. Legacy claim SQL, including a statement
   prepared before migration, omits that version and must fail atomically before
   dispatch. Existing agent claims continue working. Older workers may stop with
   an error; transparent downgrade or old-client interpretation is not promised.
5. Queued cancellation prevents claims; claimed cancellation, heartbeat expiry
   and restart retain the existing acknowledgment and uncertainty rules. Late
   writes fail at exact expiry. Uncertain command work blocks agent and command
   jobs and cannot be resolved by a simulation note. No uncertain work is replayed.
   Claims persist the bounded runtime deadline; with no command runner, this
   slice performs no runtime abort or configured-command deadline enforcement.
   Reconciliation handles lease expiry, preserving the existing store/worker
   responsibility split.
6. Existing run lists, cursors, direct run/event/artifact reads and mutations do
   not expose or mutate internal command jobs as agent conversations. Existing
   agent wire shapes remain unchanged. Portable export refuses command rows and
   retains its existing local-history refusal; imports cannot install jobs or
   approvals.
7. Regressions cover fresh approval/source binding, immutable snapshots,
   duplicate/conflicting requests, migration, legacy SQL refusal, transactional
   rollback, independent-process contention, exact-expiry fencing, cancellation,
   worker dispatch refusal and public/history compatibility. Fixtures execute no
   configured command and use no real agent account.

Validation recorded on 11 November 2026 for implementation
`f70dbf3240daa14e4a8240ba5aaf16694015e3dc`: all ten focused integration cases
passed, including independent-process enqueue and claim contention, prepared
legacy SQL across migration, rollback, exact-expiry refusal, cancellation and
public/history guards. `npm run check` passed strict types, formatting, build
and all 510 automated tests. Public-content and documentation-link checks passed.

A separate probe loaded the prior Store and Worker code from the tree merged as
`0ad0caf` alongside the new store. It opened the older Store before migration:
an ordinary agent claim still succeeded, but the older worker's command claim
failed at SQLite before workspace preparation or adapter invocation. The command
remained queued without a lease or extra event; the new internal command claim
then acquired ownership, and the configured marker remained unexecuted. This
checks the claim boundary, not a packaged-app downgrade or older-client support.
Independent final review, clean-checkout verification and hosted integration
checks remain required.

Execution still requires a separate reviewed candidate and command plan, clean
verification checkout, bounded process supervision and exact-commit evidence.
Ownership and configuration approval alone establish none of those facts.

#### Internal exact-commit candidate observation acceptance

Implemented at `b7c426b26e4ab126a292aee8d7e58b49ac9c7235`, with validation recorded
on 11 November 2026.
This read-only groundwork binds an operator's approved base configuration to an
exact observed commit. It does not collect human review, produce a complete
review diff or execution plan, persist consent, enqueue work or run commands.

1. The service supplies its worktree root, stored workspace ID and trusted
   operator identity. The inspector freshly looks up that operator's approved
   configuration and derives HEAD, tree and base identities itself. It accepts
   no caller path, revision, argv or purported review. The immutable versioned
   observation binds workspace, operator, approval, configuration identity and
   policy, base, HEAD and tree. It explicitly says review is not collected,
   execution is forbidden, ignored content is excluded and no tests were run.
2. Require the complete raw index to equal the pinned HEAD tree, including modes
   and stage zero. Read every tracked file's actual bytes with the existing
   bounded, no-follow changes reader and compare its Git blob identity and mode
   with HEAD. Executable mode follows the owner execute bit, as Git does. Reject
   staged, unstaged, index-only, missing and nonignored
   untracked files, unresolved entries and submodules. Do not trust Git's stat
   cache, assume-unchanged/skip-worktree flags, filters or normalization to prove
   byte equality. A file Git considers clean after conversion may be refused.
3. Recheck HEAD, index, nonignored untracked listing, stored workspace binding,
   directory identity and fresh approval binding. After the complete traversal
   and those Git reads, recheck every observed file's identity and metadata so
   an early-read file changed later in the operation cannot silently pass.
   These are point-in-time checks, not an atomic filesystem snapshot or protection
   against arbitrary host-owner tampering.
4. Reuse the changes limits: 1,000 files, 4 MiB per file, 32 MiB total file bytes
   and one ten-second deadline over the complete operation. Bound Git listings,
   reject unsafe types/paths and fail the whole operation on overflow, observed
   change or cancellation. Binary bytes can be compared for identity but are not
   thereby human-reviewed. Existing changes display and API shapes stay unchanged.
5. Trusted Git keeps optional index refresh disabled. An empty
   `GIT_ALLOW_PROTOCOL` allowlist denies transports despite per-protocol repository
   configuration; `GIT_NO_LAZY_FETCH=1` adds a guard on Git versions that support
   it. Missing promisor objects fail closed without transport/helper execution.
   This requires no minimum Git version increase. Local marker-only helper
   fixtures exercise the older-Git transport refusal without contacting a server.
6. Observation has no idempotency receipt or durable approval state. Restart
   performs a new read; an old object cannot authorize execution or prove current
   cleanliness. Ignored dependencies, caches and build outputs remain excluded:
   future verification still needs a fresh owned checkout. Complete pinned
   base-to-candidate review, including changed command/test machinery and a
   truthful treatment of binary content, remains separate work.
7. Tests cover stable and changed commit identities, actor/configuration binding,
   raw index and file changes, hidden dirtiness flags, final file mutation,
   binary/symlink behavior, unsupported files/submodules, bounds, abort/deadline
   and no store/index/job mutation. Existing changes and approval tests must pass,
   followed by the complete repository check and security review. No configured
   marker is executed and no dormant command job becomes runnable.

The same owner-execute interpretation applies to live changes and the untracked
worktree manifest. Group-only execute permission must neither masquerade as Git
mode `100755` nor hide removal of owner execute. Existing historical records are
not rewritten; the records remain untested.

#### Internal candidate observation evidence

Implementation `b7c426b26e4ab126a292aee8d7e58b49ac9c7235`, validated on 11 November
2026: the focused Git/candidate/changes suite passed 45 tests, the local-worktree
suite passed 36 tests, and `npm run check` passed type checking, formatting,
build and all 531 repository tests without failures, cancellations or skips.
The actual source/tests diff received a separate security review. Local owned
fixtures exercised the transport denial on Git 2.42.0 and 2.54.0; guarded reads
of missing promisor objects did not launch the marker helper or mutate Git
files in the older-Git probe.

The executable-mode regression first reproduced Git treating group-only execute
as `100644` and removal of owner execute as a change from `100755`. Candidate
inspection, live changes and untracked manifests now use the same interpretation.
The fixtures also cover concealed dirtiness, final file mutation, approval and
workspace binding, raw binary/symlink identity, bounds and cancellation. No
configured command marker is executed, and observations create no receipt or
job. Existing historical evidence is not rewritten.

This is automated fixture evidence for read-only inspection. It does not complete
L1.4 or establish human consent, fresh-checkout isolation, command execution or
trusted test evidence. The next work remains complete pinned candidate review,
explicit consent, fresh-checkout execution and exact-commit result handling.

#### Internal pinned candidate review acceptance

Acceptance recorded 11 November 2026 against main `8027d0b`. This read-only
groundwork produces what a person would have to read before consenting to run
the approved base commands against one exact commit. It collects no consent,
persists nothing, enqueues no work and runs no command. L1.4 remains incomplete.

1. The service supplies its worktree root, a stored workspace ID and the trusted
   operator identity. The review first requires a fresh
   [exact-commit observation](#internal-exact-commit-candidate-observation-acceptance):
   the operator's matching configuration approval and a worktree whose index
   and Git-visible bytes equal one commit. It accepts no caller path, revision,
   argv, diff or purported observation. A dirty, unapproved, simulated or
   unknown workspace has no review.
2. The change set compares the recorded base commit with the observed commit,
   tree to tree. Trusted Git reads only objects named by those two commits:
   never the worktree, the index, replacement refs, filters, textconv or an
   external diff. Every blob read is checked against the size in the pinned
   tree listing and against its own Git object ID, so content Git would serve
   under a mismatched ID is refused. A missing object, a gitlink, an unsafe
   path, an invalid-UTF-8 path name or a malformed listing fails the whole
   review.
3. Each changed file records its status, both modes, both blob IDs and both
   sizes. Added, modified, deleted, exact-content renamed, mode-only and
   symlink changes are represented with the same bounded whole-file text hunks
   as the changes panel. Binary or invalid-UTF-8 content has identity and size
   only, and the review says so: it is counted as binary and never described
   as displayed or reviewed. All paths and text remain untrusted display data.
4. Commands always come from the approved base configuration. The review
   reports whether the candidate's own `argent.json` is unchanged, changed or
   removed relative to the base, and marks that file in the change set. It
   states that Argent cannot identify which changed files a command will
   execute: the complete change set is the review, and no heuristic narrows it.
5. The versioned review identity hashes the observation identity (workspace,
   operator, approval, configuration, base, commit and tree), the configuration
   state and every changed path with its status, modes, blob IDs and binary
   flag. Another commit with the same tree, another operator and any content
   change produce another identity. The immutable result explicitly has no
   consent, forbids execution and is untested.
6. The changes limits apply: 1,000 paths across both trees, 4 MiB per blob,
   32 MiB of inspected blobs and 1 MiB of diff text; binary content does not
   consume the diff allowance. Overflow fails the complete review with a limit
   error and no partial result, so a candidate that cannot be reviewed in full
   cannot later be consented to. One twenty-second deadline covers the
   observation and every object read; cancellation awaits supervised Git
   cleanup. Errors never disclose file contents or raw process output.
7. The review has no idempotency receipt and no durable state. Its content is
   pinned to immutable objects; the cleanliness of the worktree is only the
   observation's point-in-time statement. Restart performs a new read, and an
   old review cannot authorize execution. Ignored content stays excluded, and
   host-owner tampering with the object database remains outside the
   protection claimed.
8. Real temporary Git fixtures cover every change kind, identity stability and
   change, candidate configuration changes, refusal without a clean approved
   commit, replacement refs and hostile command settings, literal unusual
   names, a missing and a forged object, each bound, cancellation and the
   deadline. Reviews leave store records, the index and working files
   unchanged; no configured marker runs and no dormant job becomes runnable.
   The existing changes inspection keeps its behavior and tests.

Explicit consent bound to a review identity, a fresh owned checkout, bounded
command execution and exact-commit results remain separate work. A reviewed
change set is not evidence that a command passed.

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
