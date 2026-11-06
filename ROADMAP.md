# Roadmap

Sequence by demonstrated behavior rather than dates. M0 is not the cloud MVP.

| Milestone                       | Outcome                                                                        | Exit evidence                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| M0: durability conformance      | Local scripted workspace → independent worker → disconnect/reconnect.          | Automated state, process death, race, cancellation and artifact tests; runnable demo.                                                    |
| Foundation adoption spike       | Evaluate pinned T3 Code against M0 invariants and cloud extensions.            | Written comparison, license/dependency review, adoption effort and founder decision before a fork/import.                                |
| M1a: persistent cloud workspace | One GitHub App-authorized repository in one isolated persistent E2B workspace. | Install dependency, stop/pause only at quiescence, resume and verify same repository/files; provider failure and cleanup contract tests. |
| M1b: real agent execution       | Codex in isolated compute, durable event/transcript capture, API-key auth.     | Browser disconnect while task continues, second-client reconnect, cancel/deadline, provider crash → reconciliation.                      |
| M1c: tested pull request        | Trusted checks and reviewed diff produce a draft PR for the tested commit.     | Exact SHA evidence, independent review, finite repairs, timeout-safe PR deduplication, human merge boundary.                             |
| M1 release                      | Full cloud MVP acceptance contract passes.                                     | Security/credential review, cost ceilings, verified cleanup, backup/restore and self-host instructions.                                  |
| M2                              | Additional agents and dependency-aware tasks.                                  | Provider capability tests, isolated worktrees, explicit task dependencies and review policy.                                             |

Immediate next work is the pinned T3 adoption spike. In parallel at the planning
level, specify GitHub App scopes and the E2B lifecycle contract. No paid resources
are provisioned until the founder explicitly authorizes the concrete provider,
region, resource shape and budget. Real integration credentials are not required
for M0 and must never be pasted into documentation or issue text.

Defer a full editor, enterprise tenancy features, billing, mobile applications
and autonomous merging. Authentication, isolation and budget enforcement are
requirements before exposing cloud execution, not optional later polish.
