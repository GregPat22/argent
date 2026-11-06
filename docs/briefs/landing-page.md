# Argent landing-page brief

**Current W0.6 direction:** use explicit task/review/verification copy with fewer
silver metaphors, remove visible atom captions, use plain Inter headings and the
new supplied wide footer wordmark as a home link. Remove navbar border/typed
name; scrolling compacts navigation to a single logo at viewport top-left that
opens the navigation links. This supersedes the earlier conductor heading,
footer name-origin text, Grotesk typography and floating bordered bar.

**Current W0.5 direction:** remove the hero bubble artwork/renderer entirely and
retain the W0.4 icon, headline, buttons and navbar. Enlarge the silver atom and
remove its manual pause UI/state, retaining reduced-motion and automatic
offscreen/hidden suspension. The atom is an illustrative shell model with a
verified neutral-Ag electron configuration. Earlier animated-hero requirements
below are historical and superseded by this founder feedback.

Recorded 6 November 2026. This is the handoff for the landing-page worktree.
Product facts come from the [project context](../PROJECT_CONTEXT.md),
[vision](../../VISION.md), [founding brief](../FOUNDING_BRIEF.md) and
[desktop specification](../specs/0004-desktop-prototype.md). The visual request
comes from the founder's landing-page assignment. Proposed copy and technical
options below are starting points for a draft, not approved brand decisions.

**W0.4 founder update:** the supplied silver A is now the official Argent icon,
replacing the Ag tile for product branding. Preserve the supplied original and
use faithful derivatives. The founder requests a new harmonious silver-bubble
hero, shorter conversion-oriented headline, fluid silver buttons and a restyled
navbar, always applying Laws of UX. This supersedes the earlier icon/loop choices;
see [W0.4](../specs/0005-website-landing-draft.md) and the
[brand asset record](../../website/public/brand/README.md). Pricing, public
downloads and deployment remain separate decisions.

## Product and audience

**One sentence:** Argent is an open-source desktop development platform where AI
coding agents work in persistent local or cloud workspaces, while developers
inspect verifiable results and stay in control.

Design for developers who want to delegate implementation tasks without manually
supervising every terminal, lose less work to disconnected sessions and assess
actual changes rather than an agent's claim of success. These are intended users
and problems; no validated adoption numbers are supplied.

The primary product is an installed desktop app distributed from a website.
The website introduces the product and will distribute real downloads when
release artifacts exist. It is not the execution owner or a replacement for the
desktop app. Browser access may complement the desktop later.

## Five core product pillars

1. **Persistent workspaces.** Preserve repository files, dependencies,
   configuration and evidence across idle compute suspension. Real cloud
   persistence is a target capability, not integrated in M0.
2. **Durable execution and reconnection.** An independent service owns tasks;
   reconnect reads persisted activity. M0 proves this locally with scripted work.
   Laptop-independent execution requires the real remote service and worker.
3. **Evidence you can inspect.** The product aims to show diffs, trusted tests and
   independent review for the exact proposed commit. M0 verifies only a JSON
   simulation artifact, not repository tests or pull requests.
4. **Human control.** Explicit cancellation, bounded execution, visible unknown
   outcomes and separate merge authority. An uncertain effect is reconciled
   rather than silently repeated.
5. **Open and adaptable.** A self-hostable core with workspace and agent adapters.
   Codex is the first real-agent candidate; Claude Code and OpenCode are longer-term
   targets. Do not display them as working integrations without release evidence.

The differentiator is reliable, persistent, observable and controllable autonomous
development. A grid of simultaneous chat windows does not tell the whole story.

## Stage, evidence and claims

The project is pre-launch software. A P1 local desktop prototype with simulated
execution is integrated into main; see [the handoff](../../HANDOFF.md)
and [completion report](../milestones/0001-completion.md) for source and evidence.
P1 was integrated into main through PR #1. A local unsigned
package does not establish a signed public production download. Coordinate the
existing static download page with the Conductor landing-page package; both use
`website/`.

- No approved customer logos, testimonials, adoption statistics or benchmark
  claims have been supplied. Omit social proof instead of inventing it.
- Do not publish pricing, uptime commitments, security certifications or promises
  of production-grade isolation. Real cloud execution needs further validation.
- Describe planned cloud persistence, coding-agent integrations and draft-PR
  automation as the product direction or a clearly labeled preview.
- A demo of task flow may be illustrative, but must say so. Never imply the
  illustrated agent actually changed a repository or produced a tested PR.
- The GitHub repository and MIT license are real. Cloud compute, the download
  release, a waitlist backend and public website deployment are separate work.

## Founder-requested visual experience

The founder wants an impactful first draft with animation, interaction and a
combination of visual techniques, using the Motion skill, Motion and Motion+
capabilities where available. Present a coherent designed experience, not a list
of disconnected effects. Show the product story as well as the visual treatment.

No logo, palette, font family, reference site, 3D intensity or final composition
has been approved in the repository. The silver/conductivity association may
inspire a proposed visual direction. A liquid-metal or chrome aesthetic is an
option, not an existing brand identity. Clearly identify draft proposals and ask
the founder for feedback rather than representing them as established facts.

Suggested draft story, to refine with the founder:

1. A hero stating the product and showing a task progressing through a persistent
   workspace. Proposed headline: **"Keep work moving. Keep control."**
2. An interactive explanation of workspace persistence, execution ownership,
   disconnect/reconnect and independently verified evidence.
3. A preview of the path from specification to reviewed change, clearly labeled
   as the intended workflow wherever the real integration is not yet implemented.
4. Open-source and self-hosting intent, plus how the desktop app and cloud
   execution fit together.
5. A concise status/FAQ section and a CTA that has a real destination.

Use accessible semantics, keyboard interaction, visible focus, responsive layouts,
and `prefers-reduced-motion` behavior. Core content and actions must remain usable
without 3D or elaborate animation. Avoid scroll hijacking and interaction that
depends on a mouse. Load heavier visual effects progressively and measure the
actual result on mobile before claiming good performance.

## CTA, language and brand questions

Ask these unresolved questions early and continue independent layout/exploration
work while awaiting answers:

- What should the primary CTA do for this pre-launch draft: explore the preview,
  visit GitHub, or join a waitlist once a real destination/backend is supplied?
- Should page copy be English, Italian or both? Existing repo documentation is
  English; that does not establish approval of the landing-page language.
- Are there reference sites or brand assets, and how far should the proposed
  visual direction go with 3D? Ask for feedback on a concrete draft when possible.

The real repository destination is <https://github.com/GregPat22/argent>. A
"View on GitHub" link is available now. Do not invent a working download,
signup form, mailing-list endpoint, demo booking destination or customer metric.
Do not publish the site or register domains without separate authorization.

## Implementation boundaries

Preserve the root TypeScript control plane and its checks. Keep landing-page
source, dependencies and configuration in a separate website directory/package;
coordinate with existing website work before scaffolding another frontend.
Next.js, Tailwind, React Three Fiber and Lenis were the landing agent's proposals,
not founder-approved requirements. Choose only the tools the design needs and
present material stack choices for clarification. A visual draft does not require
changing the API, durable store, worker or desktop packaging.

Use free Motion from the public `motion` package for ordinary animation. Motion+
MCP access and a private runtime package are different things. Do not infer a
need for a paid package merely from a desire to use Motion+ tooling or examples.
Check license/redistribution terms for any premium source used in this public
repository. Never write a private install token or token-bearing tarball URL into
`package.json`, a lockfile, source, logs or a public commit. Do not retrieve a token
from another agent's configuration for reuse.

## Motion tooling recovery

The official setup checked on 6 November 2026 is:

```sh
npx motion-ai@latest
```

For a Motion+ member, add the hosted premium MCP server with:

```sh
npx motion-ai@latest --plus
```

The installer asks for scope and target agent. Select the agent used in the
landing-page workspace. Reconnect/reload its MCP servers after upgrading; sign in
to `motion-plus` through that agent's MCP settings. Never paste a secret into a
chat. The current official server URLs are `https://mcp.motion.dev` and
`https://mcp.motion.dev/plus`.

Motion's official guide says the earlier local `npx` server using a `TOKEN`
environment variable is retired. A tool-method error is a tooling issue, not
evidence that product context is unavailable. If premium tools still cannot load,
report the precise limitation and use official docs plus local animation guidance
for independent work; do not claim to have used tools that failed.

Sources: [Motion AI Kit installation](https://motion.dev/docs/ai-kit-install),
[Motion for React installation](https://motion.dev/docs/react-installation).
Recheck current guidance when upgrading; these are dated setup instructions.

## Draft acceptance criteria

1. Product copy follows this brief and separates current capabilities from plans.
2. The first screen makes the product and its intended audience understandable.
3. Animation and interaction support the story, with mobile, keyboard and reduced
   motion behavior verified.
4. CTA destinations are real; unresolved conversion, language and brand choices
   are surfaced rather than silently treated as approved.
5. No invented customer proof, metrics, integrations or release availability.
6. No secrets or token-bearing package URLs enter the public source tree.
7. The existing control-plane checks remain intact, website checks are appropriate
   to the chosen implementation, and the draft has a local preview with an honest
   report of what was tested and what needs founder feedback.

### Verified Codex setup

The 6 November follow-up found that the installer had configured Claude Code,
while the landing session used Codex. A Motion skill on disk does not register
its MCP servers for another agent. For Codex, the tested registration commands
are:

```sh
codex mcp add motion --url https://mcp.motion.dev
codex mcp add motion-plus --url https://mcp.motion.dev/plus
```

The CLI starts the supported browser authentication flow. Both servers are now
authenticated on this Mac. `codex mcp login motion-plus` can renew authentication
when needed. Use the installed CLI's help for current flags and
[official Codex MCP guidance](https://developers.openai.com/codex/mcp).

Actual tool names discovered from the hosted servers include
`search-motion-docs` on `motion`, and `search-motion-source` plus
`generate-css-easing` on `motion-plus`. Older skills may name the retired
`search-motion-codex` tool. Read the actual returned resource links before using
examples. Free documentation, premium source reads and spring generation were
verified through Codex's app-server client. No token-based installation is needed
for these MCP tools. Keep machine-local configuration and OAuth state out of Git.
The current chat's tool list may require host reload; the direct Codex MCP client
provided verified access during this session without replacing the running agent.
