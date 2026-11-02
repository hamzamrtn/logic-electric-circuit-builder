# Canvas interface contract

The user's priorities are simplicity, clear organization, discoverable controls and complete editing operations. The schematic is the primary surface. A blank circuit shows a plain grid, with no welcome panel, branding banner, promotional text or empty-state button.

The top toolbar groups parts under Electrical, Logic and Connections. Opening a group shows its categories and small symbol previews. Search spans the library. The picker closes after choosing a part and consumes its own pointer interactions. The library never reserves a permanent left column. Select all and Deselect all live in the top toolbar. Properties remain closed until requested, and secondary arrangement operations are grouped under a disclosure.

Colors come from Obsidian's background, text, border and interaction CSS variables. The editor has no independent light/dark preference and no forced green palette. The browser development harness supplies representative host variables; this emulation is not shipped. Exports remain self-contained with explicit neutral colors.

Desktop target: 1440x900, full-width canvas until Properties is requested. Phone target: 390x844, compact top toolbars with horizontal scrolling where needed; category previews use three columns and touch controls retain practical hit targets. Popup/inspector sizing uses the actual view container. Palette/property scrolling does not pan the drawing.

Wire Finish ends at the final explicitly placed canvas point. It creates one atomic edit, consumes the control event and returns to Select. A pointer-up without a matching canvas pointer-down performs no drawing action. Selection rectangles have 8% fill opacity. Zoom buttons step through 25-point percentage stops; wheel/pinch remain continuous and anchored.

Text and annotations show a bounding frame, four resize handles and a round rotation handle when selected. They can be moved by dragging. Text resizing preserves proportions by default; Shift permits free scaling. Numeric transform controls provide a non-drag alternative. Double-clicking text opens its editor. A completed gesture is one undo step and cancellation leaves the committed document unchanged.

Loading is performed by the host before the standalone editor receives a validated document. Invalid/future imports preserve the current drawing and expose a specific error. Save/conflict failures retain recovery actions. No account, network or runtime authorization prompt is part of the editor. Clipboard remains optional. Keyboard focus, text-field shortcut isolation, reduced motion, light/dark colors and touch layout are reviewed separately from actual device qualification.

0.1.2 consolidates File, editing tools, parts, selection and Properties into one toolbar row. The duplicate document header is removed; title editing and exports are in File, save state stays in the existing status strip. Enter uses Finish only for an active wire draft while the canvas owns focus. Existing wires snap along their segment when Snap is enabled. Pin/junction targets take priority. Connection hints and branch lists use readable names/numbers rather than internal identifiers.
