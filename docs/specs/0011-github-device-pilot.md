# GitHub device sign-in and read-only pilot

Recorded 7 November 2026, based on main `1cb55c3`.
This continues the installed test App from [spec 0010](0010-live-repository-pilot-gates.md).
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

The pilot App initially had device flow disabled. The maintainer enabled it, and
gave App-user consent, for this single test-repository pilot only. Contents/Metadata
read and the single installation stay unchanged. The existing protected pilot key
is reused, never regenerated, and installation access is never broadened. The
host's existing GitHub OAuth session is never substituted.

This session lasts only for the pilot process. Persistent sign-in, refresh and
revocation, production secret custody, authenticated remote operators, desktop
integration, isolated checkout and every live M1a execution gate remain separate
work. GitHub may retain the authorized grant, and an issued token stays valid until
expiry or revocation even after this process forgets it. Revoke it in the
account's GitHub App authorization settings; no remote sign-out is claimed here.

## Config format

The config is a JSON file with exactly these fields; unknown fields are rejected.
Values below are placeholders:

```json
{
  "githubUserId": 1234567,
  "appId": 1234567,
  "clientId": "Iv23xxxxxxxxxxxxxxxx",
  "installationId": 12345678,
  "repositoryId": 123456789,
  "repository": "https://github.com/your-account/your-test-repo",
  "ref": "refs/heads/main",
  "keyPath": "/absolute/private/dir/app-private-key.pem",
  "keyFingerprint": "SHA256:…"
}
```

The App needs device flow enabled, Contents and Metadata read only, and an
installation on the single selected repository. `keyFingerprint` is the public
SHA-256 fingerprint GitHub shows for the App's signing key. The config file and the
key must be regular files you own, mode `600`, inside directories with mode `700`.

Primary reference checked 7 November 2026:
[GitHub App device flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token).

## Implementation evidence

At main `1cb55c3` plus the pilot changes, **39 focused synthetic protocol, key and
pilot tests pass**. They exercise interval and slow-down handling, malformed or
ambiguous responses, denial and expiry, cancellation and late responses, body
limits, a lost exchange with no retry, secret-free prompt/session/receipt output,
a wrong GitHub identity, closed and expired sessions, key fingerprint, modes and
symlinks, config validation and the composed read-only receipt. The real protected
pilot config and key also pass the loader without making network requests.

`npm run check` passed strict types, formatting, compilation and **316 tests, 0
failures, 0 skips** after independent test files were serialized. Earlier
concurrent runs had failed existing short-lease fixtures under host load; their
assertions and production timeouts are unchanged, and explicit race tests still
spawn competing processes.

A live run then completed after the maintainer approved device flow and consent.
The real CLI receipt (`source: github_api`, `simulation: false`) identified the
local OS operator, the expected GitHub user, App, installation and private test
repository, `refs/heads/main` and its exact commit SHA. The process exited 0,
closed its in-memory session and stored a redacted `600` receipt beside the
private config. No installation token was minted, and there was no checkout,
cloud resource or API/desktop connection. The receipt and a hash manifest of the
seven source and seven compiled runtime files are kept locally, outside Git; the
identifiers are deliberately not published. This does not satisfy the live
checkout, isolation, cleanup or budget gates, or establish a production account
or secret service.

## PR hardening — 7 November 2026

After main `8acab52` was integrated, review reproduced
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
**43/43**.
