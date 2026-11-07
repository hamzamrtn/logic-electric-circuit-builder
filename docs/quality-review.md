# General quality review

Local review completed 2026-11-06, covering reliability, intuitive controls, clean layout, mobile interaction, wire routing and adapter lifecycle races. This report records verified fixes and release-qualification limits; it does not certify a bug-free plugin or authorize a release. Changes remain local and unpublished, with package metadata at 0.1.5.

The added placement/wiring and circuit-aware pathfinding review is documented in [wire-routing.md](wire-routing.md). It includes native swipe protection, consistent wire selection, pin directions, obstacle clearance, independent generated route checks and a comparison with the earlier router.

## Confirmed findings repaired

| Area | Reproduced failure | Verification |
| --- | --- | --- |
| Saving | Keep local skipped a necessary restore when no local revision had changed; retries and later external events could then mishandle that restoration. | Persistence regression tests, including failed restore/retry and another external event. |
| Conflicts | Failure to write a recovery copy hid the conflict resolution controls. | Recovery-storage failure retains conflict status and both in-memory versions. |
| Reuse | Copying an attached label alone left missing pin references; a wire and copied label could lose their shared boundary anchor. Grouped standalone nodes could be omitted. | Snippet serialization, independent paste and anchor-sharing tests. |
| Groups | Deleting a wire could leave missing endpoints in a group; deleting only a group container deleted its contents. Locked group containers could be deleted. | Core regressions with exact undo; generated subset deletion and snippet round trips. |
| Shared views | Removing the start pin of an in-progress wire draft crashed/unmounted the canvas. | Browser test removes the part through the shared session, checks for page errors and then places another part. |
| Clipboard/shortcuts | Cut waited for the system clipboard; unhandled Ctrl/Meta/Alt shortcuts could rotate, delete or nudge parts and change tools. | Browser regressions with a deferred clipboard and host-modifier keys. |
| File integrity | Edits could create a saved document above the supported UTF-8 import size. | Oversized edit is rejected without document/history mutation. |
| Custom blocks | Many pins extended outside a fixed body/bounds; duplicate pin IDs were accepted until placement failed. | All four sides at 64 pins, pin-grid/body/extents checks and duplicate-ID validation. Existing definitions are not migrated or relocated. |
| Rendering | Large symbols disappeared while their origin was offscreen, despite visible geometry. | Browser rendering regression at desktop/phone/tablet sizes. Component extents also include legacy outlying pins. |
| Locked geometry | Locked annotations, group-protected routes and protected junctions could move through connected objects; locked wire bends could rotate. | Independent position/route tests and a native drag preview/commit/undo browser scenario. |
| Topology | Valid IDs containing colons could collapse two endpoint identities, falsely joining separate nets or refusing a valid connection. | Independent-net and wire-creation tests with delimiter-containing IDs. Serialized IDs remain unchanged. |
| Export | Box annotations were exported above wires although the canvas draws them behind. | SVG layer-order regression; existing SVG and PNG browser checks. |
| Selection | Select ignored proximity candidates outside a thin SVG wire stroke, especially at low zoom. | Pointer near-miss and native finger-radius tests at 25% zoom on desktop/phone/tablet. |
| Imported buses | Coincident bus endpoints produced a one-point path and crashed width-label rendering. | Browser fixture renders the bus, separates its endpoints and checks for page errors. |
| View initialization | A 1,000px-wide view could retain the initial uncentered camera because width doubled as an initialization sentinel. | Measured-center browser regression at precisely that width. |
| Vault reads | A delayed read could restore old contents after a newer external event or local save. | Versioned read tests; obsolete read errors are ignored while current errors still surface. |
| Inspector locks | Property/route controls and an already-open transform dialog could bypass object/group locks. | Disabled-control/unlock tests on all layouts; commit-time lock checks and direct graph-command atomicity tests. |
| Coordinate dialogs | Another view moving an object while its coordinate dialog was open made the submitted absolute position behave like a stale offset. | Browser regression verifies the requested coordinates and exact undo to the newer external position. |
| Group wire edits | Split halves/junctions fell out of their wire group; part insertion retained a missing wire member and changed routing settings. | Group membership, rigid move, serialization and exact-undo regressions; 100 generated split/move sequences. |
| Endpoint merges | Coincident endpoint merging could detach the intrinsic component pin or leave stale group node references. | Three-way endpoint join preserves the pin in its net; distinct overlapping pins are refused atomically. |
| Protected dependencies | Delete with attached wires could remove protected wires; junction deletion could remove protected dependencies; even empty Delete could clean up unrelated nodes. | Independent dependency tests and 150 generated deletion selections checking protected object survival, graph validity and undo. |
| Group interaction | Object-list group selection did not highlight/drag its contents, while Cut removed only its container. | Native mouse group drag and container Delete; all-layout grouped Cut and exact undo. |
| Chooser/modal focus | Choosing an overlapping wire discarded additive selection, opened the inspector, and left keyboard focus behind the dialog. Failed forms also stranded keyboard focus. | Multi and captured-Shift selection, no behind-dialog edits, focus wrapping, draft-preserving Escape and error correction tests. |
| Compound connections | Joining candidate wires and the current draft produced separate undo steps; parallel wires offered an impossible join; splitting a draft's source could invalidate its destination piece. | Atomic join/draw/reconnect, same-wire branch, shared-point validation, width-failure rollback and exact undo/redo tests. |
| Live choices/focus | Removed or moved targets remained in the chooser, and losing a focused choice or closing a placement dialog could strand or override focus. | Browser regressions prune stale choices, retain drafts, move focus to valid choices and preserve the action's placement focus. |
| Preview acquisition | A preview deleted during its initial read could mount stale content; older second-view snapshots could roll back a newer shared session. Deleted/error previews retained ownership until note close. | Shared/invalidated/aborted/disposed acquisition tests, stale-view preservation, and five preview ownership/cancellation/error lifecycle tests. |
| Crossing precision | Floating-point residue caused exact integer crossings to be rejected, even for simple asymmetric orthogonal segments. | 200 generated exact integer crossings with endpoint-policy checks; rounded candidates must lie exactly on both original lines. |

The restrained feedback and camera update is documented in [interaction-feedback.md](interaction-feedback.md). The [screenshot gallery](screenshots/README.md) includes ten validated, editable showcase drawings and checked listing copy.

The earlier touch and toolbar work is documented in [touch navigation validation](evidence/touch-navigation/validation.md).

## Coverage added

Final local verification: `npm run check` passes 143 core/adapter tests, strict TypeScript, production build and artifact audit. `npm run lint`, `npm run check:install` and `npm run package` pass. `npx playwright test --project=chromium --project=android-tablet --project=android-phone --workers=3` passes 175 browser checks with 14 explicit mouse-only skips on touch projects. The three ZIP assets match the built files byte-for-byte; the final artifact hash is recorded in [final-quality-checks.json](evidence/final-quality-checks.json).

Android tablet and phone projects now run every browser spec, rather than only the touch navigation spec. Desktop mouse-only drag scenarios retain explicit skips on touch projects; numeric alternatives and native Chromium touch navigation are checked separately.

Generated reuse tests run 100 seeded arbitrary selection/deletion scenarios, checking snippet portability, independent paste, graph validity and exact undo. The existing 70 generated movement/transform sequences remain in place.

Additional group coverage runs 100 generated split/move sequences and 150 arbitrary protected-deletion requests. Independent assertions check rigid group movement, connectivity, protected-object survival, graph round trips and exact undo.

The browser performance smoke at 1440×900 completed without page errors: 100 parts/300 wires took 24.9 ms through two frames; 500 parts/1500 wires took 62.9 ms. These are single foreground desktop smoke samples, not device FPS claims or statistical performance qualification.

## Release qualification still required

- Actual Obsidian walkthrough: concurrent views, rename/deletion, previews, plugin close/unload/re-enable and pop-out migration. Adapter tests use public-host stubs and do not prove behavior inside the host.
- Real Android phone/tablet and iPhone/iPad checks: pinch/pan, placement/wiring/reconnect/split/disconnect, soft keyboard, orientation, large interface text and theme/accessibility settings.
- Actual Safari/device walkthroughs. The WebKit touch suite now passes in [GitHub Verify](https://github.com/hamzamrtn/logic-electric-circuit-builder/actions/runs/42358998816), with 226 browser checks passed across all four projects and 26 platform-specific skips.
- Two-device sync and competing edits, app suspension and force-kill durability.

## Evidence limits

Actual Android/iOS Obsidian, real pen/trackpad input, sync and force-kill durability remain device/host checks. WebKit installation was attempted using the pinned local Playwright version and `/tmp/lec-playwright`; all download mirrors timed out. This limitation applied to the local review. The implementation was subsequently committed and pushed as 5579ea0; remote CI passed, including WebKit. Release publication remains owner-controlled.
