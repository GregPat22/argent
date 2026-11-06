# Landing-page UX review — 6 November 2026

Branch: `GregPat22/argent-landing-page-draft`, following `c70cb4c`.
Scope: the single `/` website route, all eight sections, navigation and footer.
A separate Laws of UX agent audited the source and reviewed the implementation
again. The implementing agent owns browser evidence; this is a heuristic review,
not measured user research or a conversion study.

| Principle           | Finding                                                       | Applied change                                                                                      |
| ------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Jakob / Fitts       | Navigation disappeared below desktop width                    | Mobile disclosure menu, Enter/Escape support, expanded state, 44–48px targets and a skip link       |
| Aesthetic usability | Typography and visual detail varied across sections           | Space Grotesk headings, Manrope body, retained logo and a shared silver trace/orbit/seal language   |
| Similarity          | Static commitments and roadmap felt separate from the hero    | Silver surfaces, metal nodes, spring entrances and drawn section signatures                         |
| Cognitive load      | Essential text faded to 14%/28% opacity                       | Fully readable statement and workflow copy; explicit reduced-motion handling for hero scroll values |
| Miller / Hick       | Seven workflow steps occupied over five desktop screens       | Shorter desktop pacing and naturally sized mobile steps, retaining every checkpoint                 |
| Proximity           | Example check results appeared without an immediate qualifier | Adjacent planned-workflow/simulated-evidence caption; explicit prototype and cloud status           |
| Fitts               | Small copy/footer controls and clipped slider endpoints       | 44px targets, inset slider handle at endpoints and scrollable terminal output                       |
| Feedback            | Clipboard failure had no useful fallback                      | Announced copy success/failure and instructions to select the terminal commands                     |
| Peak-end            | Later sections lost the silver identity                       | Conducting roadmap rail, original logo in the roadmap and original silver wordmark in the footer    |

The roadmap trace tracks reading progress, independently of delivery labels.
P1 is complete on its desktop review branch with simulated execution; signed
public downloads, cloud workspaces and real agents remain planned. No new
customer claims, signup endpoints, download links or prices were introduced.

The sculpture uses a ray-marched WebGL2 silver loop, pointer-sensitive lighting,
a 30fps render cap and a bounded drawing buffer. It stops offscreen/when hidden,
has a user pause control and uses one static frame for reduced motion. The
non-WebGL fallback is a static CSS silver loop. Section accents run once in view;
there are no added indefinite ambient loops. Most UI motion uses transforms and
opacity; the SVG path drawing and shader remain deliberate rendering costs.
Existing comparison clipping and footer sheen also require painting. Native
anchor scrolling replaces Lenis, keeping the content tree stable when motion
preferences change and preserving familiar keyboard/browser scrolling. This is a
source assessment, not a measured MotionScore or real-device performance claim.

During the initial visual pass, Motion AI/Motion+ MCP tools were not exposed.
A subsequent setup investigation found the servers registered for Claude Code,
while the session used Codex. They are now registered and OAuth authenticated
for Codex, with real documentation/source reads and spring generation verified.
See [the setup record](../briefs/landing-page.md#verified-codex-setup). Public Motion
14.10.0 and [official scroll guidance](https://motion.dev/docs/react-use-scroll)
plus [reduced-motion guidance](https://motion.dev/docs/react-use-reduced-motion)
were used for the visual pass. No premium source, private package or credential
was added to the repository. The tooling reference is
[Motion AI Kit](https://motion.dev/docs/ai-kit).

Browser/check evidence is recorded in the W0 specification and tracked handoff.
Next: founder visual feedback, optional real-device/Safari QA and explicit merge
review against main. The desktop branch and website directory still need an
intentional integration decision. No merge or deployment was performed here.
