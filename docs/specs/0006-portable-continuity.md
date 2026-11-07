# Portable continuity, visible control and provider authentication

Recorded 6 November 2026 and added to the managed-release requirements of the
[M1 contract](0002-cloud-mvp.md), which remains authoritative. The offline
history slice in [spec 0012](0012-portable-history.md) implements the first part:
bounded export and read-only restore of actual simulator history into separate
historical storage. Full continuity, real-agent recovery, desktop migration UI, a
Conductor importer and the fresh-machine drill below remain open.

## Why

Developers should own their workflow. If a hosted service, including ours,
disappears, a developer must be able to take their history, evidence and work to
another installation. Real execution also needs controls that make its location,
progress and blocked states visible. This contract does not authorize cloud
spending, account registration, credential transfer or upstream adoption, and the
existing prohibition on extracting credentials remains.

## Provider authentication gate

Before committing to product onboarding, produce a dated provider/deployment
authentication matrix covering local, customer-operated remote and Argent-managed
deployments. For each cell record the official interface and its policy URL and
date, the allowed entitlement, renewal, revocation, quotas, attribution and any
remaining approvals.

Supported subscription sign-in is the preferred eventual onboarding where a
provider permits it; API keys are the alternative and the baseline for the first
controlled technical pilot. API-key auth stays the M1 baseline unless this gate
explicitly revises it. Never silently switch to billable API usage when a
subscription quota is exhausted.

## M1 managed-release additions

1. The primary desktop UI identifies execution host/location, latest durable
   progress, connection freshness, awaiting input and verification status. A
   disconnected client does not infer task failure or resubmit a task.
2. A versioned export includes task/run identities, events/cursors, transcript
   and evidence manifests, repository/base/head IDs and supported working changes.
   Hashes and a missing-data inventory permit integrity/completeness checks.
   Credentials are excluded. Personal/untracked files require explicit selection
   and a preview; unsupported data is identified rather than silently omitted.
3. A second independently installed self-hosted instance, with Argent-hosted
   endpoints unavailable, restores readable history, diff/context and evidence.
   Required tool/runtime versions and external dependencies are documented. A
   fresh machine, not only the original operator profile, is used for the drill.
4. Restore does not dispatch an old agent turn, provider operation, push or PR.
   Active/uncertain imported work reconciles by external identity or enters
   `needs_attention`; prior approvals do not authorize new external effects.
   Live-session resume is advertised only for separately proven provider/version
   combinations with retained state. Cross-provider continuation is new work.
5. Imported transcripts and agent statements stay labeled historical/untrusted.
   They cannot create trusted check evidence, rewrite approval policy or make a
   run PR-ready. Config/scripts are previewed as data and run only through the
   normal authorized isolated execution path.
6. The exit path documents what happens to disks, snapshots, logs, backups,
   credentials and retention. Export/restore and provider disaster recovery are
   distinguished: one does not imply the other works. A published wind-down
   policy must reflect actual operational capacity, with no invented notice SLA.

These are planned release gates, not a promise that a Conductor export can be
fully imported. No original Conductor database/export schema was inspected here.
Start an importer contract only after consented redacted samples and a precise
preserve/view/resume capability decision. Preserve original worktrees and never
archive, delete or run their scripts as a side effect of discovery.

## Focused implementation and automated evidence

Implement as separate slices: authentication feasibility; progress/control
semantics; export schema/read-only restore; then a separately scoped importer.
Retain existing state/event transactions, claim fencing and one-writer policy.
No generic plugin framework or infrastructure rewrite is implied.

Meaningful automated checks should cover corrupted/unsupported archives, missing
artifacts, secret exclusion, path traversal/symlink escape and archive size limits,
duplicate imports, tenant/actor boundaries, no effects during restore and preserved
uncertain states. Real-provider checks must cover revoked credentials, quotas,
lost acknowledgments and worker crashes. Record exact tested revisions and limits.
Run `npm run check` and review the actual diff for each implementation slice.

## Sequencing

Keep one real agent and one workspace for the first end-to-end proof. Then deliver
subscription breadth, migration and a mobile companion before team handoff and
dependency scheduling; see the [roadmap](../../ROADMAP.md). Detailed team and
mobile acceptance specs precede their implementation.
