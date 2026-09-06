# Awwwards art direction for the daily brief

References researched:
- Igloo Inc: https://www.awwwards.com/sites/igloo-inc — central sculptural object, material depth and ambient motion. Its actual site was visually inspected at https://igloo.inc/.
- Unseen Studio: https://www.awwwards.com/sites/unseen-studio — restricted palette, coordinated transitions and menu treatment.

Applied an ink-blue daily brief with an original CSS sculpture around the exact Stride mark: layered blue plates, fine orbit outlines, subtle float and moving highlight. Clear action count and next-step text remain stationary and separate from the art. The three metrics form a compact grouped surface. Font and header-logo preferences are preserved.

Motion is decorative, not a representation of backend activity. It includes an explicit pause control, automatically pauses when off-screen or the tab is hidden, and stops with prefers-reduced-motion. CSS owns animation; IntersectionObserver and visibilitychange only control playback. No WebGL runtime, external image asset, sound or animation dependency added.

QA: browser verified running → paused through the control, and running → paused after scrolling the art off-screen. A populated one-action brief was reviewed at an actual 320px iframe width with no document overflow. Temporary client fixture removed. Physical-device battery and GPU profiling have not been performed.
