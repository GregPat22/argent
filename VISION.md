# Vision

Build an open-source development platform where coding agents work autonomously
in persistent local or cloud environments, while developers stay in control from
anywhere. Reliability, observable evidence and controllable execution matter more
than how many agent terminals fit on a screen.

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
bounded repairs and prepares a pull request. Humans keep authority over sensitive
operations and merging. Every stage has durable state and a recovery strategy; an
agent's claim is never proof of completion.

Workspace persistence and compute persistence are separate. Repositories,
dependencies, configuration and evidence survive idle compute suspension. Closing
a client does not cancel a run, and reopening one does not start a new run. An
uncertain external action is reconciled before another action is authorized.

Developers should own their workflow. The core stays usable independently of any
hosted service, including ours, and of any one model or infrastructure vendor.
Portable history and evidence are a product goal. Today the CLI exports and
restores simulation history only; real-agent transcript and Git-history export
remain planned. A managed service may
charge for easier operations, workspace compute and collaboration, but it runs the
same core rather than making self-hosting a second-class or limited mode.

The first usable release runs real agents locally: one repository, a branch and
worktree per workspace, Claude Code through its official CLI, a reviewable diff,
checks Argent runs itself and a human-controlled draft pull request. Codex and a
per-run model picker are its first update. A remote host the developer owns,
and after it an optional managed cloud, then add disconnect and reconnect on the
same engine. The personal
release adds a familiar daily workflow, support for several agents
and existing subscriptions, portable files and history, and a mobile companion,
with native iOS as its own delivery track. Team handoff and dependent tasks follow.
A full IDE, agent swarms and advanced enterprise controls remain later. See the
[roadmap](ROADMAP.md) and the [desktop shell contract](docs/specs/0008-desktop-workspace-shell.md).

Today Claude Code runs in local worktrees, and the desktop changes panel shows
current changed files and a bounded diff against the workspace base. Live diffs are
observations of current files, not checks or immutable evidence. Trusted test
execution and draft pull requests remain the next local MVP slices.
