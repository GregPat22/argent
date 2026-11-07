# M1a: repository access and persistent isolated workspace

Status: proposed live-provider contract; internal lifecycle and repository-bootstrap
simulations implemented, not provider-certified. Originally prepared on
`GregPat22/next-step-v2` from main `fd60a5a` on 6 November 2026. P1 is integrated
in that main revision; execution remains simulated.

This narrows [M1 criteria 1–3, 6, 11–13](0002-cloud-mvp.md) before provider code.
It retains the current foundation without provisioning resources or authorizing
GitHub writes.

## Scope and entry gates

Demonstrate one authorized repository in one isolated persistent workspace:
clone a pinned commit, install a pinned fixture dependency, write a sentinel,
quiesce, pause, resume and independently verify retained files. Run fixture
commands only in isolated compute. Keep the desktop client, control plane and
workspace compute separate. Real coding-agent turns and tested draft PRs belong
to M1b/M1c.

Technical decision, 6 November 2026: retain Argent's current core for bounded
M1a implementation. The founder delegated technical decisions to the engineering
agent. The [source spike](../research/t3-adoption-spike.md) found no demonstrated
runtime advantage that justifies replacement now. Reconsider T3 if measured
adapter complexity warrants a separate spike; do not fork or replace the core
without the separately required founder approval.

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

Continue in bounded slices on the retained core: lifecycle records and
fake-provider failure tests (implemented below); read-only credential
broker/bootstrap (simulation implemented below; live adapters next); then the
approved live persistence and cleanup harness. Expand the adapter interface only
alongside these tests. Keep M0/P1 checks passing and independently review the
actual diff. Do not claim M1a until every criterion has recorded passing evidence.

## First implementation slice: simulated lifecycle operations

Acceptance criteria for the bounded first slice (not M1a completion):

- Add internal lifecycle records and ordered events to the same local SQLite
  database as M0. Persist requests, ownership, dispatch intent, quiescence and
  settlement transactionally. Keep the installed desktop API unchanged.
- Support simulated create, pause, resume and delete using a separately injected
  simulation-only provider. No SDK, GitHub broker, target repository commands or
  billable calls are included. Cloud repository/bootstrap metadata is deferred.
- Deduplicate identical request keys; reject changed inputs, invalid transitions
  and concurrent operations. A workspace enrolled in the lifecycle harness cannot
  run the M0 local adapter or use metadata-only stop/start. Enrollment and M0 run
  submission/claims share the database lock.
- An expired claim/deadline or any uncertain adapter failure blocks the workspace
  and operation without automatic dispatch retry. Deletion retains `deleting`
  until absence is confirmed. Reject stale owner writes after lock contention.
- Reconciliation uses read-only provider inspection only. Settle only matching
  identities/target states with recorded dispatch intent, plus a retained
  quiescence acknowledgment for pause. An absent create marker is inconclusive.
  Wrong identities and missing/mismatched observations leave uncertainty intact.
- Demonstrate persistence/reconnect reads, independent-connection/process claim
  races, worker death and acknowledgment loss around provider effects, bounded
  hung calls, quiescence refusal, stale settlements and event rollback. Label all
  provider fixtures and their evidence simulation.

This slice deliberately leaves real authorization, trusted checkout/bootstrap,
retention manifests, cleanup inventory, live isolation/budget evidence and an
operator resolution workflow unimplemented. These remain required before M1a;
none may be inferred from the lifecycle fixture tests.

Evidence on `GregPat22/next-step-v2`, continuing from `74068ae`: 27 focused
simulation tests pass, including actual child-process death/claim races and
transaction rollback, with 68 tests passing in the full `npm run check`. The
implementation is internal `Store.lifecycle` plus its bounded simulation worker;
no API or desktop integration is enabled. Native/package smoke and real-provider
checks were not run. See the [handoff](../../HANDOFF.md#retained-core-decision-and-lifecycle-slice-6-november-2026)
for exact limits and next work.

## Second implementation slice: simulated repository access/bootstrap

Acceptance criteria for `GregPat22/next-step-v3`, based on main `1424b92`:

- Add an internal, simulation-only repository bootstrap queue with transactional
  state/events, idempotency, atomic claims, fenced leases and absolute deadlines.
  Bind it to an existing ready lifecycle workspace/provider identity. Serialize
  bootstrap enrollment with lifecycle operations; neither can overlap the other.
- A trusted server-side authorization adapter must bind the authenticated
  operator, repository URL, allowed ref and numeric repository/installation IDs
  before minting. Requests cannot supply an installation ID or permission map.
  Recheck authorization for every new attempt; deny forged/mismatched/revoked grants.
- Request exactly one repository ID and Contents read. Validate returned repository
  selection, identities, read-only permissions and bounded expiration. Reject
  extra repositories/permissions and invalid grants before sandbox access.
- Resolve the allowed ref to a full SHA. A trusted simulated bootstrap adapter
  receives the credential separately from a fixed, credential-free checkout plan.
  Keep that plan immutable across adapter calls. Disable hooks, submodules and
  LFS. Inspect checkout identity independently of
  the checkout call's return before accepting evidence.
- Persist mint/channel intent before dispatch. Revoke known tokens and clear the
  ephemeral credential channel on success and failure using bounded cleanup calls.
  Success requires both acknowledgments and matching checkout evidence; dependency
  scripts and agent turns are outside this slice. Persist no token/error text.
- Unknown mint, checkout or cleanup outcomes and expired ownership become
  `needs_attention`. Retain identity and credential/channel cleanup obligations.
  Reads, duplicate submissions and restart never replay bootstrap or minting.
  Block further lifecycle mutations until unresolved bootstrap is reconciled.
- Cover scope/authorization denial, cleanup failures, secret canaries, deadline
  and stale-worker behavior, independent database claim races, event rollback and
  durable read-only reconnect using deterministic simulation fixtures.

This slice supplies no real GitHub App, HTTP adapter, operator sign-in, secret
vault, isolated Git runner or live clone. Adapter declarations and synthetic
checkout observations do not prove isolation or credential erasure. Crash recovery
retains unresolved obligations; automated revocation after process death and an
audited operator-resolution path remain required before a live adapter is enabled.
The desktop/API and existing simulation-only lifecycle contract stay unchanged.

Evidence on `GregPat22/next-step-v3`, based on `1424b92`: **50 focused simulation
tests** pass; the full `npm run check` passes **118 tests**, strict types,
formatting and compilation. This includes actual independent-process claim and
pause/enrollment races, process death after mint intent, stale ownership after
SQLite lock contention and late acknowledgment rejection. Canary checks inspect
the operation/events, SQLite/WAL and credential-free plan. No real credential,
argv, remote filesystem or credential-channel erasure was tested. No GitHub or
provider mutation, native/package smoke or website check was performed. Actual
diff review was performed by the implementing agent; external independent review
and all live A1–A10 evidence remain open. See the
[current handoff](../../HANDOFF.md#repository-accessbootstrap-slice--6-november-2026).

PR preparation on the same branch, 6 November 2026: five additional tests cover
malformed mint responses and heartbeat failure during an outstanding adapter
call. The focused suite now contains **55 simulation tests** and fresh
`npm run check` passes **123 tests, 0 failures, 0 skips**, strict types,
formatting and compilation. Independent read-only agent reviews of the actual
diff and bounded acceptance coverage found no blocking issue. These supersede
the initial review gap above; human review and all live A1–A10 evidence remain
open. Package version `0.0.1` is unchanged. See the
[PR preparation handoff](../../HANDOFF.md#repository-bootstrap-pr-preparation--6-november-2026).

Hardening on `GregPat22/code-review`, based on `757f8eb`, supersedes parts of the
criteria above:

- A failure before mint intent (denial, authorization timeout or lease expiry
  while authorizing) has no external effect. It ends as `failed`, does not
  block lifecycle requests and permits a new request with a new Idempotency-Key.
  Failures from mint intent onward still become `needs_attention`. At most one
  non-failed bootstrap exists per workspace, including after success.
- Token identity matches GitHub's canonical name case-insensitively and ignores
  a `.git` suffix. A token must expire after the operation deadline.
- Allowed branch refs may contain dots where Git permits them.

Evidence: `npm run check` passes **129 tests, 0 failures, 0 skips**. The
operator-resolution workflow and all live A1–A10 evidence remain open. See the
[hardening handoff](../../HANDOFF.md#repository-bootstrap-hardening--6-november-2026).

Review fixes on `GregPat22/code-review-v2`, based on `333d662`, supersede parts
of the hardening criteria:

- Token identity is the numeric repository ID alone; a renamed or transferred
  repository with the pinned ID is accepted. The `owner/name` match is removed.
- A token must expire after the operation deadline plus one cleanup timeout.
- The repository schema carries a recorded version. Upgrading a version 1 table
  preserves every operation and event, including uncertain obligations; a newer
  version refuses to start; a failed start releases the database.
- The persisted phase and credential state alone decide between `failed` and
  `needs_attention`, for workers and lease reconciliation alike.

Evidence: `npm run check` passes **131 tests, 0 failures, 0 skips**. See the
[review-fix handoff](../../HANDOFF.md#repository-bootstrap-review-fixes--6-november-2026).

## Third implementation slice: audited simulated bootstrap resolution

Acceptance criteria for `GregPat22/next-step-v4`, based on main `86255f8`:

- Add an internal operator resolution path for `needs_attention` repository
  operations only. The actor comes from a trusted authenticated caller and must
  match the operation's operator. No desktop/API endpoint or live adapter is added.
- Resolution performs only bounded, read-only inspection through a separately
  injected simulation-only recovery inspector. It never mints, clones, revokes,
  clears a channel or repeats the old dispatch. Cleanup itself must already have
  happened outside this path; a request or an agent statement is not evidence.
- Require a fresh observation bound to the exact operation, workspace, provider,
  repository and installation. It must confirm all outstanding effects have
  settled (including late mint/checkout requests), every operation credential is
  revoked/absent, its channel is cleared/absent and its partial checkout is absent.
  Expiry, a lost lease or an isolated cleanup acknowledgment alone is insufficient.
- Persist an attributed, idempotent resolution receipt and its event in the same
  transaction as changing the original operation to `failed`. Preserve its phase,
  identity and original credential/channel states as historical evidence. Never
  promote the old attempt to success. A fresh bootstrap requires a new request key
  and fresh authorization; lifecycle serialization continues to apply.
- Inspection failure, timeout, stale/mismatched/incomplete evidence records only
  a fixed rejection reason and leaves the operation blocked. A new resolution key
  may inspect again; completed duplicate keys read the original receipt without adapter work.
  Store no raw observation, adapter exception or secret-bearing text.
- Cover restart/idempotency, unauthorized actors, malformed/stale observations,
  late responses, concurrent resolution/lifecycle requests, transactional rollback,
  schema upgrades and canary-secret exclusion with deterministic simulation tests.

This does not implement durable secret custody, crash-time token revocation,
provider cleanup or a real authorization/recovery service. In particular, a live
inspector must independently establish that old requests cannot complete after
resolution; a provider list response or caller assertion cannot prove that.
All live A1–A10 gates remain open.

The schema advances to version 3 by adding resolution receipts linked to their
event cursors; versions 1/2 retain their operations and events. Concurrent calls
may perform the same read-only inspection, but one key commits only one receipt.
An inspection interrupted by process death has no receipt and may safely be
repeated: the inspection itself cannot dispatch an external effect.

Evidence on `GregPat22/next-step-v4`, based on `86255f8`: fresh
`npm run check` passes strict types, formatting, compilation and **156 tests,
0 failures, 0 skips**, including **25 new recovery simulation tests**. The actual
diff was reviewed by the implementing agent. PR preparation added independent
read-only code/security and bounded acceptance/coverage reviews, with no blocking
findings; no measured coverage percentage is claimed. Live-provider evidence and
human review remain open. See the
[resolution handoff](../../HANDOFF.md#audited-simulated-bootstrap-resolution--6-november-2026)
for exact coverage, limitations and next steps.

## Fourth implementation slice: encrypted simulated credential custody

Acceptance criteria for `GregPat22/next-step-v5`, based on main `7b2eeca`:

- Reserve an opaque credential reference with mint intent and its event in the
  same transaction. Keep all credential custody internal to the simulation;
  no API, desktop, live adapter or automatic cleanup dispatcher is enabled.
- Require an explicitly injected dedicated 256-bit key and safe key identifier;
  never discover host credentials, persist the key or generate a production key.
  Encrypt received supported-format token bytes with AES-256-GCM and a fresh nonce, authenticating
  the reference and operation/operator/workspace/provider/repository/installation
  identities. Commit ciphertext and its event before token acceptance or use,
  including received tokens whose scope is subsequently rejected.
- Fence capture by the current lease, deadline, phase and pending reference.
  Reject overwrites. Recover only through a trusted internal caller matching the
  operation's operator and correct key; malformed or unauthentic ciphertext
  fails closed without recording plaintext or cryptographic exception text.
- On acknowledged revocation, erase the active ciphertext in the same transaction
  as the credential transition/event. Successful independent audited resolution
  also erases custody without rewriting historical credential/channel states.
  Event failure rolls both actions back. Retain the opaque reference as history.
- Demonstrate process death/restart recovery, wrong actor/key, tampering and
  cross-operation substitution, capture/erase rollback, stale ownership,
  concurrent capture, old-schema preservation and secret canaries in SQLite/WAL.
  Reads/restart never mint, revoke, clone, clear channels or unblock uncertainty.

This slice stores synthetic credentials only. Key custody/rotation/backup and
remote authentication remain unimplemented. A lost key makes ciphertext
unrecoverable. Erasure removes the active row payload; it does not prove physical
removal from WAL, snapshots or backups. A crash before the mint response is
captured can still leave an unknown token; late mint responses and external
request fencing are not solved here. Recovery cleanup/inspection and all live
A1–A10 gates remain required before enabling real credentials or adapters.

Evidence on `GregPat22/next-step-v5`, based on `7b2eeca`: fresh `npm run check`
passes strict types, formatting, compilation and **176 tests, 0 failures,
0 skips**, including **20 new custody simulation tests**. Actual child-process
kill/restart and competing capture processes exercise durability/serialization;
SQLite/WAL canaries check both token and key bytes. The implementing agent
reviewed the actual source/test/docs diff; no external cryptographic/security
review or measured coverage percentage is claimed. Production key custody,
audited recovery cleanup and every live A1–A10 gate remain open. See the
[custody handoff](../../HANDOFF.md#encrypted-simulated-credential-custody--6-november-2026).

## Fifth slice acceptance: audited simulated recovery cleanup

On `GregPat22/next-step-v6`, based on main `1cb55c3`:

- Add an internal, explicitly requested simulation cleanup coordinator for an
  uncertain bootstrap, authorized only for its original trusted operator. Keep
  API, desktop and service-loop integration unchanged.
- Atomically reserve one cleanup attempt per operation, with an idempotency key,
  absolute deadline, attributed receipt and ordered events. Duplicate requests
  only read; another key cannot replay an attempt, including after process death.
- Before any mutation, require fresh, exact-identity independent inspection that
  original bootstrap effects have settled. Unknown/stale evidence fails closed.
  Recover an active synthetic token only from the matching encrypted vault.
- Record intent before each bounded revoke, channel clear or partial-checkout
  discard. Never mint, clone, resume or repeat uncertain actions. Stop on failure;
  preserve uncertainty, fixed failure reasons and all original bootstrap history.
  Revocation acknowledgment erases active ciphertext atomically with its event.
- Cleanup acknowledgments never unlock the workspace. Separate audited resolution
  must additionally confirm the exact cleanup attempt's effects have settled;
  bind its current cleanup event cursor and reject resolution racing an active
  coordinator or an older inspection. Late cleanup responses cannot write after
  deadline or resolution.
- Test authorization, inspection/credential failures, duplicates, concurrent
  connections/processes, crash/restart, deadlines/late responses, rollback,
  schema upgrades and secret exclusion. Run `npm run check` and review the diff.

This is synthetic cleanup, not production credential custody or proof of provider
request fencing. One uncertain cleanup attempt deliberately requires independent
inspection/manual recovery; there is no automatic retry. Live A1–A10 remain open.

Fifth-slice implementation on `GregPat22/next-step-v6`, base `1cb55c3`: repository
schema 5 adds one cleanup receipt per operation without modifying old bootstrap
history. The receipt records inspection time, phase, deadline and latest event
cursor. A killed coordinator may retain historical `running` status past its
deadline, but cannot be reclaimed. Fresh independent resolution can settle only
with exact cleanup ID/current cursor and settled-effects evidence. Thirty-nine
focused simulation tests pass, including actual process death and competing
process reservations. Fresh `npm run check` passes strict types, formatting,
compilation and **220 tests, 0 failures, 0 skips**. See [HANDOFF.md](../../HANDOFF.md).
No live credential/provider, production key lifecycle, external security review,
measured coverage percentage, desktop/package or website verification is claimed.

## Sixth slice acceptance: read-only GitHub preflight

On `GregPat22/next-step-v6`, base main `1cb55c3`, continuing audited simulated
cleanup. This is an unwired read-only HTTP component, not authorization to mint
credentials or execute a repository:

- A trusted caller supplies an authenticated operator, its previously linked
  numeric GitHub user ID, expected App/installation/repository IDs, selected
  repository URL/ref and explicit in-memory user token/App JWT. Reject actor,
  ID, URL/ref, credential-format and deadline errors before HTTP. Discover no
  host credentials, environment tokens or signing keys.
- Use only four fixed-origin GitHub GET routes: authenticated user, repository
  metadata, repository installation for the App and the exact branch reference.
  Check linked-user identity, pinned numeric repository identity/read access,
  expected App/installation, selected-repository/read-only installation policy,
  suspension, exact ref and full commit SHA. A URL or installation ID alone is
  never an authorization decision. Return only selected validated metadata.
- Pin the REST API version; prohibit redirects, retries, arbitrary origins and
  response-provided URLs. Bound total runtime and streamed response size. Reject
  denied/rate-limited/malformed/oversized/late responses using fixed errors,
  without including credentials, response bodies or transport exceptions.
- Return an explicit preflight observation with source and simulation labels;
  injected-transport tests cannot be called live-provider evidence. No token
  issuance/revocation, Git commands, private key discovery, durable live grant,
  API/desktop/service-loop integration or existing simulation-worker change.
- Test all identity/policy failures, fixed GET-only origin/credential separation,
  redirects, cancellation/timeouts, response-stream limits, input snapshots and
  credential/error exclusion. Review the actual diff and run `npm run check`.

Production authentication must establish and protect the linked-user/binding
record and issue the correct App user token. This component cannot attest token
issuer or replace that service. A successful preflight is a point-in-time read,
not durable authorization or assurance against later revocation/ref movement.
Revalidate before real token issuance, then independently verify isolated checkout.
Live checks still require an approved fixture/App/account and secure credentials;
cloud creation additionally requires the concrete limits in the entry gates.

## Seventh slice acceptance: current installation-token compatibility

On `GregPat22/next-step-v6`, 7 November 2026, official GitHub guidance confirms
`ghs_`-prefixed JWT-format installation tokens containing dots, hyphens and
underscores, approximately 520 characters. The earlier 512-byte alphanumeric-only
simulation parser/ciphertext bound cannot retain these. Before live adapters:

- Preserve existing synthetic/legacy token support while treating installation
  tokens as opaque header-safe strings; accept the documented `ghs_` alphabet
  up to an explicit 4,096-byte resource bound. Do not decode/trust JWT claims as
  authorization, expiry or scope evidence. Unsupported/control-bearing values
  fail closed; no unbounded credential storage is introduced.
- Match the encrypted-envelope capture bound to that credential bound. Demonstrate
  long-format capture/restart/decrypt, bootstrap use, revocation and erasure using
  synthetic credentials. Reject returned overbroad scopes before checkout while
  retaining/revoking a supported-format token. Existing scope/expiry checks stay.
- Add regressions that fail before the fix; run all checks and review the diff.
  No real token is minted, revoked, stored or used by these tests.

Sources checked 7 November 2026:
[GitHub installation-token guide](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
and [format guidance](https://github.blog/changelog/2026-05-15-github-app-installation-tokens-per-request-override-header/).
These document compatibility requirements, not live integration evidence.

Sixth/seventh-slice evidence on `GregPat22/next-step-v6`, base `1cb55c3`:
**53 synthetic HTTP tests** and **four synthetic stateless-token tests** pass;
three token regressions were observed failing before the compatibility fix.
Fresh `npm run check` passes **277 tests, 0 failures, 0 skips**, strict types,
formatting and compilation. Actual diff review was performed by the implementing
agent. No live credential/provider request, native/package smoke or website check
was run. The transport is deliberately unwired and preflight observations grant
no execution authority. [Spec 0010](0010-live-repository-pilot-gates.md) records
the concrete protected-credential, approved-fixture and isolation gates at which
this continuation stops. No real authorization, production key service or M1a
completion is claimed.

Primary preflight references, checked 7 November 2026:
[authenticated user](https://docs.github.com/en/rest/users/users#get-the-authenticated-user),
[repository metadata](https://docs.github.com/en/rest/repos/repos#get-a-repository),
[App repository installation](https://docs.github.com/en/rest/apps/apps#get-a-repository-installation-for-the-authenticated-app),
[reference](https://docs.github.com/en/rest/git/refs#get-a-reference) and
[API version](https://docs.github.com/en/rest/about-the-rest-api/api-versions).
