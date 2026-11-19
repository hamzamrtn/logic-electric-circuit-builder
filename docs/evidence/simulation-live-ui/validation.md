# Simulation studio: validation record

Date: 2026-11-19. Scope: the Build | Simulate studio described in [simulation.md](../../simulation.md): the run strip and analysis dock; logic simulation with canvas switches, lamps, the expanded gate set and truth tables; and electrical analysis with the operating point, power-on transient scope, probes, cursors, measurements, hover readouts, switches and schematic voltage tags ([ADR 003](../../adr/003-electrical-analysis.md)). Published in 1.0.0 on 2026-11-19.

## Local checks

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run build`, `npm run check:artifacts` | Pass; three install assets, about 443 KiB main.js, only the obsidian external. |
| `npm run lint` (repository rules and Obsidian lint) | Pass. |
| `npx vitest run` | 253 tests pass. They include hand-calculated electrical fixtures (divider, meters, diode/LED/Zener drops, a BJT bias point, linear and clipping op-amp stages, RC/RL/AC transients, error paths), engineering-unit parsing, the expanded logic gate tables and the 500-case generated logic property. |
| `npx playwright test` (full suite, four device projects) | 416 pass, 32 skipped (existing project-specific skips), 0 fail on the final build. |
| `LEC_OBSIDIAN_BIN=/usr/bin/obsidian node scripts/check-simulation-host.mjs` | Pass in an isolated **actual Obsidian 1.14.4 desktop** profile. Logic: live start, canvas switch, lamp, truth table, shared inputs across split views, hidden-view pause/resume, pop-out migration, close-one/keep-other, last-consumer release, no file writes, preview without an engine, disable/enable reset. Electrical: switch toggle, scope trace 4.97 V, hover readout, operating point, unchanged file. No page errors. |
| `LEC_OBSIDIAN_BIN=/usr/bin/obsidian node scripts/check-simulation-failures.mjs` | Pass in the actual host: a live run follows an external replacement, a future-schema file blocks Run without being overwritten, Keep local recovers, Pause during a dense run (about 41 ms), deletion releases the runtime. |
| `LEC_ANDROID_SERIAL=… LEC_ADB_PORT=5037 node scripts/check-simulation-android.mjs` | Pass on a **physical Samsung SM-T733 (Android 14, Obsidian 1.15.0)** in a new app-storage `LEC Simulation Test` vault with hash-verified candidate assets. Logic: exhaustive half adder, live updates, pause/reset/X, unchanged file, native Home pause/resume, last-consumer release, fresh reopen. Electrical: switch tap, scope 4.97 V, operating point, unchanged file. No page errors ([report](android-tablet.json)). |
| `LEC_ANDROID_SERIAL=… LEC_ADB_PORT=5037 node scripts/check-simulation-android.mjs` (2026-11-19, phone) | Pass on a **physical Pixel 7 Pro (Android 17, Obsidian 1.15.1)** in the `LEC Simulation Test` app-storage vault, with hash-verified candidate assets: all 10 checks (logic exhaustive half adder, live update, pause/reset/X, unchanged file, native Home pause/resume, last-consumer release, fresh reopen; electrical switch/scope 4.97 V, operating point, unchanged file), no page errors ([report](android-phone.json)). The optional WebView screenshot step timed out once (capture tooling, as in the hardening run); the functional run passed without it. A visual review of the device dock found all operating-point rows present in a scrollable dock above the floating navigation inset. |
| `node scripts/check-simulation-browser.mjs --native-css …` | 30/30 simulation workflows pass on desktop, Android-tablet and Android-phone emulation with native Obsidian CSS and an emulated floating phone navigation bar. |

Defects found and fixed during qualification:
- On the real tablet, Fit always reserved space for the zoom card and the default dock took about 40 % of a short pane, leaving the schematic at 30 %. In Simulate, Fit now clears the zoom card only when the drawing would overlap it (Build keeps the approved full clearance), and the default dock is sized from the pane height (resizable). Result: 47 %. The final candidate restored Build-mode Fit after the device run; Simulate behavior is unchanged from the device-tested build.
- The analysis dock sat under Obsidian's floating phone navigation. It now grows by the navigation inset.
- Pop-out remounts looked for the old panel element, and an electrical view never released the pop-out handoff.
- Short truth tables showed a sub-pixel scrollbar with Obsidian's always-visible scrollbars.
- Changing a gate's input count gave it a random definition ID, so the allowlist rejected it.

## Captures

Actual Obsidian desktop host (dark theme):

- [Logic signals](host-desktop-signals.png), [truth table](host-desktop-truth-table.png), [electrical scope with hover readout](host-electrical-scope.png), [operating point](host-electrical-op.png).

Browser emulation with native Obsidian CSS (`scripts/capture-simulation.mjs`, [captures.json](captures.json)); tablet and phone images are not actual mobile-host captures:

- [Desktop light](simulation-desktop-light.png), [tablet dark](simulation-tablet-dark.png), [phone dark](simulation-phone-dark.png).

Physical Samsung SM-T733 (real Obsidian Android WebView):

- [Logic simulation](sm-t733-simulation.png), [electrical scope](sm-t733-electrical.png).

Development-harness CSS, larger demonstrations:

- [4-bit ripple-carry adder](demo-4bit-adder.png): 11 + 6 = 17 (S3–S0 = 0001, COUT = 1).
- [Op-amp amplifier driving an NPN/LED stage](demo-opamp-led-driver.png): transistor readout and the LED-current trace.
- [RC low-pass filter](demo-rc-filter-scope.png): 5 V 1 kHz input against the filtered output, with measurements.

## Qualification gaps

- The physical Android tablet and phone both passed. Analog-engine performance on phones has not been benchmarked beyond these workflows.
- Container widths below 352 px reach Simulate through More → Simulate circuit by design (desktop/tablet-first priority).
- iOS remains unverified.
