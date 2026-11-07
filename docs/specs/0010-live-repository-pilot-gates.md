# Live repository pilot: enablement gates

Prepared 7 November 2026 on `GregPat22/next-step-v6`, base main `1cb55c3`.
Status: live execution remains **disabled**. Pilot registration/installation and
explicit read-only App-user device verification are complete; see the progress
entry below and [spec 0011](0011-github-device-pilot.md). The
founder requested continued implementation until a safety boundary; this records
the concrete remaining boundary after simulated cleanup, the read-only GitHub
preflight and token-format compatibility work. See [M1a](0007-cloud-workspace-lifecycle.md)
for the actual live A1–A10 release gates.

## Current boundary

`inspectGitHubRepository` has a real fixed-origin GET transport, tested with
synthetic injected responses and an explicitly authorized live device pilot. It returns a point-in-time preflight observation,
never a durable grant or a callable bootstrap adapter. It has no route in the
public API, desktop bridge or service loop. The explicit memory-only pilot has
now exercised this component with App user credentials against the private fixture.
Separate administrative GET checks of the installation are recorded below.
Execution and recovery remain simulated.

The preflight accepts explicit in-memory App JWT/user-token arguments and a
trusted binding record. It does not authenticate an Argent user, establish OAuth
consent, verify which App issued a user token or protect those credentials at rest.
Those responsibilities cannot be replaced by a caller-supplied repository URL,
GitHub user ID, installation ID or a successful read of a public repository.

GitHub's current installation-token format is opaque and longer than legacy
strings. The simulation parser/custody now accepts the documented alphabet up to
4,096 bytes without interpreting JWT claims. This is compatibility, not scope or
signature validation. Live scope/expiration must come from the authenticated
issuance response and must be checked independently before credential use.

## Required inputs before a live read-only probe

Record approved, non-secret metadata for one test: authenticated Argent operator,
linked numeric GitHub user, App/client ID, selected installation/repository IDs,
canonical GitHub repository URL, explicit branch ref and the exact Argent revision.
The fixture should be a private repository selected for this test, with no customer
or production data. The App requests only Metadata read/Contents read and selected
repository access. Installation changes, registration and OAuth consent are explicit
account actions, not inferred from general engineering permission.

An authentication service must establish the operator-to-GitHub binding through the
supported App flow with protected state/redirect handling and revocation. Obtain
short-lived credentials through an explicit protected channel. Do not use the host's
GitHub CLI login, discover environment tokens or copy consumer/desktop credentials.
Never put token values, App private keys or refresh tokens in this approval record,
commands, source, request logs or renderer state. Return only validated metadata;
repository metadata itself can contain sensitive fields such as `temp_clone_token`.

The probe must preserve the fixed origin, pinned API version, GET-only routes,
no redirects/retries, overall deadline and body limits in spec 0007. Retain a redacted
result and denial cases. HTTP fixtures do not replace this live evidence. A failed
probe cannot enable token issuance or cause an automatic credential fallback.

## Production credential custody before mint/bootstrap

Select an operator-managed secret service for the actual deployment rather than
promoting the fixed test key or plaintext configuration to production. The App
signing key and refresh credentials stay outside SQLite, workspace compute and
the desktop renderer. The worker's service identity receives only the permissions
needed for the selected installation and operation. Managed deployment needs its
own tenant and secret-service authorization review.

Before accepting real installation tokens, implement and test key identification,
authenticated encryption, rotation with old-key recovery, backup/restore and
loss/revocation handling. Record the secret-service/key version and recovery owner
without key material. Rotation must not erase access to outstanding cleanup
obligations. Cryptographic erasure of the active row does not prove removal from
WAL, snapshots or backups; retention and deletion policy are separate.

Unknown mint outcomes remain blocked. A lost mint response may leave a credential
that the worker never received; neither a new token nor local lease expiry proves
that credential revoked. The real adapter/inspector must establish settled requests,
credential validity/revocation and any credential-channel/checkout state before
resolution. If provider evidence cannot establish this, retain `needs_attention`
and manual recovery. Do not substitute the simulation inspector's assertions.

## Isolation and resource authorization before checkout

Pin the provider/SDK/image and the trusted fixture. Record approved account/project,
region, resource shape, one-workspace concurrency limit, maximum runtime, storage
retention, spend ceiling and cleanup deadline. Missing limits reject provisioning.
No paid resource or account/project has been approved by this document.

All Git/dependency/agent commands run in isolated compute, with no host mounts,
credentials or privileged sockets. The trusted bootstrap step must keep tokens out
of argv, URLs, retained Git config and logs, then revoke/clear the channel before
untrusted scripts can run. Verify the pinned commit and filesystem independently.
Do not add a host Git/subprocess fallback to the existing local JSON adapter.

Only after these inputs and implementations are present should an opt-in harness
exercise live M1a. Keep it separate from default `npm run check`; cleanup evidence,
usage and all crash-window limits are part of its result. The recorded App/user
read-only checks do not establish live checkout, persistence, isolation, cleanup
or M1a completion.

## Dated primary references

Checked 7 November 2026; these describe GitHub behavior, not Argent integration:

- [App user authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
  for consent, shared user/App access and revocation.
- [App JWT requirements](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app)
  for signing and bounded lifetime.
- [Installation token issuance](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
  for explicit repository/permission narrowing.
- [Current stateless token rollout](https://github.blog/changelog/2026-10-02-stateless-github-app-installation-tokens-rolled-out/)
  and [format guidance](https://github.blog/changelog/2026-05-15-github-app-installation-tokens-per-request-override-header/)
  for opaque-token compatibility.
- [Repository metadata](https://docs.github.com/en/rest/repos/repos#get-a-repository),
  [App installation lookup](https://docs.github.com/en/rest/apps/apps#get-a-repository-installation-for-the-authenticated-app),
  [ref lookup](https://docs.github.com/en/rest/git/refs#get-a-reference) and
  [API versioning](https://docs.github.com/en/rest/about-the-rest-api/api-versions)
  for the preflight routes and pinned `2026-03-10` version.

## Pilot account setup progress — 7 November 2026

The founder subsequently authorized the agent to perform repository/App setup.
Administrative `gh` and the signed-in GitHub browser are used only for setup;
existing host credentials are not copied into Argent, fixtures or workers.

Created and independently reread private repository
`GregPat22/argent-m1a-fixture` (numeric ID `1449217243`), owned by GitHub user
`GregPat22` (ID `132290928`). The initial `refs/heads/main` commit is
`d630d7a792d7a7f2cf4783d6e62c9f849f7f57c0`. It contains only GitHub's generated
initial README. No target-repository command was run on the control-plane host.

After the founder completed GitHub's sudo confirmation, registered private App
`Argent M1a Pilot GregPat22`, slug `argent-m1a-pilot-gregpat22`, App ID `5654610`,
client ID `Iv23lilJjeCgLi7Zd4xW`. The observed registration sets Contents read and
mandatory Metadata read; all other permissions remain unselected. Installation
is restricted to the owning account. Webhooks, device flow, installation-time
OAuth and wildcard redirects are off; no callback is configured yet.

The founder explicitly approved signing-key generation and fixture-only
installation. GitHub generated one key, saved directly into an owner-only
application-support pilot folder outside Git (directory mode `700`, file mode
`600`). The key's public SHA-256 fingerprint was computed locally and matched
GitHub's displayed fingerprint:
`SHA256:yLwsXeOY+mJnieD6WENwAvjEL6wKFKWcdQyWR/6bM+k=`.
No private key or token bytes were printed, added to source or supplied to a worker.

Installation `179529579` was completed through GitHub's review screen and visibly
confirmed with **Only select repositories**, **Selected 1 repository**,
`GregPat22/argent-m1a-fixture` and read access to code/metadata. No write, account,
organization or product-repository permission was granted. At installation time the App was account-only, with no client secret generated
and no OAuth/device-flow enablement. Device flow and user consent were subsequently
approved for the explicit read-only pilot below; repository permissions are unchanged.

Administrative API verification at `2026-11-07T09:56:17.795Z` used a locally signed,
short-lived App JWT, never written to disk, for these fixed-origin GETs:

| Route                                              | Observed result                                                                        |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `/app`                                             | 200; App ID `5654610`, slug/owner match.                                               |
| `/app/installations/179529579`                     | 200; expected owner/App, selected repositories, Contents/Metadata read, no suspension. |
| `/repos/GregPat22/argent-m1a-fixture/installation` | 200; same installation and read-only policy.                                           |
| `/repos/GregPat22/argent/installation`             | 404; product repository has no installation for this App.                              |

This is real administrative configuration evidence, **not live bootstrap, user
OAuth, isolated checkout or M1a completion**. No installation access token was
minted. The host CLI's existing OAuth login could not list App installations
(403); its scopes were not expanded, and it was not imported into Argent. The
new explicitly approved App key was used only for fingerprint and App GET checks.
Redacted local receipts are `.context/github-pilot-setup.json` and
`.context/pilot-app-verification.json`; their non-secret facts are retained here.

Subsequent [device-pilot work](0011-github-device-pilot.md) implemented protected
local App-user sign-in, explicit key/config loading and live read-only preflight.
The receipt at `2026-11-07T10:19:52.061Z` verifies the expected account/installation/
fixture and original main SHA, with no installation-token issuance or checkout.
The process exited after recording only redacted metadata and closing its session. Production secret-service rotation,
backup and isolation/resource gates above remain open. A local file with restricted
permissions is a pilot artifact, not production key-management certification.
Runtime API/desktop/service-loop connections remain disabled. No cloud resource,
paid operation, target-repository command, merge, deployment or binary release was
performed. Fresh `npm run check` validation for this setup update is recorded in
[HANDOFF.md](../../HANDOFF.md).
