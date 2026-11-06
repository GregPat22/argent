# Vision

Build an open-source development platform where coding agents work autonomously
in persistent local or cloud environments, while developers remain in control
from anywhere. Reliability, observable evidence and controllable execution matter
more than how many agent terminals fit on a screen.

Argent is desktop-first. A developer visits our website, downloads an installer,
installs Argent locally and launches the desktop application, following the
installation and launch experience of Conductor. The website is the product,
download and documentation entry point; the installed app is the primary working
interface. Browser access may complement the desktop later.

Desktop delivery and cloud execution are independent choices. The desktop client
controls local or persistent cloud workspaces through the same headless engine.
Closing the desktop app must not cancel a remote run. Local work can continue
only while its host computer and worker remain available.

The developer defines verifiable work. The platform isolates changes, runs an
agent, collects deterministic checks, requests independent review, attempts only
bounded repairs and prepares a pull request. Humans retain authority over
sensitive operations and merging. Every stage has durable state and a recovery
strategy; an agent's claim is never proof of completion.

Workspace persistence and compute persistence are separate. Repositories,
dependencies, configuration and evidence survive idle compute suspension.
Closing a client does not cancel a run. Reopening one does not start a new run.
An uncertain external action is reconciled before another action is authorized.

The core remains usable independently of our hosted service and any one model or
infrastructure vendor. A managed service may charge for easier operations,
workspace compute and collaboration. It should operate the same core rather than
make self-hosting a second-class or artificially limited mode.

The first customer journey is one repository, one persistent cloud workspace,
one real agent, disconnect/reconnect, verifiable changes and a tested PR. A full
IDE, swarms, native mobile apps, billing and advanced enterprise controls are
outside that MVP. The [roadmap](ROADMAP.md) stages additional agents, scoped team
handoff and lightweight mobile access before dependency orchestration. Portable
history/evidence recovery is part of making independent operation practical.

Conductor is context, not a product specification. As of 6 November 2026 its team
has announced a move to Meta; cloud shutdown is scheduled for 20 November, with
local critical/model maintenance into early 2027.
[Primary announcement](https://www.conductor.build/changelog/0.93.0-conductor-is-joining-meta).
