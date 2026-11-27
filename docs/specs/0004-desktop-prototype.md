# P1: downloadable desktop prototype

Status: implemented as a local macOS Apple Silicon prototype, 6 November 2026.
Public signing/distribution and the real cloud MVP remain separate milestones.

## Product requirement

The installation and launch experience is that of a desktop app: visit the
website, download the application, install it locally and launch it. The
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
   Since spec 0015's launch refinement, each launch opens on the welcome screen
   with saved workspaces in the sidebar rather than reopening the last selection.
4. Task execution remains owned by the service, with existing crash reconciliation,
   cancellation, limits and independent verification behavior intact.
5. The renderer has no Node integration, arbitrary filesystem/process access or
   raw operator credentials. A narrow bridge validates requests and destinations.
6. Workspace and run lists are paginated and persisted, not seeded fake state.
   Errors, empty states, disconnected state and verification outcomes are usable.
   A selected workspace beyond the first list page must refresh its authoritative
   state after another client stops or starts it, including after reconnect.
   This applies to selections from loaded older pages and to a workspace
   reopened for an uncertain submission.
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

## Native application icon (in development)

Appearance family in development, based on main `9be273e`, 18 November 2026.
The following criteria extend the original single-appearance contract.

1. The desktop and website marks derive from the same transparent silver A and
   wordmark. Refer to the [artwork sources and export recipe](../../website/public/brand/README.md).
2. A packaged app carries a named Argent asset catalog for light, dark, tinted
   and clear presentations. An ICNS containing the padded default artwork from
   16 through 1024 px serves older macOS versions. At 16 and 32 physical pixels,
   darker faces keep the silhouette legible.
3. An unpackaged launch selects its padded Dock image from the system light or
   dark appearance and responds to appearance changes. A packaged launch leaves
   selection to macOS. The catalog and ICNS can be packaged without Xcode.
4. Inspect the six native renditions and the small icon sizes, verify both
   bundle icon references and resources, and exercise the packaged launch.

Local artwork validation on 18 November 2026 against the baseline above:
Icon Composer rendered default, dark, tinted-light, tinted-dark, clear-light
and clear-dark images. The packaged catalog contains the named Argent groups
for system selection. AppKit resolved the packaged app to its graphite icon
under the current appearance. The six renders were inspected separately from
that bundle lookup. A checksum-verified ZIP extracted to a fresh directory
contained the same catalog, classic icon and renderer assets as the updated
installation. AppKit returned the graphite A for both the extracted bundle and
the running installed app. System appearance switching on older macOS releases remains
unverified.

Both development and packaged smoke walkthroughs passed on the final artwork.
Earlier packaged runs timed out in the service or command walkthrough; a
packaged run on the unchanged baseline also timed out in the command walkthrough.
The ICNS decoded to ten entries. Website type checking, production build and
sharing-image checks passed. The navigation active-section check failed on
both revisions. The repository check recorded a queued-check assertion failure
and a disconnect timeout. The assertion also failed on the baseline; the
disconnect test passed on both revisions when run individually. The
active-section test subsequently passed locally. A later checkout-cancellation
test also passed individually on both revisions after a transient failure.
The final full repository check passed without failures or skips.

### Original single-appearance validation

Acceptance recorded 18 November 2026 against main `d8f63e2`:

1. The source artwork is the silver A on black in
   `ui/argent-app-icon.png`, preserved without redrawing or cropping. Its SHA-256
   is `b13a357596fbb3029b4c4d31e21a27d8d5d89b98721c2aa2ad0450a17d1e0989`.
2. The editable `ui/Argent.icon` document places the original artwork at 90%
   scale on the native canvas, with layer glass effects disabled. Its committed
   macOS pre-Tahoe export, `ui/argent-app-icon-macos.png`, includes the native
   rounded silhouette and transparent outer padding. The A occupies about 82%
   of the tile width, without redrawing. Packaging derives the standard macOS
   icon sizes from this export with the system image tools
   and embeds the resulting ICNS as the application's bundle icon. Every new
   build uses the committed source; no Finder-only icon override is required.
3. Development launches use the same artwork for the Dock icon. Existing
   in-window and website marks retain their own transparent derivatives.
   Packaged launches leave the bundle icon under macOS control, including its
   rounded presentation; they never replace it with a raw PNG Dock override.
4. Validate the repository check, native packaging, the bundle's icon reference
   and embedded image sizes, and the installed application's displayed icon.
   This does not establish signing, notarization, public distribution or any
   additional execution capability.

Initial validation of `f9c5b92` on 18 November 2026, based on main `d8f63e2`: packaging produced a valid ICNS referenced by
`CFBundleIconFile`, with image entries through 1024 pixels. The packaged PNG
matches the source digest above. The installed package launched, reconnected to
existing history, and displayed the silver A on black in its native About
dialog. The package remains unsigned, unnotarized and unpublished; this is not
a new full desktop workflow or real-agent walkthrough. `npm run check` passed
types, formatting, build and the full test suite without failures or skips.
The full native smoke walkthrough and website checks were not rerun.

Follow-up to `f9c5b92`, 18 November 2026: the raw PNG Dock override also ran in
the installed app, replacing the native icon presentation while running. Limit
that override to unpackaged development launches. Keep the original artwork
unchanged. Use the native-layout export for both
ICNS sizes and development Dock images, rather than the unframed source.
The editable document is an authoring asset; builds consume the committed PNG
so CI does not require a newer Xcode or a new runtime dependency. See Apple's
[app icon guidance](https://developer.apple.com/design/human-interface-guidelines/app-icons)
and Electron's [Dock API](https://www.electronjs.org/docs/latest/api/dock/).

The native export has a 1024-pixel canvas, transparent corners and an opaque
tile bounded by pixels 100 through 923 on each axis. Its SHA-256 is
`0dbbeedaabfef3a7962fd50651da89a45dfd3e8c048d1716781cea43ca96c458`.
The rebuilt bundle and installed PNG match this export, the ICNS is valid,
and the installed About dialog shows the rounded tile with the larger A.
The final integration passed `npm run check` without failures or skips.
The Dock itself was not available to automated screenshot inspection.

## Boundaries

Review follow-up, 6 November 2026: the PR #1 review
at `6104961` reproduced a selected-workspace refresh gap in criterion 6.
Fix commit `f929ae3` refreshes the selected
workspace independently of retained history. Eight compiled-renderer regressions
pass with edge-case tests `b888840`, and `npm run check` passes 41 tests with
strict types and formatting. A rebuilt local package passed packaged-executable
smoke and archive checksum validation.
The harness uses controlled bridge responses and a minimal DOM; it is not a
native smoke test. Main integrated PR #1 and the refresh fixes in `fd60a5a`; this checkout includes them. The package
remains unsigned, unnotarized and unpublished. Evidence above belongs to the
recorded revisions; the later documentation merge does not re-run native smoke.

No upstream fork/import without maintainer approval. No silent purchase, cloud
provisioning, merge, deployment or public release. Prefer a thin desktop shell
around the existing engine; review the pinned upstream comparison before larger
orchestrator changes. The desktop client is not an isolation boundary for running
untrusted repository code.

## Delivery regression gates

Acceptance criteria, 9 November 2026, based on main `241e6e6`: CI must check the
website's own lockfile, types, production build and complete browser suite in a
separate job. The desktop job must build the unsigned macOS Apple Silicon package
and exercise both development and packaged executables with the native smoke
fixture. No signing, artifact publication or deployment follows automatically.
For the packaged walkthrough, CI must verify the versioned ZIP against its
SHA-256 sidecar, extract it into a fresh directory and launch the app from
that directory. A checksum mismatch or extraction failure must stop the job
before launch.
Packaging must compile the application into a fresh staging directory on each
build. The macOS regression leaves obsolete service and renderer files in the
development build, verifies that both survive packaging there, and checks that
neither appears in the extracted application.
The installed app must carry the Electron license and Chromium third-party
notices from its bundled runtime. Compare both files in the extracted app
byte for byte with the originals from the Electron distribution.

Website geometry assertions follow the wordmark design documented in
[the website README](../../website/README.md#navigation-regression-contract),
while preserving exact endpoints, intermediate animation, keyboard and
reduced-motion coverage.

### Delivery evidence

Recorded 9 November 2026 at `8183ff8`: `npm run desktop:smoke` passes for the
restyled desktop, and `npm run desktop:package` produces the unsigned macOS
Apple Silicon application and archive. The archive's SHA-256 sidecar verifies.
The same smoke fixture passes against the packaged executable, including service
survival after the app exits; native screenshots were inspected locally.
The root and website dependency audits report no known advisories. A direct ASAR
round-trip check also exercises the overridden glob traversal and unpack matching.

An earlier native capture failed with a destroyed window before integration;
unchanged main `176384a` and the integrated native run passed. This does not prove
the capture path is free of intermittent failures. Hosted CI, signing,
notarization, publication and real model-backed execution have not been exercised
by these local fixture checks.

Website validation at `5870ae2` passes `npm run typecheck`, `npm run build` and
the complete browser suite. Geometry assertions now match the recorded wordmark
design; navigation also handles exit-only section observations and provides the
compact menu's Back to top action. Animation tests inspect the actual transition
midpoint, and the atom test waits for offscreen observer delivery before retaining
the strict no-draw assertion. An intermediate run exposed a canvas timing failure;
unchanged main passed its focused reruns. A later contended run timed out while
waiting for scroll stability and was interrupted. The final browser-only run
passes without raising timeouts or removing assertions. These results establish
local regression coverage, not execution of the new hosted CI jobs.

### Hosted CI evidence

Recorded 9 November 2026 for main `82f180b`, the first hosted run of the three
jobs: the engine check and the macOS desktop job (development smoke, package,
packaged smoke) passed. The website job passed its type check and production
build, then failed twelve browser tests by timeout.

Cause found locally: the hosted runner has no GPU, so the browser ray-marches
the hero's liquid silver on the processor. The component's quality governor
ignored every frame slower than 100 ms, which meant the slowest devices never
had their resolution lowered. With software rendering at 1440 by 900 the canvas
stayed at full resolution and drew about three frames a second, starving the
rest of the page.

The governor now treats a run of slow frames as the signal to lower the
resolution, starts lower when the renderer reports software rendering, and holds
a still frame if even the lowest resolution cannot animate. Measured locally
with the same software renderer: the median frame went from about 300 ms to
about 17 ms at 1440 by 900. A browser test covers it.

Confirmed on 10 November 2026: the hosted run for the pull request carrying
this change passed all three jobs, including every browser test in the website
job.

## Startup ownership regression acceptance

Implemented at `d2ef4e562a9f809524026af228eb8a2c8a39844e`, validated on 11 November
2026 against main `951f101`.
A controlled contention fixture reproduces a losing startup process remaining
alive after both callers receive the winning connection. Stopping that winner
releases the SQLite lock and lets the contender publish a replacement service.
This violates the explicit-stop contract even though ordinary startup and
reconnection tests pass.

Acceptance criteria:

1. A launcher retains its actual child-process handle until its own authenticated,
   healthy service is selected or that child has exited. Only selection of its
   own daemon transfers lifetime ownership and unreferences the child.
2. Before returning a different healthy owner, the launcher terminates and reaps
   its own contender, then revalidates that owner's health. This also applies to
   a contender delayed before it attempts the ownership lock. No process ID read
   from a connection file authorizes a signal.
3. Startup errors, timeouts and early read failures clean up the launched handle.
   Cleanup sends bounded termination and kill signals and requires an observed
   exit. The graceful interval accommodates the existing agent shutdown budget;
   leader exit alone does not prove descendant quiescence. A signal error is not
   proof of exit; an unconfirmed cleanup is an explicit
   failure. Startup does not retry by spawning another process automatically.
4. Automated cases cover ordinary and delayed concurrent launches, preservation
   of the selected owner, explicit stop without resurrection, launch/read errors,
   timeout escalation and unconfirmed cleanup. Existing restart, persisted-history
   and active-stop assertions remain intact. Native smoke must still show service
   survival after the desktop window exits.

### Startup ownership validation

Implementation `d2ef4e562a9f809524026af228eb8a2c8a39844e` passes all eighteen focused
startup and existing desktop lifecycle cases. `npm run check` passes type
checking, formatting, build and all 541 tests without failures, cancellations or
skips. Native desktop smoke passes, including window reopening, service restart
and continued service health after the app exits. The source/tests diff received
an independent lifecycle review.

The two new real-process concurrency regressions were also run against unchanged
implementation `60b30bb`, whose tree matches main `951f101`: both fail specifically
because the unselected child is still alive when startup returns. Their captured
child handles are reaped even on assertion failure. The same assertions pass
with the fix. A post-check process audit found no new detached test service;
these observations do not claim durable descendant reconciliation after a hard
service crash.

The baseline reproduction used only an owned temporary profile and simulated service, with all
launched handles reaped. A separate unchanged baseline at `60b30bb` passes the
existing concurrent-start test. An intermediate change to nonwaiting SQLite
acquisition failed that test with a startup timeout; the final correction keeps
the original lock policy and passes the focused suite. No SQLite initialization
root cause is inferred from that timeout.
The controlled reproduction establishes the startup lifecycle defect, not a failure
of SQLite's exclusive
ownership or a change to local execution permissions. Public release, signing,
real-account execution and the remaining L1.4 checks are outside this correction.
