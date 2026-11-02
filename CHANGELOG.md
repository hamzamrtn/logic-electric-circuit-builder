# Changelog

## 0.1.4 — wire placement polish

- Reduce grid dot size on the shared 8-unit grid.
- Preview and commit orthogonal wire routes around component bodies while ignoring other wires as obstacles; retain user-selected waypoints.
- Draw ordinary unconnected crossings without bridge arcs; explicit junction dots indicate connections.

## 0.1.3 — menu, wire geometry and preview fixes

- Anchor File below its button, dismiss on outside click/Escape, group examples and pin Clear circuit outside the scrolling list.
- Keep wire-draft undo/redo separate from document history.
- Match the grid, snapping and router to the existing 8-unit pin lattice.
- Preserve inferred orthogonal elbows during whole-circuit rotation.
- Repair selected preview references, distinguish full vault paths and duplicate basenames, support width settings, remove generated wiki-link headings and show current filenames.

## 0.1.2 — grid, selection and toolbar fixes

- Combine the three stacked bars into one compact toolbar; document naming and exports remain in File, save status moves to the existing status strip.
- Fix faint/clipped grid dots and use a unique SVG pattern per editor view.
- Snap hover and connection targets along existing wires; prioritize pins/junctions and honor Snap off.
- Add Enter-to-Finish while the drawing owns focus, preserving native input/dialog/button behavior.
- Fix Multi and Shift-click selecting then immediately deselecting a component; preserve the buffer-plus-wires selection.
- Replace internal IDs in wire hints, connection lists and branch-pairing controls with readable labels and branch numbers.

## 0.1.1 — canvas and interaction update

- Follow Obsidian's light/dark colors; remove forced green, branding and empty-state prompts.
- Replace the permanent left palette with categorized top-toolbar symbol previews.
- Move Select all/Deselect all into the top toolbar and show properties on request.
- Fix Finish ending at the button's pointer position or receiving a trailing canvas action.
- Make box selection transparent and zoom buttons use predictable 25-point stops.
- Add movable, resizable, rotatable text/annotations with drag handles and numeric alternatives; preserve old annotation records with identity transforms.

## 0.1.0 — local development build

- Added an installable Obsidian circuit file view, React/SVG editor, 72 original built-in definitions and custom blocks.
- Added explicit topology, manual wires, branches, bus lanes, connected transformations, history, clipboard/snippets, grouping and structural diagnostics.
- Added shared save coordination, conflicts/raw recovery, linked previews, SVG/PNG exports and ten example files.
- Added core/property tests, browser scenarios, CI, package verification and qualification documentation.
- Public release is pending real host/device qualification described in docs/validation.md.
