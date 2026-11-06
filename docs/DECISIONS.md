# Decision register

Recorded 6 November 2026. **Accepted** means a product or engineering requirement;
**provisional** means a recommendation still needing a practical check. Neither
label proves a capability is implemented. Read [Project context](PROJECT_CONTEXT.md)
for the current publication boundary.

| Decision                                                             | Status                                             | Rationale and consequence                                                                                                            | Revisit or completion evidence                                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Argent is desktop-first, downloaded from a website                   | Accepted founder requirement                       | Preserve installation and launch as a native app experience. Browser access may complement it.                                       | Local package and hands-on desktop checks; signing/notarization and public distribution remain separate. |
| Cloud execution is foundational                                      | Accepted founder requirement                       | A developer must be able to close a client and reconnect elsewhere. Desktop delivery does not move remote execution into the client. | Real remotely hosted worker, isolated persistent workspace and disconnect/reconnect evidence.            |
| Open-source, independently usable core                               | Accepted founder requirement                       | Self-hosting and model/provider independence remain part of the product.                                                             | Self-hosted control-plane instructions and separately verified isolation runtime.                        |
| MIT for the original foundation                                      | Selected project license                           | Permit broad adoption and commercial use; accept competing commercial forks.                                                         | Review licensing and attribution before importing upstream code or adding modules.                       |
| One TypeScript package with separate boundaries                      | Implemented M0; accepted initial structure         | Keep API, persistence, worker and adapters distinct without empty packages.                                                          | Split only when real deployment or ownership boundaries justify it.                                      |
| SQLite for one trusted local host                                    | Implemented M0                                     | Prove durability without provisioning a database. Never use a network filesystem for it.                                             | Move to PostgreSQL before multiple control-plane hosts or managed tenancy.                               |
| Atomic claims and transactional state/event writes                   | Implemented M0; required invariant                 | Prevent duplicate dispatch and unrecorded transitions across processes.                                                              | Retain concurrent-claim, lock-contention and crash regression tests through future adapters.             |
| Unknown outcomes require reconciliation                              | Implemented M0 blocking behavior; accepted policy  | Avoid silently repeating external effects. Fencing a database writer does not fence provider actions.                                | Audited operator resolution and failure injection around every real external effect.                     |
| Independent evidence before success                                  | Implemented only for simulation; accepted policy   | Agent statements are not proof. Real checks must identify trusted policy and exact commit.                                           | Trusted test artifacts, actual diff review and exact-SHA draft-PR evidence.                              |
| Evaluate T3 Code before substantially expanding custom orchestration | Deferred for bounded M1a; revisit on measured need | Existing durable machinery may save effort, but adoption creates coupling. No fork has been approved.                                | Pinned source reviewed; runtime spike deferred. Approval still required for a fork/replacement.          |
| E2B as first cloud candidate                                         | Provisional engineering recommendation             | Managed offering and open runtime may fit persistence and self-hosting goals.                                                        | Real persistence, crash, isolation, retention, cost and cleanup contract tests.                          |
| Codex via an official interface as first real agent                  | Provisional engineering recommendation             | Narrow the MVP and avoid unsupported credential reuse.                                                                               | Pin interface/version, prove authentication, sessions, interruption and usage capture in isolation.      |
| Clean pre-token failures are retryable, matching Conductor           | Accepted founder direction; simulated              | A refusal before any GitHub token request changes nothing externally, so it is shown and retried instead of locking the workspace.   | Real GitHub App denial, installation-missing and org-approval cases surface clearly and retry.           |
| Repository identity is GitHub's numeric ID                           | Implemented in simulation; engineering decision    | Owner/name changes on rename or transfer, so token scope pins only the ID the authority returned.                                    | Real GitHub App tokens for a renamed and a transferred private fixture.                                  |
| Finite repair attempts and human merge authority                     | Accepted MVP policy                                | Bound autonomous loops and preserve human control of integration.                                                                    | M1 initially permits at most one repair attempt; merges require a separate human decision.               |

## Choices deliberately left open

- Whether a later milestone warrants T3 or another foundation after a measured
  runtime spike. Bounded M1a retains the current Argent core.
- P1 uses Electron 45.2.3 for the local macOS prototype. Cross-platform releases,
  signing/notarization and automatic updates remain open.
- The exact cloud region, resource shape, account, quotas and approved budget.
- Remote authentication, tenant authorization, secrets brokering and recovery UX.
- Evidence retention, artifact access, backup/restore and deletion policies.
- Commercial pricing, proprietary feature boundaries and contributor governance
  as the community grows.

Do not turn an open choice into an implied commitment in product copy or code.
Update this register with the reason and supporting evidence when a choice is
resolved. Provider and market observations live in the
[dated research](research/technical-due-diligence.md), not as permanent guarantees.

## Conductor shutdown review: adopted roadmap direction

On `GregPat22/grok-conductor-shutdown-analysis`, based on main `fd60a5a`,
the [Grok report review](research/conductor-shutdown-analysis.md) found alignment
with our headless/cloud design, but unresolved customer, authentication and
portability questions. The founder then authorized saving the findings and
updating the roadmap. The following planning directions are adopted; capabilities
remain unimplemented and provider eligibility remains unverified:

- Serve all three overlapping audiences through
  a shared core with staged personal-cloud, team-handoff and organization features;
  do not infer a feature ranking from unsampled X posts.
- Evaluate permitted subscription routes by provider and deployment. Current
  official-binary and open-source sign-in options need a more specific assessment
  than the earlier API-key-only recommendation. No credential extraction or
  managed-cloud eligibility is authorized or established by this research.
  Prefer supported subscription sign-in for eventual onboarding and API keys as
  an alternative/technical-pilot route. The feasibility matrix must establish the
  applicable provider/deployment permissions before product promises change.
  No silent billable fallback after subscription quota exhaustion.
- Add independently demonstrated export/restore and visible execution/recovery
  controls to the managed release contract.
- Keep one real agent/workspace for the first proof. Stage additional agents,
  scoped team handoff and lightweight mobile access before dependency orchestration.
  Native mobile and advanced organization capabilities remain later. Retain
  Electron pending actual user/performance evidence; no foundation replacement.

The [continuity spec](specs/0006-continuity-and-market-validation.md) records
acceptance criteria and decision gates; M1 now references these release additions.
The first technical proof remains one repository/workspace/agent, with API-key auth.
Exact launch packaging, prices, provider permissions and the implementation details
of team/mobile features remain open. Detailed specs precede those implementations.
The founder confirms they verified Grok's underlying X material; independent
retrieval and representative-sampling limits remain documented in the review.

## Name and publication

The founder selected **Argent**, combining _argento_ and _agent_. The
`GregPat22/argent` repository namespace was available and a public repository was
created. Other software already uses Argent; no exclusive brand, domain or
trademark availability is established. The founder authorized adding project
context and pushing it to GitHub. That authorization covers source publication,
not a deployed service, paid infrastructure or downloadable binary release.

## Completed source evaluation

The [pinned T3 source spike](research/t3-adoption-spike.md) evaluated revision
`6577c6b6185167c0e502fa01f9e8e8f2dee6ff25`. No upstream code was installed, run,
forked or imported. Runtime conformance and founder approval still precede any
foundation replacement. The [P1 report](milestones/0001-completion.md) records the
local desktop implementation and its limits.

## Landing visual refinement — 6 November 2026

The founder approved the existing Ag logo and general silver website concept,
then requested improved artwork, new typography, a full Laws of UX review and
premium motion throughout. On `GregPat22/argent-landing-page-draft`, the revision
preserves the original logo/wordmark, uses Space Grotesk with Manrope, and shares
a silver conductivity motif between a connected-loop hero, drawn section accents
and the roadmap. “Argent is a good conductor” is the second section heading, with
concrete explanatory copy and planned-capability qualifiers. The typography and
artwork are implemented proposals awaiting visual feedback, not a public launch.

See [the UX review](research/landing-ux-review.md) and
[W0 acceptance criteria](specs/0005-website-landing-draft.md). Motion+ tooling was
unavailable; public Motion supports the implementation without private packages.
No engine, desktop packaging, merge or deployment decision changes here.

## W0.2 visual simplification — 6 November 2026

Founder feedback supersedes the W0.1 section-signature proposal: remove its
labels, numbers, icons and rules, the navbar progress trace and the workflow
rail. Preserve approved branding. On `GregPat22/argent-landing-page-draft`,
concentrate motion in the fluid silver hero, the “conductor” word and a stylized
47-electron silver atom. The seven-step scroll presentation becomes three
keyboard-selectable stages while retaining its product/verification boundaries.
See [the research and tradeoffs](research/fluid-motion-refinement.md) and
[W0.2 acceptance criteria](specs/0005-website-landing-draft.md). Neither visual
illustration is a physical simulation or evidence of real agent execution.

## Foundation decision for bounded M1a, 6 November 2026

On `GregPat22/next-step-v2`, the founder delegated technical choices to the
engineering agent. Retain the current Argent core for the bounded M1a lifecycle
and credential/bootstrap work. This resolves the earlier technical selection
gate; it is not permission to fork, replace the foundation or provision resources.

The current core already proves transactional state/events, atomic claims,
conservative uncertain-outcome handling and desktop/service separation. The
pinned T3 source review identified different retry, retention and durability
policies and substantial adoption coupling; it established no runtime advantage.
Replacing the core now would add migration risk before the provider contracts
are exercised. A runtime spike is deferred until measured complexity or missing
capabilities justify it. Keep new lifecycle machinery narrow and test it against
fake-provider failure windows before real integrations.

Technical implementation choices are owned by the engineering agent. Escalate
product changes, foundation replacement and concrete external spending/actions
where authorization is actually required, rather than asking the founder to
choose routine architecture details.

## Official Argent icon and W0.4 direction — 6 November 2026

The founder supplied and selected the silver A image as Argent’s **official
icon**, superseding the Ag periodic-table tile for product branding. The original
RGBA image is preserved in `website/public/brand/argent-icon-source.png`; its
provenance, hash and faithful derivatives are documented in
[the brand asset record](../website/public/brand/README.md). Website navigation,
footer, illustrated app marks and browser/touch icons use it. Native desktop
packaging remains a separate follow-up, not a rebuilt release in this pass.

The founder also requested a complete replacement of the silver loop with a
more harmonious bubble composition, shorter conversion-oriented copy, fluid
silver buttons and a properly restyled navigation bar, following Laws of UX.
The implemented proposal uses “Delegate work. Keep control.”, five slowly
drifting silver volumes, fixed action hit areas, a floating persistent navbar
and four navigation choices. This is a visual/UX proposal, not evidence of a
conversion-rate improvement. See [W0.4](specs/0005-website-landing-draft.md).

## W0.5 hero removal and larger atom — 6 November 2026

Founder feedback supersedes W0.4's hero artwork: delete the bubble animation,
shader, fallback and pause control from code; keep the accepted icon, headline,
buttons and navbar. Remove the atom's manual pause control as well, and enlarge
it to a responsive 480px desktop maximum. Automatic offscreen/hidden suspension
and reduced motion remain.

Checked neutral silver against [NIST](https://physics.nist.gov/PhysRefData/Handbook/Tables/silvertable1.htm):
Ag has Z=47 and ground-state configuration [Kr] 4d¹⁰ 5s¹. Grouping that
configuration by principal shell gives 2/8/18/18/1. The depth-projected moving
rings depict those populations artistically; they are not quantum orbitals or
physical electron trajectories. The [DOE explanation](https://www.energy.gov/science/doe-explainselectrons)
describes electrons through probability clouds rather than planetary paths.
The illustration is labeled accordingly and its fallback includes 47 markers.

## W0.6 direct copy and compact navigation — 6 November 2026

The founder requested plainer headings, more explicit product paragraphs,
removal of atom captions and name-origin copy, use of a supplied wide ARGENT
image in the footer, and a borderless navbar that compacts to its logo on scroll.

Inter replaces Space Grotesk for every heading; unused Bodoni/typed-wordmark
fonts are removed. Hero, task/review and verification copy now state the intended
workflow directly, with current simulation/integration limits nearby. Visible
atom captions are removed; its accurate accessible description is retained.

The supplied wide artwork is preserved byte for byte with faithful derivatives
and [provenance](../website/public/brand/README.md). It is a large footer link to
the page top, alongside real resource links. The footer does not intercept clicks
on blank space or contain nested anchors.

The navbar has no border or typed name. Scrolling beyond 120px compacts it to one
48px logo control at the viewport top-left. That logo opens a navigation
disclosure; ordinary links remain available at the page top. It expands again
below 48px to avoid threshold chatter. Motion layout springs animate the change
from a fixed layout root; reduced motion uses zero-duration transitions.
Keyboard navigation skips collapsed controls, Escape restores trigger focus,
and deep links initialize the correct state. This follows the founder's visual
request while preserving target size, choice reduction and accessible navigation.

## Familiar Conductor replacement — 6 November 2026

Branch `GregPat22/conductor-layout-create`, base main `333d662` (PR #8).
The founder explicitly wants an experience as familiar as possible to Conductor,
with mobile, cloud-file migration and the ability to use existing subscriptions
across providers. This revises the prior advice against prioritizing parity and
promotes these tracks ahead of team handoff/dependency orchestration. Familiarity
uses original code/Argent identity, not an upstream fork or imported implementation.

The [roadmap](../ROADMAP.md) and [P2 specification](specs/0008-conductor-familiar-desktop.md)
separate the existing one-agent engineering proof from a personal replacement
release. Initial breadth targets are Claude Code and Codex, then Cursor/OpenCode;
all four have explicit preview tabs now. Two working official integrations and
verified subscription routes for advertised environments are the proposed personal
release gate. “Every subscription” is product intent, not proven universal support.
No subscription credential transfer or silent API billing is allowed.

Cloud migration means selected files and readable context first; live-session
resume needs separate provider/version proof. Consent/sample/schema work precedes
a Conductor importer. Mobile means a narrow authenticated companion and a native
iOS delivery track using the independent service; no public M0 exposure or phone
execution. Delivery dates, commercial packaging, Android, new customer evidence
and exact provider eligibility remain unresolved.

Direct read-only Conductor workspace/Home/agent-settings inspection informed the
raw layout. Real simulation navigation, task review and artifact verification are
preserved; connection/migration/mobile/file/diff/terminal integrations remain
clearly labeled planned. No external account, export, paid resource, merge or
publication was performed. See the handoff for fresh verification evidence.

## Desktop UX and Lucide icon system — 6 November 2026

On `GregPat22/conductor-layout-create` (base main `333d662`), the founder requested
premium/intuitive refinement of the entire application and a free icon pack,
explicitly excluding the landing. [Spec 0009](specs/0009-desktop-ux-polish.md)
records the Laws of UX heuristic review and acceptance criteria. Larger desktop
controls/readable text, charcoal/silver surfaces, grouped forms/settings and
familiar pane placement are selected; no measured usability gain is claimed.

Lucide Static 1.70.0 was downloaded from the official npm registry and its SHA-512
integrity verified. A curated 45-SVG subset is vendored unmodified with its full
ISC/Feather-derived MIT notices in `ui/icons/`; desktop packaging includes notices.
Icons use CSS masks and shared sizing/current color, without a font/CDN/runtime
package. Argent's approved brand image remains separate. Website files are untouched.

Inspector/provider/terminal tabs use roving keyboard focus, search supports
arrows/Enter, and Cmd/Ctrl+Enter opens task/runtime review. Drafts remain scoped
to their workspace in renderer memory; pending uncertain submissions retain their
identity. Native dialog Escape/focus restoration remains immediate. Short
opacity/transform entry and hover/press feedback respects reduced motion. No
constant decorative animation or fake execution progress is introduced.

Expanded native recovery testing exposed an existing shutdown race: stopping
an active simulated worker could leave the stop HTTP socket answering keep-alive
polls while `server.close` waited, so UI availability returned online. Independent
reproduction traced abort → worker completion → blocked server close. The stop
response now explicitly closes that connection. A regression fails without the
header and passes with it; interrupted work remains `needs_attention` with no
replay. No new API operation or execution authority is introduced.

## Encrypted simulation custody — 6 November 2026

On `GregPat22/next-step-v5`, based on main `7b2eeca`, retain opaque credential
references and encrypted synthetic tokens within the existing single-host SQLite
boundary. An explicitly injected dedicated 256-bit key stays outside SQLite;
AES-256-GCM binds ciphertext to its operation and authorization identities.
Capture precedes token acceptance/use; acknowledged revocation or independently
confirmed audited resolution removes the active encrypted payload transactionally.
This is an internal engineering choice for restart testing, not selection of a
production secret-management system. Key custody/rotation/backup, unknown mint
outcomes, audited recovery cleanup and live adapters remain open. See
[the bounded acceptance contract](specs/0007-cloud-workspace-lifecycle.md#fourth-implementation-slice-encrypted-simulated-credential-custody).
