# Engineering instructions

These rules apply to every contributor: people and AI coding agents of any kind
(Codex, Claude, Cursor, Copilot, Gemini and others). `CLAUDE.md`, `GEMINI.md` and
`.github/copilot-instructions.md` only point here; this file is the single source
of truth. If a rule here conflicts with an agent's default habits, this file wins.

Before making changes, read README.md, ARCHITECTURE.md, ROADMAP.md, the relevant
`docs/specs/` file and docs/DECISIONS.md. Before completing substantial work,
update the relevant specification, decision entry and documentation with the
evidence, limits and next steps.

## 1. This repository is public: what may be committed

Everything committed here is published, and Git history is permanent: deleting a
file later does not unpublish it. Check before you commit, not after.

Never commit:

- **Founder or maintainer instructions and process:** prompts written to agents,
  "the founder asked/approved/wants…" narration, work logs, handoffs, session or
  chat transcripts, "do not ask the founder again" notes.
- **Business and market material:** competitor or market research, AI-generated
  research reports, customer or outreach plans, pricing strategy, fundraising.
- **Third-party personal data:** names, handles or quotes of real people taken from
  research or social media. Cite official sources instead.
- **Live account identifiers:** GitHub user, App, installation and repository IDs,
  OAuth client IDs, key fingerprints, private repository names, local OS user IDs.
  Use placeholders (`{installation}`, `your-test-repo`) in docs and examples.
- **Credentials of any kind**, even expired or "test" ones that look real, and
  token-bearing dependency URLs.
- **Local machine details:** absolute home paths (`/Users/…`), local log paths
  (`.context/…`), personal email addresses, machine-specific tool setup.
- **Branding provenance notes** naming the tool that generated an asset, and the
  name's etymology. The project is simply "Argent".

Internal material belongs in the maintainers' private repository
(`argent-internal`). If you have no access, leave the material out and tell the
maintainer; never put it here "temporarily". Commits use the GitHub noreply email
address, never a personal one.

## 2. Every claim must match the code

- Write in the present tense only what works on `main` today. Everything else is
  labelled planned, in development or illustrative. On `main`, the desktop app
  runs **Claude Code in local worktrees** (not a sandbox); GitHub-URL workspaces
  and all cloud work are **simulated**. Never describe other agents, cloud
  workspaces, diffs, tests, mobile access or pull requests as working until they
  land there.
- Describe `main`, not a branch. Never write "this branch contains…", "current
  branch…" or link to a branch in a public document.
- Do not hard-code numbers that go stale (test counts, versions, dates of "latest
  status") in the website or README. Prefer a description that stays true.
- When a capability, priority or order changes, update **all** surfaces in the
  same change: README, ROADMAP.md, VISION.md, docs/DECISIONS.md, docs/README.md,
  the relevant spec, the website hero, roadmap, FAQ and open-source sections, the
  GitHub repository description and the `package.json` description.
- Keep shared facts identical everywhere. Today: the first release is the local
  MVP (L1), real agents in isolated Git worktrees on the developer's computer,
  before cloud workspaces; the first real agent is Claude Code through its
  official CLI, then Codex (both in the local MVP), then Cursor and OpenCode;
  each workspace chooses its agent and each run a model that agent offers, and
  Argent never routes or proxies models; in local mode the agent uses
  its own official sign-in and never receives provider API-key variables; local
  execution is not a sandbox; a spend budget is not a hard spending cap.
- Never invent customer evidence, metrics, pricing, download links, availability
  or live capabilities, in code, docs or website copy.

## 3. Other products and third parties

- Argent's code, icons and assets are original or properly licensed. Do not
  describe Argent as a clone or copy of another product, and do not document
  inspecting another product's app in order to reproduce it.
- Naming another product is fine for factual interoperability (for example a
  planned importer from another tool) and for cited, dated technical comparisons.
- Do not republish third-party reports or social-media material; summarize the
  verified facts with links to primary sources.

## 4. Documentation hygiene

- Specs and reports record evidence by commit SHA and date, not by branch name or
  local log file. Keep evidence summaries; keep raw logs out of Git.
- Every relative link and anchor must resolve. When you move or rename a file,
  update every link to it in the same change.
- Use neutral wording: "the maintainers", "the product requirement", not personal
  narration. Link every new spec or report from docs/README.md.
- Run Prettier; `npm run check` fails on unformatted files.

## 5. Architecture and engineering rules

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
- A remote or managed control-plane host never executes repository code. Local
  mode (spec 0013) runs the agent on the developer's own computer, as the
  developer: label it as not a sandbox, and follow its security model (no shell,
  validated paths, hook-free Argent Git commands, allowlisted agent environment).
- Never log secrets, pass provider API keys or host tokens into agents or expose
  the local service beyond loopback. Hosted adapters require scoped credentials
  and isolation.
- Never silently merge, deploy, purchase or provision billable resources.
- Do not fork or replace this foundation without maintainer approval.

M0 uses SQLite on one host. PostgreSQL is required before multiple control-plane
hosts or a managed multi-tenant service. Do not put SQLite on a network filesystem.

## 6. Git and GitHub workflow

- Never push directly to `main`, and never force-push or rewrite its history.
- Work on a short topic branch, open a pull request, wait for CI, then
  squash-merge with the title `v0.0.1 type(scope): subject (#N)`, for example
  `v0.0.1 fix(website): correct the roadmap copy (#18)`. Conventional types:
  `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
- PR titles and descriptions are public too: section 1 applies to them.
- After merging, delete the branch on GitHub and fast-forward the local `main`.
  Do not leave stale branches on the public remote.

## 7. Local state and destructive actions

- Before editing, check `git status` and `git worktree list`. Another person or
  agent may be working in another worktree, possibly with a dev server running.
  Never edit, reset or switch a worktree you were not asked to use.
- Never discard work you have not inspected. Before deleting a branch, confirm it
  is merged into `main` or preserved elsewhere. Before moving a worktree to new
  code, confirm it has no uncommitted changes; prefer creating a new branch over
  `reset --hard`.
- Never use a bare `git stash` / `git stash pop`: the stash is shared by every
  worktree. Prefer a temporary commit.

## 8. Verify and report honestly

- Run `npm run check` before reporting completion. For website changes, also run
  `npm run typecheck`, `npm run build` and `npm run test:e2e` in `website/`.
- If a test fails, run it on unchanged `main` before concluding whether your change
  caused it, and report the result either way. Never delete or weaken a test to
  get a pass.
- Report what actually ran, what passed, what failed and what was not checked.

## Before you push

1. `git diff --cached` contains nothing from section 1 (`npm test` also runs an
   automated public-content check, but it cannot catch everything).
2. Claims match `main`, and every surface listed in section 2 agrees.
3. Links resolve, Prettier passes, `npm run check` passes.
4. The PR title follows section 6, and its description is fit to publish.
