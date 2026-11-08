# Changelog

## 0.1.10 — compact docks and clearer movement

- Keep floating docks compact over a full-size canvas, with no reserved blank sidebar or full-width mobile-style dock on desktop. Top restores the original inline desktop row by dragging or selection.
- Use a dotted Move grip, show all four coloured destinations on activation/drag and highlight the current candidate. Keep click, touch and keyboard movement equivalent.
- Prevent the lingering move tooltip, cancel Move safely and preserve normal interactions elsewhere in Obsidian. Keep wire actions, picker, zoom and Fit clear of docked controls.

## 0.1.9 — dockable tools and clearer settings

- Add a dockable drawing toolbar with a top-left move handle, edge-snap dragging, a keyboard/tap position menu and saved top/right/bottom/left preferences. Adapt the canvas, parts picker, zoom controls and Fit together, with floating phone-navigation clearance around the controls. Default to the top; preserve explicit saved positions.
- Place a native Apply button beside the recovery-folder field, with folder suggestions, inline validation and retryable errors.
- Remove the visible internal marker from recovery READMEs and upgrade older generated notes safely. Explain the backups first, followed by the corrected ⋮ → Settings path.
- Clarify how to reach keyboard shortcuts and replace the Offline circuits settings text with one-sentence sync guidance.

## 0.1.8 — recovery folders and cleaner backups

- Optionally exclude recovery folders from Search/Graph and deprioritize them in Quick Switcher. Track only plugin-owned exclusions across folder changes, preserve user rules and fall back safely when the optional host integration is unavailable.
- Add a configurable Recovery folder in Obsidian plugin settings, with an explicit Move backups action, nested folders and automatic tracking of folder/ancestor renames.
- Move existing plugin backups without overwriting destination files or moving unrelated content; serialize moves with backup writes and roll back failed migrations.
- Add `00_README.md` to recovery folders with the plugin name, brief recovery instructions and the settings path. Refresh it after folder changes and preserve unrelated READMEs.

## 0.1.7 — responsive tools and smoother editing

- Add a responsive workbench: a stable bottom drawing dock in compact panes and one tidy top toolbar in wide panes, including split desktop workspaces.
- Keep Undo/Redo visible and paired; combine parts, Text and Custom blocks in Add; move secondary actions into More.
- Give the picker a compact sheet layout, stable search position, remembered categories, touch-friendly controls and short-screen/keyboard-height support.
- Use softer corners, balanced spacing and subtle depth while retaining Obsidian theme colors and reduced-motion behavior.

- Remove duplicate native/host tooltips and redundant hover labels from named controls and containers while preserving screen-reader names.
- Make double-click/double-tap inspection reliable with Multi selection and touch gestures; stop blank-canvas right-clicks from opening an empty inspector.
- Add configurable canvas tool keys under File → Keyboard shortcuts, with conflict validation, disabled bindings, reset defaults and saved preferences shared by open views.
- Limit canvas shortcuts to drawing focus and preserve native typing, composition, button and dialog interactions.
- Simplify the inspector with common fields first, related action disclosures, grouped object lists and clearer empty/net/check states.

## 0.1.6 — touch navigation and circuit editing

- Add brief placement, wire-completion, endpoint and grid-snap feedback, with fixed authoritative geometry and Reduce Motion support.
- Add nearby alignment guides and quiet overlap cues without nudging or blocking placement; fade selection handles while deactivating them immediately.
- Animate Fit/Reset briefly, let direct gestures interrupt camera motion, and keep fitted drawings above the floating zoom controls.
- Reserve block title space above ports and keep rotated LED/photodiode labels clear of their arrows.
- Refresh the README with five desktop and five portrait circuit screenshots, editable showcase drawings, and reusable listing descriptions.

- Make compound wire joins/draft connections and reconnections atomic, validate common join points, and keep same-wire branch targets stable after splitting.
- Remove stale connection choices safely and preserve keyboard focus when choices change or placement dialogs close.
- Share and cancel preview acquisition safely across concurrent views, reject deleted/disposed loads, release preview resources promptly, and prevent older view snapshots from rolling back the shared document.
- Detect exact integer crossings despite floating-point residue, while checking that the result lies on both original segments.
- Preserve group ownership and routing settings through wire splits, endpoint merges and component insertion. Keep intrinsic pin identities when joining coincident wire ends.
- Preserve protected dependencies during deletion, avoid unrelated node cleanup, and make group Cut remove its contents in one undoable operation while group-container Delete retains them.
- Highlight and drag groups selected from the object list. Preserve Multi/Shift selection through overlapping-wire choices without opening the inspector unexpectedly.
- Share accessible dialog focus handling between forms and connection choices: contain keyboard input, retain drafts when canceling a choice, and restore correction focus after errors.
- Make thin wires selectable near their visible path at low zoom, including finger-sized touch targets. Keep coincident bus endpoints renderable and center views from measured dimensions, including exactly 1,000px-wide panes.
- Ignore obsolete vault reads after a newer external read or local save. Verify shared sessions, delayed renames/deletions and final-view release against a public vault stub.
- Disable locked inspector edits, recheck locks when commands/dialogs commit, and expose clear selection/group unlock actions. Apply coordinate-dialog positions relative to the latest document state.
- Use direction-aware orthogonal routing with pin escape segments, body clearance, fewer-bend costs and compressed coordinates for long wires. Honor horizontal/vertical-first preferences and use the same search limit for previews and commits.
- Pan during touch swipes in placement/Wire modes without accidentally placing parts or adding bends. Support middle-button panning over objects and select a newly finished wire for immediate inspection.
- Explain fixed waypoints when automatic rerouting cannot replace a manual route, and keep fallback-routing feedback visible.
- Restore a local circuit correctly after malformed external changes, keep restoration pending across write failures, and retain conflict controls when recovery storage fails.
- Keep attached labels and grouped junctions portable in snippets; remove stale group members when wire endpoints are cleaned up. Deleting a group container alone preserves its contents.
- Prevent wire drafts from crashing when their start connection is removed in another view. Apply Cut immediately with a slow clipboard and leave unhandled host shortcuts available.
- Reject edits exceeding the readable 8 MiB file limit before changing the document.
- Size new custom blocks around their pins and validate duplicate pin IDs before placement. Keep large, partially visible symbols rendered and include outlying pins in Fit/export bounds.
- Preserve locked groups, annotations, wire waypoints and junctions during indirect moves/transforms; keep attached-label drag previews consistent with the committed result.
- Keep distinct electrical endpoints separate when imported IDs contain colons, and match exported box annotation layers to the canvas.
- Give Select, Box and Multi matching icons and labels, grouped together before Wire with compact touch controls.

- Keep canvas swipes and pinch gestures inside the editor so they do not open Obsidian's sidebars or pull-down actions.
- Preserve both fingers' positions during pinch zoom, including rapid changes between panning and zooming. Continue panning when either finger lifts.
- Add phone and tablet touch regression coverage, including native Chromium multi-touch input and protection against accidental edits during navigation.

## 0.1.5 — community review fixes

- Use CSS classes and a bounded width variable for previews and the standalone harness; remove `!important` overrides.
- Adopt Obsidian's declarative, searchable settings API and handle asynchronous dialog and preview work without returning promises to synchronous host callbacks.
- Remove deprecated schema/event APIs and comma expressions flagged by the community scanner.
- Resolve explicit preview paths directly; retain filename enumeration only for the circuit picker and legacy basename lookup, and document that access.
- Use the React 18.3.1 renderer, which provides the editor's existing hooks and portals without React 19's external script-resource preloader. No dependency code is patched or obscured.
- Run Obsidian's official ESLint rules in CI, reject runtime script-element loaders in the bundle audit, and build/attest/attach release assets from the exact published tag.

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
