# 0.1.2 regression evidence

- Strict TypeScript, source-boundary lint, 50 core/property tests, production artifact checks and the three-asset module smoke pass.
- A connected Chromium view measured one 36px toolbar above a full-width canvas. `single-toolbar-grid.png` records the single row and restored grid. Grid dots are drawn inside their SVG tile and use a contrasting blend of the host's text/background colors.
- A native browser click selected an initially unselected buffer in Multi mode. Paired pointer events on its two wire hit regions then retained one selected part plus two selected wires, with document revision unchanged (`multi-selection.json`). This reproduces the user's sequence; it is separate from full Playwright execution.
- Wire hover targets moved to x=32 with Snap on and x=24 with Snap off at the same cursor location; hovering/toggling did not edit the document (`wire-snapping.json`).
- Native Enter finished one branch, returned to Select and left no pending wire (`enter-finish.json`). Native Enter in a title input submitted the form while retaining the unfinished wire; returning focus to the editor and pressing Enter finished it (`enter-input.json`, `enter-after-input.json`).
- Unit cases verify horizontal/vertical segment snapping, endpoint clamping, Snap off, nearby free-angle lattice targets, readable pin/wire/net descriptions and absence of identity changes during label generation. Raw IDs remain in the portable data format, not connection hints or numbered branch controls.
- The test-vault install is refreshed to 0.1.2; runtime assets match the verified release ZIP. Actual Obsidian qualification of the update awaits reload/testing. The known browser-process sandbox restriction still applies to the full Playwright suite.
