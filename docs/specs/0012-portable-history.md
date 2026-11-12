# Portable Argent history: first implementation slice

Recorded 7 November 2026, based on main `5c258356ac2c66d62d5adfa24200b6cffd778a3f`.
This implements a bounded part of [M1d](../../ROADMAP.md) and
[spec 0006](0006-portable-continuity.md). It is an offline CLI slice;
desktop migration controls, Conductor import and live process recovery remain open.

## Acceptance criteria

1. Export one explicitly selected M0/P1 workspace from a consistent read-only
   SQLite transaction. Include all bounded run identities, original statuses,
   event cursors/times and simulation verification manifests. Reject overflow
   rather than truncate. Reject lifecycle-enrolled workspaces: cloud operations
   and outstanding credential/cleanup obligations need a separate schema.
2. Use a versioned JSON envelope with a SHA-256 payload digest and per-artifact
   hashes. Export no database, leases, request keys, credentials, arbitrary event
   objects, host storage paths or discovered files. Default to metadata only.
   `--include-text` explicitly selects task/log/resolution text and fixed simulator
   artifacts, which can be private. Reject recognizable credential formats in
   selected text; arbitrary user-embedded secrets cannot be reliably detected.
   Operators must review selected text. Never claim automatic sanitization.
3. Inventory omitted data and each unavailable/changed/unsafe artifact. Only read
   the fixed `<workspace UUID>/<run UUID>.json` simulator artifact when its
   recorded hash and canonical fixed JSON identity/content match. Bound files,
   bundle bytes, run count and event count. Reject symlinks/non-regular files, hardlinks and
   traversal; never extract an archive-supplied path. Use nonblocking file opens.
4. Validate the complete envelope/schema/digest/identities/cursor ordering and
   included artifact hashes before import. Reject unsupported versions, unknown
   fields, duplicates, invalid states and corrupt/missing included content with
   fixed errors that do not echo source data. Hash integrity is not authenticity.
5. Restore into a separate private, application-identified history SQLite store.
   Insert the immutable bundle and its import event atomically; identical bundle
   imports return the original receipt. A restarted independent process can list
   and read history with no original database, workspace files or hosted service.
   Never write imports into executable workspace/run/provider tables.
6. Every restored view is read-only, historical/untrusted and simulated. Preserve
   original status; present queued/running/cancelling/uncertain runs as
   `needs_attention`. Imported completion/verification never becomes fresh trusted
   evidence, execution authority or PR readiness. Restore dispatches no command,
   provider request, agent turn, script, push or PR.
7. Provide documented `export`, `inspect`, `restore`, `list` and `show` commands.
   Export files are private, bounded and never overwritten; sensitive content is printed
   only by explicit inspect/show. Test round-trip, restart, duplicate import,
   transaction rollback, corruption, bounds, unsafe paths/files, secret exclusion,
   and preservation of uncertainty. Run `npm run check` and review the actual diff.

## Limits and subsequent slices

This is real export/restore of the existing simulator's history, not a simulated
export operation. All exported work remains simulated. The exporter rejects real
local workspaces, including those without completed runs; this CLI cannot move
Claude Code history to another machine. It does not satisfy M1d's
fresh-machine drill or restore cloud storage, Git changes, transcripts from real
agents, credentials, provider operations, approvals or live sessions. No Conductor
archive schema or private user data is inspected. Desktop selection/preview and
history browsing should reuse this format behind the existing narrow bridge.

The immediate cloud critical path remains production secret custody, approved
isolation/resource limits and live M1a checkout/cleanup. Basic branch/worktree and
setup/run/review/archive workflows belong to the personal replacement path;
dependency scheduling and team coordination are later work.

## Using the offline CLI

Run on Node 22.19.x with the root dependencies installed. Choose an existing
M0/P1 workspace UUID from the desktop or authenticated loopback workspace list.
Supply the source data directory explicitly; the command discovers no profiles,
credentials, user archives or arbitrary files. These examples use a standalone
`.data` profile. Use its actual database/workspace paths for a desktop profile.

```sh
mkdir -m 700 .data/history-export
npm run continuity -- export --database .data/platform.sqlite --workspaces .data/workspaces --workspace WORKSPACE_UUID --out .data/history-export/workspace.json
npm run continuity -- inspect --bundle .data/history-export/workspace.json
npm run continuity -- restore --bundle .data/history-export/workspace.json --history .data/history-export/history.sqlite
npm run continuity -- list --history .data/history-export/history.sqlite
npm run continuity -- show --history .data/history-export/history.sqlite --id IMPORT_SHA256
```

Replace the uppercase placeholders. `list` supports `--limit 1..100` and `--before`
with its returned `nextCursor`. `show` identifies an import by the payload digest
returned by export/restore. Use the same exported file for an idempotent duplicate
restore; making another export deliberately creates another snapshot identity.

Default metadata exports omit task/log/resolution text and artifact bodies. To
select that private content, append `--include-text` to export and choose a new
output filename. Review the source text for secrets first. Known credential
markers reject the export; this is not a general secret sanitizer. `inspect` and
`show` print selected content as JSON. Other success output contains receipts and
counts only. Do not publish bundles or redirect private text into shared logs.

Copy only the selected JSON bundle to an independent installation with this source
and runtime, then restore into a private `700` directory. Files are `600`; export
never overwrites a destination. Local paths must resolve without symlinks (on
macOS, use `/private/tmp` rather than the `/tmp` alias). Owner-controlled local
storage is assumed; this is not protection against a hostile process with the
same OS identity or SQLite on a network filesystem.

Limits: 16 MiB encoded bundle/source selected-data budget, 500 runs, 20,000 events,
32 KiB per simulator artifact. Overflow rejects the whole export. Artifact
availability is explicit: included, excluded, missing, changed or unsafe. No
archive-supplied file is extracted or executed. A checksum detects corruption;
anyone who can rewrite a bundle can recompute it, so imported evidence always
remains historical/untrusted.

## Implementation evidence — 7 November 2026

Implemented on the unchanged branch and main base above. Final root
`npm run check` passes strict types, formatting, build and **364 tests,
0 failures, 0 skips**, including **44 new continuity tests** in
`tests/continuity.test.ts`. They exercise real simulator export/artifacts,
full history beyond API page sizes, metadata/authority/credential exclusions,
opt-in credential-marker denial, active/uncertain state preservation,
independent process recovery without source data, restart/duplicate import,
transaction rollback, committed-snapshot consistency, lifecycle rejection,
unsupported/corrupt/oversize bundles, schema/identity/cursor bounds, canonical
artifact identity, unsafe files and CLI errors/pagination. No network or target
repository workload runs in these tests.

The implementing agent reviewed the actual source/test/docs diff, including
exact-length/newline identity checks and duplicate-key artifact rejection.
The validation log and runtime hash manifest are kept locally, outside Git.
No external review, measured coverage, fresh-machine, native desktop/package,
website, live-provider or iOS verification is claimed. All original scope limits
remain. Next slices are desktop preview/read-only history, real transcript/Git
manifests and the full independent recovery drill; cloud M1a remains the critical
path under its original credential/isolation/resource gates.
