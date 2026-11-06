# Continuity and market validation after Conductor's shutdown

Status: incorporated into the roadmap at the founder's request, 6 November 2026;
unimplemented. Branch: `GregPat22/grok-conductor-shutdown-analysis`, based on
`fd60a5a878fdde3f129c0f276b74b647ea373760`.

## Latest sequencing revision

[Spec 0008](0008-conductor-familiar-desktop.md), on
`GregPat22/conductor-layout-create` at base `333d662`, records the founder's later
request for a familiar Conductor replacement. It promotes migration, subscription
breadth and mobile ahead of team/dependency scope. The first one-agent API-key
technical proof stays bounded; personal replacement launch additionally needs
multiple agents, supported subscriptions and a usable mobile companion. Native
iOS is now an explicit planned track. Historical “native mobile later” sequencing
below is superseded by that decision; all portability/security criteria remain.

## Problem and boundaries

The [research review](../research/conductor-shutdown-analysis.md) supports
investigating continuity, authentication and switching friction. It does not
establish a representative customer feature ranking. Argent's desktop-first,
headless-cloud, independently usable core remains the accepted direction.
The [existing M1 contract](0002-cloud-mvp.md) remains authoritative.

This contract adds planned validation and managed-release requirements. It does not
authorize cloud expenditure, customer outreach, account registration, credential
transfer or upstream adoption. Existing credential-extraction prohibitions remain.
API-key auth stays the first technical-pilot baseline; supported subscription
sign-in is the preferred eventual product direction, subject to verified eligibility.
The filename leaves 0005 available for the landing specification on another branch.

## Discovery and authentication gate, alongside the foundation decision

Before finalizing commercial onboarding or expanding the MVP:

1. Map the three overlapping audiences the founder wants to serve: displaced
   Conductor users, solo/small-team developers and engineering teams wanting
   shared workflows/evidence. The roadmap stages a one-user cloud proof, then
   agent breadth/team handoff before dependency orchestration. Define exact launch
   promises without describing the one-user pilot as a team replacement.
2. With authorized outreach, examine actual workflows; 5–8 users is the proposed
   discovery method, not a fixed release quota. Record user/vendor identity, source/date, current
   spend, blocked tasks, subscription needs, mobile/handoff needs and willingness
   to pilot/pay. Do not describe this sample as market prevalence.
3. Compare a real bounded task in at least two closest substitutes using permitted
   accounts/environments. Record pinned versions, setup friction, execution host,
   laptop-close behavior, diff/evidence UX, recovery and actual charges. Do not
   declare a missing feature from silence in marketing material.
4. Produce a provider/deployment authentication matrix: local, customer-operated
   remote and Argent-managed; official interface and policy URL/date; entitlement,
   renewal, revocation, quotas, attribution and remaining approvals. Recommend
   supported subscription sign-in as preferred eventual onboarding, API keys as
   an alternative and for the first controlled pilot. API-key auth stays the M1
   baseline unless explicitly revised after this gate. Never silently switch to
   billable API usage when subscription quota is exhausted.
5. Record evidence that supports or challenges delegation versus an interactive
   workspace. The founder chooses scope; unknown willingness to pay stays unknown.

The [bounded M1a technical decision](../DECISIONS.md#foundation-decision-for-bounded-m1a-6-november-2026)
retains Argent's current core and defers the T3 runtime spike until measured need.
Neither the shutdown nor this discovery gate approves foundation replacement.

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

## Priorities and remaining decision gates

Keep one real agent and one workspace for the first end-to-end proof. If existing
subscriptions are essential, resolve supported auth before product onboarding.
Build common evidence/recovery capabilities for all three overlapping audiences,
then subscription breadth, migration and mobile before team handoff and
dependency graphs. Detailed team/mobile acceptance specs precede implementation.
Team replacement requires those capabilities to pass, rather than merely shipping
the single-user M1 proof. Native mobile remains later.
No Electron replacement is justified by the current unverified sentiment signal.

The research task is complete when verified facts and limits, plan conflicts,
adopted priorities and outstanding founder choices are documented, the tracked
handoff/decision index is updated and repository checks/diff review are recorded.
That completion does not mean the planned features or customer validation passed.
