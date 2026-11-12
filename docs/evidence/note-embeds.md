# Note embedding screenshots

Recorded 2026-11-12. Documentation and capture tooling only; no plugin runtime change or release publication.

The README now leads with two student-style example notes: light-theme four-bit ripple-carry addition (20 gates, 44 wires) and a dark-theme photodiode/filter/amplifier/comparator chain (19 parts, 30 wires). Each has an actual embedded circuit, explanatory text and calculations. Following the owner’s request for more involved circuits, the white note also explains carry propagation, worked four-bit arithmetic, delay and signed overflow. The owner's revisions are reflected in the final captures: centered 920px note columns, lighter headings, restrained bold text, no amber warning and smaller previews using the existing `width: 90%` option.

## Capture and verification

- `node scripts/generate-note-showcase.mjs`: schema, graph, bus-width, structural and overlap checks pass for both drawings. Regeneration preserves their bytes.
- `node scripts/capture-note-showcase.mjs`: both final captures pass in installed **Obsidian 1.14.4**, using plugin **0.1.11** in a temporary isolated vault/profile. The actual Markdown processor and Reading view render all 20 logic parts and 19 electrical parts without page errors. Checks confirm complete note framing, the 920px column and 90% preview width. Final PNGs are **2640 × 2640** from a 1320 × 1320 viewport; both compositions were visually reviewed.
- Independent evaluation of the saved logic graph: all 512 combinations of four-bit A, four-bit B and carry-in produce A + B + carry-in, including the final carry. This is a fixture-specific arithmetic check; no simulation feature was added to the plugin.
- Styling uses the default light/dark host themes plus the included optional `examples/notes/study-notes.css` snippet. The snippet changes note typography, centering and spacing; preview width comes from the plugin's existing code-block setting. Obsidian's in-document properties are hidden through its Editor preference.
- `node scripts/package-showcase.mjs`: twelve PNGs, twelve circuit drawings, two source notes, their CSS snippet and listing metadata packaged successfully. Short/long listing copy remains 186/200 and 944/1000 characters.
- Independent ZIP verification: all 33 entries pass CRC checks; all screenshots, circuits, notes and styling match their source bytes, and image hashes match the package. The original ten editor screenshots are unchanged.
- All 56 local links in the changed README/gallery/listing/example indexes resolve. Capture/package JavaScript syntax and `git diff --check` pass.

These are native desktop app captures running headless Electron, not mobile qualification or notes supplied by actual students. Circuits illustrate documentation and drawing, without simulation or hardware qualification. No full application suite was rerun for this documentation-only change. Push and CI status are reported separately from these local checks; no listing publication is claimed. Existing release-document edits were preserved.

Sources, images, metadata and reproduction commands are in the [screenshot index](../screenshots/README.md) and [example notes](../../examples/notes/README.md).
