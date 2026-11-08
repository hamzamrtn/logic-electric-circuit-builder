# Dockable drawing toolbar

Recorded 2026-11-08. Release 0.1.9, prepared with owner-authorized publication. The owner's latest choice replaces the whole-view bottom-padding draft with four fixed docking positions. Document format, circuit geometry and backup retention are unchanged.

## Behavior

- The move icon sits in the drawing toolbar's top-left corner. Dragging previews an edge and snaps to top/right/bottom/left on release. Center/outside drops, pointer cancellation and lost capture leave the chosen position unchanged. Only the handle owns these gestures.
- Tapping or keyboard-activating the handle opens the same four choices and Reset toolbar position. The menu opens above a low anchor when necessary. Reset restores the responsive default: inline top on wide panes, top dock on compact panes (owner-selected default).
- Top/bottom docks are horizontal; side docks are vertical. Short side docks have contained scrolling, retaining access to Add and the handle. Controls and the document session stay mounted.
- The canvas, parts picker and zoom card adapt together. Narrow/short pickers use the available modal area; the host's floating phone navbar is excluded from that area. Zoom moves to a clear corner, and Fit accounts for both zoom controls and obscured bottom canvas space.
- Host navigation itself is untouched. Its inset affects docked controls and safe Fit bounds; the entire host view is not padded.
- Dock preference is stored in plugin settings, shared across open circuit views and published to listeners only after a successful settings write. Older/malformed values use the responsive default. Failed writes preserve the previous preference. Docking adds no document edit or undo entry.
- Recovery settings include the requested example `99_Archive/CircuitBackup`. Earlier Apply, README and settings-guidance improvements are preserved.

## Final local checks

- `npm run check`: strict TypeScript, 188 core/adapter/property tests in 31 files, production build and artifact audit passed.
- `npm run lint`: runtime boundaries and official Obsidian ESLint passed.
- `npm run check:install`: built-plugin stub passed, including layout save/reload, rejected values, failed layout writes and subscriber notifications alongside existing settings/shortcut/recovery checks.
- `npm run preview:build`: passed.
- Full Chromium/Android tablet/Android phone matrix: **268 passed, 17 intentional platform/input skips**, 285 combinations.
- Docking browser checks cover four edges, unobstructed tool hits, zoom non-overlap, picker access, mouse edge drops, canceled center drops, keyboard menus/reset, short-screen scrolling, native Chromium touch drag/cancel, unchanged circuit snapshots and Fit above simulated host navigation.
- Unit checks cover legacy preference loading, invalid/center/outside edge targets and shared preference notifications.
- Visual review used the actual editor with a clearly labelled simulated Obsidian navbar. Grid bounds were checked against the viewport. The final captures include all four positions after Fit-clearance verification.
- `git diff --check` passed.

## Smaller, consistent grip follow-up

The owner identified a mismatch between the merged horizontal handle and separate vertical button. Both now share one corner primitive: 32px visual chrome, 16px move icon and a 44px pointer/touch target. Computed geometry matched in top and left docks. The focused docking suite passed 14 checks across Chromium and Android tablet/phone, with one native-touch-only skip on desktop; this styling-only follow-up did not rerun the full matrix recorded above. Runtime-boundary/CSS policy and diff checks passed. [Horizontal grip](grip-top.png) and [vertical grip](grip-left.png) show the matched treatment.

## Top-default follow-up

The owner selected the top as the default for compact panes; wide panes retain the inline top row. Explicit saved side/bottom preferences remain unchanged, and Reset toolbar position resolves to the top. Default/reset assertions and native-touch drag destinations were updated accordingly. The initial verification reproduced Properties covering the top-docked Wire button; overlay placement now clears top and side docks, and the four-edge test checks toolbar hit targets while Properties is open. The focused responsive/docking suite passed 52 checks across desktop and Android tablet/phone, with two intentional skips. README and standing contracts reflect the selected default. Production build/install smoke, strict TypeScript and diff checks pass. The full follow-up browser run passed 267 cases with 17 skips and exposed one old Fit test that still assumed bottom-positioned zoom controls. That test now explicitly selects bottom docking, preserving its original clearance assertion, and passes across all three available projects; no application change was needed for that test adaptation.

## Captures and limits

[Top](top.png) · [Right](right.png) · [Bottom](bottom.png) · [Left](left.png)

The navbar in these captures is simulated. Actual Obsidian phone/tablet testing, real keyboard/orientation transitions and WebKit qualification remain separate. Source push, remote CI and release publication are recorded separately in GitHub Actions. The dated 0.1.8 release evidence remains historical.
