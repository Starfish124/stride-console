# Stride Console UX discovery

Baseline: Starfish124/stride-console, main at 683777d. Fresh local clone at /Users/jort/Desktop/stride-console. Baseline preview: http://127.0.0.1:3210. This clone has no production data or connected services.

## Process checklist
- [x] Explore project files, instructions, recent commits and baseline browser rendering.
- [x] Confirm proposed direction and any user constraints.
- [x] Identify approaches: visual refresh; workflow-led redesign (recommended); configurable dashboard (greater complexity).
- [x] Obtain approval of the proposed design.
- [ ] Write and commit the approved design document.
- [ ] Prepare the implementation plan and proceed with implementation.

## Observations
- The homepage stacks BrainHub, metrics, RightNow, QuickMenu, PanelDeck, recipe generation, myth capture and AskStride.
- Desktop rail appears only at xl; intermediate screens use header links; phones use a tab bar. Home belongs to Content despite spanning the business.
- A fresh installation opens with a large brain illustration and empty metrics. Empty local data cannot validate populated workflows.
- The closed menu is present in the browser accessibility tree. Its open effect handles Escape and initial focus but lacks explicit focus containment and restoration.
- Sidebar links lack aria-current; query-specific SEO destinations share pathname-based active matching.
- Login founder buttons have no announced selected state; myth and ask fields appear unnamed in the observed accessibility tree.
- Existing theme includes focus-visible styles and light/dark tokens: improve the foundation rather than replacing backend logic.

## Proposed direction, pending approval
A Stride daily workspace: clear sidebar destinations, a compact contextual toolbar, and an action-first overview. Use the website's electric blue, near-black text, pale surfaces and typography character. Put urgent follow-ups, approvals and deadlines above metrics. Keep the brain as a compact contextual assistant. Standardize page headers, filters, tables, boards, detail panels and empty/loading/error feedback. Preserve current routes, data models, approval requirements and integration behavior while changing UI composition. Validate desktop, mobile, keyboard, zoom, dark mode and reduced motion.

References studied: https://stride-ai.nl/ (live visual inspection); https://linear.app/features (product reference); https://attio.com/ (live product page and visual inspection).
