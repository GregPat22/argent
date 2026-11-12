# Deterministic timing and service teardown tests

Status: implemented (main `32748a5`). Investigation baseline: `241e6e6`,
8 November 2026. Product behavior and release scope are unchanged.

## Problem and evidence

GitHub Actions failures on 7 November 2026 exposed four test races:

- At `6b49267` and `e57c4b7`, a slow-authorization test lost its 100 ms lease
  before a scheduled heartbeat could renew it.
- At `2bdde47`, cleanup exhausted its 100 ms deadline during inspection,
  before reaching the channel-clear phase the test intended to expire.
- At `ffbeef2`, synchronous log writes exhausted a worker's 200 ms lease before
  its event-limit assertion. Promise continuations did not yield to heartbeat
  timers, so the run retained `running` until reconciliation.
- At `93a2df9`, desktop test teardown removed the service directory after HTTP
  became unavailable but before the process finished closing SQLite, producing
  `ENOTEMPTY`.

An unchanged checkout of `241e6e6` passed `npm run check` on 8 November 2026.
Controlled stalls reproduced the first three failures: 150 ms before
authorization/inspection and 3 ms per generated log. The existing fail-closed
lease/deadline behavior is correct; test timing and teardown need correction.

## Acceptance criteria

1. Hold authorization pending, advance a controlled clock across multiple
   heartbeats and beyond the original lease, then complete successfully. Assert
   that the persisted lease remains valid and settlement stops heartbeat calls.
2. Wait explicitly for channel-clear dispatch before advancing the cleanup
   deadline. Assert timeout in `clear_intent`, rejected late writes, independent
   resolution, and unchanged events after the delayed adapter returns.
3. Keep time fixed while testing log volume. Assert exactly the permitted log
   count and a durable failure specifically caused by the log limit. Preserve
   the separate real-time lease, cancellation and runtime tests.
4. After requesting desktop service shutdown, wait with a bounded deadline for
   the owned process to exit before removing its temporary directory. An HTTP
   health-check failure alone must not authorize directory removal.
5. Keep the CI workflow and production safety limits intact. Run focused tests,
   controlled-delay checks, the full `npm run check`, and review the actual diff.

These criteria refine the test harnesses for [M0](0001-durable-local-run.md),
[P1](0004-desktop-prototype.md) and the
[repository simulation](0007-cloud-workspace-lifecycle.md). Mock time establishes
ordering in individual tests; it does not replace independent-process crash,
lock-contention or real-provider verification.

## Validation limits and next step

Validation on 8 November 2026 against base `241e6e6`: all four affected tests
pass, and the three controlled-stall reproductions pass after the test changes.
The desktop teardown test also passes with a 750 ms delay between HTTP closure
and database closure. Full `npm run check` passes strict types, formatting,
compilation and 391 tests with no failures or skips. The implementation diff was
reviewed for preserved safety assertions and public-content restrictions.

No website, native GUI, packaged desktop or live-provider behavior is changed or
certified. Hosted CI must verify the proposed fix before integration; a passing
run cannot guarantee that all possible intermittent failures have been found.

## Repository custody crash fixture follow-up

Recorded 11 November 2026 against main `3836760`. CI exposed a failure before
the custody crash test's intended checkpoint: its child claimed a 100 ms lease,
then synchronous authorization and encrypted credential capture could outlast
that lease. The child reported a conflict instead of acknowledging the operation
ID. An unchanged-main focused run passed; a controlled 150 ms stall immediately
after claim reproduced the failure. This is a fixture timing race, not evidence
that production should accept writes after lease expiry.

Acceptance for this correction:

1. Freeze the child fixture's clock only across claim, authorization and custody
   capture in its two crash modes. Restore it after the critical section. Keep
   the 100 ms persisted lease and every production ownership check unchanged.
2. Exercise both zero-delay and synchronous 150 ms stall cases. Acknowledge only
   after the intended mint intent or credential-stored checkpoint is durable;
   assert that checkpoint before sending a real `SIGKILL` and awaiting child exit.
3. Reopen the store with a controlled parent clock one millisecond before the
   persisted lease expires. Reconciliation must leave the operation running.
   Advance exactly to expiry: the worker must preserve `needs_attention`, retain
   unknown credentials and never dispatch again. For custody, the encrypted
   credential must remain recoverable after restart.
4. Keep the separate real-time lease, lock-contention and process tests. No
   production timer, deadline, transition or authorization behavior changes.

Focused validation passes all four crash cases, including both controlled
stalls, and the complete repository test file. Full checks and hosted CI are
required for integration.
This establishes deterministic crash-checkpoint coverage with real child death;
it does not certify real-provider recovery or remove production expiry checks.

## Local worktree process-fixture lease correction

Acceptance recorded 11 November 2026 against main `9ddf9d7`. Two full validation
runs of the internal command-reader work each passed 483 of 484 tests but failed
different unchanged local-worktree cases: slow Git verification, then ordinary
CLI completion. Both observed `running` after the worker tick instead of
`completed`. Two focused slow-Git comparisons and a complete `npm run check`
on unchanged main passed, including all 469 tests in that full baseline run.

A diagnostic build of main `9ddf9d7` inserted a 250 ms synchronous
scheduler stall immediately after claim and before preparation. The ordinary
completion case failed with the same token, an expired lease and `lease_lost`;
the worker correctly refused to settle expired ownership. The shared fixture's
200 ms lease, unlike the production 5,000 ms lease, is sensitive to this stall.
This establishes a test-harness failure mechanism, not the precise cause of the
earlier uninstrumented failures. No production limit or expiry rule changes.

Acceptance for the test-only correction:

1. Ordinary local-worktree process fixtures use the worker's production-default
   lease. Keep real Git, fake CLI processes, cancellation, resistant-descendant
   cleanup and the existing process termination grace periods.
2. The slow-Git case holds a real Git process at an explicit gate, published
   atomically. Control only the parent clock and heartbeat intervals in this
   case. Cross the original persisted expiry in heartbeat-sized steps and assert
   each renewed lease remains valid. A real authenticated health request must
   respond while Git remains gated and the worker remains unsettled.
3. Release Git, await successful completion and advance the clock again to prove
   settlement cleared the heartbeat. On assertion failure, release the gate and
   cancel and await the owned worker with bounded waits before fixture teardown.
   Restore real time for process cleanup; do not freeze all process fixtures.
4. Preserve store expiry/fencing, real lock-contention and process-crash tests.
   Run focused completion, heartbeat and cancellation cases, the complete
   local-worktree file and `npm run check`. Repeat the controlled stall against
   the corrected fixture before integration.

Implemented at `c6dd1281a3bf62cfebe61a0971fd27a9705a6db5`, with validation recorded
on 11 November 2026. Focused completion, heartbeat and both cancellation cases
passed, as did the complete 35-case local-worktree file and `npm run check`
(484 tests, strict types, formatting and build).
An independent controlled comparison retained the main `9ddf9d7` runtime and
the same 250 ms post-claim stall, replacing only the compiled test fixture:
ordinary completion passed with the corrected fixture, while the original
200 ms fixture failed with expired ownership. This bounds the comparison to
the fixture lease choice; it does not identify the host scheduling conditions
of the earlier failures. `npm run check` passed strict types, formatting, build
and all 484 automated tests after the correction. Independent final review and
integration checks remain required. No reader or other production code changes
are part of the correction.

## Cleanup crash checkpoint and child message handling

Acceptance recorded 11 November 2026 against main `9ddf9d7`. CI validation of
`0168c50` cancelled the cleanup crash test while awaiting a child message, then
cancelled the five following cases. The pull request check for the same commit passed.
The unchanged-main focused case passed locally. A controlled 150 ms synchronous
stall in the child inspection reproduced the cancellation: the 100 ms cleanup
deadline expired in `inspecting`, cleanup correctly returned `needs_attention`
with reason `timeout`, and the child exited without a dispatch notification.
The parent awaited only the missing message, with neither exit rejection nor
a timeout. This reproduces the failure mechanism, not the original CI stall.

Acceptance for the test-only correction:

1. Control the crash child's clock and cleanup timer through its durable
   `revoke_intent` checkpoint, retaining the 100 ms persisted deadline. Keep a
   real child alive until the parent sends `SIGKILL`; test both zero delay and
   a 150 ms synchronous inspection stall. Assert the durable phase before killing.
2. After confirmed child exit, reopen just before the persisted deadline with
   a controlled parent clock. A duplicate request must not dispatch, and even
   settled-effect evidence cannot resolve an active cleanup. At exact expiry,
   late acknowledgment is refused and redispatch remains forbidden. Independent
   fresh settled-effect evidence is still required to resolve and erase custody.
3. Bound readiness, response and exit waits, reject child exit or error before its
   message, and await child teardown before removing fixture data. A separate
   uncontrolled-timeout case must reject promptly rather than cancel the suite.
4. Keep real-time hung-cleanup, lock-contention, timeout and expiry tests and all
   production behavior unchanged. Run focused crash/handshake cases, the complete
   repository-cleanup file and `npm run check` before integration.

Implemented at `3b4eafe84ae1c1ec7c3d1eee58e4e9a2d168cba6`, with validation recorded
on 11 November 2026. Focused crash, reservation and missing-response cases passed, including both synchronous-stall variants. The complete cleanup
file passed all 41 cases after readiness, response and exit waits were bounded.
`npm run check` passed types, formatting, build and all 486 automated tests.
These results preserve real process death and exact-deadline refusal; they do
not establish the precise scheduling conditions of the earlier CI failure.
Independent final review and hosted integration checks remain required.

## Hallmark layout assertion synchronization

Acceptance recorded 11 November 2026 against main `9ddf9d7`. At `fea3941`, one
hosted website run passed while another measured a 6.14 px difference between the
first two hallmark plates, exceeding the existing 2 px alignment limit. Website
source and tests were unchanged from main. Three focused baseline runs passed
with the initial local browser settings. Repeating the unchanged-main test three
times with the configured software renderer and one worker reproduced the same
alignment failure once.

The test waited for full opacity, although the struck plates also animate scale,
rotation and vertical position with a spring. Opacity alone does not establish
resting geometry. The test must wait for the final transform as well, then read
both phone-layout rectangles in one browser evaluation. Keep the same alignment
and right-edge limits, all animation/state/accessibility assertions, and the
production animation. No fixed sleep or wider tolerance substitutes for rest.

The correction at `5e59216c5ed604512430a6fada11710a7d5668ca` passed three
focused software-rendered runs with one worker on 11 November 2026.
Website typecheck/build/full browser tests, repository checks and review are
required before integration.

## Scripted worker heartbeat fixture correction

Acceptance recorded 11 November 2026 against main `f9a85f3`. One hosted check
at `a4eaeec` failed the unchanged scripted-worker heartbeat test with `running`
instead of `completed`; another hosted check and the independent complete
499-test validation passed. The test used a 200 ms lease and two real 150 ms
agent delays, asserting only final completion. The unchanged-main focused case
and full `npm run check` passed locally, including all 486 baseline tests.

A controlled diagnostic using the unchanged-main runtime inserted a 250 ms
synchronous stall before the first log write. The token remained unchanged but
the lease expired before any heartbeat ran. The worker correctly refused the
expired write and retained `running`; reconciliation then produced
`needs_attention`, and no work could be claimed again. Without the stall, the
same diagnostic completed after five heartbeats. This establishes a scheduling
failure mechanism, not the precise cause of the uninstrumented hosted failure.
Production lease, fencing, transition and deadline rules remain unchanged.

Acceptance for the test-only correction:

1. Keep the fixture's 200 ms lease. Gate the scripted agent explicitly and
   control only this test's `Date` and heartbeat intervals; do not enlarge the
   lease or rely on sleeps. Advance six 50 ms steps, passing the original expiry.
   At each step assert exactly one heartbeat, unchanged ownership token,
   persisted expiry one lease ahead of the clock, `running` status, no
   reconciliation and an unsettled worker.
2. While the gate remains closed, no verification event may exist. Release it,
   run the normal simulation artifact producer and verifier, and require durable
   completion with verification. Advance the clock after settlement and assert
   no further heartbeat calls.
3. Exercise both zero-delay and a synchronous 250 ms stall before the gate.
   Bound gate and settlement waits with real timers; on failure release the
   gate, cancel and await the owned worker before removing its temporary store.
   Restore real time during cleanup. Keep the separate real-time runtime,
   cancellation, lease-expiry, process-crash and contention tests unchanged.
4. Run the focused variants, complete worker test file and `npm run check`.
   Review the test/specification diff and preserve the unchanged-main comparison.

Implemented at `eb1c99c61e1386f3562242a83f111b53e00b1570`.
On 11 November 2026, both corrected focused variants and the complete 11-case
worker test file passed. Full `npm run check` passed strict types, formatting,
build and all 500 tests with no failures, cancellations or skips. Independent
final review and integration checks remain required. No approval
implementation or other production code changes are part of this correction.
This isolated clock-controlled proof does not certify real-provider scheduling
or establish that every possible intermittent test failure has been found.

## Website browser-process isolation (in development)

Recorded 12 November 2026 at `4aebc0470bbdb3f494044ebb54cb3a16b9b7cb5b`,
based on main `3f2181b`. Two hosted push runs pass 61 browser tests and time out
while creating the browser context for the first crawler-visible SEO test,
before navigation. Both report `Browser.setDownloadBehavior` failing to find
its context. The pull-request run of the same code passes all 62 tests, and the
isolated SEO test passes against unchanged main. These observations do not
establish the exact Chromium stall or a deterministic application failure.

The single-worker configuration shares one Chromium process across the
animation-heavy landing/reveal tests and the SEO checks. Per-test contexts
isolate page state, not browser-process resources. Separate these groups into
Playwright projects so each group starts a fresh worker/browser process while
retaining the global one-worker limit.

Acceptance:

1. Every existing test remains selected exactly once; new ordinary test files
   still enter the interactive project by default. Reveal and SEO files each
   have their own project. Keep every assertion, timeout, renderer flag and
   zero-retry policy unchanged.
2. A focused cross-group probe must show distinct Chromium process launches
   with the correction, compared with reuse before it. Full browser tests must
   pass, including the reveal geometry and crawler-visible metadata checks.
3. Run website typecheck/build and `npm run check`; require hosted checks to pass
   before integration. Process separation bounds cross-group resource sharing;
   it does not prove that every possible browser-startup stall is resolved.

The focused local probe runs one landing entrance test, the desktop reveal
geometry regression and the affected SEO test in sequence. Before separation,
all three share one observed Chromium launch; afterwards they pass with three
distinct launches. Comparing Playwright's collected test lists before and after
confirms all 62 tests are selected exactly once. This establishes the intended
process boundary; the original CI startup timeout was not reproduced locally.

Local validation on 12 November 2026 passes website typecheck, production build
and all 62 browser tests across the three projects. `npm run check` passes
strict types, formatting, compilation and all 541 repository tests. Independent
review found no issues in test selection, inherited configuration or the stated
validation limits. Hosted validation remains required before merging.
