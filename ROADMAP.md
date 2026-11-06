# Roadmap

Updated 6 November 2026 after the founder authorized incorporating the
[Conductor shutdown review](docs/research/conductor-shutdown-analysis.md).
Sequence by demonstrated behavior rather than dates. Planned work is not an
implemented capability or authorization to spend, deploy or replace the foundation.

## Product direction

Serve a shared audience of developers and small teams, including displaced
Conductor users and engineering teams needing handoff and inspectable evidence.
These audiences overlap. Build a common core, then stage team and organization
capabilities. The installed desktop remains the primary interface to independent
execution; lightweight mobile access is a secondary client.

Prefer supported subscription sign-in for eventual product onboarding, with API
keys as an alternative and the first controlled technical-pilot path. Verify each
provider and deployment separately before promising managed subscription support.
Never silently fall back to billable API usage. Pricing and customer demand remain
unvalidated; MIT and a headless architecture alone do not establish differentiation.

## Milestones and exit evidence

| Milestone                              | Status / outcome                                                                                                                         | Exit evidence                                                                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0: durability conformance             | Complete: local scripted workspace, independent worker and reconnect.                                                                    | Recorded state/process-death, claim-race, cancellation and artifact tests.                                                                                                                                                  |
| P1: usable desktop prototype           | Merged in `fd60a5a`: local macOS desktop, detached service and simulated work.                                                           | P1 reports and refresh regressions; latest checks record 41 tests. Real agents/cloud and public signed distribution remain unfinished.                                                                                      |
| Foundation adoption gate               | Current core retained for bounded M1a; T3 runtime spike deferred until measured need.                                                    | Conformance, license/dependency and measured adaptation comparison; founder approval before a fork/import or foundation replacement.                                                                                        |
| Customer and authentication validation | Next, alongside bounded M1a: check real workflows, closest alternatives and permitted auth by deployment.                                | Document user tradeoffs, onboarding/cost friction and provider-specific permissions, renewal, quotas and revocation. Proposed discovery sample is 5–8 users, not a mandatory count or representative survey.                |
| M1a: persistent cloud workspace        | One GitHub App-authorized repository in isolated persistent compute; E2B remains the first candidate.                                    | Approved provider/budget before provisioning; pinned checkout/dependency survives quiescent suspend/resume; failure, isolation and cleanup contracts pass.                                                                  |
| M1b: real agent and visible control    | One official Codex integration, retained transcripts/events and API-key pilot.                                                           | Laptop-independent execution, second-client reconnect, visible execution location/freshness, blocked-input handling, cancellation acknowledgment, deadlines and uncertain-outcome reconciliation.                           |
| M1c: tested draft pull request         | Trusted checks and independently reviewed diff for the exact proposed commit.                                                            | Tested SHA, retained output, finite repair budget, timeout-safe PR deduplication and explicit human merge authority.                                                                                                        |
| M1d: portable continuity               | Export and restore usable context/evidence to an independent installation.                                                               | Versioned manifest, completeness/integrity and secret checks; restore without Argent-hosted endpoints; uncertain runs never automatically replay external effects.                                                          |
| M1 managed release                     | Complete the [M1 contract](docs/specs/0002-cloud-mvp.md) and [continuity contract](docs/specs/0006-continuity-and-market-validation.md). | PostgreSQL, remote authorization, credential/isolation review, enforced limits, cost evidence, cleanup, backup/restore and independent self-host operation.                                                                 |
| Desktop distribution                   | Signed public download/install/launch experience; can progress alongside M1.                                                             | Real versioned artifacts, signing/notarization, checksums and update verification; publication separately authorized.                                                                                                       |
| M2a: agent breadth and team handoff    | Additional agent integration, scoped shared workflows and lightweight mobile access before dependency orchestration.                     | Provider capability tests; actor/workspace authorization, approval attribution and serialized writers; handoff and secondary-client reconnect without credential sharing. Separate acceptance specs precede implementation. |
| M2b: dependency-aware tasks            | Coordinate eligible follow-on work and isolated worktrees.                                                                               | Explicit task dependencies, bounded concurrency/repair, review policy and recovery evidence.                                                                                                                                |
| Later organization capabilities        | Advanced organization controls, enterprise procurement and native mobile apps as demand warrants.                                        | Separate scope and acceptance decisions. No enterprise or native-mobile availability implied.                                                                                                                               |

## What changed and what agents should do next

The shutdown reinforces continuity and practical ownership. Existing cloud and
open-source alternatives mean we must measure reliability, review effort, recovery
and total cost per accepted task against the same agent/workflow elsewhere.
The founder verified the underlying X material; it remains qualitative evidence,
not a market-size estimate, feature-frequency ranking or proof of willingness to pay.

1. Read the [decision register](docs/DECISIONS.md),
   [research](docs/research/conductor-shutdown-analysis.md) and
   [continuity specification](docs/specs/0006-continuity-and-market-validation.md).
2. Retain the current core for bounded M1a and verify the provider/deployment auth matrix.
   User interviews and paid competitor trials require the relevant authorization.
3. Continue [M1a access/lifecycle work](docs/specs/0007-cloud-workspace-lifecycle.md)
   from the internal lifecycle/bootstrap simulations to live GitHub access,
   isolated checkout and approved persistence/cleanup evidence, then M1b–M1d in focused slices.
4. Preserve the one-repository, one-workspace, one-agent technical proof. Team
   replacement is a later release promise; it needs M2a evidence first.

Keep Electron pending measured performance/user evidence. Do not build a full
editor, swarms, billing system or VM runtime now. Full Conductor live-session
import is not promised: inspect a consented redacted export before defining an
importer. Exporting readable history and resuming a process are separate claims.

No paid resources are provisioned until the founder explicitly authorizes the
provider, region, resource shape and budget. No automatic merging. Native mobile
and advanced enterprise capabilities are outside M1; authentication, isolation,
budget enforcement and portable recovery are managed-release requirements.
