# Technical due diligence

Checked 6 November 2026. This is a focused primary-source review, not a production
validation or an exhaustive dependency audit. No upstream was forked or imported,
and no billable resource was created. Conclusions are engineering judgments;
provider capabilities and prices below are dated observations.

## Recommendation

Build a small headless durability conformance prototype now. Before expanding it
into a substantial custom orchestrator, evaluate a pinned T3 Code revision against
the same acceptance tests. T3 is the strongest existing application foundation;
adopting it could avoid significant reinvention. Its models and operational
dependencies need a practical spike before a founder-approved fork decision.

Use a TypeScript modular monolith with API and independent worker processes.
Keep authoritative state outside the workspace. SQLite is enough for this local
single-host slice; PostgreSQL is the managed/multi-host target. Recommend E2B as
the first cloud adapter because it has a maintained open-source runtime and a
managed path. Use official Codex interfaces and API-key authentication for the
first real agent. Keep other providers behind explicit capability adapters.

This recommendation does not select a foundational upstream repository. A future
fork or substantial import requires founder approval and pinned-license review.

## Existing application foundations

| Project                         | License and architecture                                                                                                                 | Fit / maintenance and engineering effort                                                                                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T3 Code (`pingdotgg/t3code`)    | MIT; browser/mobile/desktop clients, server-owned execution, normalized provider adapters, transactional command receipts/events/outbox. | Closest fit. Existing reconnect, deduplication and lost-process handling can save substantial work. Large Effect-based monorepo and newer toolchain add ownership cost; cloud provisioning, policy and long-lived audit requirements need validation.   |
| Emdash (`generalaction/emdash`) | Apache-2.0; Electron plus workspace-server daemon, transport-independent core and ACP/Wire contracts.                                    | Strong agent/worktree UX and real remote architecture. Browser extraction needs a renderer/host dependency audit. It is inaccurate to call it desktop-only.                                                                                             |
| Orca (`stablyai/orca`)          | MIT; Electron, CLI, mobile/remote functionality, worktrees and terminal/structured agent views.                                          | Broad useful product surface. Native/runtime dependencies and existing UX expand adoption scope; tenant-safe lifecycle and evidence policy are not established by this review. “Orca” is ambiguous; this report evaluates this repository specifically. |

Opened source licenses: [T3](https://github.com/pingdotgg/t3code/blob/main/LICENSE),
[Emdash](https://github.com/generalaction/emdash/blob/main/LICENSE.md),
[Orca](https://github.com/stablyai/orca/blob/main/LICENSE).
Architecture evidence: [T3 overview](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md),
[Emdash instructions](https://github.com/generalaction/emdash/blob/main/AGENTS.md),
[Orca README](https://github.com/stablyai/orca/blob/main/README.md).

T3's actual [EventSink](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/orchestration-v2/EventSink.ts)
and [EffectWorker](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/orchestration-v2/EffectWorker.ts)
corroborate durable effects and conservative handling of lost processes. Its
overview describes short replay-history retention; our product needs explicit
long-lived evidence retention. Its per-environment ownership of execution/files/
credentials also needs evaluating against an always-reachable cloud control
plane. See [remote design](https://github.com/pingdotgg/t3code/blob/main/docs/internals/remote.md)
and [server manifest](https://github.com/pingdotgg/t3code/blob/main/apps/server/package.json).

| Approach                                        | Benefit                                                  | Cost / decision                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fork T3                                         | Highest potential reuse of real orchestration and UI.    | Import its domain model, toolchain and upstream tracking obligation. Run adoption spike first.                                                       |
| New narrow core with reused SDKs/infrastructure | Clear ownership of cloud lifecycle, policy and evidence. | Must re-prove durability already solved upstream. Appropriate only at current prototype scope until comparison.                                      |
| Existing frontend plus new backend              | Potentially save UI effort.                              | Client protocols encode orchestration semantics; compatibility/adaptation may cost more than a small browser client. Do not assume cheap extraction. |

Relative effort is inferred from source structure, not measured delivery estimates.
Before adopting, record an exact commit and run tests; mutable `main` links are
research references, not dependency pins or a claim that all versions behave alike.

## Cloud infrastructure

| Candidate      | Persistence / lifecycle / reconnect                                                                                                                                             | Isolation, self-hosting and tradeoff                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2B            | Pause retains disk and memory/process state. Reconnect by saved sandbox ID; paused retention documented as indefinite.                                                          | Firecracker; Apache-2.0 runtime also used by E2B Embed. Self-host needs Linux/KVM. Best current fit; restored processes make unsafe resumption a real concern.        |
| Vercel Sandbox | Persistent by default; stop snapshots disk and resume boots another session. Named get-or-create lifecycle, independent Drives; default snapshot expiry 30 days since last use. | Firecracker; managed infrastructure. No self-host implementation established. Credible managed alternative, not accurately described as ephemeral-only.               |
| Daytona        | Container stop/start retains disk; archive offloads it. VM pause retains memory too; independent volumes.                                                                       | Container/VM isolation differs. Production code went closed source 11 June 2026; legacy open code is no longer maintained. Managed option, not a maintained OSS base. |
| OpenSandbox    | Lifecycle APIs and runtime-dependent checkpoint/pause behavior; current Fast Sandbox supports disk+memory checkpoints.                                                          | Apache-2.0; Docker/Kubernetes/Firecracker options. Credible self-host alternative, with more infrastructure work and runtime-dependent guarantees.                    |

Primary sources: E2B [runtime](https://github.com/e2b-dev/runtime),
[license](https://github.com/e2b-dev/runtime/blob/main/LICENSE),
[persistence](https://docs.e2b.dev/sandbox/persistence),
[reconnect](https://docs.e2b.dev/sandbox/connect),
[limits](https://docs.e2b.dev/billing);
Vercel [duration/persistence](https://vercel.com/kb/guide/vercel-sandbox-duration-and-persistence)
and [isolation](https://vercel.com/sandbox);
Daytona [source change](https://www.daytona.io/dotfiles/updates/daytona-is-going-closed-source),
[persistence](https://www.daytona.io/docs/en/persistence/),
[isolation](https://www.daytona.io/docs/en/isolation/);
OpenSandbox [runtime repository](https://github.com/opensandbox-group/OpenSandbox),
[license](https://github.com/opensandbox-group/OpenSandbox/blob/main/LICENSE),
[checkpoints](https://github.com/opensandbox-group/OpenSandbox/blob/main/docs/architecture/fast-sandbox/checkpoints.md).

### Cost model, not a purchase proposal

Example: 2 vCPU, 4 GiB, 8 hours/day for 30 days = 240 runtime hours.

- E2B list compute: `(2 × $0.000014 + 4 × $0.0000045) × 3600 = $0.1656/hour`,
  or $39.744 usage. An uninterrupted eight-hour session exceeds Hobby's one-hour
  continuous limit; Pro is $150/month plus usage, so $189.744 before other costs.
  Pro's continuous limit is 24 hours. Confirm storage-specific billing for the
  chosen account/features. [Official pricing](https://e2b.dev/pricing),
  [limits](https://docs.e2b.dev/billing).
- Vercel `iad1` list usage: memory `4 × 240 × $0.0212 = $20.352`;
  CPU at 10% utilization `2 × 240 × 0.1 × $0.128 = $6.144`, total $26.496.
  At 100% CPU the same compute is $81.792. A 10 GB snapshot adds $0.80/month.
  This is usage, not a full subscription invoice; plan credits/fees vary.
  [Official billing model](https://vercel.com/docs/sandbox/pricing).
- Do not quote a Daytona equivalent yet: its current `.com` rate card uses
  physical cores and differs from the `.io` versioned stopped-disk billing.
  Pin the actual offer/API before estimating.
  [Current rates](https://www.daytona.com/pricing),
  [versioned billing](https://www.daytona.io/docs/en/billing/).

All examples exclude model usage, control plane, transfer, taxes and free credits.
Paused storage retention does not establish zero total cost. Recheck the chosen
rate card, region and timeout behavior immediately before any authorized trial.

## Agent interfaces and authentication

| Agent            | Official integration and lifecycle                                                                                                                                 | Permissions, cancellation and accounting                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex            | TypeScript SDK starts/resumes threads; app-server offers richer long-lived conversations and streamed events. Session references still need retained state.        | App-server approval requests and `turn/interrupt`; map normalized usage and errors, not assistant assertions. Use API-key auth for programmatic MVP; do not assume cached ChatGPT credentials authorize a hosted product.                           |
| Claude Agent SDK | Official TypeScript/Python library runs the Claude Code harness. Session history persists on disk; resume by explicit ID, retaining transcript files across hosts. | Permission hooks/user-input handling, streaming, interruption and usage/cost reporting. SDK overview requires API-key auth for third-party products unless approved; subscription support for personal use is not permission to offer hosted login. |
| OpenCode         | Headless HTTP server, OpenAPI/SDK, sessions, events and ACP support.                                                                                               | Session abort, explicit permission responses and authenticated server mode. Keep the server private to the sandbox/control channel. Underlying model provider credentials and usage terms remain separate.                                          |

Codex evidence: [official SDK documentation](https://developers.openai.com/codex/sdk/),
[app-server methods/events](https://developers.openai.com/codex/app-server/),
[programmatic authentication](https://developers.openai.com/codex/auth/).
The SDK is suitable for bounded programmatic runs; app-server is the leading
candidate when explicit approval handling is needed. Verify exact pinned versions,
streamed usage fields, abort semantics and sandbox capabilities in a contract test.
Usage counters are not a guaranteed dollar invoice or hard spending cap.

Claude evidence: [SDK overview/authentication boundary](https://code.claude.com/docs/en/agent-sdk/overview),
[sessions](https://code.claude.com/docs/en/agent-sdk/sessions),
[approvals](https://code.claude.com/docs/en/agent-sdk/user-input).
OpenCode evidence: [server/API](https://opencode.ai/docs/server/),
[SDK](https://docs.dev.opencode.ai/docs/sdk/),
[ACP](https://opencode.ai/docs/acp/).

No real agent is installed or invoked by M0. There is no subscription-token reuse
or model charge. ACP interoperability and official SDKs can reduce adapter work;
they do not provide our durable workflow, tested-commit policy or cloud lifecycle.

### Authentication qualification from the shutdown review

The [6 November shutdown analysis](conductor-shutdown-analysis.md) rechecked
current official guidance. OpenAI documents ChatGPT plan use for open-source/local
tools and self-hosted VMs, with a separate eligibility path for paid/remotely
hosted apps. Anthropic distinguishes SDK applications from hosting the unmodified
Claude Code binary with end-user authentication under stated commercial
conditions. Do not extend an SDK restriction into a blanket claim that all
hosted official-binary subscription use is prohibited, or assume a competitor's
support establishes permission for Argent's design. The linked review supplies
the primary sources, boundaries and proposed validation gate.

API-key auth remains the M1 technical-pilot baseline. No subscription route, account
entitlement or commercial approval has been tested or adopted. Existing rules
against extracting host credentials remain in force.

## Build versus reuse

Own product policy, task/run identity, evidence requirements, human approval,
budget enforcement, cleanup intent, reconciliation and the client experience.
Evaluate reusing T3's durable machinery rather than automatically rewriting it.
Reuse Git/worktrees, GitHub Apps and APIs, official agent harnesses/protocols,
PostgreSQL and existing isolated workspace infrastructure. Do not build a VM
runtime, editor, model harness or custom distributed queue for the MVP.

The initial repository keeps `src/` modules, `tests/`, `scripts/`, `docs/specs/`
and `docs/research/`. When real deployment boundaries justify it, split into
`apps/api`, `apps/worker`, `apps/web`, `packages/core`, `packages/agents`,
`packages/workspaces` and `packages/persistence`; do not create empty packages now.

## Highest risks and next verification

1. Replaying an uncertain agent/tool/Git/PR action. Persist intent, reconcile actual
   provider state and require action when outcome cannot be established.
2. Untrusted code, repository prompt injection and credential exfiltration. Use
   microVMs, scoped credential brokers and external approval/verification policy.
3. Confusing a snapshot or saved session ID with recoverable execution. Persist
   provider/session/artifact state separately; suspend only at quiescence.
4. Weak success evidence. Verify an exact commit with trusted commands and review
   test/policy modifications; retain actual exit status and logs.
5. Upstream coupling and reinventing existing machinery. Run the pinned T3 spike
   before building more core features; measure adoption rather than guessing.
6. Costs, quotas, retention and orphaned resources. Record lifecycle intent, usage
   and cleanup outcomes; enforce explicit budgets and validate provider behavior.

M0 tests local invariants only. Remaining gates: pinned upstream evaluation,
agent/version contracts, real isolated cloud persistence, GitHub App scopes,
actual PR deduplication, backup restore and security review. See the M1 spec.
