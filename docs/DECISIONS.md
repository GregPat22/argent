# Decision register

Recorded 6 November 2026. **Accepted** means a product or engineering requirement;
**provisional** means a recommendation still needing a practical check. Neither
label proves a capability is implemented. Read [Project context](PROJECT_CONTEXT.md)
for the current publication boundary.

| Decision                                                             | Status                                            | Rationale and consequence                                                                                                            | Revisit or completion evidence                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Argent is desktop-first, downloaded from a website                   | Accepted founder requirement                      | Preserve installation and launch as a native app experience. Browser access may complement it.                                       | Local package and hands-on desktop checks; signing/notarization and public distribution remain separate. |
| Cloud execution is foundational                                      | Accepted founder requirement                      | A developer must be able to close a client and reconnect elsewhere. Desktop delivery does not move remote execution into the client. | Real remotely hosted worker, isolated persistent workspace and disconnect/reconnect evidence.            |
| Open-source, independently usable core                               | Accepted founder requirement                      | Self-hosting and model/provider independence remain part of the product.                                                             | Self-hosted control-plane instructions and separately verified isolation runtime.                        |
| MIT for the original foundation                                      | Selected project license                          | Permit broad adoption and commercial use; accept competing commercial forks.                                                         | Review licensing and attribution before importing upstream code or adding modules.                       |
| One TypeScript package with separate boundaries                      | Implemented M0; accepted initial structure        | Keep API, persistence, worker and adapters distinct without empty packages.                                                          | Split only when real deployment or ownership boundaries justify it.                                      |
| SQLite for one trusted local host                                    | Implemented M0                                    | Prove durability without provisioning a database. Never use a network filesystem for it.                                             | Move to PostgreSQL before multiple control-plane hosts or managed tenancy.                               |
| Atomic claims and transactional state/event writes                   | Implemented M0; required invariant                | Prevent duplicate dispatch and unrecorded transitions across processes.                                                              | Retain concurrent-claim, lock-contention and crash regression tests through future adapters.             |
| Unknown outcomes require reconciliation                              | Implemented M0 blocking behavior; accepted policy | Avoid silently repeating external effects. Fencing a database writer does not fence provider actions.                                | Audited operator resolution and failure injection around every real external effect.                     |
| Independent evidence before success                                  | Implemented only for simulation; accepted policy  | Agent statements are not proof. Real checks must identify trusted policy and exact commit.                                           | Trusted test artifacts, actual diff review and exact-SHA draft-PR evidence.                              |
| Evaluate T3 Code before substantially expanding custom orchestration | Provisional engineering recommendation            | Existing durable machinery may save effort, but adoption creates coupling. No fork has been approved.                                | Pin a revision, run conformance tests, assess licenses and obtain founder decision.                      |
| E2B as first cloud candidate                                         | Provisional engineering recommendation            | Managed offering and open runtime may fit persistence and self-hosting goals.                                                        | Real persistence, crash, isolation, retention, cost and cleanup contract tests.                          |
| Codex via an official interface as first real agent                  | Provisional engineering recommendation            | Narrow the MVP and avoid unsupported credential reuse.                                                                               | Pin interface/version, prove authentication, sessions, interruption and usage capture in isolation.      |
| Finite repair attempts and human merge authority                     | Accepted MVP policy                               | Bound autonomous loops and preserve human control of integration.                                                                    | M1 initially permits at most one repair attempt; merges require a separate human decision.               |

## Choices deliberately left open

- Whether to adopt T3 Code, retain the current core or use another approved
  foundation after the practical spike.
- P1 uses Electron 45.2.3 for the local macOS prototype. Cross-platform releases,
  signing/notarization and automatic updates remain open.
- The exact cloud region, resource shape, account, quotas and approved budget.
- Remote authentication, tenant authorization, secrets brokering and recovery UX.
- Evidence retention, artifact access, backup/restore and deletion policies.
- Commercial pricing, proprietary feature boundaries and contributor governance
  as the community grows.

Do not turn an open choice into an implied commitment in product copy or code.
Update this register with the reason and supporting evidence when a choice is
resolved. Provider and market observations live in the
[dated research](research/technical-due-diligence.md), not as permanent guarantees.

## Conductor shutdown review: adopted roadmap direction

On `GregPat22/grok-conductor-shutdown-analysis`, based on main `fd60a5a`,
the [Grok report review](research/conductor-shutdown-analysis.md) found alignment
with our headless/cloud design, but unresolved customer, authentication and
portability questions. The founder then authorized saving the findings and
updating the roadmap. The following planning directions are adopted; capabilities
remain unimplemented and provider eligibility remains unverified:

- Serve all three overlapping audiences through
  a shared core with staged personal-cloud, team-handoff and organization features;
  do not infer a feature ranking from unsampled X posts.
- Evaluate permitted subscription routes by provider and deployment. Current
  official-binary and open-source sign-in options need a more specific assessment
  than the earlier API-key-only recommendation. No credential extraction or
  managed-cloud eligibility is authorized or established by this research.
  Prefer supported subscription sign-in for eventual onboarding and API keys as
  an alternative/technical-pilot route. The feasibility matrix must establish the
  applicable provider/deployment permissions before product promises change.
  No silent billable fallback after subscription quota exhaustion.
- Add independently demonstrated export/restore and visible execution/recovery
  controls to the managed release contract.
- Keep one real agent/workspace for the first proof. Stage additional agents,
  scoped team handoff and lightweight mobile access before dependency orchestration.
  Native mobile and advanced organization capabilities remain later. Retain
  Electron pending actual user/performance evidence; no foundation replacement.

The [continuity spec](specs/0006-continuity-and-market-validation.md) records
acceptance criteria and decision gates; M1 now references these release additions.
The first technical proof remains one repository/workspace/agent, with API-key auth.
Exact launch packaging, prices, provider permissions and the implementation details
of team/mobile features remain open. Detailed specs precede those implementations.
The founder confirms they verified Grok's underlying X material; independent
retrieval and representative-sampling limits remain documented in the review.

## Name and publication

The founder selected **Argent**, combining _argento_ and _agent_. The
`GregPat22/argent` repository namespace was available and a public repository was
created. Other software already uses Argent; no exclusive brand, domain or
trademark availability is established. The founder authorized adding project
context and pushing it to GitHub. That authorization covers source publication,
not a deployed service, paid infrastructure or downloadable binary release.

## Completed source evaluation

The [pinned T3 source spike](research/t3-adoption-spike.md) evaluated revision
`6577c6b6185167c0e502fa01f9e8e8f2dee6ff25`. No upstream code was installed, run,
forked or imported. Runtime conformance and founder approval still precede any
foundation replacement. The [P1 report](milestones/0001-completion.md) records the
local desktop implementation and its limits.
