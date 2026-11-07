# Editing, notes and recovery

## Editing

Open **Electrical**, **Logic**, or **Connections** in the top toolbar. Choose a category and a symbol preview, then click/tap the canvas to place it. Search finds parts across all categories. Use **Rotate** before placement; the inspector offers repeat placement. Cancel discards a preview.

Tap a pin or choose **Wire**. Tap blank positions to add bends, then tap another pin, wire or junction to finish. **Finish** or **Enter** ends the wire at the last canvas point you placed and returns to Select. Enter keeps its native behavior in inputs, dialogs, buttons and menus. It never uses the screen position of the Finish button. **Undo corner** and **Cancel** are visible while wiring. Nearby competing targets open a chooser. Crossing wire interiors never join automatically. Use **Multi** and the object list to select crossing wires, then **Join selected crossing**.

Select objects to inspect values, pins and nets. Move by dragging, arrow-key nudges, numeric coordinates or a tap destination. Connected moves, right-angle rotations and mirrors preserve pin identities. Wire route editing provides draggable handles and a coordinate list for adding/removing bends. **Reconnect start/end** explicitly changes an endpoint. **Insert selected part into wire** requires both pins of a two-pin part to lie on one selected wire segment and removes the bypass connection.

Blank dragging pans; touch swipes also pan while placing parts or drawing wires, so only taps place parts or points. Middle-drag pans over objects. **Box** (the dashed rectangle next to Select) performs rectangle selection; **Multi** sits immediately to its right. Wheel zoom anchors to the pointer; Shift-wheel pans. The +/− buttons use predictable 25-point zoom stops; wheel and pinch remain smooth. Reset and Fit remain available. Shortcuts when the drawing owns focus: R rotate, W wire, V select, F fit, Escape cancel, Cmd/Ctrl-Z undo, Shift-Cmd/Ctrl-Z redo, Cmd/Ctrl-A select all, Cmd/Ctrl-C/X/V clipboard, Cmd/Ctrl-D duplicate, arrows nudge. Native text-field editing keeps its own shortcuts.

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

The Open/Find circuit picker and legacy previews that specify only a filename enumerate vault file paths to find `.lecircuit` files and detect duplicate names. Explicit full-path or note-relative previews use direct file lookup. The editor reads circuit files, reads a source note when repairing its preview, and writes circuits, recovery copies and requested exports inside the vault. It does not send file paths or contents over the network.

Obsidian Sync needs **Sync all other types** to sync `.lecircuit`; plugin installation, enablement and settings sync are separate. If a preview path becomes stale after renaming, use Find circuit to update that block. New previews do not add a separate wiki-link heading.
