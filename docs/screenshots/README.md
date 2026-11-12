# Screenshot gallery

Twelve unretouched PNG captures, with editable source drawings: two notes captured inside the installed desktop Obsidian app and ten editor views from the standalone preview harness. The README leads with the note examples so readers can see how circuits fit into their notebooks.

## Embedded circuits in notes

These are authored example student notes, captured in native **Reading view in Obsidian 1.14.4**, running headless Electron with the 0.1.11 plugin in an isolated temporary vault. They use the real Markdown code-block processor, live circuit previews and default host themes with the included [study-note CSS snippet](../../examples/notes/study-notes.css). The snippet centers a 920px note column and softens headings; preview sizing uses the plugin's existing `width: 90%` option. They are desktop app captures, not mobile qualification or submissions from actual students.

| Note | Screenshot · 2640 × 2640 | Editable sources |
| --- | --- | --- |
| Four-bit ripple-carry addition · light | [Logic study note](note-logic-light.png) | [Note](../../examples/notes/Logic%20-%20Ripple-carry%20addition.md) / [20 gates, 44 wires](../../examples/notes/Ripple-carry%20adder.lecircuit) |
| Photodiode sensing, filtering, gain and threshold detection · dark | [Electrical lab note](note-electrical-dark.png) | [Note](../../examples/notes/Electrical%20-%20Filtering%20a%20sensor%20signal.md) / [19 parts, 30 wires](../../examples/notes/Filter%20and%20amplifier.lecircuit) |

Viewport: 1320 × 1320 at 2× resolution. Each note contains one linked circuit preview with four related stages. The white note explains carry propagation, a worked four-bit sum, delay and signed overflow; the dark note explains the sensor chain, RC/gain estimates and threshold behavior. [note-captures.json](note-captures.json) records the host, plugin version, sources, styling and dimensions.

## Editor gallery

Editor captures use the standalone preview harness and its default light/dark host themes. Phone captures use Chromium touch emulation; they are not photographs or proof of real-device qualification.

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
node scripts/generate-note-showcase.mjs
npm run build
node scripts/capture-note-showcase.mjs
node scripts/package-showcase.mjs
```

The note capture also requires installed desktop Obsidian; set `LEC_OBSIDIAN_BIN` if its executable is not `/opt/Obsidian/obsidian`. It creates and removes its own temporary profile/vault without opening personal notes. To refresh only the note images, run the note generator and note capture commands, followed by packaging; build the plugin first if its local assets are missing or outdated. The existing ten editor screenshots need no regeneration for a note-only change.

The generators validate every circuit and assign deterministic IDs. Editor capture fails on page errors or drawings hidden behind zoom controls; note capture checks all parts render, the entire note fits and the centered column/90% preview sizes match. [captures.json](captures.json) records the editor images. The package command produces `dist/plugin-listing-screenshots.zip`, containing all twelve PNGs, listing descriptions, metadata, twelve editable drawings, the two source notes and their optional CSS snippet. [Listing copy](../listing-description.md) is ready to paste into the directory. Schematics are illustrative study material, not simulated or electrically qualified hardware designs.
