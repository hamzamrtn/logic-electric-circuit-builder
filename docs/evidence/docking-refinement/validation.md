# Compact docks and discoverable placement

Recorded 2026-11-08. Prepared as 0.1.10 with owner-authorized publication. The owner's screenshots showed the 0.1.9 desktop corner treatment, oversized docked controls, inability to return to the inline row through Top, a reserved blank canvas column and a lingering host tooltip during dragging.

The current design uses content-sized floating palettes over a full-width/full-height canvas, with no reserved gutter. Wide floating controls retain the inline desktop icon/text treatment. Top restores the original desktop row through either a drop or a destination click. Mobile touch targets remain comfortable. The circuit-tool icons were not changed.

The Move control has an original six-dot grip, a visible Move label and an accessible referenced name. It does not expose aria-label/title attributes that Obsidian turns into redundant hover tooltips. Click, touch, keyboard activation and dragging reveal all four coloured destinations; only the candidate is strongly highlighted. The targets themselves are keyboard-accessible buttons. Escape or a canceling canvas click does not edit the drawing; outside clicks elsewhere in Obsidian continue normally. A separate Reset menu is no longer needed because Top directly restores the desktop origin.

Fit uses measured toolbar/zoom/native-navigation bounds while retaining the full canvas. The parts picker and wire actions avoid the dock and phone navigation. The initial broad run exposed a wire-undo test point now covered by the floating zoom card; its points were moved into unobstructed canvas space without changing the undo/history assertions. Added tests verify Finish, Cancel and Undo corner clearance, including a bottom dock with a simulated host navbar.

## Sources used for the design review

- [Atlassian drag-and-drop design guidance](https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines/): visible drag grips, grab cursors and separate handles for entities containing interactive controls.
- [Atlassian accessible alternatives](https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines/): equivalent non-drag outcomes, meaningful control names, announcements and retained focus.
- [Lucide Grip Vertical](https://lucide.dev/icons/grip-vertical) and [Grip Horizontal](https://lucide.dev/icons/grip-horizontal): documented dotted-grip vocabulary. No third-party component or icon dependency was added.

## Local verification

- `npm run check`: 188 core/adapter/property tests in 31 files, strict TypeScript, production build and artifact audit passed.
- `npm run lint`: source boundaries and official Obsidian ESLint passed.
- `npm run check:install`: settings persistence/failure handling and the built plugin's public-host stub passed.
- `npm run preview:build`: passed.
- Full desktop Chromium/Android tablet/Android phone matrix: **277 passed, 17 intentional skips** (294 combinations).
- Focused coverage includes visible placement targets during click/drag, candidate highlighting, keyboard focus/cancel, center-drop cancellation, desktop drag back to inline, compact dock dimensions, full-width canvas, tooltip-trigger removal, external-host clicks, wire controls and phone navigation clearance.
- Desktop inline, left/right/bottom and phone top layouts were visually inspected before broad verification. The final capture set includes [desktop inline](desktop-inline.png), [left](desktop-left.png), [right](desktop-right.png), [bottom](desktop-bottom.png), [desktop destinations](desktop-targets.png), [phone top](phone-top.png) and [phone destinations](phone-targets.png).
- `git diff --check` passed. Release metadata, archives and remote CI are verified separately during publication.

These are browser/adapter checks. Actual Obsidian devices, screen readers and current WebKit qualification remain separate; GitHub verification records the WebKit result. Older release evidence remains historical.
