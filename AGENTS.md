# Engineering instructions

Read HANDOFF.md, START_HERE.md, README.md, ARCHITECTURE.md and the relevant docs/specs file
before edits. Product context is in docs/PROJECT_CONTEXT.md. For landing-page
work, also read docs/briefs/landing-page.md before asking for product information.
If these files are missing in a new worktree, inspect its branch and origin/main;
do not conclude the product is undocumented from an empty or stale checkout.
Before completing substantial work, update the tracked handoff and relevant
specifications/decisions with the exact branch, evidence, limits and next steps.

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
- Do not fork or replace this foundation without founder approval.
- Run `npm run check` before reporting completion; report actual results and gaps.

M0 uses SQLite on one host. PostgreSQL is required before multiple control-plane
hosts or a managed multi-tenant service. Do not put SQLite on a network filesystem.
