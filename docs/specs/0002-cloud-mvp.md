# M1: persistent cloud workspace to a tested pull request

Status: real-cloud MVP proposed and unimplemented. Retain the current core for
bounded M1a work; an internal simulation-only lifecycle harness is implemented.
Billable provisioning still requires explicit authorization.

M1a is narrowed in [repository access and workspace lifecycle](0007-cloud-workspace-lifecycle.md), including proposed GitHub permissions, explicit transitions and crash/cleanup evidence. That contract is not an implemented cloud adapter.

Roadmap follow-up, 6 November 2026: this contract incorporates the
[portable continuity requirements](0006-portable-continuity.md).
The first technical proof remains one repository, workspace and agent. Managed
release also requires visible control, portable recovery and a documented
provider/deployment authentication decision. Supported subscriptions are the
preferred product direction; API-key auth below remains the technical-pilot path.

The later [P2 desktop shell contract](0008-desktop-workspace-shell.md) separates
this bounded engineering proof from the broader personal release. Familiar UX,
multiple agents/subscriptions, migration and a mobile companion now precede
team/dependency scope; they do not change the isolation/durability criteria here.

## User journey

An authenticated developer authorizes one GitHub repository, creates one persistent
cloud workspace, asks one real coding agent to implement a bounded task, closes
their client, then reconnects from another client to inspect changes, trusted test
evidence and a draft pull request. Idle compute can suspend without losing files
or installed dependencies. Merging always requires a separate human decision.

## Acceptance criteria

1. GitHub App installation grants access to only the selected repository. Tokens
   are short-lived, brokered and never persisted in logs or agent transcripts.
2. Persist workspace identity/provider ID outside the sandbox. Clone a pinned
   base commit, install a dependency, suspend quiescent compute, resume and verify
   the same repository, dependency and file contents without reinstalling.
3. The worker and orchestration database run independently of the developer's
   computer and workspace lifecycle. Closing all clients does not terminate work.
4. Codex runs via an official interface in isolated compute with an explicit
   API-key authentication path. No extracted desktop/consumer credentials.
5. Events, provider session references and transcript/artifact storage survive
   API restarts. A second authorized client restores status and cursor history.
6. Lease loss does not resend an agent turn, push, PR request or lifecycle action.
   Reconcile provider identity and external effects. Unknown outcomes enter an
   auditable `needs_attention` resolution flow. Test crashes before and after
   each external action's acknowledgment.
7. Serialize writers to the workspace; use a task worktree/branch pinned to the
   base. Inspect diff and exact head commit independently of agent messages.
8. Run trusted deterministic checks in isolation and record argv, exit code,
   tested SHA and retained stdout/stderr. Changes to tests/policy are visible.
   Failed checks prevent the PR-ready state; agent assertions cannot override it.
9. A separate review pass examines the actual diff and evidence. At most one
   repair attempt in the MVP; preserve failure/review history across attempts.
10. Explicit PR authorization permits a scoped broker to create one draft PR for
    the exact tested commit. Deduplicate by repository, branch and run marker;
    timeouts require lookup/reconciliation. A link alone is not evidence of tests.
11. Enforce bounded wall time, agent turns, resources, logs and provider budget.
    Record actual usage and distinguish estimates from invoiced costs. Test limit
    failures and cancellation acknowledgment. Idle suspension needs a quiescence
    acknowledgment and must not interrupt active execution silently.
12. Separate stop/pause from delete. An explicit cleanup operation revokes tokens,
    stops compute and reports retained/deleted disks, snapshots and artifacts.
    Failure leaves actionable cleanup intent, not an untracked orphan.
13. Verify isolation and tenant authorization on every API/artifact path. No host
    credentials, privileged host sockets or shared writable tenant mounts.
14. Demonstrate self-hosted control plane and local adapter without our servers;
    validate the real open-source isolated runtime on Linux/KVM before claiming
    self-hosted untrusted execution parity.
15. The desktop identifies execution location, latest durable progress, connection
    freshness, awaiting input/approval and verification state. Disconnection does
    not resubmit work. Define blocked-input transitions/timeouts and retain
    cancellation acknowledgment and uncertain-outcome handling.
16. Export and restore readable task context, supported changes and evidence to
    an independent self-hosted installation with Argent-hosted endpoints unavailable.
    Validate manifest integrity/completeness, secret exclusions and untrusted
    import handling. Active/uncertain records never replay external effects.
    Apply the detailed [continuity contract](0006-portable-continuity.md).
17. Before commercial onboarding, record supported authentication per provider and
    local/customer-operated remote/managed deployment, including renewal, quotas,
    revocation and unresolved permissions. Managed subscription availability needs
    actual eligibility and integration evidence. Never silently switch to paid
    API usage when subscription allowance is exhausted.

## Release evidence

Automated real-provider contract tests, a recorded disconnect/reconnect journey,
an actual GitHub draft PR, exact-commit test artifacts, credential and cleanup
audit, measured resource consumption, visible control/recovery evidence and both
a documented backup/restore drill and independent portable-context restore.
No simulation can satisfy the real-provider or PR criteria above.
