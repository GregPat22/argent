# M0: durable local execution and reconnection

Status: implementation in this repository. This is a simulator, not the cloud MVP.

## Problem

A browser disconnect must not terminate a run, and a worker crash must not cause
an uncertain command to execute again. Prove those invariants before paying for
infrastructure or attaching an agent with arbitrary command execution.

## Scope

A loopback authenticated HTTP API and independent worker share a local SQLite
database. Register one GitHub repository URL as metadata, create a local workspace,
queue a scripted task, disconnect and reconnect to read status and ordered events.
The workspace retains an artifact across stop/start. No repository is cloned.
No model, shell, cloud API or GitHub API is invoked.

## Acceptance criteria

1. Workspace metadata, runs and event history survive API and worker restarts.
2. HTTP clients can disconnect while a separate worker completes a run.
3. Concurrent claims execute one run once; only one active run per workspace.
4. Run submission accepts an idempotency key. Same key and payload return the
   original run; key reuse with different content returns HTTP 409.
5. Events have stable ordered cursors; reconnect after a cursor yields only newer
   events, with bounded pagination.
6. Expired running leases become `needs_attention`; never automatically requeue.
   Stale workers cannot append events or finalize a run.
7. Cancellation is persisted. Queued cancellation is immediate; active cancellation
   is cooperative and must be acknowledged by the worker or marked uncertain.
8. Enforce run wall time, finite event volume, validated inputs and API body limits.
9. Stop preserves workspace files; stop while active fails. No delete endpoint.
10. Scripted execution creates a fixed JSON artifact. A separate verifier reads
    it and records its SHA-256 and simulation evidence before `completed`.
11. Unauthenticated and invalid requests fail without leaking internals.
12. Integration tests include real child processes, worker death, reconnect, leases,
    cancellation, idempotency and workspace persistence.

## Constraints and completion

SQLite WAL and `BEGIN IMMEDIATE` transactions; no in-memory authoritative queue.
Fenced leases are control-plane guards, not a promise to fence an external API.
Unknown external outcomes always require reconciliation. The API binds loopback
and uses an operator token; this is not multi-user authentication or cloud isolation.

Complete when the criteria above pass. M0 completion does not complete the MVP;
see 0002-cloud-mvp.md for the real cloud and tested-PR acceptance contract.
