# M0 completion report

Completed 6 November 2026 on macOS with Node 22.19.0 and npm 10.9.3.

## Delivered

- Initialized an original MIT-licensed project in the previously empty directory.
- Wrote vision, architecture, roadmap, engineering instructions, dated primary-source
  due diligence, and separate M0 and real-cloud MVP specifications.
- Implemented a token-authenticated loopback HTTP API, on-disk transactional queue,
  independent worker, fenced leases, cursor history and idempotent submission.
- Implemented bounded scripted execution, independent artifact verification,
  cancellation, persistent local workspace files and conservative crash handling.
- Added pinned development dependencies, CI checks and a runnable restart demo.

## Verification actually run

`npm run check` passed: strict type checking, formatting, and **22 tests, 22 passed,
0 failed, 0 skipped**. The suite uses real on-disk databases and independent child
processes. Coverage includes duplicate submissions, competing claims, API death
during a running task, new-client event replay, killed-worker reconciliation,
cancellation, runtime/event limits, workspace file retention, missing verification
and leases expiring while another process holds the database write lock.

`npm run demo` demonstrates an active simulated task continuing across an API
restart and reconnecting to persisted verification history. It preserves its
database and JSON artifact under the printed ignored `.data/` directory.

This environment initially prevented loopback listening. Unit/worker checks ran
in the sandbox; the complete suite and demo subsequently ran successfully with
local-server permission. No checks were skipped to obtain a passing result.

## Independent review and repairs

A fresh read-only reviewer found a clock-sampling race: a database lock wait
could outlast a lease/deadline while validation used a pre-lock timestamp. A
cross-process reproduction confirmed it. Lease-sensitive methods now sample
the default clock after acquiring the transaction lock; three focused regression
tests cover completion, heartbeat and log writes.

The reviewer also found demo cleanup could miss a failed worker startup. Startup
now sits inside the API cleanup boundary. No other actionable defect was found
in the trusted local-simulator scope during that review.

## Limitations and next step

This is a local simulator. Repository URLs are metadata, not GitHub authorization
or cloned code. The scripted adapter writes fixed JSON; it does not implement
repository tasks. There are no real model/cloud/GitHub calls, diffs or pull requests.
API polling demonstrates reconnect behavior locally; remote authenticated access
and independent cloud hosting remain M1 work.

SQLite is experimental in this Node release, single-host only and not suitable
for the managed multi-host target. The local workspace adapter does not isolate
untrusted execution. There is no operator resolution/delete API, production
secret broker or deployed backup/restore path. Uncertain work blocks its workspace.

Next: test a pinned T3 Code version against our acceptance contract before further
custom orchestration. Obtain maintainer approval before any upstream fork/import
or billable provisioning. Then implement real isolated workspace and official
agent adapters against the M1 specification.
