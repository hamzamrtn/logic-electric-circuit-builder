# Screenshot gallery

Twelve unretouched PNG captures of version 1.0.0, all taken in actual Obsidian: ten listing images (five desktop, five phone) alternating light and dark, plus two square note captures for the README. Each shows a complete circuit being built or simulated. [listing-captures.json](listing-captures.json) records host, theme, scene and dimensions; [image-hashes.json](image-hashes.json) records digests.

## Listing images

Upload in this order. Desktop images come from the installed **Obsidian 1.14.4** desktop app (headless Electron, isolated temporary vault) at 1600 × 1000, 2× scale. Phone images are screen captures of **Obsidian 1.15.1 on a physical Pixel 7 Pro** (Android 17) in the dedicated `LEC Simulation Test` vault, with Android System UI demo mode for a clean status bar.

| # | Scene | Desktop · 3200 × 2000 | Phone · 1080 × 2340 |
| --- | --- | --- | --- |
| 1 | Lab note with an embedded live circuit | [Light: digital design note](desktop-1-note.png) | [Dark: analog electronics note](phone-1-note.png) |
| 2 | Building gate-level logic | [Dark: decoder with gate inspector](desktop-2-logic-build.png) | [Light: 2 × 2-bit multiplier](phone-2-logic-build.png) |
| 3 | Simulating logic | [Light: switches, segments, truth table](desktop-3-logic-simulation.png) | [Dark: 3 × 2 = 6, lit probes, truth table](phone-3-logic-simulation.png) |
| 4 | Building an electrical circuit | [Dark: sensor chain with parts library](desktop-4-electrical-build.png) | [Light: compact sensor chain](phone-4-electrical-build.png) |
| 5 | Simulating an electrical circuit | [Light: scope, cursors, measurements, Q1 readout](desktop-5-electrical-simulation.png) | [Dark: voltage tags, five traces, cursors](phone-5-electrical-simulation.png) |

Phone build and simulation shots use two circuits composed for the phone canvas, so each fits completely above the analysis dock at a readable size.

## README note captures

[Logic · light](note-logic-light.png) and [electrical · dark](note-electrical-dark.png): the two lab notes in native Reading view at 1320 × 1320, 2× scale, with the optional [study-note CSS snippet](../../examples/notes/study-notes.css) and the plugin's `width: 90%` preview option.

## Circuits

| Circuit | Source | Contents and verification |
| --- | --- | --- |
| BCD to seven-segment decoder | [Drawing](../../examples/notes/BCD%20to%20seven-segment%20decoder.lecircuit) · [note](../../examples/notes/Digital%20design%20-%20BCD%20decoder.md) | 4 Logic inputs, 3 NOT, 9 AND and 7 OR gates drawn as a PLA, a seven-segment display and seven segment probes (31 parts, 98 wires). The generator checks all ten BCD digits against the expected segments. |
| Sensor signal chain | [Drawing](../../examples/notes/Sensor%20signal%20chain.lecircuit) · [note](../../examples/notes/Analog%20electronics%20-%20Sensor%20signal%20chain.md) | 200 mV 1 kHz source, ×11 non-inverting stage, 3.4 kHz active low-pass, 1.09 V comparator and NPN LED driver on ±12 V (28 parts, 36 wires). The generator runs the operating point and transient; the note's results table quotes them. |
| 2 × 2-bit multiplier (phone) | [Drawing](../../examples/showcase/2-bit%20multiplier.lecircuit) | 4 Logic inputs, four AND partial products, two half adders and four output probes (16 parts). The generator checks all 16 products. |
| Sensor chain, compact (phone) | [Drawing](../../examples/showcase/Sensor%20chain%20%28compact%29.lecircuit) | The same chain in two rows with a passive 1.6 kHz RC low-pass (21 parts, 25 wires); the generator runs its operating point and transient. |

These are demonstration circuits verified with the built-in simulator, not hardware-qualified designs.

## Reproduce

With the pinned dependencies, Playwright Chromium and installed desktop Obsidian (set `LEC_OBSIDIAN_BIN` if it is not `/opt/Obsidian/obsidian`):

```sh
node scripts/generate-listing.mjs        # regenerate and verify all four circuits
npm run build
node scripts/capture-listing.mjs desktop # five desktop images and two note captures
LEC_ANDROID_SERIAL=… LEC_ADB=/path/to/adb node scripts/capture-listing.mjs android
node scripts/package-showcase.mjs        # dist/plugin-listing-screenshots.zip
```

The desktop run creates and removes its own temporary profile and vault. The Android run requires Obsidian open on the `LEC Simulation Test` vault with the candidate build installed; it verifies the installed assets by hash, writes the notes and drawings only into that vault, and restores the System UI demo-mode setting afterwards. The package contains the twelve PNGs, the listing copy, metadata, both drawings and notes, and the optional CSS snippet.
