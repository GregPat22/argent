# Contributing to Argent

Argent is early-stage software. This branch contains P1, a local desktop
prototype with simulated execution. Persistent real-cloud execution and signed
public distribution remain future work. Start with [Project context](docs/PROJECT_CONTEXT.md),
[the documentation index](docs/README.md) and [AGENTS.md](AGENTS.md).

## Set up a development checkout

Use Node.js 22.19.0, npm 10.9.3 and Git, matching the tested foundation. In a
trusted development checkout:

```sh
git clone https://github.com/GregPat22/argent.git
cd argent
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run demo
```

The demo starts real local API and worker processes around simulated work, kills
the API and reconnects to durable events. It preserves a disposable database and
JSON artifact in an ignored `.data/demo-<id>` directory and prints the location.
It does not clone a target repository, invoke a coding agent or create a PR.

For standalone API/worker configuration, use the
[README setup instructions](README.md#environment-setup) and `.env.example`.
Create your own local operator token and keep `.env` out of Git. Do not use the
known conformance-test token for an operator deployment.

These commands test Argent's control-plane implementation in a development
checkout. The prohibition on executing repository code on the control-plane host
means untrusted target-repository/agent workloads must not run there. The current
local adapter writes fixed JSON and is not an execution isolation boundary.

## Scope the change before implementation

Read the architecture and relevant `docs/specs/` acceptance contract. For a
behavior change, add or update a focused written specification with observable
acceptance criteria, constraints, failure handling and verification evidence.
Prefer one coherent improvement over an unrelated collection of changes.

Use a `codex/`, `feat/` or `fix/` branch with a clear task name. If another person
or agent is working in the same checkout, use a separate Git worktree. Do not
stage their unfinished files, switch their active branch or overwrite their work.

Keep the current foundation until the founder approves a replacement or upstream
fork. Provider research, a mock integration and a paid trial are different
activities; research does not authorize provisioning.

## Implement within the boundaries

- Use strict TypeScript, explicit transitions and parameterized SQL.
- Keep the API, store, worker and adapters separate. Persist a state transition
  and its event together, and claim work atomically.
- Reconnect by reading state and ordered events. Never replay an uncertain
  external action. Preserve `needs_attention` until an explicit resolution path
  can establish what happened.
- Keep workspace identity, filesystem persistence, running processes and agent
  session history distinct.
- Preserve independent verification. A successful agent response does not prove
  a check ran, passed or tested the commit being proposed.
- Keep credentials outside agent/renderer access and never log secrets. Real
  agent execution requires isolation and scoped credentials.
- Make simulation visible in user-facing behavior, examples and reports.

These are summaries. [AGENTS.md](AGENTS.md) and the relevant acceptance spec are
the operative engineering instructions.

## Verify and review

Run `npm run check` before reporting completion. It checks strict types,
formatting, compilation and all unit/process tests. For code changes, add tests
that exercise observable behavior and relevant failure paths. Documentation-only
changes need accurate examples, working internal links and review of the actual
diff; avoid tests that merely repeat prose or implementation details.

The test suite needs child processes and loopback listening. A restricted runner
may report `listen EPERM` rather than a product defect. Report the actual result
and use an approved development environment with loopback access; never remove
the integration tests to obtain a pass.

Review the actual diff, not an agent's summary. For real adapters, independently
check the tested SHA, trusted command policy, exit status and retained output.
Keep failed attempts and limitations visible. Test/policy changes need review
because they can change what a passing result means.

Use conventional commit subjects such as `docs: preserve project context` or
`fix: reject expired worker ownership`. Open a focused pull request against
`main` describing the problem, resulting behavior, acceptance criteria covered,
tests actually run and remaining gaps. Publishing a PR is not merge approval.

## Documentation and completion reports

Update the README for entry-point changes, the architecture for boundary changes,
the [decision register](docs/DECISIONS.md) for resolved choices, and the relevant
specification for acceptance changes. Add milestone evidence under
`docs/milestones/` when a milestone is actually demonstrated, and link it from the
[documentation index](docs/README.md).

Separate intended, implemented, simulated and real-provider behavior. An unsigned
local macOS build is not a signed public installer. A repository URL is not GitHub
authorization. Provider usage counters are not a final invoice or a hard budget
cap. Do not describe a local simulator as laptop-independent cloud execution.

## License and sensitive reports

The original project is [MIT-licensed](LICENSE). Keep required notices and review
upstream licenses before adding third-party code. Future commercial packaging or
licensing changes must account for code ownership and contribution terms.

Do not put live credentials, personal/customer data or an active exploit with
sensitive details into public issues. A dedicated private vulnerability-reporting
channel has not yet been established in this publication; arrange a private
channel with the maintainer before sending sensitive details. No response-time
or production security guarantee is currently offered.
