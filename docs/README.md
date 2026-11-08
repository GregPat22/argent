# Argent documentation

Start with the [README](../README.md) for what works today, then the
[architecture](../ARCHITECTURE.md) and [roadmap](../ROADMAP.md). The desktop app
runs Claude Code in local worktrees as the first part of the local MVP
([spec 0013](specs/0013-local-mvp.md)), which is in development; cloud execution
and signed public distribution follow.

## Product and decisions

| Document                                                       | What it contains                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [Vision](../VISION.md)                                         | Desktop-first product experience, cloud persistence and open-source goals.                           |
| [Roadmap](../ROADMAP.md)                                       | Milestone sequencing and the evidence each milestone needs.                                          |
| [Architecture](../ARCHITECTURE.md)                             | Process boundaries, state machine, recovery, verification and security.                              |
| [Decision register](DECISIONS.md)                              | Accepted requirements, provisional choices, reasons and open decisions.                              |
| [Technical due diligence](research/technical-due-diligence.md) | Dated comparisons of foundations, infrastructure and agent interfaces. Recheck before adopting them. |
| [T3 Code source evaluation](research/t3-adoption-spike.md)     | Source-only evaluation of an alternative foundation at a pinned revision.                            |

## Acceptance contracts

Each behavior change starts from one of these specs. Status is as of the latest
recorded revision.

| Spec                                                                                      | Status                                                                              |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [0001 Durable local run](specs/0001-durable-local-run.md)                                 | Implemented (M0), simulated execution.                                              |
| [0002 Cloud MVP to a tested PR](specs/0002-cloud-mvp.md)                                  | Planned real-provider release contract.                                             |
| [0003 Project identity](specs/0003-project-identity.md)                                   | Name, license rationale, metadata and namespace check.                              |
| [0004 Desktop prototype](specs/0004-desktop-prototype.md)                                 | Implemented local macOS prototype (P1).                                             |
| [0006 Portable continuity](specs/0006-portable-continuity.md)                             | Managed-release requirements; the first offline slice is implemented in 0012.       |
| [0007 Repository access and workspace lifecycle](specs/0007-cloud-workspace-lifecycle.md) | Lifecycle, bootstrap, custody and cleanup simulations implemented; live gates open. |
| [0008 Desktop workspace shell](specs/0008-desktop-workspace-shell.md)                     | Implemented layout (P2); real integrations planned.                                 |
| [0009 Desktop UX and icons](specs/0009-desktop-ux-polish.md)                              | Implemented refinement (P2.1).                                                      |
| [0010 Live repository pilot gates](specs/0010-live-repository-pilot-gates.md)             | The credential, authorization and isolation gates before live repository access.    |
| [0011 GitHub device sign-in pilot](specs/0011-github-device-pilot.md)                     | Implemented opt-in read-only pilot, not connected to the desktop.                   |
| [0012 Portable history](specs/0012-portable-history.md)                                   | Implemented offline export and read-only restore, with commands.                    |
| [0013 Local MVP](specs/0013-local-mvp.md)                                                 | Critical path: L1.1 engine and L1.2 desktop implemented; later slices planned.      |

Spec 0005 (the landing-page draft) is maintained privately with the website's
design history.

[0014 CI test determinism](specs/0014-ci-test-determinism.md) records the
in-development timing and service-teardown regression criteria and evidence.

## Milestone reports

- [M0 completion](milestones/0000-completion.md): the durable engine's test and
  review evidence, with limits.
- [P1 completion](milestones/0001-completion.md): the local desktop prototype's
  native and package evidence.

## Build and contribute

- [README quick start](../README.md#quick-start) and [commands](../README.md#development).
- [Contributing](../CONTRIBUTING.md): how to scope, implement, verify and review work.
- [Engineering instructions](../AGENTS.md): mandatory repository rules, for people
  and coding agents.
- [Security policy](../SECURITY.md) and the [MIT license](../LICENSE).

## Keeping the docs reliable

The implementation, focused tests and fresh results establish current behavior.
Specs define acceptance and the roadmap records intent; a historical completion
report does not certify later revisions. Fix the docs when those sources disagree,
and link every new spec or completion report from this index. A provider
recommendation is not permission to provision it. Keep secrets, private notes,
transcripts, customer data, local databases and generated artifacts out of Git.
