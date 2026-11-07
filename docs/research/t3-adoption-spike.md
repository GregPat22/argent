# Pinned T3 Code adoption source spike

Reviewed 6 November 2026 against Argent's desktop-first vision, architecture and
M1 acceptance criteria. **Recommendation: finish the bounded thin desktop
prototype now; retain T3 as the leading adoption candidate, pending maintainer
approval and runtime conformance testing before replacing or substantially
expanding the core.**

Follow-up, 6 November 2026: Argent's own core is retained for bounded M1a.
The runtime spike is deferred until measured complexity warrants it; no upstream
code was imported. See [the decision register](../DECISIONS.md#retain-the-current-core-for-bounded-m1a--6-november-2026).
The next-decision recommendation below records the source review's original gate.

## Pin and method

Official repository: `pingdotgg/t3code`. Read-only `git ls-remote` resolved
`refs/heads/main` to
[`6577c6b6185167c0e502fa01f9e8e8f2dee6ff25`](https://github.com/pingdotgg/t3code/commit/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25).
Every upstream link below uses that exact revision. Selected raw source files
were downloaded into temporary review storage; nothing was forked, installed,
executed or imported into Argent. These are **source observations, not runtime
conformance results**. No Node upgrade or billable resource was required.

## Observed fit and coupling

The [overview](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/docs/internals/overview.md)
assigns execution, providers, files and credentials to an environment server;
desktop, web and mobile clients use authenticated RPC. This supports an installed
desktop controlling local and remote execution. The
[remote design](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/docs/internals/remote.md)
explicitly supports desktop with its local environment disabled: bundled UI loads
independently and connects to saved remote environments. SSH startup and cleanup
remain desktop-owned for servers it launches. Thus the boundary is real, but
server survival depends on deployment and launcher ownership.

Adoption would bring client-runtime, RPC/domain contracts, provider adapters,
Effect services and packaging together; extracting only the UI would require
protocol adaptation. The [root manifest](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/package.json)
pins Node 26.12.1 and pnpm 12.14.0. The
[server manifest](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/apps/server/package.json)
also declares Node 22.16+ compatibility within specified ranges, but that does not
prove the monorepo builds on Argent's runtime. It includes provider SDKs and
native/runtime dependencies such as node-pty and keyring. The
[desktop manifest](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/apps/desktop/package.json)
pins Electron 44.10.1 and includes updater, authentication and native integration
dependencies. Ownership cost is materially greater than the current simulator.

The pinned [LICENSE](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/LICENSE)
is MIT, copyright T3 Tools Inc. Retaining its notice is required for copies or
substantial portions. This observation does not replace dependency-license and
distribution review.

## Durability: strong machinery, different policy

- [EventSink](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/apps/server/src/orchestration-v2/EventSink.ts#L667)
  reserves the command receipt, appends events, updates projections and enqueues
  effects within its transaction wrapper, publishing after commit.
- [EffectOutbox](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/apps/server/src/orchestration-v2/EffectOutbox.ts#L487)
  claims through one SQL update and guards settlement by worker ownership.
  Process-loss recovery cancels process-bound effects and requeues designated
  replay-safe effects. This is not an exactly-once external-effects guarantee.
- [EffectWorker](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/apps/server/src/orchestration-v2/EffectWorker.ts#L740)
  checks cancellation before execution and terminalizes process-bound work if
  successful execution cannot be settled. Execution failures can nevertheless
  enter bounded retries. [Recovery](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/apps/server/src/orchestration-v2/ProviderRuntimeRecoveryService.ts#L746)
  also supports settings-driven continuations after restart. Argent must audit
  these paths against its uncertain-outcome reconciliation policy.
- [SQLite setup](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/apps/server/src/persistence/Sqlite.ts)
  uses WAL with `synchronous=NORMAL`; its comment acknowledges possible
  post-checkpoint commit loss on OS crash or power loss. Argent currently uses
  FULL. These durability contracts are not equivalent.

Read tests include [foundation persistence](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/apps/server/src/orchestration-v2/FoundationPersistence.test.ts)
(atomic publication, deduplication, claim races, cancellation, process loss),
[receipt races](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/apps/server/src/orchestration-v2/Orchestrator.receipt-race.test.ts),
[settlement failure](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/apps/server/src/orchestration-v2/EffectWorker.test.ts#L460)
and [recreated-runtime replay](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/apps/server/src/orchestration-v2/testkit/OrchestratorReplayRecovery.integration.test.ts#L274).
The latter uses recorded provider transcripts; reading it does not validate a live
provider or a real process-kill journey. **No upstream tests were run.**

## Cloud and evidence gaps

[Configuration](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/apps/server/src/config.ts#L139)
puts the database, secrets, logs and attachments under environment storage,
separate from project checkouts. That is useful filesystem separation, but state
still belongs to that execution environment. It does not establish an independent
control plane surviving suspension or deletion of the environment itself.

The overview describes roughly one day of replay-event retention with retained
projections/receipts; [settled outbox retention](https://github.com/pingdotgg/t3code/blob/6577c6b6185167c0e502fa01f9e8e8f2dee6ff25/apps/server/src/orchestration-v2/EffectOutbox.ts#L155)
is seven days, retaining failed rows. This is insufficient evidence for Argent's
long-lived tested-commit audit contract. The remote design also states that peer
routing does not isolate agents from the receiving environment's user.

This bounded inspection does not establish isolated cloud provisioning,
quiescent suspend/resume, durable cleanup reconciliation, hard budgets, scoped
credential brokering, trusted exact-commit verification or retained PR evidence.
Existing remote connectivity must not be presented as those guarantees.

## Next decision gate

Keep the website download/install/launch journey and thin desktop shell separate
from engine selection. Do not grow the simulator into a large bespoke workflow
engine. Seek maintainer approval for a separate pinned-runtime adoption spike with
these acceptance criteria:

1. Build the pinned source in an isolated compatible toolchain; record actual
   targeted test results and dependency/distribution costs.
2. Run equivalent crash/reconnect, claim-race and uncertain-effect tests against
   both foundations, including before/after external acknowledgment and desktop
   exit; prohibit ambiguous retries.
3. Demonstrate state outside suspendable compute, retained transcripts/evidence,
   exact-commit verification and explicit lifecycle/cleanup policy.
4. Compare measured adaptation cost with continuing Argent, then obtain explicit
   maintainer approval before any fork or foundation replacement.
