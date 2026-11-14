# Vision

Argent aims to be the easiest open-source environment for running several coding
agents under consistent, enforceable project rules, with evidence of completion
that Argent collects itself. Reliability, observable evidence and controllable
execution matter more than how many agent terminals fit on a screen.

This page states the goal and the beliefs behind it. It does not describe what
works today: the [README](README.md#what-works-today) does, and the
[roadmap](ROADMAP.md) gives the order of work.

## What Argent believes

- **An agent's claim is not proof.** A result counts when a check Argent ran
  says so for the exact commit, and it stops counting when the code changes.
  "Checks passed" means the named checks passed on a known state. It never means
  the code is correct, safe or free of defects.
- **Rules are named by what enforces them.** A project rule reaches an agent in
  one of four ways: guidance the agent is given, a check Argent runs afterwards,
  a gate that blocks a step such as a pull request until a check passes, or a
  control that prevents an action before it happens. Argent never presents one
  as another. A check after the fact can stop delivery; it cannot undo a command
  that already ran. Where Argent cannot check a rule, it says so.
- **The same rules for every agent.** Rules belong to the project, not to one
  model or one agent's instructions file. They are read from a state the agent
  cannot change, and a person approves them.
- **Parallel work is coordinated in the open.** Separate worktrees keep changes
  apart; they do not make them fit together. Planned: work that must fit
  together is linked, and a link carries a check Argent can run. It is never a
  private channel between agents and never grants access.
- **People keep authority.** Automation removes manual coordination. It does not
  hide a consequential decision. Sensitive operations, exceptions and merging
  stay with a person.
- **Developers own their workflow.** The core stays usable independently of any
  hosted service, including ours, and of any one model, agent or infrastructure
  vendor. History and evidence are portable.
- **Easy means clear, not hidden.** Clear state, safe defaults and little setup.
  A developer with one agent and one workspace gets the full value of rules and
  evidence without learning anything built for many.
- **Rules worth sharing.** The long-term aim, with nothing built or scheduled:
  developers share reusable sets of checks and rules that anyone can read, pin
  to a version and adapt. A shared rule set is code from a stranger: it is never
  run merely because it is popular.

## The product

Argent is desktop-first. A developer visits the website, downloads an installer
and launches the desktop app, which is the primary working interface. The website
is the entry point for the product, downloads and documentation. Browser access
may complement the desktop later.

Desktop delivery and remote execution are independent choices. The desktop client
controls local workspaces, workspaces on a remote host the developer owns, or
persistent cloud workspaces through the same headless engine.
Closing the desktop app must not cancel a remote run. Local work can continue only
while its host computer and worker remain available.

The developer defines verifiable work. The platform isolates changes, runs an
agent, collects deterministic checks, requests independent review, attempts only
bounded repairs and prepares a pull request. Every stage has durable state and a
recovery strategy.

Workspace persistence and compute persistence are separate. Repositories,
dependencies, configuration and evidence survive idle compute suspension. Closing
a client does not cancel a run, and reopening one does not start a new run. An
uncertain external action is reconciled before another action is authorized.

Portable history and evidence are a product goal. Today the CLI exports and
restores simulation history only; real-agent transcript and Git-history export
remain planned. A managed service may charge for easier operations, workspace
compute and collaboration, but it runs the same core rather than making
self-hosting a second-class or limited mode.

## The order

The first usable release runs real agents locally: one repository, a branch and
worktree per workspace, Claude Code through its official CLI, a reviewable diff,
checks Argent runs itself and a human-controlled draft pull request. Codex and a
per-run model picker are its first update. Checked links between workspaces
follow as an experiment: Argent warns when two linked workspaces changed the
same paths and runs the approved tests on a trial merge of their exact commits.
More kinds of project rule come after the release.

A remote host the developer owns, and after it an optional managed cloud, then
add disconnect and reconnect on the same engine. The personal release adds a
familiar daily workflow, support for several agents and existing subscriptions,
portable files and history, and a mobile companion, with native iOS as its own
delivery track. Team handoff and dependent tasks follow. Shared rule sets, a
full IDE and advanced enterprise controls remain later. Agent swarms and agents
exchanging messages through Argent are out of scope. See the
[roadmap](ROADMAP.md) and the
[desktop shell contract](docs/specs/0008-desktop-workspace-shell.md).

Argent is built first for its maintainers' daily work on this repository.
Whether they keep using a capability decides whether it stays.

## Today

Claude Code runs in local worktrees, and the desktop changes panel shows
current changed files and a bounded diff against the workspace base. Live diffs are
observations of current files, not checks or immutable evidence. Trusted test
execution and draft pull requests remain the next local MVP slices. Links between
workspaces, further rule types and shared rule sets do not exist.
