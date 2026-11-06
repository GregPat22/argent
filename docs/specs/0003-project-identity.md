# Project identity and repository setup

## Decisions

- Name: **Argent**, selected by the founder. It combines _argento_ (Italian for
  silver, a conductor) and _agent_.
- Repository: <https://github.com/GregPat22/argent>, public from the start to
  support the intended open-source community and self-hostable core.
- Description: Open-source control plane for AI coding agents in persistent
  workspaces, with durable runs, independent verification, and human control.
  M0 simulator.
- License: **MIT**, retained from the original foundation. Its permissive terms
  allow commercial use, modification and redistribution while requiring retention
  of the copyright and license notice. This fits a freely self-hostable core
  alongside a future paid managed service. It also permits proprietary forks;
  it does not reserve hosted-service rights for this project.
  [License reference](https://choosealicense.com/licenses/mit/).
- Keep the existing local directory while another active chat builds the same
  foundation. Do not create a second scaffold or move its working directory.
- `private: true` in the npm manifest prevents accidental package publication;
  it does not make the GitHub repository private.

## Acceptance criteria

1. The GitHub repository exists under `GregPat22`, is public, and has the chosen
   description. The existing local Git repository uses it as `origin`.
2. README, package metadata, lockfile and copyright notice use Argent. Package
   metadata identifies MIT and the repository, issue tracker and homepage.
3. The M0 simulation boundary remains explicit. No cloud deployment, merge,
   billable infrastructure or application GitHub integration is implied by setup.
4. Credentials, `.env`, generated files and local databases remain excluded.
5. Run `npm run check` and review the actual setup diff before reporting results.

## Name availability

On 6 November 2026, the authenticated GitHub API returned 404 for
`GregPat22/argent` before repository creation. This establishes availability in
that account only. Argent is already used by other software, including
[Software Mansion's agentic toolkit](https://github.com/software-mansion/argent).
The founder selected Argent; this setup does not establish domain availability,
trademark clearance or exclusive ownership of the name.
