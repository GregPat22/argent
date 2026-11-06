# M1a: repository access and persistent isolated workspace

Status: proposed contract, not implemented or provider-certified. Prepared on
`GregPat22/next-step-v2` from main `fd60a5a` on 6 November 2026. P1 is integrated
in that main revision; execution remains simulated.

This narrows [M1 criteria 1–3, 6, 11–13](0002-cloud-mvp.md) before provider code.
It does not select a foundation, provision resources or authorize GitHub writes.

## Scope and entry gates

Demonstrate one authorized repository in one isolated persistent workspace:
clone a pinned commit, install a pinned fixture dependency, write a sentinel,
quiesce, pause, resume and independently verify retained files. Run fixture
commands only in isolated compute. Keep the desktop client, control plane and
workspace compute separate. Real coding-agent turns and tested draft PRs belong
to M1b/M1c.

Before provider implementation, record the founder's foundation decision: authorize
the pinned T3 runtime conformance spike, or explicitly retain Argent for this
bounded milestone. The [source spike](../research/t3-adoption-spike.md) is input
to that decision, not runtime evidence or approval for replacement.

Before a live provider test, record concrete authorization for the provider,
account/project, region, resource shape, maximum concurrent workspaces (one),
runtime limit, storage retention, total spend ceiling and cleanup deadline.
Select and pin an SDK/image only after checking current capabilities and terms.
An unset limit rejects creation; it must never mean unlimited. E2B remains a
candidate. No account, credentials, region or budget is approved by this spec.

A loopback-only single-host development harness may retain SQLite on local
storage. Multiple control-plane hosts or managed tenancy require PostgreSQL;
remote user access additionally requires authentication and per-resource
authorization. Do not expose P1's operator API to reach a cloud workspace.

## GitHub access boundary

The proposed M1a App registration requests repository Metadata read and Contents
read, installed for the selected repository only. Pull requests, Contents write,
Actions, Workflows, administration, organization and user permissions are outside
M1a. Any later push/PR permission expansion needs its own reviewed M1c contract
and authorization; App permissions alone never authorize an action.

The credential broker stays outside the workspace and desktop renderer:

1. Validate the authenticated operator's repository access and installation
   ownership server-side; a repository URL or submitted installation ID is not
   authorization. Resolve and store numeric repository and installation IDs.
2. Mint a token with an explicit single `repository_ids` entry and
   `permissions: { contents: "read" }`. Verify the returned grant and expiration;
   reject broader or inconsistent access. Never rely on omitted scope defaults.
3. A trusted bootstrap step uses an ephemeral credential channel for HTTPS Git.
   Never embed the token in argv, clone URLs, `.git/config`, credential helpers
   on retained disk, logs, events or transcripts. The App private key and provider
   control credential never enter compute. Revoke the bootstrap token and clear
   its channel before repository dependency scripts or agent code can run.
4. Resolve an allowed ref to a full base SHA and verify checkout identity in the
   sandbox. Disable submodules and Git LFS for the initial fixture; reject a
   checkout needing extra repository/host credentials rather than widening scope.
5. Recheck authorization before issuing a fresh token. Installation removal,
   suspension, repository removal, 401 or 403 blocks further Git access pending
   reauthorization. Revoke tracked tokens and retain an audit event. This does
   not claim to erase repository data already cloned; cleanup is separate.

GitHub documents token narrowing, expiration and HTTPS Git authentication in
[installation token generation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
and [installation authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation).
Revocation is described in the
[installation REST API](https://docs.github.com/en/rest/apps/installations#revoke-an-installation-access-token).
Checked 6 November 2026; these are provider documentation, not integration results.

## Durable records and ownership

Add provider lifecycle records separately from M0's simulated workspace state.
Do not reinterpret its metadata-only stop/start as cloud suspension. Persist:

- Workspace ID, authorized operator, repository/installation IDs, base SHA,
  workspace path and branch, provider/account/region, opaque provider ID, pinned
  image/SDK and capability version.
- Lifecycle state and revision; operation ID, kind, request fingerprint,
  idempotency key, approval reference, ownership fence, deadline and timestamps.
- Provider correlation marker, receipt/request ID, observed state, failure and
  reconciliation evidence. Store secret references and expiry, never raw tokens.
- Quiescence acknowledgment, filesystem manifest, dependency fixture identity,
  runner/session references, budgets and cleanup inventory/retention deadlines.

Commit intent, transition and ordered event in one database transaction before
an external action. Atomically claim one lifecycle operation per workspace;
serialize it with execution claims so pause/delete cannot race a new run.
Commit acknowledgment and its event together. A lifecycle operation is distinct
from a coding run and cannot be resolved using P1's simulation abandonment route.

Identical idempotent submissions return the original operation; changed inputs
with the same key conflict. Fences prevent stale database writes but cannot
prevent a previously issued provider request from finishing. After lease loss,
block mutations and reconcile that operation before any replacement dispatch.

## Lifecycle transitions

These are proposed cloud states, not additions to today's API.

| From                             | Request/observation                                                | Next state and condition                                                              |
| -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| No workspace                     | Authorized create intent                                           | `provisioning`; record correlation marker before dispatch.                            |
| `provisioning`                   | Provider identity recorded and checkout/bootstrap verified         | `ready`; bind the provider ID and evidence.                                           |
| `ready`                          | Pause intent wins the workspace lock                               | `quiescing`; reject new execution claims.                                             |
| `quiescing`                      | Runner acknowledges no active execution or pending external writes | `pausing`; persist acknowledgment before provider pause.                              |
| `quiescing`                      | Quiescence deadline expires with known unchanged compute           | `ready` with failed operation; no pause was sent.                                     |
| `pausing`                        | Provider confirms retained paused state                            | `paused`.                                                                             |
| `paused`                         | Authorized resume intent                                           | `resuming`; address the existing provider ID only.                                    |
| `resuming`                       | Provider ready and retained filesystem verified                    | `ready`; no new agent turn is dispatched.                                             |
| Any live state except `deleting` | Unknown outcome, lease loss or identity/content mismatch           | `needs_attention`; block normal execution and lifecycle requests.                     |
| Any nondeleted state             | Authorized cleanup intent, with outstanding effects reconciled     | `deleting`; drain execution and revoke credentials before destructive provider calls. |
| `deleting`                       | Compute absence and required cleanup evidence confirmed            | `deleted`; retain an audit tombstone and declared retained evidence.                  |

A definitive rejection known to have caused no provider change records a failed
operation and returns to the last verified state. Partial bootstrap failure
retains the provider ID and cleanup obligation; it never returns to an imaginary
empty state. Failed/uncertain deletion remains `deleting` with actionable errors
and blocked execution. Requests during another operation conflict or return its
matching receipt; clients cannot force a state transition.

Read-only reconciliation may settle an existing operation when provider evidence
is conclusive. Otherwise retain `deleting` for cleanup or record `needs_attention`
for other operations and require an audited operator decision, retaining the old
attempt. Never automatically repeat create, pause,
resume, bootstrap commands or delete after a timeout. Failure to find a create
marker in an eventually consistent list is insufficient proof that nothing was
created. Unsupported reliable lookup is a blocking adapter limitation.

Provider observations must use a documented read-only API. A convenience
"connect" call that resumes compute is a mutation and cannot be used by client
reconnect or reconciliation reads. Client reconnect reads durable state/events
only; explicit resume is separately authorized.

## Persistence, isolation and cleanup

The adapter must declare and test filesystem retention, memory/process retention,
pause/resume semantics, read-only inspection, correlation lookup, expiry behavior
and deletion coverage. Unsupported features fail explicitly. A provider session
ID is neither filesystem proof nor a runner checkpoint.

For the candidate, [E2B persistence documentation](https://docs.e2b.dev/sandbox/persistence)
describes both memory-preserving and filesystem-only pause modes and a connect
operation that can resume compute. The pinned adapter must prove its chosen mode
and timeout behavior; this documentation does not certify Argent integration.
Provider auto-pause cannot substitute for the runner's quiescence acknowledgment.
Unexpected automatic pause/termination blocks the run for reconciliation.

Build a manifest before pause containing the full checkout SHA, sentinel digest,
lockfile digest, installed dependency version and a direct dependency probe.
After resume, inspect the same provider identity and files and repeat the probe
without checkout or reinstall. For filesystem-only retention, a new runner
identity is expected and must be explicit; never silently restart an agent turn.

All repository scripts, including package installs, execute inside isolated
compute with no host mounts/sockets or inherited host credentials. Restrict
egress to reviewed bootstrap/dependency endpoints, enforce resource/time limits
and export redacted evidence outside the sandbox. The trusted fixture must not
require unknown install hooks or unrestricted network access.

Cleanup inventories compute, persistent disks, snapshots, bootstrap tokens and
control-plane artifacts/logs/backups separately. Record each item as deleted,
retained until a stated deadline under a stated policy, or unresolved with an
owner and next action. Confirm provider absence through read-only inspection;
a successful delete request alone is insufficient. A `deleted` tombstone means
required resource deletion is confirmed, not that explicitly retained audit data
has disappeared. If provider retention cannot be established, report that limit
and fail the corresponding release gate. Pause is never described as cleanup.

## Acceptance evidence required before M1a completion

| ID  | Required test and observable result                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Authorized selected private fixture repository clones at the exact SHA. A second repository, forged installation and revoked grant are denied; no write permission is issued.                                                          |
| A2  | Sentinel, installed dependency and manifest survive pause/resume on the same workspace without reinstall. File-only versus process retention is labeled and verified.                                                                  |
| A3  | Closing all clients and restarting the API does not terminate a provider operation. Reconnect restores state/cursor without create, connect/resume or bootstrap calls.                                                                 |
| A4  | Race two workers and race pause/delete against execution: only one operation claims the workspace; stale settlements fail; no run starts after quiescing begins.                                                                       |
| A5  | Inject worker death before dispatch, after dispatch before acknowledgment and after acknowledgment before commit for create/pause/resume/delete. Discover the same provider object or block; never dispatch an uncertain effect again. |
| A6  | Lost quiescence acknowledgment, provider refusal, paused expiry, unexpected termination and missing/changed files produce explicit failures with retained identity and cleanup intent.                                                 |
| A7  | Expired/removed GitHub access cannot mint fresh credentials. Canary-secret inspection finds no tokens in argv, remotes, retained files, events or evidence, including failure paths.                                                   |
| A8  | Budget, concurrency and deadline limits reject excess work; provider enforcement stops compute within the approved bound. Report retained-storage obligations and actual versus estimated usage.                                       |
| A9  | Cleanup succeeds for running, paused and partially provisioned workspaces. Timeout/restart retains inventory; duplicates do not delete unrelated resources; retained artifacts and deadlines remain visible.                           |
| A10 | A cross-workspace access attempt and attempts to reach host credentials/mounts fail. Store/events survive compute deletion and a backup/restore drill.                                                                                 |

Deterministic fake-provider tests must cover transitions, races, credential
boundaries and crash windows without billing. Label them simulation. Separately
run opt-in real GitHub/provider contract tests after the entry gates: retain
exact Argent revision, provider/SDK/image versions, command argv, timestamps,
redacted receipts, manifests and cleanup/usage results. Fakes and provider docs
cannot satisfy live isolation, persistence or budget evidence.

Implement in bounded slices after the foundation decision: lifecycle records
and fake-provider failure tests; read-only credential broker/bootstrap; then the
approved live persistence and cleanup harness. Expand the adapter interface only
alongside these tests. Keep M0/P1 checks passing and independently review the
actual diff. Do not claim M1a until every criterion has recorded passing evidence.
