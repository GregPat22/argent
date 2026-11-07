# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub:
[**Report a vulnerability**](https://github.com/GregPat22/argent/security/advisories/new)
(the repository's Security tab → "Report a vulnerability"). Do not open a public
issue, pull request or discussion for a suspected vulnerability.

Include what you found, the affected revision, steps to reproduce and the impact
you expect. Never include real credentials or other people's data in a report.

## Scope and expectations

Argent is an early prototype. Agent execution is simulated, and the local service
is built for one trusted host on loopback (`127.0.0.1`). It is **not** hardened
for remote exposure or multi-tenant use; running it beyond loopback is outside
the supported configuration.

Reports about the desktop bridge and renderer isolation, the local API's
authentication, credential handling in the GitHub pilot, the encrypted simulation
custody and the history export/restore format are especially welcome.

This is a volunteer-maintained project with no bug bounty and no guaranteed
response time. We aim to acknowledge reports and to credit reporters who want
credit once a fix is released.
