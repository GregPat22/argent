# Conductor shutdown: evidence, strategy and proposed Argent changes

Reviewed 6 November 2026 on `GregPat22/grok-conductor-shutdown-analysis`, based on
`fd60a5a878fdde3f129c0f276b74b647ea373760` (also the observed `origin/main`).
Input: the founder's [original Grok research](sources/grok-conductor-report-2026-11-06.txt),
compiled 4–6 November and preserved unchanged as an attributed secondary source.
The original report's assertions are not all independently verified. This is a
research review preserving the initial proposals. The founder subsequently
authorized incorporating the findings into the [roadmap](../../ROADMAP.md) and
[continuity contract](../specs/0006-continuity-and-market-validation.md). That
adopts planning direction; implementation and provider eligibility remain pending.

## Judgment

Keep Argent's desktop-first, headless, persistent-cloud foundation. The shutdown
strengthens the reason for independently usable software and portable work.
It does not validate customer demand for our particular autonomous workflow.
The strongest challenges to our plan are adoption friction, subscription
compatibility, interactive control, practical portability and existing competition.

Recommend a bounded customer/authentication validation gate alongside the existing
foundation decision, then one real cloud task with visible changes, cancellation,
recovery and evidence. Propose export/restore as a release requirement. Do not
expand immediately into a Conductor feature-parity project or a new VM runtime.

## Evidence quality and corrections to Grok

The attachment supplies no URLs, post IDs, sampling method, unique-author count,
engagement denominator or distinction between users and vendors pitching tools.
Repeated research rounds are not independent corroboration. It is a useful map
of hypotheses; it is not a representative X survey or a market-sizing study.

| Claim                                                                                          | Assessment on 6 November                                                                                          | Consequence                                                                                                                       |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Conductor is joining Meta                                                                      | Confirmed by the [founder's announcement](https://www.conductor.build/announcement).                              | Treat this as a real continuity event. Acquisition alone says nothing about profitability or the reason cloud is closing.         |
| Cloud read-only 13 November; shutdown 20 November; local model/critical fixes until early 2027 | Confirmed by the [official release note](https://www.conductor.build/changelog/0.93.0-conductor-is-joining-meta). | The effective deadline for active cloud interaction is 13 November. Early 2027 is a support window, not an exact local kill date. |
| Sign-ups/downloads closed, existing Pro free, refunds, deletion begins at shutdown             | Stated in the [official timeline and FAQ](https://www.conductor.build/announcement).                              | Deletion beginning is different from all copies being deleted that day.                                                           |
| Transfer to local and full account export exist                                                | Confirmed in the [release note](https://www.conductor.build/changelog/0.93.0-conductor-is-joining-meta).          | An export is not proof another tool can restore a runnable session.                                                               |
| More than 100,000 users                                                                        | The [company homepage](https://www.conductor.build/) advertises 100k+ builders.                                   | Not a count of active cloud users, paying teams or customers available to Argent.                                                 |
| Broad demand for cloud, subscriptions, mobile, multiplayer and non-Electron apps               | Some qualitative corroboration; no population-level prevalence established.                                       | Interview distinct users and record tradeoffs before setting priorities.                                                          |
| No complete replacement has emerged                                                            | Not established by an exhaustive hands-on evaluation.                                                             | Do not position Argent as the only cloud replacement.                                                                             |
| Enterprise controls are still limited in most tools                                            | The claimed prevalence is unmeasured; several vendors advertise enterprise controls.                              | Availability, quality and audit assurance need separate verification. This is not an empty category.                              |
| Most alternatives cannot seamlessly import full Conductor sessions                             | Supported for sampled migration paths, not established across the whole category.                                 | Distinguish source exports, Git transfer, session-file recovery and destination import.                                           |

The report's claim that there were no intervening updates is not independently
provable from checking the current pages. Deal economics and the motivations for
the shutdown were not established here. No inference about cloud unit economics
should be presented as the cause of this acquisition or closure.

## What the X evidence actually supports

[Flavio Copes' 5 November roundup](https://flaviocopes.com/conductor-alternatives/)
links three concrete posts: [Manuel Castro](https://x.com/manny4c/status/2118051955646030027)
asks for subscriptions, cloud and team handoff; [Jared Rhizor](https://x.com/jaredrhizor/status/2118067487975911791)
asks for cloud-first alternatives; [Josh Pigford](https://x.com/Shpigford/status/2118096646856704454)
reports problems trying replacements. Direct X retrieval returned 403 for all
three. Their descriptions here are secondary reporting, not independently read
posts or verified verbatim quotations.

Founder follow-up: the founder says they verified the underlying X material.
Record that as founder-confirmed qualitative evidence. No post corpus or source
links accompanied that confirmation, so this review's independent-access and
sampling limits remain. No additional source-verification answer is pending.

Search also surfaced mirrors of Ryan Shea's comparison announcement and Loic's
claimed 134-option thread. Those are discovery leads, not a validated feature
matrix or an audited count of distinct viable competitors. The report's exact
short-notice quotation, non-Electron preference, Project X and Kcap claims remain
unverified in this review. Do not infer frequency from a few highly visible posts.

The actionable hypotheses are that people value continuity of an active work
environment, an interface they can understand quickly, their existing model
spend and the ability to return or hand off without reconstructing context.
Those hypotheses support our investigation. They do not establish willingness
to pay for autonomous specification execution, independent verification or MIT
licensing. Vendor replies and comparison-thread mentions are supply signals.

## Competition changes the interpretation

These are dated primary-source capability claims, not hands-on certifications.
No competitor's crash recovery, security, performance or authentication was tested.

| Alternative                                                                | What its own material establishes                                                                                                                                                                                                                         | Implication for Argent                                                                                                                                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Boxes.dev](https://boxes.dev/)                                            | Advertises managed per-agent cloud computers, laptop-independent execution, existing Claude/Codex subscriptions, desktop/web/mobile/CLI and shared sessions. Lists $19/50h and $99/300h monthly tiers; model spend is separate from its compute offering. | Direct competition for the alleged cloud gap. Its advertised workflow substantially overlaps our broad promise. Price is an offer, not proof of sustainable margins or our achievable costs. |
| [Paradev pricing](https://paradev.com/pricing)                             | Team lists $60/seat/month monthly, cloud workspaces in beta and 150 standard-workspace hours. Enterprise lists SSO/SCIM and audit features.                                                                                                               | Cloud and collaboration already have funded competitors. Public availability and reliability still require evaluation.                                                                       |
| [Paradev migration](https://docs.paradev.com/migrate-from-conductor-cloud) | Documents local/cloud migration, states chats cannot be imported, and labels cloud early access.                                                                                                                                                          | Migration help is already competitive onboarding. Preservation remains useful without claiming perfect session resumption.                                                                   |
| [Paseo](https://paseo.sh/)                                                 | A headless daemon can run on a laptop or server, with clients connecting remotely and optional encrypted relay.                                                                                                                                           | Remote access to a customer-operated machine is an existing substitute. It requires that execution host to remain available.                                                                 |
| [T3 Code](https://github.com/pingdotgg/t3code)                             | Open-source, remote-ready server/client product with multiple agents and background-service support.                                                                                                                                                      | Open source plus a headless architecture is valuable but insufficient differentiation. Our pinned source spike remains relevant.                                                             |
| [Tutti](https://tutti.sh/)                                                 | Distinguishes cloud/local rooms and local agents, advertises team collaboration and says subscription accounts stay on the user's computer.                                                                                                               | Shared cloud files do not by themselves prove laptop-independent agent execution. Determine where each agent runs and what survives disconnection.                                           |

Orca and Emdash remain relevant to reuse and local/remote workspace UX; see the
[existing due diligence](technical-due-diligence.md). A long catalog adds less
decision value than testing the two closest workflows on the same real task.
Single-provider products are also substitutes for a one-agent MVP: users may
prefer their existing provider unless Argent proves a useful additional outcome.

Do not claim competitors lack exact-commit verification merely because these
marketing pages do not establish it. That is a product test to perform. Protocols,
adapters and open-source licensing are reproducible; a defensible advantage would
need measured reliability, successful workflows, trusted operations and adoption.

## Fit against Argent's actual plan

| Requirement or signal             | Current plan and implementation                                                                         | Assessment / proposal                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Work continues with laptop closed | Accepted cloud requirement; P1 only survives desktop exit on an awake local host.                       | Strong architectural alignment, no real cloud proof yet. Make the closed-laptop journey the next product demonstration.                      |
| Ownership and vendor continuity   | Accepted independently usable MIT core; no tested cloud-to-self-host restore.                           | Intent is right. Add an operational exit/restore drill; a license cannot restore hosted disks or credentials.                                |
| Keep existing subscriptions       | M1 criterion 4 selects Codex API-key auth; no agent implemented.                                        | Potentially serious adoption mismatch. Validate permissible provider-specific routes and user preference before locking onboarding.          |
| Interactive control and review    | Cancellation/history exist for simulation; real diffs, intervention and approval flows are future work. | Autonomous delegation must still explain progress, blocked input and uncertainty, with explicit controls. Prioritize evidence and review UX. |
| Full-context migration            | No importer/exporter or portable recovery bundle.                                                       | Real gap. Start with safe preservation and readable context; investigate a redacted export sample before promising resume.                   |
| Mobile and multiplayer            | Explicitly outside first MVP; second-client reconnect is in M1.                                         | Sound for a bounded solo pilot, a mismatch if displaced cloud teams are the first customer. Segment decision precedes scope expansion.       |
| Non-Electron preference           | P1 is Electron; prevalence of this preference is unverified.                                            | No rewrite justified. Measure launch time, responsiveness and memory with target users before choosing a shell replacement.                  |
| Multiple agents                   | Vision supports them; MVP has one agent and serialized workspace writers.                               | Keep the first failure surface small. If mixed Claude/Codex usage is essential, prioritize a second adapter before task graphs.              |

The repository at `fd60a5a` contains the P1 merge, including the refresh fix.
`HANDOFF.md` and several documents still describe main as M0 awaiting PR #1.
That historical branch status is stale. Inspection of `src/adapters.ts` and
`src/worker.ts` confirms current execution is a fixed JSON simulation: no repository
checkout, model, real cloud sandbox, production authentication or tested PR.

## Authentication is a product decision as well as an integration decision

The earlier due diligence correctly prohibits extracting host credentials. It
needs qualification on the supported alternatives. Current documentation is more
specific than either blanket subscription support or a blanket prohibition.

OpenAI's [plan-usage overview](https://developers.openai.com/siwc/token-sharing-open-source)
documents OAuth for open-source/local tools and directs paid or remotely hosted
apps to a separate interest path. Its [VM guide](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms)
describes self-hosted credential transfer and limits on host-specific attribution
and revocation. The [app-server guide](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
documents an integration route, but publication of that route does not establish
Argent managed-cloud eligibility. Keep API-key auth as the proposed baseline
until the applicable deployment is verified.

Anthropic's [Claude Code policy](https://code.claude.com/docs/en/legal-and-compliance)
allows hosting the unmodified binary under stated commercial conditions with
end users authenticating themselves. It separately restricts third-party Claude.ai
login, credential intermediation and SDK applications using consumer plan tokens.
This warrants evaluating a hosted official-binary route; it does not establish
that an arbitrary managed authentication broker is permitted.

Separate local, customer-operated remote and Argent-managed deployments in the
capability matrix. Test sign-in, renewal, quota exhaustion, cancellation and
revocation. Provider usage limits may stop a job even while infrastructure remains
available. No route is implemented, no account entitlement verified, and no
commercial provider approval obtained by this research. Do not copy credentials
or weaken existing repository security rules to investigate it.

## Technical changes worth proposing

1. **Make continuity observable.** Show execution location, last durable event,
   last confirmed runner contact, blocked input and verification status. A live
   connection, an active process and a completed task are separate facts.
2. **Make exit practical.** Version a portable bundle of task intent, events,
   transcripts, repository/base/head IDs, uncommitted changes where supported,
   policy and evidence manifests. Include capability/version metadata, hashes,
   secret exclusions and an explicit inventory of omitted data. Test restore to
   an independent installation with Argent-hosted endpoints unavailable.
3. **Preserve uncertainty on restore.** Imported active runs must reconcile or
   become `needs_attention`; restoring records must not replay cloud creation,
   agent turns, pushes or PR creation. Provider memory images are not a portable
   recovery format. Restore readable evidence even when live resume is unsupported.
4. **Separate context from executable authority.** Imported chats are untrusted
   historical data, never trusted policy or proof of tests. Preview config/script
   mappings; do not execute discovered setup/archive commands during import.
5. **Keep human control available.** Add explicit awaiting-input/approval handling
   only with defined transitions, timeout/budget policy and provider tests. Preserve
   cancellation acknowledgment and reconcile a runner that cannot confirm stopping.
6. **Keep the existing trust boundaries.** Git worktrees separate changes, not
   security domains. Real repository code runs in isolated compute; trusted check
   policy and the PR broker remain outside the agent's authority. PostgreSQL and
   remote authorization remain gates for managed release.

These extend, rather than replace, M1. Full cross-vendor live-session migration,
enterprise SSO and native mobile applications should not be prerequisites for
the first one-user end-to-end proof. Team access would require explicit actor
identity, repository/workspace authorization, approval authority and accounting;
a shared bearer token is not multiplayer.

## Strategic choices and proposed sequence

My recommended first segment is developers or small teams already delegating
bounded coding tasks who value returning to reviewable work. This is a proposed
segment, not the founder's decision or validated demand. A possible positioning
is: “Delegate a task, disconnect, return to changes with evidence you can inspect
and take with you.” All future capabilities must remain labeled as such.

The founder asks why we should not serve all three proposed audiences. We can:
they overlap. Displaced Conductor users are an acquisition cohort; solo/small
teams describe customer organization; shared workflows and auditability describe
needs. One developer can fit all three. Recommend a common product for all three
with staged delivery: personal cloud delegation and readable evidence, then scoped
team handoff, then advanced organization controls as demonstrated demand requires.
Auditability belongs in the core from the beginning. Enterprise procurement,
SSO/SCIM and compliance attestations are additional commitments, not prerequisites
for serving a small engineering team. Do not impose those on the founder's answer.

For authentication, the founder asks for a recommendation rather than expressing
an API-key preference. Recommend supported subscription sign-in as the preferred
eventual onboarding wherever the provider permits our deployment, with API keys
as a clear alternative. A separate API account and usage bill could increase
friction for users already paying for a model plan; its actual adoption impact is
unmeasured. Retain API keys for the first controlled technical pilot while proving
the subscription path. If managed subscription use is unavailable, test API-key
acceptance and total cost explicitly before positioning Argent as a replacement.
Never silently fall back from a subscription quota to billable API usage.

The Conductor migration window can help discovery, but P1 cannot honestly absorb
production cloud workflows by 13 November. We should not compromise isolation,
auth or recovery to hit that date. The acquisition also removes a supplier while
the same team promises a successor; it does not permanently remove competition.

Proposed sequence:

1. Map the overlapping audiences to the common workflow and define the pilot
   order; evaluate the recommended subscription-first onboarding by deployment.
   Keep the foundation runtime decision separate from customer validation.
2. Interview a proposed 5–8 qualified users, distinguish solo/cloud-team/local
   users, and test the same task in closest alternatives. This is a small discovery
   exercise, not a statistically representative sample. Do not contact anyone
   without authorization. Record failed onboarding and unwillingness to pay too.
3. Prove permitted authentication and real isolated execution for one agent, one
   repository and one workspace. Add no billable resources without approval.
4. Complete the existing exact-commit checks, independent review and authorized
   draft-PR journey, with progress, intervention and recovery controls.
5. Before managed release, prove export/restore and independently usable operation.
   Add safe Conductor preservation/import only after inspecting a consented,
   redacted sample and selecting the promised import scope.
6. Stage authorized team handoff after the personal cloud proof and evaluate
   lightweight mobile access before native mobile apps. If team replacement is a
   launch promise, propose these ahead of task dependencies and explicitly revise
   scope. Until then, keep the existing one-user MVP contract.

Measure time to first useful result, trustworthy completion, human interventions,
review time, recovery time and total cost per accepted task. Total cost includes
compute, idle storage/snapshots, inference/review/repair, control plane and support.
Compare against using the same agent directly; a passing test suite alone does
not establish task correctness or business value. No demand, retention, margins,
TAM or acquisition cost is established by the available evidence.

Reasons to change direction would include repeated insistence on an unsupported
subscription route, preference for existing interactive tools over our workflow,
or no material gain in review/recovery time. The nearby alternative is a portable
interactive cloud workspace with evidence as an enhancement; choosing that would
need founder approval and a new scope decision. Do not select it from X chatter.

## Decision and evidence boundary

The founder wants all three audiences considered, asks for our authentication
recommendation and confirms having verified the underlying X research. The
overlapping-audience sequence and subscription-first product recommendation above
incorporate that response; exact launch scope and provider feasibility remain
unresolved. The linked
[continuity acceptance criteria](../specs/0006-continuity-and-market-validation.md)
and roadmap now incorporate the findings following the founder's request to save
the context and update the roadmap. Exact launch packaging and verified provider
permissions remain open; no runtime feature was implemented.

This work changes documentation only. Repository checks validate the local
prototype, not Grok's sentiment claims, competitor quality, provider eligibility
or a real cloud workflow. No fork, runtime rewrite, migration of user data,
external contact, remote publication, merge, provisioning or deployment occurred.

Initial research validation passed `npm run check`: strict types, formatting,
compilation and 41 tests, zero failures/skips. All 48 relative file links across
the six changed documents resolve; whitespace checks passed and the actual edits
were reviewed. Native desktop/package smoke and real-provider tests were not run
for this documentation change. Installation reported the existing five moderate
packaging dependency findings; no dependency versions or lockfile changed.
