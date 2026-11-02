# Logic-Electric Circuit Builder

An offline electrical and logic schematic editor for Obsidian, by **Hamza**. MIT licensed.

The workspace opens directly into a schematic grid. Add searchable parts, connect stable pins, draw manual wire bends, move and rotate connected parts, and export ordinary SVG/PNG. Crossed wires remain separate until explicitly joined. The 72 built-in symbols include electrical parts, gates, logic blocks and explicit bus splitters. Custom blocks have editable pin identities and layouts.

**Local development build: 0.1.4.** Core and browser evidence is recorded in [docs/validation.md](docs/validation.md). Real Obsidian/device qualification remains required before a public release. The plugin declares mobile support intent; browser touch emulation is not a real-device pass. There is no circuit simulation.

## Install the local build

Unzip `dist/logic-electric-circuit-builder-0.1.4.zip` into your development vault’s `<configDir>/plugins/` directory. Alternatively create `<configDir>/plugins/logic-electric-circuit-builder/` and copy these three files from `dist/logic-electric-circuit-builder/`:

- `main.js`
- `manifest.json`
- `styles.css`

Reload Obsidian and enable **Logic-Electric Circuit Builder** in Community plugins. `.obsidian` is the usual configuration directory; custom configuration directories work too. Use a separate test vault for initial qualification. Users do not need Node, npm, a server or an internet connection.

Run **Logic-Electric Circuit Builder: New circuit** from the command palette or use the circuit ribbon icon. Files use `.lecircuit`. The initial minimum host version is 1.14.0; widen that range only after testing.

## Use

Open **Electrical**, **Logic**, or **Connections** in the top toolbar. Choose a category and a symbol preview, then click/tap the canvas to place it. Search finds parts across all categories. Use **Rotate** before placement; the inspector offers repeat placement. Cancel discards a preview.

Tap a pin or choose **Wire**. Tap blank positions to add bends, then tap another pin, wire or junction to finish. **Finish** or **Enter** ends the wire at the last canvas point you placed and returns to Select. Enter keeps its native behavior in inputs, dialogs, buttons and menus. It never uses the screen position of the Finish button. **Undo corner** and **Cancel** are visible while wiring. Nearby competing targets open a chooser. Crossing wire interiors never join automatically. Use **Multi** and the object list to select crossing wires, then **Join selected crossing**.

Select objects to inspect values, pins and nets. Move by dragging, arrow-key nudges, numeric coordinates or a tap destination. Connected moves, right-angle rotations and mirrors preserve pin identities. Wire route editing provides draggable handles and a coordinate list for adding/removing bends. **Reconnect start/end** explicitly changes an endpoint. **Insert selected part into wire** requires both pins of a two-pin part to lie on one selected wire segment and removes the bypass connection.

Blank dragging pans; **Box** performs rectangle selection. Wheel zoom anchors to the pointer; Shift-wheel pans. The +/− buttons use predictable 25-point zoom stops; wheel and pinch remain smooth. Reset and Fit remain available. Shortcuts when the drawing owns focus: R rotate, W wire, V select, F fit, Escape cancel, Cmd/Ctrl-Z undo, Shift-Cmd/Ctrl-Z redo, Cmd/Ctrl-A select all, Cmd/Ctrl-C/X/V clipboard, Cmd/Ctrl-D duplicate, arrows nudge. Native text-field editing keeps its own shortcuts.

**Select all** and **Deselect all** are in the top toolbar. **Inspect** opens properties only when requested; its **Objects** and **Nets** tabs provide list alternatives. Text/annotations show corner resize handles and a round rotation handle when selected. Drag the text/box to move it. Text keeps its proportions by default; hold Shift for free resizing. Numeric transform controls provide the same operations without dragging. Double-click text to edit it. **Connect named pins** connects without precise pointer placement. **Checks** highlights dangling ends, conflicting labels, bus widths, potential multiple drivers and drawing overlaps. Checks are structural rather than an electrical analysis.

## Notes, export and recovery

From a Markdown note, run **Insert circuit preview**. It inserts a `lecircuit` block with an explicit vault-relative path and width. For example: 
```lecircuit
/Circuits/MyCircuit.lecircuit
width: 400px
```

Use pixels or a percentage for width. Bare filenames are accepted only when unique; `/Folder/File.lecircuit` is explicit, and `./` or `../` is note-relative. **Find circuit** repairs the selected broken block. The Open button uses the current filename.

Export SVG/PNG for viewing with the plugin disabled or using Obsidian Publish. The File menu also exports own-format JSON and selected snippets. PNG exports are capped at 16 megapixels/8192px per edge; use 1× or SVG for large drawings.

Autosave reports completed writes. Conflicts offer review, keep-local and use-external choices; save failure offers retry and a separate copy. Invalid/future-format files preserve raw bytes and do not autosave. Recovery files are in `Circuit recovery/`. OS force-kill can still lose edits after the last completed write.

Obsidian Sync needs **Sync all other types** to sync `.lecircuit`; plugin installation, enablement and settings sync are separate. If a preview path becomes stale after renaming, use Find circuit to update that block. New previews do not add a separate wiki-link heading.

## Build and verify

Use Node 24 and npm. Dependencies are pinned in `package-lock.json`. The Obsidian SDK’s CodeMirror peers are host-provided; the repository’s `.npmrc` avoids installing unused peers.

```sh
npm ci
npm run lint
npm run check
npm run check:install
npm run examples:build
npm run preview:build
npx playwright install chromium webkit
npm run test:e2e
npm run package
```

`npm run dev` opens the Vite harness when local servers are available. `dev/preview.html` is a server-free harness after `preview:build`; it exports files on explicit request and keeps the drawing in memory. Core/property tests run in Vitest. Lint checks import boundaries and injection hazards; strict TypeScript also checks unused code. CI includes Chromium and WebKit browser tests. Public release/submission is a separate, owner-controlled step.

See [format](docs/format.md), [architecture](docs/architecture.md), [validation and qualification](docs/validation.md), and [release instructions](docs/release.md).
