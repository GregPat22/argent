# P2.1: desktop icon system and UX refinement

6 November 2026, based on main `333d66201a2c56a556b239abfe9777a89a8c7cd4`.
Continues the P2 shell.
PR preparation integrates main `9eac908` through merge `36cdf25`; the integrated
code/test revision passes 181 root tests and expanded native desktop smoke.
Scope: the entire installed application, including navigation, sessions, composer,
inspection, settings, empty/offline/error states and every dialog. The landing
page and website assets/source are outside this refinement.

## Audit and design intent

Apply the Laws of UX principles as a heuristic review. Do not claim
measured usability gains or repeat its unsupported percentage improvement claims.
Keep the familiar navigation layout and Argent's original code and brand.

| Principle                      | Finding                                                                                                    | Refinement                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fitts                          | Small icon controls and service actions are difficult to acquire.                                          | At least 32px desktop controls, 36px navigation and 40px primary form/composer actions; visible labels/tooltips/focus. Desktop density differs from mobile touch guidance. |
| Hick / Tesler                  | Planned connection options compete with the one available simulator; disabled composer has no explanation. | Clearly separate working functionality from future connections, explain disabled states, retain task/runtime review.                                                       |
| Jakob                          | Familiar pane locations help, but keyboard tab navigation and search selection are incomplete.             | Preserve workbench layout; add standard tab arrow/Home/End navigation, search arrows/Enter and Cmd/Ctrl+Enter review.                                                      |
| Proximity / common region      | Forms, metadata and connection choices have weak hierarchy.                                                | Consistent spacing, grouped inputs, clear section headings and subordinate metadata.                                                                                       |
| Similarity                     | Unrelated Unicode symbols and text sizes look inconsistent.                                                | One licensed SVG icon family with shared size/stroke/color; coherent button/status styles.                                                                                 |
| Miller / serial position       | Long technical explanations obscure the next step.                                                         | Lead with current state and available action; disclose details nearby; keep task identity and critical outcomes visible.                                                   |
| Peak-end / aesthetic usability | Flat states and abrupt changes give little feedback.                                                       | Restrained dialog/panel/event entry and hover/press feedback; clear verified/failed/uncertain outcomes without invented progress.                                          |

## Acceptance criteria

1. Download and pin the official free Lucide static pack. Record package version,
   registry integrity and license provenance. Vendor only used SVGs and required
   notices, package locally, and use the same family throughout desktop chrome,
   dynamic rows, status/empty states and all dialogs. No remote font/CDN or new
   icon runtime dependency; keep the approved Argent brand image.
2. Establish a coherent charcoal/silver theme, readable text, restrained emphasis,
   consistent spacing/radii/strokes, clear section hierarchy and larger desktop
   targets. Main content and controls remain usable at 900×620 and 1380×900.
3. Every interactive icon has an accessible name. Decorative icons are hidden
   from assistive technology. No interactive-looking placeholder plus/menu
   affordances without behavior. Planned tools remain clearly unavailable.
4. Inspector/provider/terminal tabs expose selected state, linked tab panels and
   roving keyboard focus; settings sections remain clear navigation. Search
   supports no-result feedback, ArrowUp/Down and Enter selection. Native dialogs
   retain Escape and return focus to their trigger.
5. The composer explains disabled states and opens existing runtime review using
   its action or Cmd/Ctrl+Enter. Enter remains a newline. Preserve uncertain
   submissions and workspace-specific drafts; never dispatch from navigation.
6. Forms associate descriptions/errors with inputs and expose invalid/busy state.
   Service reconnect/stop and uncertain-run recovery preserve existing authority,
   confirmation, idempotency and durability rules. An active-service stop must
   close its polling connection, release service ownership and retain the
   interrupted simulation as `needs_attention` without replay. This fixes an
   existing HTTP keep-alive shutdown race; no new API operation is added.
7. Use short opacity/transform animations for dialogs, panel changes and newly
   appended activity, plus brief hover/press feedback. No layout animation, fake
   progress or constant decorative motion. Reduced motion removes nonessential
   animation and transitions; keyboard focus remains immediate.
8. Native desktop smoke covers new icon assets, all settings/inspection/terminal
   surfaces, keyboard navigation, composer review, form/empty/offline/uncertain
   states and both window sizes. Capture and review screenshots locally.
   Test meaningful draft/pending/keyboard regressions; preserve existing tests.
   Run `npm run check`, review the actual diff and record exact results/limits.

## Non-goals and limits

Real subscriptions, cloud migration, mobile, terminal execution and repository
diff/checkout remain future integrations. No website change, upstream app import,
account connection, paid pack, provisioning, merge, deployment or release.
The outcome is a desktop heuristic/design pass, not proof of user satisfaction,
accessibility certification or feature parity with other tools.
