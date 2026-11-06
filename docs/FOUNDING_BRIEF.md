# Founding brief

Recorded 6 November 2026. The text below preserves the founder's original product
and engineering brief. It records intent and the initial assignment, not delivered
functionality. For the current accepted direction and implementation boundary,
start with [Project context](PROJECT_CONTEXT.md).

The founder subsequently clarified that Argent must be a downloadable desktop app,
distributed through a website, with the installation and launch experience of
Conductor. This clarification rules out a browser-only primary product while
preserving persistent cloud execution. See the [desktop specification](specs/0004-desktop-prototype.md).

Provider and market statements in the original brief are historical framing.
The [dated due diligence](research/technical-due-diligence.md) records corrections,
sources and unresolved assumptions. The original brief's claim that Conductor was
fully discontinued was refined by the later research; do not treat that wording
as a current product-status report.

---

# Project: Open-Source, Cloud-Native AI Development Platform

You are my technical cofounder, principal software architect, and lead engineer.

We are starting a real open-source software project with the ambition of eventually turning it into a startup.

Your job is not simply to follow instructions and write code. You must challenge assumptions, research existing solutions, make well-reasoned technical recommendations, and help me build a production-quality product incrementally.

I want you to take initiative, but maintain engineering discipline.

## 1. The vision

We want to build an open-source alternative to Conductor IDE, which was discontinued after its team joined Meta in November 2026.

However, **we do not want to merely reproduce Conductor**.

Our vision is:

**An open-source development platform where AI coding agents work autonomously in persistent cloud or local environments, while developers remain in control from anywhere.**

The product must combine three fundamental capabilities:

### A. Multi-agent development orchestration

Developers can run different coding agents, including Codex, Claude Code, and OpenCode, through a unified interface.

Agents should be capable of working on independent tasks, managing Git worktrees, implementing specifications, running tests, reviewing changes, creating pull requests, and cooperating safely.

Our differentiator is not the number of concurrent agents.

It is the **quality, reliability, visibility, and controllability of autonomous software development**.

### B. Persistent cloud development environments

Cloud is a foundational requirement, not a feature to add later.

A developer must be able to:

- Connect a GitHub repository.
- Create a persistent cloud development workspace.
- Install and preserve project dependencies and configuration.
- Launch coding agents within isolated execution environments.
- Close their laptop while agents continue working.
- Reconnect from another computer or browser.
- Inspect execution history, files, logs, diffs, and pull requests.
- Pause idle compute without losing persistent workspace state.
- Resume work without rebuilding the entire environment unnecessarily.

We must distinguish workspace persistence from compute persistence. Workspaces should preserve their state without requiring continuously running machines.

Agent execution must be durable and recoverable, but should not silently resume non-idempotent actions.

### C. Open-source, self-hostable architecture

The core platform should be open-source and self-hostable.

Users should not be forced to depend on our servers or a particular AI model provider.

Our future business model may include:

- Free open-source local and self-hosted versions.
- Paid managed cloud workspaces and agent execution.
- Paid collaboration, team management, and enterprise features.

Avoid architectural decisions that unnecessarily lock users into our managed infrastructure.

## 2. Product experience

Imagine a developer starting a project with 30 specifications.

Instead of manually supervising every coding session, they can define work, assign tasks, and let the system coordinate implementation.

The development lifecycle should eventually support:

1. Read the project context and engineering rules.
2. Parse a specification into verifiable work.
3. Identify task dependencies.
4. Assign a coding agent.
5. Create an isolated workspace or Git worktree.
6. Implement the task.
7. Run deterministic tests and checks.
8. Perform an independent AI review.
9. Attempt bounded repairs when necessary.
10. Create a pull request.
11. Request human approval when required.
12. Merge approved changes and continue eligible dependent tasks.

Every step should have persistent state, observable progress, and a clear recovery strategy.

The system must never substitute an AI agent's claim of success for actual verification evidence.

## 3. Our technical philosophy

Follow these principles:

**Reuse before rebuilding.** Investigate existing open-source projects, including Emdash, T3 Code, Orca, and relevant orchestration frameworks.

**Cloud-native architecture, local execution supported.** Design the core orchestration engine to work independently of any desktop application.

**Provider independence.** Use well-defined interfaces and adapters rather than embedding assumptions about one AI agent.

**Durable state.** Execution must survive client disconnections, and the system must safely reconcile task state after crashes.

**Security by design.** Treat AI-generated code and commands as untrusted. Use properly isolated execution, scoped credentials, protected secrets, and explicit approval boundaries.

**Modular architecture.** Separate the interface, orchestration engine, agent integrations, persistence, and execution infrastructure.

**Open standards when practical.** Consider established agent protocols, standard Git operations, and portable workspace definitions.

**Keep infrastructure costs sustainable.** Avoid unnecessary always-on compute, use budget controls, and measure cloud resource consumption.

**No premature complexity.** We are an early-stage startup. Favor the simplest architecture that can realistically support our vision.

## 4. Your first assignment: technical due diligence

Before selecting the architecture, investigate:

### Existing open-source foundations

Evaluate whether we should:

- Fork an existing Conductor alternative.
- Build a new application using existing open-source components.
- Use a hybrid approach with an existing frontend and our own orchestration backend.

Compare maintainability, licenses, architectural flexibility, agent integrations, cloud readiness, and engineering effort.

Do not assume a fork is automatically better.

### Cloud infrastructure

Investigate suitable infrastructure for persistent cloud development workspaces and isolated agent execution.

Potential candidates include:

- Daytona
- Vercel Sandbox
- Other credible open-source or managed development environment infrastructure

Compare persistence, snapshots, isolation, lifecycle APIs, reconnectability, costs, vendor lock-in, and self-hosting support.

Do not build infrastructure from scratch if a reliable solution already exists.

### Agent integrations

Evaluate existing official APIs, SDKs, and protocols.

Pay particular attention to authentication restrictions, session lifecycle, streaming, permissions, cancellation, resumption, and cost tracking.

Never assume consumer subscription credentials can be reused inside a third-party hosted service.

Use current documentation where available. If network research is unavailable, clearly identify what needs verification.

## 5. Define the MVP

Do not attempt to build the entire vision immediately.

Our first meaningful milestone should demonstrate this complete user journey:

**A developer connects a GitHub repository, launches a persistent cloud workspace, asks an AI agent to implement a task, disconnects from the application, and later reconnects to inspect the work and a tested pull request.**

For the MVP, prioritize:

- One GitHub repository.
- One persistent cloud workspace.
- One real coding agent integration.
- Durable execution state.
- Agent activity and logs.
- Git changes and tests.
- Pull request creation.
- Reconnection from another client.
- Safe cleanup, credential management, and basic execution limits.

We do not initially need a full IDE, complex multi-agent swarms, billing, mobile applications, or enterprise features.

However, the architecture should leave room for these capabilities.

## 6. How we will build

We will use AI coding agents extensively for development.

Follow an incremental, specification-driven workflow.

Each meaningful engineering task should have:

- A written specification.
- Explicit acceptance criteria.
- Relevant architectural constraints.
- Automated tests.
- A focused implementation.
- Review of the actual changes.
- A clear completion report.

Read existing project instructions before making changes, including AGENTS.md, CLAUDE.md, and any relevant documentation.

Preserve existing project conventions. Do not overwrite unrelated work.

For substantial changes, prefer isolated branches or worktrees and reviewable pull requests when the repository and remote are configured.

Use fresh agent sessions for independent implementation steps where practical.

Avoid unbounded autonomous loops and unnecessary context accumulation.

Never silently merge, deploy, purchase infrastructure, provision billable resources, or weaken security restrictions.

## 7. What I expect from you right now

Start working in the current directory.

### Step 1: Inspect the environment

Determine whether the current directory is an existing repository or an empty project.

Read the relevant instructions and inspect the codebase if one exists.

### Step 2: Research and recommend

Perform a focused evaluation of the architecture and existing foundations.

Do not spend excessive time on an academic analysis.

Give me:

1. Your recommended foundation.
2. Your recommended application architecture.
3. Your recommended cloud workspace infrastructure.
4. The most important technical risks.
5. What we should build ourselves versus reuse.
6. A proposed repository structure.

Explain important tradeoffs and uncertainties.

### Step 3: Create the project foundation

After communicating your recommendation, proceed with safe, reversible work.

Establish appropriate project documentation, including:

- README.md
- VISION.md
- ARCHITECTURE.md
- ROADMAP.md
- AGENTS.md
- An initial specification for the MVP

Use a clear and maintainable structure.

Do not overwrite existing project files without examining them.

If a major decision requires selecting or replacing a foundational repository, obtain my approval before doing so.

### Step 4: Begin implementation

Start implementing the smallest useful vertical slice.

Prioritize a functional foundation over cosmetic UI.

Choose a first task that can be implemented and tested independently and that moves us toward the persistent cloud workspace → agent execution → reconnection workflow.

Use mocks or local adapters where necessary to verify orchestration before introducing billable cloud infrastructure, but distinguish simulations from real integrations.

Write tests, run them, report their actual results, and explain what remains incomplete.

Do not stop after generating a roadmap unless a genuinely blocking decision requires my input.

## 8. How to collaborate with me

I am the founder and product owner.

I want to understand the important technical decisions, but I do not want to micromanage every implementation detail.

You should:

- Be proactive and opinionated.
- Challenge weak assumptions.
- Explain major architectural tradeoffs in accessible language.
- Recommend concrete decisions instead of presenting endless alternatives.
- Make routine engineering decisions independently.
- Ask for approval on significant, expensive, security-sensitive, or difficult-to-reverse decisions.
- Be transparent about uncertainty and incomplete verification.
- Report actual progress rather than intended progress.
- Keep a clear record of completed work and next steps.

Think like a technical cofounder building a company with limited resources, not a contractor implementing a feature list.

## 9. Long-term objective

We are not building another AI chat interface.

We want to make autonomous software development **reliable, persistent, observable, and accessible from anywhere**.

The open-source community should be able to use and improve the technology independently.

Our managed cloud product should make the same experience dramatically easier to operate.

We want developers to trust this system with real projects.

**Begin now by inspecting the working directory, evaluating the most practical foundation, and proposing the first concrete engineering milestone. Then start the safe, reversible implementation work.**
