# W0.4 liquid silver redesign

Historical visual pass: W0.5 subsequently removes the bubble hero and all manual
pause controls, while retaining the icon, buttons and floating navigation.
The silver atom is enlarged and labeled as an illustrative shell model. See
[the current specification](../specs/0005-website-landing-draft.md).

6 November 2026 · `GregPat22/motion-landing-page-improve`, continuing W0.3 on
`b5e763f`. Founder direction and acceptance live in
[the landing specification](../specs/0005-website-landing-draft.md).

## Applied Laws of UX

| Heuristic                      | Concrete decision                                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hick / serial position         | Four top-level navigation choices; one prominent “See it in action” CTA leads to the reconnect illustration. GitHub is secondary, and the ending still offers a real local demo.    |
| Fitts                          | At least 48px action/control targets. Hover moves only link contents and reflections; target geometry stays fixed. Workflow tabs remain stationary too.                             |
| Jakob                          | Home-linked logo at left, ordinary links, a native mobile menu button with expanded state and Escape focus restoration; persistent navigation, normal cursor and browser scrolling. |
| Proximity                      | Product explanation, actions and prototype limits stay together. The FAQ groups release/agent/evidence answers without making the hero carry every detail.                          |
| Similarity                     | One silver primary/secondary action recipe across hero, navbar, local-demo CTA and illustration controls, plus the same supplied icon throughout.                                   |
| Aesthetic usability / peak-end | Five coordinated rounded silver volumes replace the loop. Short “Delegate work. Keep control.” copy puts the benefit first, with the local simulator as a concrete final action.    |

These are design heuristics, not a measured conversion study. No adoption,
conversion, performance or usability percentages are inferred from them.

## Motion and rendering

Live Motion AI searches and full reads of
[useSpring](https://motion.dev/docs/react-use-spring) and
[layout animations](https://motion.dev/docs/react-layout-animations) informed
spring-following content and the navbar selection surface. The latter sits in a
fixed layout root. A Motion+ magnetic-pull reference was retrieved and evaluated;
its source was not copied into this public repository.

Motion+ generated the CSS spring for hover shape/arrow feedback with 0.32s
perceptual duration, 0.12 bounce and 400ms settling. Reflection sweeps are finite
and event-triggered. Their small masked button region repaints; the effect is not
advertised as free compositor work. Link contents use public Motion springs,
with live reduced-motion gating. Target bounds remain stationary.

The original WebGL distance field now combines five spherical volumes with slow
coordinated phases and broad studio reflection bands. Pointer response gently
expands the main volume and offsets the group through spring values without
React rerenders per frame. The 30fps cap, bounded drawing buffer,
visibility/offscreen suspension, pause control and still reduced-motion frame
remain. A matching five-globule CSS fallback replaces the old ring. This is an
art-directed illustration, not a fluid solver or evidence of agent execution.

The supplied icon is retained byte for byte with faithful web/browser derivatives;
see [provenance](../../website/public/brand/README.md). Website runtime and native
packaging remain independent. No private runtime dependency, account setting or
credential was added.

Production browser evidence, actual-diff review and remaining device/Safari limits
are recorded in the specification and HANDOFF.md. Screenshots remain ignored local
evidence under `.context/liquid-redesign/`.
