# GitHub device sign-in and read-only pilot

Prepared 7 November 2026 on unchanged `GregPat22/next-step-v6`, base main `1cb55c3`.
This continues the installed fixture App from [spec 0010](0010-live-repository-pilot-gates.md).
The first integration is an explicit local pilot command, separate from desktop,
API and execution workers. It proves user sign-in/preflight before durable account
connections or untrusted checkout. The installed desktop remains the primary product.

## Acceptance criteria

- Implement the official App device flow using fixed `github.com` POST endpoints,
  client ID and requested fixture repository ID. Display only the public user code
  and exact official verification URL. Keep device code, user/refresh tokens and
  signing key out of stdout, errors, argv, renderer state, files and SQLite.
- Validate code/URI/expiry/interval responses; obey pending and slow-down intervals.
  Bound total sign-in and each streamed HTTP response. Reject redirects, malformed
  responses, access denial, cancellation and expiry using fixed errors. Do not
  repeat requests after an uncertain transport failure or restart an expired flow
  automatically. Protocol polling after an explicit pending response is permitted.
- Return an opaque in-memory session with expiry, close and read-only preflight,
  not a serializable credential object. Discard refresh credentials. Closing drops
  the local credential reference; it does not claim remote grant revocation.
- Load only an explicitly configured pilot signing key from an owned, regular,
  non-symlink file in an owned private directory. Require file `600`, directory
  `700`, nonblocking open before file-type validation, bounded size, RSA strength and the previously recorded public fingerprint.
  Use a short-lived RS256 App JWT. Discover no environment/CLI/browser credentials.
- Add `npm run github:pilot -- --config /absolute/private/config.json`. Its config
  contains only approved non-secret identifiers, URL/ref, key path/fingerprint.
  Bind the authenticated user to the expected numeric GitHub user and installation/
  repository via the existing preflight; the local OS user is the pilot operator.
  A mismatch never persists a successful binding. Save only a redacted observation
  atomically beside the private config; no durable execution authority is created.
- The pilot does not mint installation tokens, clone, execute repository code,
  provision resources, expose an API or change desktop simulation behavior.
  An injected transport is labeled simulation and cannot be claimed live evidence.
- Cover protocol timing, wrong identity/config/key, redirects, malformed/oversized/
  hung responses, cancellation, session expiration/close, secret exclusion and
  successful fixture preflight with focused tests. Review the diff and run
  `npm run check`. Live consent is separate from fixture tests. Serialize independent
  test files to prevent unrelated fixture startup from consuming short leases on
  a busy host; explicit multi-process races inside tests must remain unchanged.

## Live enablement

The existing private App initially had device flow disabled. The founder has now
approved enablement and App-user consent for this single fixture pilot. Keep
Contents/Metadata read and the single fixture installation unchanged. Use the
existing protected pilot key; never regenerate it or broaden installation access.
Once consent is supplied, record exact identities/SHA and selected metadata from a
live read-only run. Do not substitute the host's existing GitHub OAuth session.

This session lasts only for the pilot process. Persistent sign-in, refresh/revoke,
production secret custody, authenticated remote operators, desktop integration,
isolated checkout and every live M1a execution gate remain separate work. GitHub
may retain an authorized grant and an issued token remains valid until expiry or
revocation even after this process forgets it. Revocation is available in the
account's GitHub App authorization settings; no remote sign-out is claimed here.

Primary reference checked 7 November 2026:
[GitHub App device flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token).

## Implementation evidence

On unchanged `GregPat22/next-step-v6`, base main `1cb55c3`, **39 focused synthetic
protocol/key/pilot tests pass**. These exercise interval/slow-down handling,
malformed/ambiguous responses, denial/expiry, cancellation and late responses,
body limits, lost exchange/no retry, secret-free prompt/session/receipt output,
wrong GitHub identity, closed/expired sessions, key fingerprint/modes/symlinks,
config validation and the composed read-only receipt. The real local protected
pilot config/key also pass the loader without making network requests.

Default `npm run check` passes strict types, formatting, compilation and **316
tests, 0 failures, 0 skips** after serializing independent files. Earlier concurrent
runs failed pre-existing short-lease/noisy-worker fixtures under host load; their
assertions and production timeouts are unchanged. Explicit race tests still spawn
competing processes. Logs: `.context/device-tests.log`, `.context/device-check.log`
and `.context/device-lease-recheck.log`.

Live verification completed after the founder's explicit device-flow/OAuth
approval. At `2026-11-07T10:19:52.061Z`, the real CLI receipt identifies
`local-uid:501` and expected GitHub user `132290928`, App `5654610`, installation
`179529579`, private repository `1449217243`, ref `refs/heads/main` and exact SHA
`d630d7a792d7a7f2cf4783d6e62c9f849f7f57c0`. `source: github_api` and
`simulation: false` distinguish it from fixtures. The process exited 0, closed
its in-memory session and stored a redacted `600` receipt beside the private config.
No installation token was minted; no checkout, cloud, API/desktop connection or
source publication. GitHub's remote user authorization can remain after local close.

Local evidence: `.context/live-github-device-receipt.json` and runtime manifest
`.context/live-github-device-runtime.json`. Seven source/seven compiled runtime
files are SHA-256 hashed, bound to main HEAD `1cb55c3` plus the unchanged branch's
local implementation. Combined runtime-manifest SHA-256:
`75b9f80d025cb1a8c2e407687399b2d91a46688e4e65de8873634eb355ba58f0`.
The tracked source/tests and identities above are reproducible evidence; ignored
local receipts are supplemental. This does not satisfy live checkout/isolation/
cleanup/budget gates or establish a production account/secret service.

## PR hardening — 7 November 2026

On `GregPat22/next-step-v6`, after integrating main `8acab52`, review reproduced
an indefinite open of a local FIFO before config/key file-type validation. Both
loaders now open with `O_NONBLOCK` and reject non-regular descriptors. Two bounded
subprocess regressions timed out before the fix and reject promptly afterward.
A third regression cancels a hung token-exchange response body and rejects a late
successful exchange response without accepting a session or retrying.

The device flow also snapshots its injected transport before any await. Caller
mutation cannot relabel a simulated session as live or switch later preflight to
real HTTP. Its regression failed before the fix and now confirms prompt, session
and preflight retain the original simulated transport.

The historical live receipt/hash above covers the pre-hardening runtime. The device
module and two loader files have since changed; no repeat live consent or network run is claimed
for the hardened revision. Its loader and protocol behavior is checked with
synthetic credentials. This does not expand the pilot's authorization or scope.

Final PR verification after hardening: `npm run check` passes types, formatting,
build and **320 tests, 0 failures, 0 skips**; focused device/key/pilot tests pass
**43/43**. Logs: `.context/pr-final-check.log`, `.context/pr-device-review-tests.log`.
