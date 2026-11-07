# Responsive workbench review

Unreleased UI update, 2026-11-07. The owner approved a polished, modern, slightly cozy interface with width-based toolbar adaptation. Existing circuit data, editing operations and the published 0.1.6 tag are preserved.

## Result

| Area | Behavior |
| --- | --- |
| Compact workspace | At 900px or less, Select → Box → Multi, Wire and Add form a stable bottom dock. File, paired Undo/Redo, Inspect and More stay above. Essential controls fit at 320px without horizontal scrolling and retain 44px-or-larger compact touch targets. |
| Wide workspace | One tidy top row with the same primary order. An inline inspector can make the remaining workspace compact; resizing preserves the actual tool elements and document state. |
| Add | One searchable picker contains Electrical, Logic, Connections, Text and Custom block. It remembers the selected family/category and closes immediately when a part is chosen. |
| Picker presentation | Anchored popover in wide panes; stable-height sheet in compact panes. Touch/coarse input initially focuses the dialog instead of raising the keyboard. Fine-pointer input focuses Search. |
| Short views | When height is limited, the picker uses the available pane. Content scrolls while search, close and insertion controls stay reachable. Filtering does not move Search; focus/query survive a keyboard-height resize. |
| Secondary actions | More contains selection-wide actions, grid/snapping, checks and keyboard shortcuts. The status strip is informational. The host diagnostics command uses an editor-owned event rather than depending on the removed status-bar button. |
| Rotation | Direct in the wide toolbar and compact placement controls. Compact selections use More → Rotate selected or Properties. Selecting a part never shrinks the compact viewport or hides the tapped object under a new context row. |
| Visual direction | Soft, concentric corners, balanced gaps, light borders and restrained shadows. Host-theme colors, visible text labels, single useful icon tooltips and reduced-motion behavior remain intact. |
| Startup | Layout is measured before the first fit. Startup and an immediate manual Fit use the same settled compact viewport. This was reproduced as a failing 40px camera offset before the fix. |

## Verification

- `npm run check`: 147 tests in 28 files, strict TypeScript, production build and artifact audit pass. The bundle is about 755 KiB with only `obsidian` external.
- `npm run lint`: source boundaries and official Obsidian ESLint rules pass.
- `npm run check:install`: public-host stub smoke passes; the same seven host commands remain registered.
- Full Chromium desktop/Android tablet/Android phone suite: **251 passed, 16 intentional layout/input-specific skips**, 267 combinations.
- Twelve responsive scenarios cover fitting controls, hit targets, split panes, short screens, native touch placement/undo/redo, resize/focus, menus/checkboxes, diagnostics integration, keyboard-height search, stable selection, focus containment and startup fit.
- Existing topology, editing, locking, dialog, shortcut, export, pinch and gesture regressions remain included.
- [GitHub Verify](https://github.com/hamzamrtn/logic-electric-circuit-builder/actions/workflows/ci.yml) provides additional WebKit verification. Local touch projects are browser emulation, not real-device qualification.

## Visual evidence

Real editor captures using the editable analog showcase:

- [Desktop](desktop-light.png) / [desktop picker](desktop-picker-light.png).
- [Phone](phone-dark.png) / [phone picker](phone-picker-dark.png).
- [320px phone](small-phone-light.png) / [picker](small-phone-picker-light.png).
- [Tablet](tablet-dark.png) / [tablet picker](tablet-picker-dark.png).
- [Placement controls](phone-placement-dark.png), [stable selection](phone-selection-dark.png), [inspector](phone-inspector-dark.png).

Reproduce with `npm run preview:build` and `node scripts/capture-responsive-ui.mjs`. The [ten-image README gallery](../../screenshots/README.md) and its listing ZIP are refreshed from the same editor; [image hashes](../../screenshots/image-hashes.json) identify their current bytes.

Actual Android/iOS Obsidian, physical keyboard/IME variants, host lifecycle and device-specific layout qualification remain separate from these automated and harness results.
