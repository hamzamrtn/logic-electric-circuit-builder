# Screenshot gallery

Ten unretouched PNG captures of the actual editor, with editable source drawings. All captures use the standalone preview harness and its default light/dark host themes. Phone captures use Chromium touch emulation; they are not photographs or proof of real-device qualification.

| Circuit | Desktop · 3200 × 2100 | Phone · 1290 × 2796 | Source drawings |
| --- | --- | --- | --- |
| Protected power supply | [Light](desktop-power.png) | [Light](mobile-power.png) | [Desktop](../../examples/showcase/desktop-power.lecircuit) / [Portrait](../../examples/showcase/mobile-power.lecircuit) |
| Analog sensor chain | [Dark](desktop-analog.png) | [Dark](mobile-analog.png) | [Desktop](../../examples/showcase/desktop-analog.lecircuit) / [Portrait](../../examples/showcase/mobile-analog.lecircuit) |
| Ripple-carry logic | [Light](desktop-logic.png) | [Light](mobile-logic.png) | [Desktop](../../examples/showcase/desktop-logic.lecircuit) / [Portrait](../../examples/showcase/mobile-logic.lecircuit) |
| 8-bit control bus | [Dark](desktop-bus.png) | [Dark](mobile-bus.png) | [Desktop](../../examples/showcase/desktop-bus.lecircuit) / [Portrait](../../examples/showcase/mobile-bus.lecircuit) |
| Timer and relay driver | [Light](desktop-timer.png) | [Light](mobile-timer.png) | [Desktop](../../examples/showcase/desktop-timer.lecircuit) / [Portrait](../../examples/showcase/mobile-timer.lecircuit) |

Desktop viewport: 1600 × 1050 at 2× resolution. Phone viewport: 430 × 932 at 3×. Portrait drawings are composed separately for a narrow screen. Captures retain toolbar, grid, zoom and status controls. Each shows a connected, multi-stage circuit rather than an empty canvas or symbol catalogue. Circuits illustrate drafting features and have not been simulated or electrically qualified.

## Reproduce

With the pinned dependencies and Playwright Chromium installed:

```sh
node scripts/generate-showcase.mjs
npm run preview:build
node scripts/capture-showcase.mjs
node scripts/package-showcase.mjs
```

The generator validates every file and assigns deterministic IDs. Capture fails on page errors or drawings hidden behind zoom controls. [captures.json](captures.json) records each image's theme, size and circuit counts. The package command produces `dist/plugin-listing-screenshots.zip`, containing the ten original PNGs, listing descriptions, metadata and editable drawings. [Listing copy](../listing-description.md) is ready to paste into the directory.
