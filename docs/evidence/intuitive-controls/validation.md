# Intuitive controls review

Unreleased working-tree changes, reviewed 2026-11-07. These changes follow the owner's double-click, shortcut, tooltip, right-click and inspector feedback. The published 0.1.6 tag is not modified.

## Interaction requirements

| Before | Current behavior | Evidence |
| --- | --- | --- |
| Native titles duplicated host tooltips; parent labels appeared over gaps, the scrollbar, search, categories and inspector backgrounds. | Visible labels and structural containers retain referenced screen-reader names without hover-triggering aria-label attributes. Icon-only Undo/Redo/Fit retain one host tooltip; native titles are removed from tool buttons. | Accessible-name, attribute and hidden-label layout assertions on desktop, tablet and phone. |
| Double-click could miss the actual object after pointer capture, or toggle it off in Multi. | Hit-testing resolves the actual targeted object and assigns that exact selection before opening properties. Text annotations retain direct editing. | Reproduced as failing desktop regressions before the fix; native mouse and touch tests now pass. |
| Blank-canvas right-click opened an empty inspector. | Blank right-click preserves the inspector, tool, selection and document. Select-mode object right-click can inspect the exact object. | Blank and Multi/object right-click regressions. |
| Tool keys were fixed and could bubble from focused non-text controls. | File → Keyboard shortcuts configures V/B/M/W/R/F/I defaults, disables cleared bindings, rejects conflicts and restores defaults. Tool keys require drawing focus and ignore composition and repeated activation. | Configuration, validation, focus, composition/repeat and typing regressions; shortcut parser/store unit tests. |
| Preferences needed reliable persistence and shared-view behavior. | Shortcut snapshots publish after successful serialized settings writes. Failure preserves the old keys; a later settings write cannot persist a failed binding change. | Public-host install smoke covers successful, failed and concurrent shortcut/settings writes; subscription/unit coverage. |
| The inspector mixed common properties and many unrelated actions. | Common fields come first; movement, pins/connections and selection actions use labelled disclosures. Empty selection has concise guidance, object lists are grouped by kind, and nets/checks have shorter explanations. | Disclosures/empty-state regressions, existing locked-control and editing suites, and visual captures below. |
| Touch double-activation was suppressed with compatibility mouse gestures. | Native double-tap inspects a part. A pan, pinch, cancellation, document edit or control interaction clears the pending tap. Pin/wiring gestures retain their behavior. | Native CDP double-tap and intervening-pan tests; touch-enabled pointer tests; full existing pinch/navigation suite. |

## Local checks

- `npm run check`: 147 core/property/adapter tests in 28 files, strict TypeScript, production build and artifact audit pass.
- `npm run lint`: runtime boundaries and official Obsidian ESLint rules pass.
- `npm run check:install`: public-host stub smoke passes, including shortcut persistence/failure/concurrent-write checks.
- `npm run preview:build`: passes.
- Full Chromium desktop/Android tablet/Android phone suite: 213 passed, 15 intentional mouse/touch-specific skips; 228 combinations. The final focus-restoration refinement additionally passes 41 focused checks with one touch-only skip across the three projects.
- Implementation commit `ceff322` passed [GitHub Verify](https://github.com/hamzamrtn/logic-electric-circuit-builder/actions/runs/42363926881): 147 core tests and 275 browser checks, with 29 platform-specific skips across Chromium and WebKit. Final focus-restoration changes receive their own subsequent CI run.
- WebKit download was attempted locally; the pinned download mirrors timed out. Additional WebKit verification runs in [GitHub Verify](https://github.com/hamzamrtn/logic-electric-circuit-builder/actions/workflows/ci.yml). Local Chromium results do not imply a WebKit or real-device pass.
- `git diff --check`: passes. Existing source and published releases are preserved.

## Visual review

Actual editor captures from the standalone harness, using the editable analog showcase. Desktop: 1440 × 900; phone: 430 × 932. Both use 2× raster resolution. Phone layout is emulated.

- [Properties](desktop-properties-dark.png) and [expanded connections](desktop-connections-dark.png).
- [Phone properties](phone-properties-dark.png) and [customizable keys](desktop-shortcuts-dark.png).
- [Objects](desktop-objects-dark.png), [nets](desktop-nets-dark.png), [checks](desktop-checks-dark.png).
- Empty state: [dark](desktop-empty-dark.png) / [light](desktop-empty-light.png).

Closing the inspector or shortcut dialog returns focus to the drawing. Pointer activation of tool/zoom controls also returns drawing focus, while direct keyboard focus on buttons retains native control behavior. The final focus tests exercise this workflow.

The installed Obsidian 1.14.4 tooltip reader was inspected to confirm its aria-label hover-text mechanism. The captures verify grouping, spacing, field readability and hierarchy; the automated DOM assertions verify the tooltip-triggering attributes and preserved accessible names. Actual Obsidian hover integration and real-device behavior remain host qualification rather than a claim inferred from a browser mock.
