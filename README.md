# Argent

**An open-source desktop app for Claude Code in local Git worktrees.** Follow
live sessions, inspect changes and run approved checks against an exact commit.
Open a GitHub draft pull request with the evidence you reviewed.
You decide what gets merged.

> **Status: early prototype.** The durable engine and the macOS desktop app work
> today. The desktop app can run **Claude Code on a local repository**, each
> workspace on its own branch and Git worktree, using your own `claude` sign-in.
> Local execution is **not a sandbox**: the agent runs as you. The Changes panel
> shows current files and a bounded diff against the workspace base. The Commands
> dialog shows a repository's check commands for review and records your
> approval. Argent records exact-commit setup/test results. Draft publication
> uses your GitHub CLI sign-in.
> Cloud workspaces are planned and GitHub-URL workspaces
> remain a scripted simulation. Everything below says which parts are
> real and which are planned.

**The goal:** the easiest open-source environment for running several coding
agents under consistent, enforceable project rules, with evidence of completion
that Argent collects itself. The [vision](VISION.md) states the beliefs behind
it; the list below says what works today.

Website: [argent.build](https://argent.build/). Desktop downloads are planned.

Follow the build on X: [@Argent_build](https://x.com/Argent_build).

## What works today

- Choose a local repository to create a branch and Git worktree for each
  workspace. Run Claude Code through its official CLI and your own sign-in.
  Follow the live transcript, send follow-ups or cancel a run. Each run lets
  you choose edits only (the default) or full access. The agent receives an
  allowlisted environment without provider API keys.
- Open **Changes** to inspect changed files and a bounded diff against the
  workspace base, including untracked, renamed, deleted and binary files.
  Argent records the commit and diff independently of the agent's transcript.
- Open **Commands** to review the project's commands at the base commit.
  Setup and test run in a fresh checkout after you consent to the exact
  candidate commit. Before consent, the judging-changes report lists recognised
  changes to tests, check scripts, configuration and dependencies. Its count
  appears beside the check result. The separate run action has its own consent
  and result.
- Review and commit staged changes. Confirm the destination, branch history,
  title and evidence to open a GitHub draft pull request. The saved URL takes
  you to the draft. Archiving a clean workspace keeps its branch and history.
- Close and reopen the desktop to reconnect to the local service and its
  recorded history. An uncertain run requires investigation before the
  workspace can continue. After a service restart on the same boot, choose
  **Check agent process group**. If the recorded group is gone, Argent marks
  the interrupted run failed and lets you submit a new task.

## Quick start

The desktop development build runs on Apple Silicon Macs. Use Git and the
Node.js and npm versions listed in [Contributing](CONTRIBUTING.md). For real
agent tasks, install the official Claude Code CLI and sign in. If the CLI is
missing, outdated or signed out, the desktop explains how to fix it and keeps
your draft editable.

```sh
git clone https://github.com/GregPat22/argent.git
cd argent
npm ci
npm run desktop
```

### Reproduce an exact-commit check

1. Choose the cloned Argent repository in the desktop and create a local
   workspace. Start with a clean commit.
2. Open **Commands**. Review the base commit's `argent.json`, which specifies
   `npm ci` and `npm run check`, and choose **Approve these commands**.
3. Select **Review commit for checks**, inspect the judging-changes report and full diff, choose
   **Record consent for this commit**, then **Run checks**.
4. Open **Checks** and choose **Refresh** to see the result. After a pass,
   edit a tracked file in that workspace and refresh again. The earlier
   result is now **stale**.

For npm projects without a committed `argent.json`, [direct approval of suggested commands](docs/specs/0019-suggested-commands.md) is in development.

The [desktop walkthrough](docs/specs/0013-local-mvp.md#l14-manual-walkthrough)
records this passing-to-stale transition, a failing check and cancellation.
For standalone API setup, the headless demo, simulation-history export, the
read-only GitHub pilot and desktop packaging, see the
[local development reference](docs/local-development.md).

## Principles

Argent collects its own evidence. A passing result names the commands and the
commit they checked. Project rules are described by what enforces them:
guidance for the agent, a check Argent runs, a gate that requires a result,
or a control that prevents an action. Local execution provides no prevention
control. A person approves commands and decides what gets merged. The
MIT-licensed core runs on the developer's computer. See the [vision](VISION.md).

## Where it is going

The first public release is the local MVP with Claude Code. The remaining
[L1 walkthrough evidence](docs/specs/0013-local-mvp.md#exit-evidence-for-l1) is a pull
request created through Argent and merged by a person.

The planned first update experiments with checked links between workspaces.
A link grants no access and carries no messages between agents. Codex and
per-run model choice follow, then Cursor and OpenCode. Each agent offers its
own models. Work that continues with the laptop closed comes first on a host
you own, then in an optional managed cloud. The [roadmap](ROADMAP.md) lists
the milestones and their exit evidence.

## Development

| Reference                                                                                                                        | What it covers                                       |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| <a name="how-it-works"></a>[Architecture](ARCHITECTURE.md)                                                                       | Desktop, service, worker and store                   |
| <a name="configuration"></a>[Configuration](docs/local-development.md#configuration)                                             | Desktop data and standalone service setup            |
| <a name="local-api"></a>[Local API](docs/local-development.md#local-api)                                                         | Loopback endpoints and authentication                |
| <a name="offline-history-export-and-restore"></a>[Offline history](docs/local-development.md#offline-history-export-and-restore) | Export and restore simulation history                |
| <a name="read-only-github-pilot"></a>[GitHub pilot](docs/local-development.md#read-only-github-pilot)                            | Opt-in, read-only sign-in                            |
| <a name="project-layout"></a>[Development reference](docs/local-development.md#development)                                      | Commands, native smoke, packaging and project layout |

## Contributing, security and license

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request; work starts
from a written spec with acceptance criteria. Coding agents should follow
[AGENTS.md](AGENTS.md). Report vulnerabilities privately as described in
[SECURITY.md](SECURITY.md), not in public issues.

Argent is original code released under the [MIT license](LICENSE). The bundled
Lucide icons keep their own license notices in [ui/icons](ui/icons/README.md).
