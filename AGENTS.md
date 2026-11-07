# Engineering instructions

Read README.md, ARCHITECTURE.md, ROADMAP.md and the relevant `docs/specs/` file
before making changes. Decisions and their reasons are in docs/DECISIONS.md.
Before completing substantial work, update the relevant specification, decision
register entry and documentation with the evidence, limits and next steps.

This repository is public. Keep maintainer planning notes, founder instructions,
private research, chat transcripts, account identifiers and local log paths out
of it; the maintainers keep those in a separate private repository.

- This is a headless cloud-oriented control plane. Clients never own execution.
- The primary product is a downloadable desktop app, distributed from a website.
  Do not replace the desktop installation/launch experience with a browser-only app.
  Keep desktop packaging separate from the headless engine and workspace execution.
- Keep API, durable store, worker and provider adapters separate within one package.
- Every behavior change needs written acceptance criteria, focused implementation,
  appropriate automated tests and review of the actual diff.
- Use strict TypeScript, parameterized SQL and explicit state transitions.
- Persist a transition and its event in the same transaction. Claim work atomically.
- Client reconnect only reads state. Never replay an uncertain external side effect.
- A provider session ID is not durable process or filesystem state.
- Treat agent statements and output as untrusted. Verification evidence is independent.
- Label simulation everywhere; never call simulated work a tested pull request.
- Do not execute repository code on the control-plane host. The local adapter only
  writes fixed JSON artifacts and is not an isolation boundary for coding agents.
- Never log secrets, inherit host credentials into agents or expose this prototype
  beyond loopback. Real adapters require scoped credentials and isolation.
- Never silently merge, deploy, purchase or provision billable resources.
- Do not fork or replace this foundation without maintainer approval.
- Run `npm run check` before reporting completion; report actual results and gaps.

M0 uses SQLite on one host. PostgreSQL is required before multiple control-plane
hosts or a managed multi-tenant service. Do not put SQLite on a network filesystem.
