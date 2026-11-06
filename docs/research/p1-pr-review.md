# P1 desktop PR review

Reviewed 6 November 2026 on `GregPat22/next-step`, based on
`a5a96cb0bb8ad84aa44ca112a07d780b0ed0738a` (`origin/main`). Review target:
[draft PR #1](https://github.com/GregPat22/argent/pull/1),
`codex/desktop-handoff` at `6104961056d1123988a1fe6e2d76fcb3ed53897b`.
The branch name and checkout were preserved. No merge or release was performed.

## Finding requiring follow-up

**[P2] (confidence: 10/10) Selected older workspaces stop receiving state updates.**

In [ui/app.ts:476](https://github.com/GregPat22/argent/blob/6104961056d1123988a1fe6e2d76fcb3ed53897b/ui/app.ts#L476), polling calls `api().listWorkspaces()` without a cursor,
then merges that first page into the retained list. `getWorkspace` is called only
for initial selection restoration, guarded by `!selectedWorkspace` at line 481.
Once selected, a workspace outside the newest 50 is never fetched again.

Reproduction against the compiled renderer, using a controlled service bridge
and minimal DOM:

1. Return 50 recent workspaces from `listWorkspaces`; retain an older workspace
   as the saved selection. Restore it through `getWorkspace`, state `running`.
2. Change that workspace's service state to `stopped`, as another authenticated
   client can do. Return unchanged recent records from the next list request.
3. Run another refresh. The renderer still shows `Ready` and enables New task;
   it has called `getWorkspace` only once. The service correctly rejects a new
   task, but the client continues to display stale state on subsequent polls.
   Starting an older stopped workspace externally has the inverse effect: the
   client keeps task submission disabled until a full renderer reload.

The diagnostic output was:

```json
{
  "reproduced": true,
  "serviceState": "stopped",
  "rendererState": "running",
  "newTaskEnabled": true,
  "selectedWorkspaceReads": 1
}
```

Fetch and merge the selected workspace on each refresh when it is absent from the
fresh page, applying the existing epoch guard after the await. Add a renderer
regression covering both stop and start through another client beyond page one.
Acceptance criterion 6 in the desktop specification now records this requirement.
This review does not include that runtime fix; P1 source is on the separate PR.
Recommendation: resolve this finding before approving integration.

## Fresh verification

The PR was fetched and inspected through a source archive in the ignored
`.context/p1-review/` directory, without checking out another branch or altering
the landing workspace. Verification used Node 22.19.0 and npm 10.9.3.

- PR metadata reported open/draft, mergeable and successful GitHub check jobs at
  the exact target revision. These are observed statuses, not a merge decision.
- `npm ci --ignore-scripts` and `npm run check` passed on the PR snapshot:
  strict TypeScript, formatting, compilation and **33 tests, 0 failures, 0 skips**.
- After installing the pinned Electron binary, `npm run desktop:smoke` passed
  against the development Electron app. It exercised workspace/task forms,
  verification, window close/reopen, cancellation, service stop/reconnect and
  renderer isolation. The parent confirmed service survival after app exit.
  The harness cleaned up its temporary profile and owned services.
- The separate renderer reproduction passed against the unmodified compiled
  renderer with mocked service responses. It demonstrates the stale-state bug;
  it is not an end-to-end second-client test.
- On the main-based review branch, `npm run check` passed strict types,
  formatting and **22 tests, 0 failures, 0 skips**. `git diff --check` passed;
  all 34 relative Markdown links in the four changed documents resolve.
- `npm audit --json` reported five moderate package entries in the development
  packaging dependency chain (`@electron/packager`, `@electron/asar`,
  `@electron/universal`, `glob`, `minimatch`). These are dependency signals, not
  five demonstrated product exploits. No dependency changes or audit auto-fix
  were applied; reachability was not established by this review.

Local review artifacts (ignored, reproducible rather than tracked evidence):
`.context/p1-check.log`, `.context/p1-native-smoke.log`,
`.context/main-check.log`, `.context/p1-audit.json`, `.context/p1-ui-repro.mjs`, and
`.context/p1-review/.data/screenshots/argent-desktop.png`.
Run the reproduction with `node .context/p1-ui-repro.mjs` after rebuilding that
snapshot; the numbered scenario above preserves its contract outside this machine.

## Scope and remaining decisions

The source review covered the API/store changes, desktop bridge, service ownership
and lifecycle, renderer state/submission/history logic, build/package/preview
scripts, new automated tests and changed capability documentation. No general
security certification or exhaustive visual audit is claimed. The review skill's
automated workflow could not run because its required AskUserQuestion tool was
unavailable; the review and verification above were performed directly.

The packaged archive and packaged-executable smoke were not rebuilt or repeated
here. Those remain historical evidence in the P1 completion report. The new
smoke evidence is for the development executable. Signing, notarization, public
downloads, updates, cloud execution, real agents and product GitHub integration
remain incomplete. All executed product tasks were simulations.

Next: fix the renderer refresh issue on the desktop continuation branch, rerun
its checks and native smoke, then request the explicit merge decision for the
updated PR. Reconcile its `website/` ownership with the separate landing work
before integrating both efforts. Do not replace the foundation or provision
resources as a consequence of this review.
