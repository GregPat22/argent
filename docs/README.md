# Argent documentation

Start with [Project context](PROJECT_CONTEXT.md) to understand the product and
current limits without reading private chats. The published runtime is M0, a
local orchestration simulator. Desktop and real cloud execution are requirements
for later milestones.

## Product and decisions

Read the [current handoff](../HANDOFF.md) first for the completed P1 review branch,
evidence, Conductor worktree setup and next actions. The M0 descriptions here
refer to the default branch's runtime until P1 is integrated.

| Document                                                       | What it contains                                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [Project context](PROJECT_CONTEXT.md)                          | Product journey, current versus target capabilities, architecture invariants, business intent and next work.   |
| [Founding brief](FOUNDING_BRIEF.md)                            | The original founder brief, preserved with the later desktop clarification and historical-status caveat.       |
| [Vision](../VISION.md)                                         | Desktop-first product experience, cloud persistence and open-source goals.                                     |
| [Decision register](DECISIONS.md)                              | Accepted requirements, provisional choices, reasons and unresolved decisions.                                  |
| [Roadmap](../ROADMAP.md)                                       | Milestone sequencing and required exit evidence.                                                               |
| [Architecture](../ARCHITECTURE.md)                             | Process boundaries, state machine, recovery, verification and security.                                        |
| [Technical due diligence](research/technical-due-diligence.md) | Dated primary-source comparisons of foundations, infrastructure and agent interfaces. Recheck before adoption. |

## Acceptance contracts and evidence

| Document                                                                | Status in this publication                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [M0 durable local run](specs/0001-durable-local-run.md)                 | Implemented simulation contract.                                   |
| [M0 completion report](milestones/0000-completion.md)                   | Actual test and review evidence, with limits.                      |
| [M1 persistent cloud workspace to tested PR](specs/0002-cloud-mvp.md)   | Proposed real-provider release contract; unimplemented here.       |
| [Project identity and repository setup](specs/0003-project-identity.md) | Name, MIT rationale, metadata and namespace availability.          |
| [P1 downloadable desktop prototype](specs/0004-desktop-prototype.md)    | Accepted product requirements; implementation proceeds separately. |
| [W0 website landing page draft](specs/0005-website-landing-draft.md)    | Draft in `website/`; not deployed.                                 |

## Build and contribute

- [README quick start and API reference](../README.md#getting-started): tested
  runtime, environment settings, demo, routes and commands.
- [Contributing](../CONTRIBUTING.md): how to scope, implement, verify and review work.
- [Engineering instructions](../AGENTS.md): mandatory repository constraints.
- [MIT license](../LICENSE): terms for the original code.

## Keeping the context reliable

Use the implementation, focused tests and fresh results to establish current
behavior. Specs define acceptance; a roadmap records intent. A historical
completion report does not certify later revisions. Correct the docs when those
sources disagree. A provider recommendation is not permission to provision it.

Record decisions and limitations in Git rather than relying on a chat or an agent
session ID. Link every new specification or completion report from this index.
Keep secrets, private transcripts, customer data, local databases and generated
artifacts out of source control. The founding brief is included as intentionally
published product context; unrelated chat history is not part of this repository.

## Latest completed work outside main's runtime

- [P1 completion report](milestones/0001-completion.md): completed local desktop
  prototype and recorded native/package evidence; source is in draft PR #1.
- [Pinned T3 source evaluation](research/t3-adoption-spike.md): source-only
  evaluation at an exact revision; runtime conformance remains open.
- [Development handoff](../HANDOFF.md): exact branches, sources, tests, limits,
  Conductor worktree guidance, active website overlap and next actions.
