# P1 desktop prototype completion

Completed 6 November 2026. This is the first usable **local desktop prototype**,
not the real-agent/cloud MVP or a signed public release.

This report records original source `a4f3d52`, preserved on `codex/p1-original`.
The context-integrated source was reviewed on `codex/desktop-handoff` in
[PR #1](https://github.com/GregPat22/argent/pull/1), integrated into main at
`fd60a5a` with the subsequent refresh fix/tests. The original 33-test/native
evidence below remains historical; later checks record 41 tests. See
[HANDOFF.md](../../HANDOFF.md) for current branch and integration status.

## Delivered

- Native Electron desktop application with workspace creation/selection, task
  submission, live activity, cancellation and persisted reconnection.
- Independent local execution service that survives the desktop window and
  application process, with explicit stop/reconnect controls.
- Sandboxed renderer, context isolation, named and validated IPC operations,
  exact main-frame checks, packaged resource allowlist and restrictive CSP.
  The renderer receives no raw service credentials or Node APIs.
- Workspace/task history with keyset pagination, remembered selection, retry-safe
  submission keys, empty/error/offline states and audited abandonment of uncertain
  simulated runs. Loaded older records remain accessible beyond 1,000 entries.
- Actual JSON artifact inspection checked against committed verification SHA-256.
- Self-contained macOS Apple Silicon app, downloadable zip and checksum.
- Unpublished download-page source with real artifact/screenshot links and
  installation instructions. No fabricated public download or cloud capability.
- Pinned T3 source-adoption evaluation at
  `6577c6b6185167c0e502fa01f9e8e8f2dee6ff25`; no upstream fork/import or runtime
  conformance claim.

## Verification actually completed

`npm run check` passed: strict type checking, formatting and **33 tests passed,
0 failed, 0 skipped**. Tests include process death, claim races, lease expiry
under lock contention, cancellation, event/runtime limits, service startup races
and crash/restart, private credentials, artifact tampering, input round-tripping
and history pagination beyond 1,000 records.

The actual packaged executable passed `desktop:smoke` using its bundled runtime:
create workspace, submit task, inspect verified artifact, close the window during
another active task, reopen persisted state, cancel a task, stop/reconnect the
service, and assert renderer isolation. The parent harness also confirmed that
the detached service remained alive after the desktop application process exited.
Owned smoke services and temporary profiles were then cleaned up.

Archive SHA-256 validation passed. Local website checks returned HTTP 200 for its
page, stylesheet, actual app screenshot, zip and checksum; a private `.env` route
returned 404. The page was also inspected in a real browser.

Independent review found and prompted repairs for service ownership after crashes,
artifact-size acceptance, NUL round-tripping, and old-history truncation. Focused
regression tests cover each behavior. An Electron startup readiness deadlock was
also fixed before the native app journey passed.

## Try the prototype

Local artifacts:

- `release/Argent-darwin-arm64/Argent.app`
- `release/Argent-0.0.1-macos-arm64.zip`
- `release/Argent-0.0.1-macos-arm64.zip.sha256`
- `.data/screenshots/argent-desktop.png`

From source: `npm ci`, then `npm run desktop`. The installed app needs no global
Node installation. `npm run site:preview` serves the local download page after
the screenshot and package exist. See README.md for lifecycle/data locations.

## Remaining scope

All agent work is explicitly simulated. Repository URLs are metadata; there is no
GitHub authorization, checkout, real model execution, cloud workspace or tested
pull request. Local compute depends on the Mac remaining awake.

The build has no Developer ID signing or notarization. Public distribution,
automatic updates and other OS/architecture builds remain future work. The local
service is a trusted single-host prototype, not an untrusted-code sandbox or a
managed multi-tenant service. PostgreSQL, isolated real-agent execution, scoped
credential brokering and provider lifecycle/budget checks remain M1 requirements.

No cloud resources were provisioned, infrastructure purchased, website deployed,
upstream foundation adopted, changes merged or release published.
