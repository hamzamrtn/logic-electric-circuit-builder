# Floating phone navigation and settings polish

Recorded 2026-11-08. Local, unreleased follow-up to 0.1.8; document format and backup retention are unchanged.

The owner's Android Obsidian screenshots show its floating navigation covering Box, Multi and Wire. Read-only inspection of installed Obsidian 1.14.4 CSS confirmed its `is-phone`, `is-floating-nav`, `is-hidden-nav` classes and `--view-bottom-spacing`, `--navbar-height`, `--navbar-bottom-offset` variables. The first fixed-inset draft was superseded by the owner’s dockable-toolbar request. Current behavior and final counts are recorded in [toolbar docking](../toolbar-docking/validation.md); clearance is applied around docked controls, without padding the entire host view. Hidden navigation, tablets and ordinary docked navigation avoid an extra inset; negative keyboard spacing clamps to zero. Host navigation itself is unchanged.

Recovery folder settings use a searchable custom row with the public Setting and AbstractInputSuggest APIs. The text field and native Apply button stay together on desktop and phone. Drafts do not move files; unchanged/invalid paths disable Apply; pending migration disables controls; failures retain the draft and show an inline error for retry. Folder suggestions remain available.

Generated `00_README.md` notes now explain what the folder is first, under **What this folder is — DO NOT REMOVE**, followed by location instructions with **⋮ → Settings** and **Apply**. The HTML ownership comment is no longer emitted. Legacy notes bearing that comment refresh on load; new notes are recognized by their identifying prose and expected headings. Handwritten notes are preserved. Shortcut instructions identify the circuit toolbar's top-right three-dot menu. How to sync contains one sentence about Sync all other types.

## Verification

- `npm run check`: 185 tests in 30 files, strict TypeScript, production build and artifact audit passed.
- `npm run lint`: source boundaries and official Obsidian ESLint checks passed.
- `npm run check:install`: built-plugin settings definitions, draft/apply behavior, failure handling, persistence and exclusion/shortcut compatibility passed with the public-host stub.
- `npm run preview:build`: passed.
- Responsive-toolbar browser suite on Chromium, Android tablet and Android phone: 38 passed, one touch-only check intentionally skipped on desktop in the initial pass; see the docking record for the final expanded matrix.
- New navbar regression checks actual hit targets above the overlay, picker clearance, inset fallback, negative keyboard spacing, hidden navigation, tablet/docked layouts and an unchanged circuit snapshot.
- The actual settings-row implementation was also exercised in Chromium with a public-API stub and installed Obsidian CSS at desktop and phone widths. Draft/apply, invalid paths, a failed migration followed by retry, and inline control geometry passed. The initial phone review exposed a native full-width control rule; the scoped selectors were corrected and rechecked.
- README tests cover legacy-marker removal, purpose-first order, corrected settings path, repeated refresh and protection of handwritten notes.
- `git diff --check`: passed.

## Visual evidence and limits

- [Docked phone navbar clearance](../toolbar-docking/top.png): actual editor with a labelled simulated host overlay. The earlier fixed-inset capture remains historical.
- [Desktop Apply row](apply-desktop.png) and [phone Apply row](apply-phone.png): actual settings renderer, public-API stub and installed host CSS.

These captures are browser emulation, not a successful run of the updated plugin on a physical Obsidian phone. The owner supplied actual-device failure evidence; confirming the fix on that phone, real soft-keyboard transitions and current WebKit behavior remains separate qualification. No full gallery regeneration or release publication was performed for this change.
