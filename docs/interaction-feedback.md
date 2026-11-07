# Interaction feedback

Implemented in the current working tree, 2026-11-07. The drawing stays the primary surface: no new panel, persistent decoration, onboarding banner or runtime animation library was added.

| Interaction | Feedback | Precision and accessibility |
| --- | --- | --- |
| Place a component | 120 ms ink settle from 98% to full size | Pins, position and hit rectangle stay fixed. Imports, undo and culling do not replay the effect. |
| Complete a wire | 180 ms fade along its saved path and endpoint confirmations | Uses the committed route, with screen-sized strokes and no input interception. |
| Approach a pin | Briefly acquired, constant-screen-size halo | Incompatible bus width or protected route gets a warning treatment before commit. |
| Snap to the grid | Quiet 160 ms marker | Repeated samples of the same grid point do not restart it. |
| Select/deselect | Outline and handle opacity transitions | Deselected handles stop accepting pointer input immediately, including during the 80 ms exit. |
| Fit/Reset | Interruptible 160 ms camera transition | Direct pan, wheel or pinch stops it immediately. Startup fit stays instant; rapid Reset/+ retains predictable zoom stops. Fit reserves the measured zoom-control height. |
| Place/move near another part | At most two nearby exact-center alignment guides | Informational only: no coordinate nudging. Reference parts must be within 240 screen pixels. |
| Place over a part | Quiet overlap outline and existing-bar hint | Overlap remains allowed. At most four outlines are shown. |
| Press a toolbar button | Brief color feedback and icon press scale | Button hit rectangle stays fixed; hover effects require actual hover support. |

Reduce Motion disables transform and camera animation. The scoped preference rule also removes transitions and decorative animations; feedback does not introduce continuous motion. Changing the preference during a camera transition finishes immediately. Colors inherit the host theme.

Transient effects expire independently, so continuing to move across grid points cannot keep an older placement animation alive. Part/wire effects are capped at eight each and endpoint markers at four. Timers and animation frames use the owning window and are cleaned up on unmount. Undo, external reload, cancellation and document replacement clear stale effects. They do not enter document history, saves or exports.

New block definitions reserve a title row above the ports, keeping the full title readable without changing pin coordinates. Rotated LED/photodiode labels clear the light arrows, including mirrored variants. Existing embedded symbol definitions retain their saved geometry.

## Evidence

- `tests/e2e/interaction-feedback.spec.ts`: placement geometry, exact committed wire path, guide/overlap behavior, immediate handle deactivation, Reduce Motion and live preference changes, interruption by touch, pin-target sizing/width feedback, stable button targets, independent repeat-placement expiry, and Fit clearance.
- `tests/unit/placement-cues.test.ts`: transformed body extents, strict overlap, nearby exact alignment and ignored moving selections.
- `tests/unit/symbol-label-spacing.test.ts`: reserved bus title row with unchanged pin coordinates, and LED arrow clearance for rotation/mirroring.
- [Brief feedback recording](evidence/interaction-feedback/feedback-demo.webm) and [gallery](screenshots/README.md).
- Final counts, package hashes and verification limits: [final-quality-checks.json](evidence/final-quality-checks.json).

Chromium desktop and Android layouts are automated browser evidence. Real Obsidian/WebView behavior and Safari remain the manual/platform qualification described in [validation.md](validation.md).
