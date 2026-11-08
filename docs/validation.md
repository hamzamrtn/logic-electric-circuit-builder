# Validation and remaining qualification

The 0.1.10 docking refinement is recorded in [docking-refinement/validation.md](evidence/docking-refinement/validation.md): 188 core/adapter/property tests and the full available desktop/Android matrix (277 passed, 17 intentional skips) pass, with lint/build/install checks. Floating docks now overlay the complete canvas, all four destinations appear during Move, Top restores the desktop row and wire controls retain navigation clearance. Remote WebKit/release results are recorded separately in GitHub Actions.

The current unreleased dockable-toolbar update is recorded in [toolbar-docking/validation.md](evidence/toolbar-docking/validation.md): 188 core/adapter/property tests and the full available desktop/Android matrix (268 passed, 17 intentional skips) pass, along with lint, build/artifact and install-stub checks. Four fixed edges replace the whole-view inset draft, with shared saved positions and adaptive canvas/picker/zoom/Fit. Screenshots use a simulated host navbar; actual-device and WebKit qualification remain separate.

The unreleased phone-navbar and settings follow-up is recorded in [mobile-nav-and-settings/validation.md](evidence/mobile-nav-and-settings/validation.md): 185 core/adapter/property tests, 38 responsive browser checks and one intentional desktop skip, lint, build/artifact checks and install smoke pass locally. A simulated floating host navbar no longer covers the dock or picker. Settings/README refinements and visual captures are included; actual-device confirmation of the reported overlap remains pending.

The 2026-11-08 recovery-folder settings update is recorded in [recovery-folder/validation.md](evidence/recovery-folder/validation.md): 183 core/adapter/property tests, lint, production build/artifact checks and settings/exclusion persistence in the install stub pass locally. This adds safe folder migration, optional owned exclusions and brief recovery instructions; actual host/device folder and Sync qualification remains separate.

The current responsive workbench update is recorded in [responsive-toolbar/validation.md](evidence/responsive-toolbar/validation.md): 147 core tests and 251 desktop/Android browser checks pass, with 16 input/layout-specific skips. Wide, compact, split-pane, short-screen and keyboard-height behavior have dedicated coverage. Visual captures and the refreshed listing gallery show the current UI; GitHub Verify records the separate WebKit result.

Current unreleased control/inspector changes: 147 core tests and 213 desktop/Android browser checks pass, with 15 mouse/touch-specific skips. Lint, production build, artifact checks and install-stub persistence checks pass. See the [intuitive controls review](evidence/intuitive-controls/validation.md) for the owner's reported issues, implementation evidence, visual review and host/device limits. GitHub Verify provides the separate WebKit result.

Latest verification, 2026-11-07: 143 core/adapter tests and 175 desktop/Android browser checks pass, with 14 mouse-only skips on touch projects. Strict TypeScript, official Obsidian lint, production artifact checks, clean-install stub smoke and packaging pass. [Current hashes and command record](evidence/final-quality-checks.json), [interaction feedback](interaction-feedback.md), and [README/listing gallery](screenshots/README.md) describe this working tree. Real-device/Safari qualification remains separate.

GitHub [Verify for the 0.1.6 implementation](https://github.com/hamzamrtn/logic-electric-circuit-builder/actions/runs/42358998816) also passes: 143 core tests and 226 browser checks across Chromium, Android layouts and WebKit touch, with 26 platform-specific skips. Actual Obsidian devices and Safari remain separate from browser emulation.

The general reliability/UI review is recorded in [quality-review.md](quality-review.md), including repaired regressions and remaining host/device work.

The 2026-11-06 Android phone/tablet gesture fix and its current automated results are recorded in [touch-navigation/validation.md](evidence/touch-navigation/validation.md). The historical results below remain a record of earlier builds.

Recorded 2026-11-01. Local development version 0.1.2, author Hamza, MIT. This record distinguishes source implementation, automated checks, browser review and actual host/device evidence. It is not a public-release approval.

The current canvas/interaction update is documented in [ui-0.1.1/validation.md](evidence/ui-0.1.1/validation.md). Earlier screenshots and launch logs are retained as baseline evidence. The owner supplied an actual Obsidian screenshot of 0.1.0; updated 0.1.1 host qualification is pending reload.

0.1.2 adds a single 36px desktop toolbar, a visible uncut grid, Enter-to-Finish, wire-segment snapping and readable connection names. Browser checks reproduced the buffer-plus-wires Multi case without changing document revision, verified Snap on/off targets, and confirmed that Enter submits a title input without finishing a wire before finishing it once canvas focus returns. See `evidence/ui-0.1.2/`.

## Completed locally

- Strict TypeScript checking and source-boundary/injection lint pass.
- 50 Vitest tests pass, including 70 seeded fast-check generated operation sequences. They exercise crossings/junctions, exact undo, stable pin movement/transforms, branch splitting, insertion without a bypass, component deletion, copying, lane mapping, width rejection, pin reconfiguration, labels, slow saves, conflicts, failures, malformed external files, recovery, routing bounds, SVG escaping, complete-library/examples round trips, internal group-node movement and coalesced nudges.
- Production bundle has only `obsidian` external; no runtime Node/Electron imports, remote assets, chunks or workers. The browser-safe runtime dependencies and complete license notices are included.
- Three-asset module smoke loads the built CommonJS plugin in a fresh directory with a public-host stub and registers seven commands, one view, the extension and preview fence. This does **not** execute Obsidian or mount its view.
- Connected Chromium 154 browser review passes 12 checks at 1440×900 and 390×844. It exercises responsive layout, phone tool targets, malformed/future import preservation, named-pin dialog wiring, exact undo, PNG bytes, SVG parsing, field shortcut isolation and viewport controls. Native browser clicks separately verified palette placement, rotation/undo and coordinate movement. JSON results and screenshots are in `evidence/`.
- Keyboard Tab reaches the circuit title with a visible 3px focus outline. The phone toolbar targets measure at least 44 CSS pixels. Light and dark rendered views were inspected. The fallback muted color was adjusted to clear a 4.5:1 contrast threshold against the drawing background. User themes can supply their own interface colors.
- PNG encoding produced a valid PNG signature; SVG parsed as XML and includes the full document. Large exports retain explicit dimension/pixel limits.
- Npm advisory bulk check for the final lockfile returned no advisories after updating Vite to 8.1.6 and Vitest to 4.1.12. See `evidence/dependency-audit.json`; this is a time-specific advisory lookup, not a permanent guarantee.

## Browser performance spike

The foreground Chromium 154 sample used a 1440×900 viewport with hardwareConcurrency 16. The fixtures contain 100 parts/300 wires and 500 parts/1500 wires. `browser-benchmark-final.json` records parse/publish at 5.6/15.5 ms and elapsed time through two animation frames at 22.2/89.8 ms. Viewport culling rendered only the visible subset (20 parts/51 wire paths in this camera).

The initial timing sample was roughly a second through two frames; explicitly bringing the browser page to the foreground changed that result. Browser scheduling therefore matters. These are single smoke samples, not statistically established opening-time or FPS claims, and do not establish real mobile performance.

## Not passed here

The Playwright suite discovers twenty-four project/test combinations. A Chromium run was attempted with one worker and stopped during browser launch before application test assertions: the sandbox denied a Chromium shutdown/socket operation (`Operation not permitted`, SIGTRAP). The launch log is `evidence/playwright-attempt.txt`. Four remaining Chromium cases did not run; WebKit did not run. Connected-browser inspection provides separate evidence and does not turn the Playwright suite green. CI is prepared but has not been executed on GitHub.

A clean local `npm ci` also encountered the sandbox's subprocess restriction in esbuild's synchronous postinstall version probe. A clean install with `--ignore-scripts` is the local verification path; the required platform binary is present in the lockfile and build/artifact checks execute it separately. Normal contributor/CI instructions retain `npm ci`; its unsandboxed postinstall path has not been qualified here. Network-restricted dependency installation used an isolated cache under `/tmp`, populated with public npm metadata/tarballs through the connected browser; npm verified package integrity. No runtime service or registry proxy is required by the plugin.

| Actual host/platform | Status |
| --- | --- |
| Linux Obsidian | 1.14.5 found installed; plugin was not launched in it |
| Windows Obsidian | Not tested |
| macOS Obsidian | Not tested |
| Real iPhone / iPad Obsidian | Not tested |
| Real Android phone / tablet Obsidian | Not tested |
| Touch/phone layout in Chromium | Selected browser checks passed; emulation only |
| WebKit browser harness | Not tested |
| Screen readers, real pen, trackpad, native pinch, soft keyboard | Not tested |
| Obsidian Sync, force-kill durability, pop-out migration, competing plugins | Not tested |
| Competitor task benchmarks / new-user usability sessions | Not performed |

## Exact manual qualification checklist

Use a dedicated test vault and copy **only** main.js, manifest.json and styles.css into its plugin folder. Record host, OS/device, browser/WebView, plugin version and input method for every run. Save the evidence alongside the completed handover scenario numbers.

1. Enable offline, create a circuit, open/reopen it, switch files and disable/enable the plugin repeatedly. Check for errors and orphan listeners. Verify seven commands/ribbon/context menu, file association, settings and all 72 symbols with stable pins after reload.
2. Build source/resistor/ground and two-input AND/output circuits using visible controls. Branch, cross without joining, join explicitly, disconnect with arm pairing, insert a two-pin device and remove one branch. Move/rotate/mirror connected parts, drag bends/segments and inspect the resulting nets. Repeat with touch and no keyboard.
3. Open one file in two tabs, edit alternately and verify shared content/history with separate cameras. Delay/fail vault writes; ensure saved status acknowledges only durable revisions and recovery remains available. Rename during a delayed save and verify the old path is not recreated. Delete during a pending edit and verify no resurrection.
4. Change the file externally while clean and dirty. Test each conflict choice. Supply malformed JSON, missing-pin references and a future schema; verify original bytes are preserved and no empty save occurs. Inspect the three-slot recovery sets. Record the last actually durable edit after app suspension and force-kill.
5. In Reading view and Live Preview separately, insert a linked preview, edit its circuit, rename/move/delete the target and reopen the note. Verify repairable missing references and unrelated note content remains intact. Export SVG/PNG with offscreen content; disable the plugin and view those images.
6. Exercise pointercancel, lost capture, a second finger during a drag, orientation/background changes, pan, zoom and soft keyboard. Verify a long drag is one undo step and canceled gestures add nothing. Use all non-drag/list/coordinate alternatives, large text, both themes, reduced motion and screen-reader navigation.
7. Move the editor to/from pop-out windows. Check input, palette, shortcuts, subscriptions and shared session; the current remount intentionally resets camera/tool previews. Complete the same editing tasks on each real platform in the matrix.
8. On two real devices, configure custom-type Sync and plugin activation separately. Verify concurrent edit conflict handling. Measure the standard 100/300 and 500/1500 fixtures on recorded devices; retain performance traces rather than inferring smoothness from the desktop browser sample.
9. Run the handover’s identical editing benchmark against installed Perun, Logic circuits and Circuit Sketcher where supported. Mark unsupported tasks/devices unavailable. Run new-user discovery sessions before claiming a usability advantage.

Public release remains blocked on these actual-host/device checks and the full Chromium/WebKit suite. Source, local package and independent automated/browser work are available for review now. Recovery sets from earlier sessions remain until the user removes them; preview code-fence path repair after reopening is manual. See architecture.md for these implementation boundaries.
