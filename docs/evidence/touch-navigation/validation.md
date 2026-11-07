# Touch navigation validation — 2026-11-06

Users reported erratic two-finger pinch zoom and canvas swipes opening Obsidian's sidebars or pull-down actions on Android tablets and phones. These changes are local and unreleased; package metadata remains 0.1.5.

## Causes and changes

- Obsidian 1.15.0's installed swipe recognizer checks ancestors for inline `touchAction: none` or `data-ignore-swipe`. The editor previously supplied only a CSS rule. The canvas viewport now supplies both opt-outs; native touch/gesture listeners also cancel default behavior and stop propagation. Toolbar and inspector gestures remain outside this boundary.
- A single queued pointer event previously discarded one finger's movement when both moved during a frame. Each finger's position is now sampled immediately, with rendering still limited to animation frames.
- Pending movement is flushed before a finger lands or lifts. Camera references update synchronously so a pinch starts from the latest pan/zoom position.
- Releasing capture for a finger that already lifted no longer cancels the other finger. A remaining finger continues panning, and another finger can resume pinch zoom. Cancellation discards pending movement.
- Wheel events use a non-passive native listener so zoom cancellation works alongside touch isolation.

## Verified locally

- `npm run check`: strict TypeScript, all 62 unit/property tests, production build and bundle/install-asset audit pass.
- `npm run lint`: source boundary checks and pinned official Obsidian ESLint rules pass.
- `npm run check:install`: three-asset package loads against the public-host stub; this is not an actual Obsidian run.
- `npm run preview:build`, then `npx playwright test --project=chromium --project=android-tablet --project=android-phone --workers=2`: 35 browser checks pass.

The browser suite includes seven touch scenarios at desktop, Android tablet (1024×768), and Android phone (Pixel 7) sizes: simultaneous finger movement, pinch reversal/midpoint anchoring, lifting either finger and starting another pinch, pending frame transitions, cancellation, placement safety, and event isolation. One scenario uses Chromium CDP touch input with real browser pointer capture, verifies single-finger swiping and pinch-to-pan handoff, and checks that the page scale and document revision remain unchanged. Deterministic same-frame scenarios use synthetic pointer events with a capture stub.

Five regression scenarios were also run against a temporary build using the original `HEAD` editor: all five failed their assertions (finger sampling, lift handoff, pending movement, event isolation, native multi-touch). The fixed preview assets were restored afterward.

Chromium required execution outside the restricted shell sandbox because the sandbox prevents browser launch. WebKit and real Android Obsidian were not tested in this pass.

## Android device check before release

Install the local `main.js`, `manifest.json`, and `styles.css` together, then reload the plugin on both phone and tablet. Record the Obsidian version, Android version and device model.

1. Swipe left, right, up and down from the canvas, including near its edges. The drawing should move without opening sidebars or pull-down actions. Confirm those actions still work outside the drawing.
2. Pinch inward and outward repeatedly, with a moving midpoint. Lift either finger, continue panning, and add a finger again. Look for jumps, freezes or page-level zoom.
3. Repeat while placing a part, drawing a wire, and dragging a component. Pinching must not create parts, add wire points, or commit the interrupted component drag.
4. Check part selection, wire taps, toolbar/inspector scrolling, zoom buttons, rotation and returning from the background. Repeat in portrait and landscape.
