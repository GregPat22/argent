# P1: downloadable desktop prototype

Status: implemented as a local macOS Apple Silicon prototype, 6 November 2026.
Public signing/distribution and the real cloud MVP remain separate milestones.

## Founder requirement

The installation and launch experience follows Conductor: visit the website,
download the application, install it locally and launch a desktop app. The
installed application is the primary product interface. A browser-only dashboard
does not satisfy this requirement.

Desktop delivery preserves the original cloud requirement. A desktop client can
control a persistent remote workspace; closing the app does not cancel remote
work. The local prototype depends on the local host remaining awake and running.

## First prototype scope

Package a macOS desktop build in the current development environment over the
existing durable engine. Provide workspace creation/selection, task submission,
activity and verification inspection, cancellation, stop/start and reconnection.
Use the scripted local adapter initially and clearly identify it as simulation.
Do not imply GitHub authorization, real coding-agent execution or a tested PR.

## Acceptance criteria

1. One documented development command launches the desktop app and local service.
2. A packaged local build can launch without a developer terminal or globally
   installed Node. Report unsigned/notarized status accurately.
3. Reopening the app restores persisted workspaces, tasks and activity. A window
   close never silently cancels a run; expose explicit service lifecycle controls.
4. Task execution remains owned by the service, with existing crash reconciliation,
   cancellation, limits and independent verification behavior intact.
5. The renderer has no Node integration, arbitrary filesystem/process access or
   raw operator credentials. A narrow bridge validates requests and destinations.
6. Workspace and run lists are paginated and persisted, not seeded fake state.
   Errors, empty states, disconnected state and verification outcomes are usable.
   A selected workspace beyond the first list page must refresh its authoritative
   state after another client stops or starts it, including after reconnect.
   This applies to restored selections and selections from loaded older pages.
   A response arriving after selection changes must not update the new selection;
   read failures remain visible and later polls can recover.
7. The app makes simulation status visible. Unavailable real-cloud/agent/PR
   capabilities are described accurately and are not fabricated working controls.
8. Automated bridge/API/lifecycle tests pass, plus hands-on desktop flow checks.
   Preserve the existing durability regression suite.
9. Provide a website download entry-point source with accurate build/install
   information. Public release links require real published artifacts; no invented
   download URLs or silently published website.
10. Document remaining release requirements: signing/notarization, updates, other
    operating systems, and the real cloud MVP acceptance contract.

## Boundaries

Review follow-up, 6 November 2026: [PR #1 review](../research/p1-pr-review.md)
at `6104961` reproduced a selected-workspace refresh gap in criterion 6.
Fix commit `f929ae3` on `GregPat22/next-step-request` refreshes the selected
workspace independently of retained history. Five compiled-renderer regressions
pass, and `npm run check` passes 38 tests with strict types and formatting.
The harness uses controlled bridge responses and a minimal DOM; native smoke
results and remaining limits are in the [review follow-up](../research/p1-pr-review.md#fix-verification-follow-up).
The fix is local to this continuation branch; PR #1 and main still need explicit
integration and a merge decision.

No upstream fork/import without founder approval. No silent purchase, cloud
provisioning, merge, deployment or public release. Prefer a thin desktop shell
around the existing engine; review the pinned upstream comparison before larger
orchestrator changes. The desktop client is not an isolation boundary for running
untrusted repository code.
