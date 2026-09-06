# Stride Daily: visual design and motion

## Reference decisions

- Things: readable daily structure and progressive disclosure. https://culturedcode.com/things/features/
- Linear: predictable control placement, quieter surfaces and clear hierarchy. https://linear.app/now/behind-the-latest-design-refresh
- Emil Kowalski: immediate press feedback, short purposeful motion, clear entry/exit, transform/opacity animation. https://emilkowal.ski/ui/good-vs-great-animations
- Stride: existing brand mark and diagonal accent, signature blue. https://stride-ai.nl

## Implemented

Branded daily brief and wordmark, lighter heading hierarchy, individual metric cards, prominent Capture, floating mobile navigation, segmented action filters, and consistent sheet styling. A seven-day home schedule shows real calendar entries, per-day indicators, and expands busy days without leaving home. Schedule shortcut jumps directly there.

Motion uses CSS transform/opacity: 200ms sheet entry, 160ms exit, 140ms press response, short schedule/confirmation transitions, and a finite brand mark entrance. Reduced-motion CSS removes these movements. No animation dependency or continuous decorative loop added.

## Validation

- Production build and TypeScript pass; lint has no errors and two pre-existing warnings.
- 513 tests pass, one skipped. New tests cover year rollover, leap day and DST dates.
- Browser: 390x844 light and dark visual review; populated three-entry day selection and expand; 320px page has no horizontal overflow and day targets remain 44px (week strip scrolls internally).
- Radix sheet reports the expected 200ms entry animation. Escape completes exit, unmounts the dialog and returns focus to Capture.
- Fixed selected-control contrast in dark mode by retaining the saturated action blue under white labels.
- Temporary client fixtures removed; appearance restored to device setting.
- Physical iPhone keyboard/VoiceOver and OS reduced-motion simulation remain unverified. Reduced-motion rules were reviewed in source.

## Release

Pushed through existing GitHub main branch. The shared site is served by the Mac mini, which still requires its local pull/build/service restart; this machine has no established remote access.
