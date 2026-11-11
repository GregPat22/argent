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
