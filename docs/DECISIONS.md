# Decision register

**Accepted** means a product or engineering requirement; **provisional** means a
recommendation that still needs a practical check. Neither label proves that a
capability is implemented: see the [README](../README.md#what-works-today) for
what works today and the [roadmap](../ROADMAP.md) for sequencing.

| Decision                                                           | Status                                           | Rationale and consequence                                                                                                       | Revisit or completion evidence                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Argent is desktop-first, downloaded from a website                 | Accepted product requirement                     | The installed app is the primary interface. Browser access may complement it later.                                             | Local package and hands-on desktop checks; signing, notarization and public distribution are separate. |
| Cloud execution is foundational                                    | Accepted product requirement                     | A developer can close the client and reconnect elsewhere. Desktop delivery does not move remote execution into the client.      | A real remotely hosted worker, an isolated persistent workspace and disconnect/reconnect evidence.     |
| Open-source, independently usable core                             | Accepted product requirement                     | Self-hosting and model/provider independence are part of the product, not a lesser mode.                                        | Self-hosted control-plane instructions and a separately verified isolation runtime.                    |
| MIT license                                                        | Accepted                                         | Broad adoption and commercial use; competing commercial forks are accepted as a consequence.                                    | Review licensing and attribution before importing upstream code or adding modules.                     |
| One TypeScript package with separate boundaries                    | Implemented                                      | API, persistence, worker and adapters stay distinct without empty packages.                                                     | Split only when real deployment or ownership boundaries justify it.                                    |
| SQLite for one trusted local host                                  | Implemented                                      | Proves durability without provisioning a database. Never on a network filesystem.                                               | Move to PostgreSQL before multiple control-plane hosts or managed tenancy.                             |
| Atomic claims and transactional state/event writes                 | Implemented; required invariant                  | Prevents duplicate dispatch and unrecorded transitions across processes.                                                        | Keep concurrent-claim, lock-contention and crash regression tests through future adapters.             |
| Unknown outcomes require reconciliation                            | Implemented blocking behavior; accepted policy   | Avoids silently repeating external effects. Fencing a database writer does not fence provider actions.                          | Audited operator resolution and failure injection around every real external effect.                   |
| Independent evidence before success                                | Implemented for simulation only; accepted policy | Agent statements are not proof. Real checks must identify a trusted policy and the exact commit.                                | Trusted test artifacts, actual diff review and exact-SHA draft-PR evidence.                            |
| Familiar desktop layout                                            | Accepted product requirement                     | Developers used to multi-agent desktop tools should be able to switch with little relearning. Original code and assets only.    | Observed first-use walkthroughs on real tasks; see [spec 0008](specs/0008-desktop-workspace-shell.md). |
| Retain Argent's own core rather than adopt T3 Code for bounded M1a | Decided; revisit on measured need                | Existing durable machinery may save effort, but adoption creates coupling and no runtime advantage was shown.                   | A pinned runtime spike only if measured complexity justifies it.                                       |
| E2B as first cloud candidate                                       | Provisional                                      | Its managed offering and open runtime may fit persistence and self-hosting goals.                                               | Real persistence, crash, isolation, retention, cost and cleanup contract tests.                        |
| Codex via an official interface as first real agent                | Provisional                                      | Narrows the MVP and avoids unsupported credential reuse.                                                                        | Pinned interface/version; proven authentication, sessions, interruption and usage capture.             |
| Subscription sign-in preferred, API keys as the pilot baseline     | Accepted direction; eligibility unverified       | Developers want to use the subscriptions they already pay for, where providers allow it. Never a silent fallback to paid usage. | A dated provider/deployment authentication matrix; see [spec 0006](specs/0006-portable-continuity.md). |
| Clean pre-token failures are retryable                             | Accepted; simulated                              | A refusal before any GitHub token request changes nothing externally, so it is shown and retried instead of locking the work.   | Real GitHub App denial, missing-installation and org-approval cases surface clearly and retry.         |
| Repository identity is GitHub's numeric ID                         | Implemented in simulation                        | Owner/name changes on rename or transfer, so token scope pins only the ID the authority returned.                               | Real GitHub App tokens for a renamed and a transferred test repository.                                |
| Finite repair attempts and human merge authority                   | Accepted MVP policy                              | Bounds autonomous loops and keeps humans in control of integration.                                                             | M1 permits at most one repair attempt; merges always need a separate human decision.                   |

## Choices deliberately left open

- Whether a later milestone warrants T3 Code or another foundation, after a
  measured runtime spike.
- Cross-platform desktop releases, signing/notarization and automatic updates
  (the prototype uses Electron 45.2.3 on macOS).
- The cloud region, resource shape, account, quotas and budget.
- Remote authentication, tenant authorization, secrets brokering and recovery UX.
- Evidence retention, artifact access, backup/restore and deletion policies.
- Commercial packaging, proprietary feature boundaries and contributor governance
  as the community grows.

Do not turn an open choice into an implied commitment in product copy or code.
Record the reason and evidence here when a choice is resolved.

## Engineering decisions

### Retain the current core for bounded M1a — 6 November 2026

The current core already proves transactional state/events, atomic claims,
conservative uncertain-outcome handling and desktop/service separation. The
[pinned T3 source review](research/t3-adoption-spike.md) found different retry,
retention and durability policies and substantial adoption coupling, and no
runtime advantage. Replacing the core now would add migration risk before the
provider contracts are exercised. Keep new lifecycle machinery narrow and test it
against fake-provider failure windows before real integrations.

### Familiar workspace shell and personal release scope — 6 November 2026

The desktop follows familiar multi-agent tool placement: workspaces on the left,
the session and composer in the centre, inspection and terminal on the right.
Breadth targets are Claude Code and Codex, then Cursor and OpenCode, all shown as
explicitly unavailable previews today. Two working official integrations and
verified subscription routes for each advertised environment are the proposed
personal-release gate. Migration means selected files and readable context first;
live-session resume needs separate provider/version proof. Mobile means a narrow
authenticated companion and a native iOS track on the independent service, never
public exposure of the local prototype. See the [roadmap](../ROADMAP.md) and
[spec 0008](specs/0008-desktop-workspace-shell.md).

### Lucide icon system — 6 November 2026

Lucide Static 1.70.0 was downloaded from the official npm registry and its
SHA-512 integrity verified. A curated 45-SVG subset is vendored unmodified with
its full ISC and Feather-derived MIT notices in `ui/icons/`, and packaging
includes the notices. Icons use CSS masks with shared sizing and current colour,
without a font, CDN or runtime package. See [spec 0009](specs/0009-desktop-ux-polish.md).

The same pass exposed a shutdown race: stopping an active simulated worker could
leave the stop HTTP socket answering keep-alive polls while `server.close` waited.
The stop response now closes that connection explicitly; a regression covers it,
and interrupted work remains `needs_attention` with no replay.

### Encrypted simulation custody — 6 November 2026

Keep opaque credential references and encrypted synthetic tokens inside the
existing single-host SQLite boundary. An explicitly injected, dedicated 256-bit
key stays outside SQLite; AES-256-GCM binds each ciphertext to its operation and
authorization identities. Capture precedes token acceptance or use, and an
acknowledged revocation or independently confirmed resolution removes the active
encrypted payload transactionally. This is for restart testing, not a choice of
production secret management. See
[spec 0007](specs/0007-cloud-workspace-lifecycle.md#fourth-implementation-slice-encrypted-simulated-credential-custody).

### Audited simulation cleanup — 6 November 2026

Allow one explicit cleanup reservation per uncertain repository bootstrap.
Persist intent before revoke, channel-clear or partial-checkout discard, stop on
uncertainty, and never reclaim or replay an attempt after a deadline or restart:
manual recovery is preferred over guessing whether a cleanup happened. A separate
fresh inspection must bind the cleanup ID and current event cursor and confirm
that every cleanup effect has settled before the workspace unlocks. See
[spec 0007](specs/0007-cloud-workspace-lifecycle.md#fifth-slice-acceptance-audited-simulated-recovery-cleanup).

### Read-only GitHub preflight before live bootstrap — 7 November 2026

Implement the GitHub protocol checks as a separate, unwired read-only component
rather than a live-capable adapter disguised as the simulation contract. A trusted
auth service supplies the operator/GitHub binding and credentials; the preflight
returns labelled metadata, never a durable grant. Origin and API version are
pinned, requests are bounded, and raw responses and errors are stripped. Opaque
stateless installation tokens up to 4,096 bytes are accepted without interpreting
their claims. Continue only through the
[live pilot gates](specs/0010-live-repository-pilot-gates.md).

### Memory-only device sign-in pilot — 7 November 2026

Prove user authentication and the read-only repository path through an explicit
local command before exposing it to the desktop or service API, using GitHub's
official App device flow and a single read-only test installation. Tokens live
only in memory and refresh credentials are discarded. See
[spec 0011](specs/0011-github-device-pilot.md).

### Offline history before importers — 7 November 2026

Implement [spec 0012](specs/0012-portable-history.md) as an independent
continuity slice while the live cloud gates remain open. Use an explicit read-only
source snapshot and a separate immutable history store, not restored execution
rows. Imported active or uncertain states stay `needs_attention`, and imported
verification stays historical and untrusted. Importing from other tools requires
consented sample data first.

### Name

The project is named **Argent**. Other software also uses the name; no exclusive
brand, domain or trademark is claimed. See
[spec 0003](specs/0003-project-identity.md).
