# Argent: Claude Code entry point

Argent is an open-source, desktop-first app for delegating coding tasks to AI
agents in persistent workspaces and reviewing independently verified results.
Agent execution is currently simulated.

Read before making changes:

1. [AGENTS.md](AGENTS.md): the shared engineering rules; follow them in Claude too.
2. [README.md](README.md): what works today, quick start and commands.
3. [ARCHITECTURE.md](ARCHITECTURE.md) and [ROADMAP.md](ROADMAP.md).
4. The relevant acceptance spec in [docs/specs/](docs/README.md), and
   [docs/DECISIONS.md](docs/DECISIONS.md) for why choices were made.
5. For website work, [website/README.md](website/README.md).

The repository is public. Never commit credentials, token-bearing dependency URLs,
private configuration, founder instructions, private research or local log paths.
Keep the website separate from the headless engine and desktop packaging.

Distinguish accepted requirements, proposed designs and implemented features. Do
not invent customer evidence, pricing, download availability or live cloud or
agent capabilities, in code, docs or website copy.
