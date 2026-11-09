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
