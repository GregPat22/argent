# Start here: Argent

Argent is an **open-source, desktop-first platform for developers to delegate work
to AI coding agents in persistent local or cloud workspaces, inspect independent
verification evidence and retain control of changes**.

The name combines _argento_ (Italian for silver, a conductor) with _agent_. Users
will visit a website, download Argent, install it and launch the desktop app.
The installed client controls an independent execution service. Persistent cloud
execution remains part of the product, even though its primary client is desktop.

## Read the context for your task

**Latest progress and branch locations:** [HANDOFF.md](HANDOFF.md). Current branch
`GregPat22/conductor-layout-create` started at `333d662` (PR #8) and now integrates
main `9eac908` (PR #11), including audited recovery and encrypted simulated
repository credential custody.
It adds a familiar Conductor-style raw desktop shell and reprioritizes subscriptions,
cloud migration and mobile before team/dependency orchestration. See
[spec 0008](docs/specs/0008-conductor-familiar-desktop.md) and the
[roadmap](ROADMAP.md). Execution remains simulated; real connections, migration and
mobile are planned. The website remains unpublished.

| Task                             | Read first                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Understand the product           | [Project context](docs/PROJECT_CONTEXT.md), [vision](VISION.md)                                                                     |
| Design or build the landing page | [Landing-page brief](docs/briefs/landing-page.md)                                                                                   |
| Change code                      | [AGENTS.md](AGENTS.md), [architecture](ARCHITECTURE.md), relevant [specification](docs/README.md#acceptance-contracts-and-evidence) |
| Understand why choices were made | [Decision register](docs/DECISIONS.md), [founding brief](docs/FOUNDING_BRIEF.md)                                                    |
| Find all documentation           | [Documentation index](docs/README.md)                                                                                               |

This branch contains the tested **P1 local desktop prototype**, using M0
simulated execution. See the [completion report](docs/milestones/0001-completion.md). Real cloud workspaces, official coding-agent
execution and a tested-PR flow are future acceptance contracts, not live features
in this revision. The source repository is public and MIT-licensed. No published
production download, approved pricing or customer proof is established here.

Next engineering contract: [M1a repository access and workspace lifecycle](docs/specs/0007-cloud-workspace-lifecycle.md). Retain the current core for bounded implementation. The internal lifecycle, repository-bootstrap and audited recovery harnesses are simulated; production key custody, audited recovery cleanup, live GitHub access, isolated checkout and approved provider validation remain next.

## If this folder appears empty

An agent can read only the checkout it has. A Git worktree does not automatically
follow later pushes to GitHub. Documentation existing on another branch, in a chat
or elsewhere on the machine does not mean it is present in this worktree.

Inspect the checkout before searching unrelated services or asking for the product
brief again:

```sh
git status --short --branch
git remote -v
git log -3 --oneline
git fetch origin
git log -3 --oneline origin/main
git ls-tree --name-only origin/main
```

The source remote is `https://github.com/GregPat22/argent.git`. If `origin/main`
contains these documents but the working tree does not, preserve local work and
bring the branch up to date using the project's normal Git workflow. Do not
overwrite or reset another agent's changes. If the branch is clean and simply
behind its ancestor, `git merge --ff-only origin/main` can update it safely. A
diverged branch or unrelated empty initial commit needs an explicit branch repair,
not repeated claims that Argent has no description. Ask for help if unsure.

## What is still a founder decision

The shutdown review is saved in tracked documents. Serve the three overlapping
audiences through a shared core and staged delivery. Supported subscription
sign-in is the preferred product direction; API keys remain the technical-pilot
baseline and alternative. Managed eligibility is unverified. Add portable
export/restore and visible control before managed release; subscription breadth,
migration and mobile now precede team handoff and dependency orchestration. These are planned, unimplemented work.
Read the [research](docs/research/conductor-shutdown-analysis.md) and
[continuity contract](docs/specs/0006-continuity-and-market-validation.md).
Do not ask the founder to choose only one of these audiences again.

The product purpose, desktop requirement, open-source intent and desire for a
high-impact animated landing-page draft are recorded. Final branding, page
language, conversion CTA and commercial packaging are not approved here.
Propose design options as drafts and ask concise questions about those choices.
You do not need to ask what Argent is again.
