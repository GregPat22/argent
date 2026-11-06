# Argent

A headless foundation for an open-source, self-hostable development platform where
coding agents work in persistent environments and developers reconnect to inspect
verifiable results.

The name combines **argento**, Italian for silver and a conductor, with **agent**.
Repository: [GregPat22/argent](https://github.com/GregPat22/argent).

**Product direction: a downloadable desktop app.** Developers will download Argent
from our website, install it locally and launch it like Conductor. The desktop
client will control both local and persistent cloud execution; the headless engine
below remains independent of the interface. The website is the download and
documentation entry point. Desktop packaging is the next prototype milestone.

**Current milestone: M0, a local orchestration simulator.** The API, durable queue,
worker, crash reconciliation and reconnectable event history work. A scripted
adapter writes a JSON artifact, which a separate verifier checks. There is no real
GitHub connection, repository checkout, AI agent, cloud compute or pull request.

## Project context and documentation

Start with [Project context](docs/PROJECT_CONTEXT.md) for the product, accepted
decisions, implementation status, business direction and next work. The
[documentation index](docs/README.md) links the original founder brief, decision
register, architecture, research, milestone reports and acceptance specifications.
Read [Contributing](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before changes.

This initial publication contains the tested M0 foundation and accepted desktop
requirements. Active prototype work is separate; there is no downloadable desktop
release in this revision.

## Tech Stack

| Layer                | Technology                                                  | Rationale                                                              |
| -------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Runtime              | Node.js 22.19.x, strict TypeScript                          | Runs in this environment and matches official agent SDK ecosystems.    |
| API                  | Node HTTP, JSON and cursor polling                          | Small headless interface; browser framework can follow.                |
| M0 persistence       | Built-in SQLite, WAL, full synchronous commits              | Real cross-process durability without provisioning a database.         |
| Managed target       | PostgreSQL and an independent worker                        | Shared authoritative state outside suspended workspace compute.        |
| Cloud recommendation | E2B, behind an adapter                                      | Managed path and an open-source self-host runtime; not integrated yet. |
| First real agent     | Codex, using official interfaces and API-key authentication | Server-side integration; not integrated yet.                           |
| Checks               | Node test runner, TypeScript, Prettier                      | Small toolchain with meaningful process-level tests.                   |

The built-in SQLite API is experimental in the tested Node release. M0 is a
single-host development prototype, not a multi-tenant production deployment.

## Architecture Overview

The API commits a run and its initial event to SQLite. An independent worker
claims it transactionally, records logs and independently verifies an artifact
before completion. API requests do not own the running operation. A new client
can read the run and replay events after its last cursor, including after API
process death. A lost worker lease produces `needs_attention`, never an automatic
retry. Workspace stop/start changes lifecycle metadata while retaining files.

See [ARCHITECTURE.md](ARCHITECTURE.md), [research and recommendations](docs/research/technical-due-diligence.md),
[VISION.md](VISION.md) and [ROADMAP.md](ROADMAP.md).

## Project Structure

`src/` contains the API boundary, durable store, worker and two narrow adapter
interfaces. They remain modules in one package until deployment or ownership
requires splitting packages. `tests/` covers state transitions and real process
death/reconnection. `scripts/` holds a runnable demo and its process harness.
`docs/specs/` distinguishes the implemented M0 contract from the actual cloud MVP.
`docs/research/` records dated primary sources and decisions that still need proof.
Generated files and runtime state are ignored by Git.

## Getting Started

### Prerequisites

Node.js **22.19.0** (tested), npm **10.9.3**, and Git. Node 22 releases at or above
22.19.0 are accepted; CI uses the tested version. No Docker, cloud account or model
credential is needed for M0. Reassess the supported production runtime before M1.

### Environment Setup

For the standalone API, copy `.env.example` to `.env`, replace the token with a
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
npm run demo
```

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
on every request. No browser UI or remote ingress is configured.

| Method | Route                                | Input / behavior                                                                   |
| ------ | ------------------------------------ | ---------------------------------------------------------------------------------- |
| GET    | `/health`                            | Authenticated milestone/status information.                                        |
| POST   | `/workspaces`                        | `{"repository":"https://github.com/owner/repo"}`; metadata only.                   |
| GET    | `/workspaces/:id`                    | Read persisted workspace state.                                                    |
| POST   | `/workspaces/:id/stop` or `/start`   | Preserve identity and files; refuse active/uncertain work.                         |
| POST   | `/runs`                              | `{"workspaceId":"…","task":"…","maxRuntimeMs":30000}`; requires `Idempotency-Key`. |
| GET    | `/runs/:id`                          | Status and limits; worker fencing token omitted.                                   |
| GET    | `/runs/:id/events?after=0&limit=100` | Ordered events and `nextCursor`; persist the cursor to reconnect.                  |
| POST   | `/runs/:id/cancel`                   | Persist cancellation; active work acknowledges cooperatively.                      |

Submission with the same key and identical payload returns the original run.
Changed payload returns 409. Events page at 100 items maximum. Runtime is bounded
to 100–300,000 ms; default 30 seconds. A run can emit at most 100 log events, each
at most 2,048 characters; request bodies are capped at 16 KiB.

`needs_attention` intentionally blocks further workspace mutations. M0 has no
resolution or deletion endpoint: preserve and inspect the data; use a new
workspace for another simulation. M1 must add an audited reconciliation workflow.

## Development

### Available Scripts

| Script                 | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `npm run build`        | Compile source, tests and scripts into `dist/`.       |
| `npm run typecheck`    | Strict compile checks without output.                 |
| `npm run format`       | Apply Prettier to maintained project files.           |
| `npm run format:check` | Check formatting without edits.                       |
| `npm test`             | Build and run all unit and process integration tests. |
| `npm run check`        | Typecheck, formatting and all tests.                  |
| `npm run start:api`    | Run the built loopback API.                           |
| `npm run start:worker` | Run the built independent worker.                     |
| `npm run demo`         | Build and demonstrate API restart/reconnection.       |

### Code Style & Conventions

Strict TypeScript, ESM imports, parameterized SQL and transactional state/event
changes. Use written specifications and focused branches (`feat/…`, `fix/…`),
conventional commit messages, and small reviewed PRs against `main`.
Read [AGENTS.md](AGENTS.md). A dependency lockfile is committed; installs disable
dependency lifecycle scripts in CI. There are no production package dependencies.

### Testing

Tests use Node's built-in runner and temporary on-disk databases. Process tests
start independent Node processes, kill API/worker processes, race claims, and
verify durable history. They need permission to bind loopback and spawn processes.
No billable API is called. Simulation evidence checks an actual artifact's identity
and SHA-256; it says nothing about a real repository's tests.

## Deployment

M0 is for a single trusted host on loopback. Persist the entire data directory
on local storage. SQLite is not supported over network filesystems or across
multiple hosts. Stopping the API does not stop the worker; stopping the host
does. There is no cloud deployment artifact yet. TLS, user/tenant authorization,
PostgreSQL, credential brokering, isolated execution, quotas and backups must be
implemented before a managed or remotely accessible release.

## Contributing

Start from a specification with acceptance criteria, implement a focused change,
run `npm run check`, review the actual diff, and report gaps honestly. No upstream
application has been forked or copied. The original code uses the [MIT license](LICENSE).
Any upstream adoption needs a pinned-source/license review and founder approval.
