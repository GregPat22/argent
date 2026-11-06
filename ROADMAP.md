# Roadmap

Sequence by demonstrated behavior rather than dates. M0 is not the cloud MVP.

| Milestone                       | Outcome                                                                                        | Exit evidence                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0: durability conformance      | Local scripted workspace → independent worker → disconnect/reconnect.                          | Automated state, process death, race, cancellation and artifact tests; runnable demo.                                                              |
| Foundation adoption spike       | Evaluate pinned T3 Code against M0 invariants and cloud extensions.                            | Written comparison, license/dependency review, adoption effort and founder decision before a fork/import.                                          |
| P1: usable desktop prototype    | Install and launch Argent locally; control workspaces/tasks and reconnect to durable activity. | Working desktop build, tested app-to-service bridge, local packaging, lifecycle/reconnection checks and honest simulation labels.                  |
| Desktop distribution            | Website download entry point and release artifacts.                                            | Real versioned artifacts, checksums, platform signing/notarization plan and accurate installation instructions; publication separately authorized. |
| M1a: persistent cloud workspace | One GitHub App-authorized repository in one isolated persistent E2B workspace.                 | Install dependency, stop/pause only at quiescence, resume and verify same repository/files; provider failure and cleanup contract tests.           |
| M1b: real agent execution       | Codex in isolated compute, durable event/transcript capture, API-key auth.                     | Browser disconnect while task continues, second-client reconnect, cancel/deadline, provider crash → reconciliation.                                |
| M1c: tested pull request        | Trusted checks and reviewed diff produce a draft PR for the tested commit.                     | Exact SHA evidence, independent review, finite repairs, timeout-safe PR deduplication, human merge boundary.                                       |
| M1 release                      | Full cloud MVP acceptance contract passes.                                                     | Security/credential review, cost ceilings, verified cleanup, backup/restore and self-host instructions.                                            |
| M2                              | Additional agents and dependency-aware tasks.                                                  | Provider capability tests, isolated worktrees, explicit task dependencies and review policy.                                                       |

Completed: M0 durability conformance, the P1 downloadable local desktop prototype,
and a pinned T3 source evaluation. See `docs/milestones/0001-completion.md` and
`docs/research/t3-adoption-spike.md`. The website and macOS archive are available
locally; a public signed release has not been published.

Retain the current core for bounded M1a; the technical decision is recorded in
[the decision register](docs/DECISIONS.md#foundation-decision-for-bounded-m1a-6-november-2026).
The internal lifecycle simulation is implemented. Next is read-only GitHub
bootstrap, then approved real-provider validation under the
[M1a access/lifecycle contract](docs/specs/0006-cloud-workspace-lifecycle.md). The
source evaluation does not replace runtime conformance tests. No paid resources
are provisioned until the founder explicitly authorizes the concrete provider,
region, resource shape and budget. Real integration credentials are not required
for M0 and must never be pasted into documentation or issue text.

Defer a full editor, enterprise tenancy features, billing, mobile applications
and autonomous merging. Authentication, isolation and budget enforcement are
requirements before exposing cloud execution, not optional later polish.
