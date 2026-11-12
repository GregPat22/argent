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
its own worktree of a local repository, so parallel workspaces use separate
working directories. Follow-up tasks reuse their workspace; this is not
filesystem isolation. The agent runs through its official command-line
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

Accepted on 12 November 2026: a trusted check runs in a fresh checkout that
Argent creates as a detached linked worktree of the exact commit and verifies
before use, so commands that call Git keep working. A test request runs the
approved `setup` command, when one is configured, and then `test` in that same
checkout, and records both. Running the `run` action is deferred until setup
and test results work; the configuration schema is unchanged.

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

#### Configuration approval service acceptance (in development)

Acceptance recorded 12 November 2026 against main `6ba963b`. This integration
step exposes the existing configuration reader and approval store through the
local service. It does not complete L1.4 or enable execution, candidate-change
consent, desktop controls or verified results.

1. `GET /workspaces/:id/command-configuration` reads the stored base configuration
   and looks up its approval from that same fresh observation. It returns the
   workspace ID, descriptor (commands, source hashes and candidate identity),
   approval ID/time when matched, and `executionAllowed: false`. Missing
   configuration returns null configuration and approval; malformed or unsafe
   source and corrupt stored approval fail closed. Current worktree bytes never
   supply configuration authority. GET does not record approval.
2. `POST /workspaces/:id/command-approvals` accepts exactly
   `{"expectedCandidateIdentity":"<sha256>"}` and requires `Idempotency-Key`.
   It invokes the existing fresh-source approval transaction. No request can
   select the operator, repository, root, revision, command array or descriptor.
   Changed expected identities reject without mutation. Its projected receipt
   includes the original approval descriptor, originating workspace, approval
   ID/time, requesting workspace and audit event. It is labelled
   `historical: true` and `executionAllowed: false`; it is never candidate consent
   or a job.
3. Both routes require the existing bearer authentication, reject browser origins
   and query parameters, and require explicit service configuration with a
   worktree root and stable operator. The desktop service supplies the fixed
   `local-desktop` actor within its private single-user store. Token/instance
   rotation does not change that actor. This is not multi-user authentication or
   resistance to an agent with the host owner's filesystem privileges. The
   standalone API does not enable these routes. Responses omit the internal
   operator identity, use `no-store`, and never return raw unexpected exceptions.
4. A duplicate POST returns the original historical receipt after restart or
   source loss without rereading Git or adding events. A fresh GET or new POST
   still revalidates source. Reused keys with different content conflict. The
   original approval workspace and the requesting sibling workspace remain
   distinguishable. Inspection, approval and retry never create runs, enqueue
   commands or invoke a configured command.
5. The existing 16 KiB body limit and ten-second source-read deadline apply.
   Disconnect signals cancel in-flight source inspection; the approval store
   checks cancellation before committing. A receipt committed before a lost
   response remains retrievable with the same key. Authentication and exact
   request-shape validation precede source reads or writes.
6. Real temporary repositories and loopback HTTP tests cover base versus current
   bytes, missing/malformed configuration, auth/origin/enablement gates, caller
   authority rejection, request bounds, stale digest, sibling reuse, operator
   separation, service restart/token rotation, lost source, corrupt snapshots,
   disconnect propagation and error redaction. Marker commands stay unexecuted
   and the agent queue remains empty. Existing approval-store regressions retain
   transaction, repository separation and concurrency coverage.

The next integration step is desktop configuration review and approval controls.
Candidate-change consent, including the open handling of changes that cannot be
displayed, remains separate from configuration approval. Command execution,
exact-commit results and stale-result presentation still require their contracts
and evidence. Public product descriptions continue to label trusted checks as
planned.

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
4. Bound the check by time, not by what a screen can show: 50,000 files, 2 GiB
   of file bytes in total, 32 MiB per Git listing and one two-minute deadline
   over the complete operation, as set out under
   [clean-commit scale](#clean-commit-scale-acceptance). Reject unsafe
   types/paths and fail the whole operation on overflow, observed change or
   cancellation. Binary bytes can be compared for identity but are not thereby
   human-reviewed. Existing changes display and API shapes, and their own
   limits, stay unchanged.
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

Acceptance recorded 11 November 2026 against main `8027d0b`; implemented at
`042a169f7267adf1b4d2806ba802de04b81d3b83`. This read-only
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
   external diff. The object source is pinned to the stored repository's common
   Git directory, independently of the worktree's `.git` file. Every commit,
   traversed tree and changed blob is hashed against its Git object ID; changed
   blobs also match their declared sizes. The common-directory binding is
   checked again after the reads. A missing object, a gitlink, an unsafe
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
6. The changes limits apply to what a person must read: 1,000 changed paths,
   4 MiB per changed blob, 32 MiB of inspected blobs and 1 MiB of diff text;
   binary content does not consume the diff allowance. Unchanged paths cost
   only verified tree traversal, bounded to 50,000 files, 50,000 trees and
   32 MiB of commit/tree bytes per revision. Changed blobs alone are read. Overflow fails the complete review with a limit error and no
   partial result, so a candidate that cannot be reviewed in full cannot later
   be consented to. One four-minute deadline covers the observation and every
   object read; cancellation awaits supervised Git cleanup. Errors never
   disclose file contents or raw process output.
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

#### Internal pinned review evidence

Recorded 11 November 2026 for implementation commit
`042a169f7267adf1b4d2806ba802de04b81d3b83`, on macOS with Git 2.42.0. `npm run check`
passed strict types, formatting, build and all 554 automated tests without
failures, cancellations or skips; unchanged main `8027d0b` passed its 541 tests
in the same environment. The thirteen focused cases in
`tests/local-command-review.test.ts` use real temporary Git repositories and
cover the acceptance criteria above. The existing changes, candidate and
approval suites pass unchanged against the shared comparison helper.

Each check was also disabled in turn in a built copy: blob size and object-ID
verification, the per-blob, total and path-count limits, the observation
binding in the identity, the configuration state and the final abort check.
Every omission made a focused case fail. That probe found the first
total-bytes fixture passing through the diff-text limit instead; the fixture
now uses NUL-filled content so that only the input allowance applies.

The forged-object case replaces a base blob's loose object with different
bytes of the same length. Git 2.42.0 served those bytes under the original ID
without error; the review refused them through its own object-ID check and
produced a result again once the object was restored. The live changes panel
does not verify base blobs this way: its diff remains unverified, untrusted
display data, as its contract states.

The diff was checked by its author against the
[security model](#security-model): explicit argument arrays, object IDs taken
only from validated listings, no caller-supplied path or revision, no worktree
or index read after the observation and no process other than trusted Git.
Blob content is the only thing the review hashes itself: a forged commit or
tree object that Git serves could still misstate the change set, which stays
within the originally stated host-owner tampering limit. The subsequent
[security correction](#review-and-checkout-security-correction) replaces that
assumption: an agent-writable Git-directory redirect can supply forged subtrees.
Independent hosted integration checks remain required.

Limits: every trusted Git read starts two processes, and a review reads up to
two blobs per changed file, so a change set of several hundred files can reach
the deadline before the size limits. The observation it depends on reads every
tracked file and refuses a commit with more than 1,000 of them, which excludes
larger repositories from trusted checks until that bound is revisited.
These fixtures establish bounded read-only review. They establish no consent,
fresh checkout, command execution or test result, and L1.4 remains incomplete.

#### Internal bounded command runner acceptance

Acceptance recorded 12 November 2026 against main `8027d0b` with the pinned
candidate review above; implemented at
`e4260cc61b42983f5092006af737cc36fbf56263`. This is the process primitive a later trusted check
needs under every design: one argument array, started under the
[security model](#security-model)'s process rules, with bounded output and one
deadline. Nothing calls it. No configuration, approval, review, job, worker,
route or desktop control reaches it, dormant command jobs stay forbidden to
execute, and Argent still launches no repository command. L1.4 remains
incomplete.

1. The runner accepts an argument array, a working directory, a runtime bound
   and an optional cancellation signal. The array has the configuration
   reader's bounds: 1 to 64 strings of at most 4 KiB, without NUL or unpaired
   surrogates, and a nonblank first element. The directory must be an existing
   directory given by its real absolute path. The runtime is an integer from
   one second to two hours. Invalid input is refused before anything starts.
2. No shell string is built or passed. A bare executable name of letters,
   digits, dot, underscore and hyphen is searched on the same path as the agent
   CLI; an absolute path is used as given; a relative path containing a slash
   must resolve, after links, to an executable regular file inside the working
   directory. Remaining arguments are passed unchanged as separate arguments.
   Starting the file is the operating system's: an interpreter line applies,
   and a file without one is run by the system shell, as `execvp` does.
3. The process receives the agent's allowlisted environment (`PATH`, `HOME`,
   `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_*`, `TERM`, `TMPDIR`) and nothing
   else: no provider API key, host token, service credential, agent
   configuration location or runtime option variable. Standard input is closed.
   The command runs as the developer. This is not a sandbox.
4. Standard output and standard error are each counted and hashed with SHA-256
   over every byte; only the last 256 KiB of each is retained, with a
   truncation flag. Both streams together are limited to 64 MiB: reaching the
   limit stops the command and is reported as such. Output is untrusted bytes.
5. The deadline, the output limit and cancellation terminate the command's
   whole process group and wait for confirmed quiescence, with the existing
   supervisor. A deadline or output limit returns a result with that outcome
   and no exit status. Cancellation returns no result. Unconfirmed termination
   raises the existing uncertainty error and is never described as an outcome.
   The runner waits for both output streams to close, so a command whose
   leftover child keeps them open ends at the deadline.
6. The immutable result records the argument array, the resolved executable,
   the directory, the outcome (exited, signaled, timed out or output limit),
   the exit status or signal when the process ended on its own, start time,
   duration and both stream records. It is labelled untested and as no
   recorded evidence: an exit status of zero says only that this process
   exited with zero. An executable that is missing, not executable, outside
   the directory or refused by the system fails without a result.
7. Fixtures start only the test runtime and small scripts written by the test
   in temporary directories; no repository command or configured action runs.
   They cover literal shell metacharacters, exit and signal outcomes, closed
   input, the environment allowlist, each executable form and its refusals,
   invalid input, output accounting and truncation, the output limit, and
   deadline and cancellation with a child process in the same group.

A fresh owned checkout, explicit consent bound to a review identity, wiring to
command jobs and exact-commit results remain separate work, with their own
security review. Until then this runner establishes nothing about a commit.

#### Internal bounded runner evidence

Recorded 12 November 2026 for implementation commit
`e4260cc61b42983f5092006af737cc36fbf56263`, on macOS with Node 22.19.0.
`npm run check` passed strict types, formatting, build and all 562 automated
tests without failures, cancellations or skips. The eight focused cases in
`tests/local-command-runner.test.ts` passed in three consecutive runs. They
start real child processes and no repository command.

Removing the environment allowlist, the inside-the-directory check, the
cancellation refusal or the output limit in a built copy each made a focused
case fail. The deadline and cancellation cases start a child that starts
another process, and confirm that both are gone afterwards.

One expectation was wrong and is corrected in the contract: an executable file
without an interpreter line is not refused by the system. It is run by the
system shell, as `execvp` does. Argent builds no shell string, but a later
check that runs a repository script inherits this.

The diff was checked by its author against the
[security model](#security-model). It has no caller, so it adds no path by
which Argent runs repository code. Independent security review is required
before anything is connected to it. Limits: bare names with other characters
are not found; a command that leaves a child holding its output open is
reported as timed out; the tail is bytes, not decoded or redacted text. No
commit, checkout, consent or test result is established, and L1.4 remains
incomplete.

#### Internal verification checkout acceptance

Acceptance recorded 12 November 2026 against main `8027d0b` with the pinned
review and bounded runner above; implemented at
`217ad9d1bb50be7e0f54d7eaeaf374daa5268d56`. This creates and removes the fresh checkout a
trusted check will run in. It runs no configured command and nothing calls it:
no job, worker, route or desktop control. L1.4 remains incomplete.

1. The service supplies its worktree folder, a separate verification folder,
   a UUID naming the checkout, a stored workspace ID and the commit and tree it
   expects. The repository and branch come from the store. No caller path,
   branch or revision name is accepted. A simulated, unknown or inconsistently
   recorded workspace is refused.
2. The commit must resolve to itself, carry the named tree and be reachable
   from the workspace's own `argent/<id>` branch. Any other commit in the
   repository, including one amended away from that branch, is refused before
   anything is created.
3. The verification folder must be apart from the repository and the
   workspace worktrees: none may equal or contain another. Its parent must
   already exist. The checkout folder, named by the UUID, is created
   exclusively with owner-only permissions; a name that already exists is
   refused and left untouched.
4. Trusted Git adds a detached linked worktree at the commit from the stored
   repository, with hooks, fsmonitor, filter commands and transports disabled.
   Registration uses `--no-checkout`; a separate population command runs
   inside the linked worktree after re-reading its conditional filter settings.
   No branch is created or moved. The workspace worktree, its index, its
   ignored files and the store are unchanged.
5. Before a checkout is returned, Argent requires the same folder it created,
   the expected top level and common Git directory, a detached HEAD at the
   commit, and an index and Git-visible bytes and modes equal to the commit,
   using the same check as the exact-commit observation. No other file may be
   present, ignored or not. The reads are repeated at the end. A mismatch,
   such as line-ending conversion requested by the commit's own attributes or
   a submodule entry, refuses the checkout. The observation's limits apply
   (50,000 files, 2 GiB in total) under one five-minute deadline, which also
   bounds Git's own population of the folder.
6. On refusal, cancellation or deadline, what was created is removed through
   Git's removal of that one worktree, or by removing the folder while it is
   still empty. Argent performs no recursive deletion of its own and never
   prunes other worktrees. If removal cannot be completed the remainder is
   left in place and the cleanup failure is reported, including on cancellation.
   A moved or missing owned folder is not reported as successfully removed.
   Unconfirmed process termination stops all cleanup.
7. Removal accepts only a checkout object created by the live service
   process. The folder must still be the same real directory, by path, device
   and inode. Whatever a command left in it is discarded, without following
   links out of the folder. A description of a checkout, or a folder that
   replaced it, removes nothing and is reported. Nothing is removed from a
   stored path or after a restart.
8. The immutable result names the folder, workspace, commit, tree and file
   count, and says that its contents matched at one point in time, that it is
   not isolation and that nothing was tested. A command run there acts as the
   developer and shares the repository's Git directory.
9. Real temporary Git fixtures cover the exact contents and modes, ignored
   and uncommitted workspace content staying behind, hostile hooks and filter
   settings, every refusal above, mismatching checkouts, removal of a dirtied
   checkout with links pointing outside, unowned and replaced folders,
   cancellation and the deadline. The existing observation tests pass
   unchanged against the shared check.

Consent bound to a review identity, wiring to command jobs, running `setup`
and `test` here and exact-commit results remain separate work, with an
independent security review before anything is connected.

#### Internal verification checkout evidence

Recorded 12 November 2026 for implementation commit
`217ad9d1bb50be7e0f54d7eaeaf374daa5268d56`, on macOS with Git 2.42.0.
`npm run check` passed strict types, formatting, build and all 572 automated
tests without failures, cancellations or skips. The ten focused cases in
`tests/local-verification-checkout.test.ts` use real temporary Git
repositories and run no configured command. The observation, review and
changes suites pass unchanged against the shared clean-commit check.

Removing each of these in a built copy made a focused case fail: the branch
reachability check, the tree binding, the separation of folders, the folder
identity check on removal, cleanup after a failed creation and exclusive
creation of the checkout folder. The tree binding is checked before creation
and again after it; removing only the first is not observable, because the
second refuses the checkout.

Two defects were found and corrected before this record. The verification
folder was created before its location was checked, which left an empty folder
inside a repository that should have been refused; the location is now decided
first and the folder's parent must exist. The first hostile-settings fixture
ran the hostile filter through its own untrusted Git calls; hostile settings
are now present only while Argent's code runs.

The diff was checked by its author against the
[security model](#security-model). Independent security review is required
before a command is run in a checkout. Limits: a checkout left by a crash or a
restart is not removed, because ownership is held only by the live process; a
command run in the checkout can change the shared repository's refs and
configuration; a file stored through a filter such as Git LFS stays a pointer;
a commit whose attributes convert line endings, and any commit above the
observation's size limits, cannot be checked out for a trusted check. No
command, consent or test result is established, and L1.4 remains incomplete.

#### Clean-commit scale acceptance

The exact-commit observation first reused the changes panel's limits, which
exist because a person reads that panel. Proving that a folder equals a commit
has no reader: the 1,000-file limit excluded ordinary repositories from
trusted checks without protecting anything. The bound is revised below independently of the display limits.

1. The clean-commit check, shared by the observation and the verification
   checkout, computes each file's Git blob identity while reading it in 64 KiB
   pieces and holds no file content. Memory therefore does not grow with file
   size or total size. Every earlier check is kept: observed parent links,
   final links not followed, regular files only, no hard links, the same file
   before and after the read, and the final recheck of every file. A file
   that grows while it is read is refused.
2. Its bounds protect time: 50,000 tracked files, 2 GiB of file bytes in
   total, 32 MiB for each Git listing and one two-minute deadline. There is no
   separate per-file limit. Exceeding a bound is a limit error with no partial
   result; a listing that does not fit is a refusal, never a shortened tree.
3. The changes panel is unchanged. It still holds whole files, because it
   displays them, within 1,000 paths, 4 MiB per file, 32 MiB in total and ten
   seconds.
4. The pinned review counts changed paths, not tracked files, against its
   1,000-path limit. A tree of up to 50,000 files with a reviewable change set
   is reviewable. The per-blob, total and diff limits on changed content are
   unchanged, under one four-minute deadline.
5. The verification checkout has one five-minute deadline for creation and
   one for removal, each also given to Git's own population or removal of the
   folder.
6. The submodule listings of the worktree ownership check use the same 32 MiB
   bound, so they do not refuse a tree the observation accepts.
7. Real temporary Git fixtures cover a commit above every changes limit, file
   sizes around the read piece size, each bound refusing without partial
   success, a large tree with a small change set and a change set that is too
   large. The existing observation, review, checkout and changes suites pass.

Still open: a changed blob above 4 MiB, or more than 1 MiB of diff text, makes
the whole candidate unreviewable and so untestable. Whether such a change may
be accepted by identity alone is a product choice for the consent slice.

#### Clean-commit scale evidence

Recorded 12 November 2026 for implementation commit
`2ed334f687b7887e3d86931be4a8e67bf6eae862`, on macOS (Apple M1) with Git 2.42.0
and Node.js 22.19.0. `npm run check` passed strict types, formatting, build
and all 572 automated tests without failures, cancellations or skips. Two
earlier cases that asserted the 1,000-file refusal were replaced by cases for
the new contract; the changes panel's suite is unchanged.

Measured once on that machine, outside the test suite, with other work
running: a commit of 50,000 files totalling 1,995 MiB, one of them 1,800 MiB,
took 21 to 22 seconds to check and 3 to 5 seconds to recheck in two runs,
with the process at 77 to 104 MiB of resident memory. A commit of 50,001
files was refused. The two-minute deadline is about four times the measured
time at the bounds; a slower disk reaches the deadline and is refused, never
passed.

Changing each of these in a built copy made a focused case fail: the
cumulative total, the comparison of the computed blob identity, the file
count, the tree listing bound, the remaining-bytes limit on a single file,
the review's restriction to changed paths and the review's changed-path
limit. Three removals are not observable by outcome, because another check
refuses the same input: the index listing bound (a clean index listing is
never longer than the tree listing), the refusal of growth during a read
(the size comparison after the read refuses it) and the review's tree file
bound (the observation or the changed-path limit refuses first).

The diff was checked by its author against the
[security model](#security-model). Limits: Git's own time to populate or
remove a checkout of this size was not measured; the bounds are engineering
values to adjust by evidence, not a product commitment; and the review still
refuses large changed blobs as stated above. No command, consent or test
result is established, and L1.4 remains incomplete.

#### Review and checkout security correction

Acceptance recorded 12 November 2026 against `43573dd`. An independent review
identified filter commands enabled only in linked-worktree configuration,
filter names containing `=`, forged nested trees supplied through a redirected
worktree `.git`, and incomplete cleanup reporting. These are corrections to
L1.4's existing security contract, not permission to execute commands.

- Filter overrides preserve complete keys through Git's separate environment
  key/value fields. Both workspace creation and verification-checkout creation
  register without population, then populate through trusted Git inside the
  new worktree's configuration context.
- Candidate review pins the object source to the stored repository, verifies
  commit and recursive tree identities as well as changed blobs, and refuses
  a changed common-directory binding. Raw traversal replaces the differently
  sized flat listings; object-size and cumulative bounds refuse with 413.
- Cancellation during population leaves a registered worktree for targeted
  removal. Failed cleanup and a moved or missing owned checkout report a
  remainder instead of success. No recursive deletion or global prune is added.
- Regression fixtures cover both filter bypasses, a forged nested tree,
  redirection immediately after observation, interruption during population,
  a moved folder and cancellation with failed cleanup.

Validation recorded 12 November 2026 for correction commit
`2f243e1`: `npm run check` passed types, formatting, build and all 579 tests,
without failures, cancellations or skips. The focused Git, review and checkout
suites passed all 32 tests. Six new filter, forged-tree, redirection and cleanup
regressions failed against unchanged `43573dd` and passed with the correction;
the population-cancellation fixture also passed. These are real temporary Git
and process fixtures, not real-agent or end-to-end trusted-check evidence.
The final diff was inspected against the independent review's findings.

These helpers remain unconnected. Consent, command-job integration, durable
results, stale marking and desktop controls remain required before L1.4 is
complete. A crash still requires manual inspection; local execution remains
unsandboxed, and an escaped process is not fenced by a process group.

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
