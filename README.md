# Argent

A desktop-first, open-source, self-hostable development platform where
coding agents work in persistent environments and developers reconnect to inspect
verifiable results.

The name combines **argento**, Italian for silver and a conductor, with **agent**.
Repository: [GregPat22/argent](https://github.com/GregPat22/argent).

**New worktree or agent? Read [START_HERE.md](START_HERE.md).** For website design,
use the [landing-page brief](docs/briefs/landing-page.md). Claude Code also has a
root [CLAUDE.md](CLAUDE.md) entry point pointing to the shared context and rules.

## Project context and documentation

Start with [Project context](docs/PROJECT_CONTEXT.md), the
[documentation index](docs/README.md), [decision register](docs/DECISIONS.md) and
[Contributing](CONTRIBUTING.md). The [P1 completion report](docs/milestones/0001-completion.md)
and [pinned T3 source evaluation](docs/research/t3-adoption-spike.md) record the
latest completed work and its limits.

The [updated roadmap](ROADMAP.md) incorporates the
[Conductor shutdown findings](docs/research/conductor-shutdown-analysis.md):
provider-specific authentication validation, visible execution/control, portable
export/restore, and staged agent breadth/team handoff before dependency orchestration.
These are planned capabilities; P1 execution remains simulated.

**Current milestone: P1, a working local desktop prototype.** Install and launch
Argent as an application, create a workspace, submit a task, inspect live activity
and verified artifacts, close the window and reconnect to persisted work. The
execution service remains independent of the desktop client. A website source
provides the download entry point and serves the generated local build.

**Execution is simulated.** A scripted adapter writes a JSON artifact, which a
separate verifier checks. There is no real GitHub authorization, repository
checkout, AI agent, cloud compute or pull request. The desktop architecture keeps
those next integrations behind the existing headless engine.

Next engineering milestone: [M1a repository access and workspace lifecycle](docs/specs/0007-cloud-workspace-lifecycle.md). The current core is retained for bounded M1a. Internal simulation-only lifecycle and repository-bootstrap queues exercise durable operations, read-only credential policy and audited bootstrap resolution. Fresh independent cleanup observations can resolve blocked simulated bootstrap attempts as failed, preserving their audit history. Durable secret custody, real recovery/cleanup, live GitHub access, isolated checkout and approved provider validation remain next.

## Tech Stack

| Layer                | Technology                                                  | Rationale                                                                  |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| Runtime              | Node.js 22.19.x, strict TypeScript                          | Runs in this environment and matches official agent SDK ecosystems.        |
| Desktop              | Electron 45.2.3, packaged HTML/CSS/TypeScript               | Installable app with sandboxed renderer and a narrow privileged bridge.    |
| API                  | Node HTTP, JSON and cursor polling                          | Desktop main process brokers authenticated calls; no renderer credentials. |
| M0 persistence       | Built-in SQLite, WAL, full synchronous commits              | Real cross-process durability without provisioning a database.             |
| Managed target       | PostgreSQL and an independent worker                        | Shared authoritative state outside suspended workspace compute.            |
| Cloud recommendation | E2B, behind an adapter                                      | Managed path and an open-source self-host runtime; not integrated yet.     |
| First real agent     | Codex, using official interfaces and API-key authentication | Server-side integration; not integrated yet.                               |
| Checks               | Node test runner, TypeScript, Prettier                      | Small toolchain with meaningful process-level tests.                       |

The built-in SQLite API is experimental in the tested Node release. M0 is a
single-host development prototype, not a multi-tenant production deployment.

## Architecture Overview

The API commits a run and its initial event to SQLite. A worker
claims it transactionally, records logs and independently verifies an artifact
before completion. API requests do not own the running operation. A new client
can read the run and replay events after its last cursor, including after API
process death. A lost worker lease produces `needs_attention`, never an automatic
retry. Workspace stop/start changes lifecycle metadata while retaining files.
The desktop starts or reconnects to a detached local service containing the API
and worker loop. Standalone API/worker commands still support separate processes.
Closing or quitting Argent keeps the local service running; stop it explicitly
through the app. Local execution still requires this computer to remain awake.

See [ARCHITECTURE.md](ARCHITECTURE.md), [research and recommendations](docs/research/technical-due-diligence.md),
[VISION.md](VISION.md) and [ROADMAP.md](ROADMAP.md).

## Project Structure

`src/` contains the API boundary, durable store, worker and narrow simulation
adapter contracts. They remain modules in one package until deployment or ownership
requires splitting packages. `tests/` covers state transitions and real process
death/reconnection. `scripts/` holds a runnable demo and its process harness.
`docs/specs/` distinguishes the implemented M0 contract from the actual cloud MVP.
`docs/research/` records dated primary sources and decisions that still need proof.
`src/desktop/` owns the privileged shell/bridge and detached service; `ui/` is the
credential-free renderer. `website/` is the unpublished download-page source.
`release/` contains generated installers/builds and is ignored with runtime data.

## Getting Started

### Prerequisites

Node.js **22.19.0** (tested), npm **10.9.3**, and Git. Node 22 releases at or above
22.19.0 are accepted; CI uses the tested version. No Docker, cloud account or model
credential is needed for M0. Reassess the supported production runtime before M1.

### Environment Setup

**Desktop:** no environment setup or account is needed. Argent creates a private
local service credential and stores application data in
`~/Library/Application Support/Argent/`. Workspace/task selections persist in the
app profile. No credentials are stored in renderer preferences. Development and
smoke tests can use `ARGENT_DESKTOP_DATA_DIR` to choose an isolated data directory.

**Optional standalone API:** copy `.env.example` to `.env`, replace the token with a
unique value of at least 32 characters, and retain the same `PLATFORM_DATA_DIR`
for API and worker. Generate a token with:

```sh
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

The start scripts load `.env` if present. The demo supplies its own disposable
operator token and a unique data directory. Do not use that known demo token for
an operator deployment.

### Installation & Running

```sh
npm ci
npm run check
npm run desktop
```

For a self-contained macOS Apple Silicon build:

```sh
npm run desktop:smoke
npm run desktop:package
open release/Argent-darwin-arm64/Argent.app
```

Packaging produces `release/Argent-0.0.1-macos-arm64.zip` and a `.zip.sha256`
checksum. The app bundles its runtime; an installed user does not need global
Node or a terminal. This is an unsigned, unnotarized local preview, not a public
release. Do not bypass OS security prompts; public distribution still needs
Developer ID signing/notarization and an update/release process. Windows, Linux
and Intel Mac packages have not been built or tested.

`npm run site:preview` serves the unpublished website at
`http://127.0.0.1:4320` after the smoke screenshot and package exist. Its download
links stream the actual local archive and checksum. Nothing is uploaded.

The interactive landing draft is a separate Next.js package in `website/`:
run `cd website`, `npm ci` and `npm run dev` for `http://localhost:3000`.
See [the website README](website/README.md) for its build and browser checks.
This leaves the static desktop download preview and packaging independent.

`npm run demo` remains available for the headless M0 demonstration:

The demo launches real API and worker processes, submits a simulated task, kills
the API process, starts another API, reconnects and prints verified simulation
history. It stops its processes and preserves the demo database and artifact in
the printed `.data/demo-<id>` directory.

To operate the API manually, build once and run these in separate terminals:

```sh
npm run build
npm run start:api
```

```sh
npm run start:worker
```

The API binds only `127.0.0.1:4310`. Supply `Authorization: Bearer <your token>`
on every request. This optional mode uses `.data/` independently of the desktop
application's profile. No remote ingress is configured.

| Method | Route                                       | Input / behavior                                                                                 |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| GET    | `/health`                                   | Authenticated milestone/status information.                                                      |
| POST   | `/workspaces`                               | `{"repository":"https://github.com/owner/repo"}`; metadata only.                                 |
| GET    | `/workspaces?limit=50&before=<id>`          | Keyset-paginated persistent workspace list.                                                      |
| GET    | `/workspaces/:id/runs?limit=50&before=<id>` | Keyset-paginated task history.                                                                   |
| GET    | `/workspaces/:id`                           | Read persisted workspace state.                                                                  |
| POST   | `/workspaces/:id/stop` or `/start`          | Preserve identity and files; refuse active/uncertain work.                                       |
| POST   | `/runs`                                     | `{"workspaceId":"…","task":"…","maxRuntimeMs":30000}`; requires `Idempotency-Key`.               |
| GET    | `/runs/:id`                                 | Status and limits; worker fencing token omitted.                                                 |
| GET    | `/runs/:id/events?after=0&limit=100`        | Ordered events and `nextCursor`; persist the cursor to reconnect.                                |
| POST   | `/runs/:id/cancel`                          | Persist cancellation; active work acknowledges cooperatively.                                    |
| GET    | `/runs/:id/artifact`                        | Read the actual artifact after checking its committed SHA-256.                                   |
| POST   | `/runs/:id/resolve`                         | `{"note":"Reviewed; abandon this simulation"}`; audited abandonment of uncertain simulated work. |

Submission with the same key and identical payload returns the original run.
Changed payload returns 409. Events page at 100 items maximum. Runtime is bounded
to 100–300,000 ms; default 30 seconds. A run can emit at most 100 log events, each
at most 2,048 characters; request bodies are capped at 16 KiB.

`needs_attention` intentionally blocks further workspace mutations. P1 adds an
explicit review note and abandonment action for simulated runs. It never retries
the old task or removes evidence. Real-provider reconciliation and deletion remain
M1 work. The desktop service also exposes authenticated `/service/stop`; this is
not enabled in optional standalone API mode.

## Development

### Available Scripts

| Script                    | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `npm run build`           | Compile source, tests and scripts into `dist/`.                |
| `npm run typecheck`       | Strict compile checks without output.                          |
| `npm run format`          | Apply Prettier to maintained project files.                    |
| `npm run format:check`    | Check formatting without edits.                                |
| `npm test`                | Build and run all unit and process integration tests.          |
| `npm run check`           | Typecheck, formatting and all tests.                           |
| `npm run start:api`       | Run the built loopback API.                                    |
| `npm run start:worker`    | Run the built independent worker.                              |
| `npm run demo`            | Build and demonstrate API restart/reconnection.                |
| `npm run desktop`         | Build and launch the native desktop prototype.                 |
| `npm run desktop:smoke`   | Exercise the actual Electron app and capture its UI.           |
| `npm run desktop:package` | Build a self-contained local macOS arm64 app and zip/checksum. |
| `npm run site:preview`    | Serve the download-page source and real local artifacts.       |

### Code Style & Conventions

Strict TypeScript, ESM imports, parameterized SQL and transactional state/event
changes. Use written specifications and focused branches (`feat/…`, `fix/…`),
conventional commit messages, and small reviewed PRs when a remote is configured.
Read [AGENTS.md](AGENTS.md). A dependency lockfile is committed; installs disable
dependency lifecycle scripts in CI. Electron is bundled into the desktop build;
the headless execution modules have no external runtime npm dependencies.

### Testing

Tests use Node's built-in runner and temporary on-disk databases. Process tests
start independent Node processes, kill API/worker processes, race claims, and
verify durable history. They need permission to bind loopback and spawn processes.
No billable API is called. Simulation evidence checks an actual artifact's identity
and SHA-256; it says nothing about a real repository's tests.

`desktop:smoke` requires a macOS GUI session. It drives the actual renderer through
workspace/task forms, artifact inspection, window close/reopen, cancellation and
service stop/reconnect. It asserts no renderer Node access, and checks the detached
service survives desktop process exit. Test profiles are cleaned up; the captured
image remains in `.context/argent-desktop.png`.

## Deployment

P1 is for a single trusted host on loopback. Persist the entire data directory
on local storage. SQLite is not supported over network filesystems or across
multiple hosts. Stopping the API does not stop the worker; stopping the host
does. Website source and a local desktop archive are provided; there is no public
website deployment or signed release. TLS, user/tenant authorization,
PostgreSQL, credential brokering, isolated execution, quotas and backups must be
implemented before a managed or remotely accessible release.

## Contributing

Start from a specification with acceptance criteria, implement a focused change,
run `npm run check`, review the actual diff, and report gaps honestly. No upstream
application has been forked or copied. The original code uses the [MIT license](LICENSE).
Any upstream adoption needs a pinned-source/license review and founder approval.

The [P2 desktop layout](docs/specs/0008-conductor-familiar-desktop.md) follows familiar
Conductor workspace/session, composer, inspection and terminal placement. Run
`npm run desktop` to inspect it. Home/Search uses loaded saved workspaces; Settings
previews Claude Code, Codex, Cursor, OpenCode, migration and mobile. Only the scripted
local simulator is connected. These previews do not implement sign-in, a terminal,
repository checkout/diffs, file transfer or a mobile app. The [roadmap](ROADMAP.md)
now prioritizes those replacement capabilities before teams/dependency graphs.

The [desktop UX refinement](docs/specs/0009-desktop-ux-polish.md) adds bundled
Lucide icons, keyboard-accessible tabs/search, workspace-specific composer drafts,
clearer forms and reduced-motion transitions throughout the installed app.
Cmd/Ctrl+Enter reviews a draft before starting; it does not send directly to an
agent. Required icon notices are included in [the icon bundle](ui/icons/README.md).
