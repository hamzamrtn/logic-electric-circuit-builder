# Requirements and evidence ledger

Implementation is separate from qualification. The handover’s 42 acceptance scenarios remain the authoritative release tasks. Automated checks cover independent core outcomes; browser inspection covers selected actual controls. An untested host/device row is a release blocker, not an inferred pass.

| Handover area | Implementation | Current evidence / next qualification |
| --- | --- | --- |
| Documents and lifecycle | New/open/duplicate, title, import, autosave, clear confirmation, raw recovery | Core/import/save tests; host file operations require actual vault walkthrough |
| Navigation | Pan, wheel/pinch zoom, zoom buttons/reset, fit all/selection, grid/snap | Zoom math tested, browser controls verified; native pinch/pen/trackpad walkthrough pending |
| Placement and parts | 72 built-ins, search/category, ghost, rotate, repeat, custom blocks | Complete library schema round trip; native mouse/touch-emulated placement checked |
| Selection | Single/additive/box/all, lists, net selection, lock/groups | Browser object/inspector controls present; exhaustive touch selection remains manual |
| Component operations | Move/nudge/coordinates/tap destination, rotation/mirrors, properties, clipboard, groups, align/distribute | Topology/inverse/generated tests; named-pin dialog and rotation/undo reviewed |
| Wiring | Manual bends, segment handles, bend coordinate editor, free/orthogonal, split, reconnect, stubs, branch deletion, explicit insertion/join/disconnect | Core split/join/insertion/arm-pairing tests; full device gesture scenarios pending |
| Topology | Stable pins/nodes, geometric crossings separate, explicit labels, per-lane buses, no-connect markers | Crossings/junctions, width rejection, label lanes and pin reconfiguration tested |
| History | Atomic commands, one drag commit, canceled preview, bounded snapshots, nudge coalescing | Unit/property tests; Playwright drag/cancel scenarios authored but browser process unavailable locally |
| Diagnostics and access | Component/pin/net lists, coordinate move, named connections, structural diagnostics | Browser named-pin/shortcut checks; screen-reader and full keyboard/device review pending |
| Reuse | Selection snippets, ID remapping, embedded definitions, isolated ordinary named nets | Fragment round trip and boundary-stub tests; file export manually reviewable |
| Notes/sharing | Public code-fence previews, normal links, SVG/PNG/JSON export, missing-path repair state | SVG/XML and real PNG encoding checked; Reading/Live Preview/rename/Publish fallback pending actual host |
| Persistence | One queue per TFile, baseline comparison, completed revision status, retry, conflicts, recovery, delete guard | Delayed writes/conflicts/errors/malformed external content tested; rename/sync/force-kill need real hosts |
| Mobile and accessibility | Container layouts, 44px phone toolbar, visible non-drag alternatives, focus, dark/reduced-motion CSS | Browser 390x844 and 1440x900 evidence; real iPhone/iPad/Android and assistive technology pending |
| Feedback | More → Send feedback, lightning icon, personal response guidance, separate GitHub templates | [Feedback and scorecard validation](evidence/feedback-scorecard/validation.md); keyboard focus, drafts and small-pane browser checks; external submission remains user initiated |
| Packaging | Single browser bundle and three assets, license notices, lockfile, CI, ZIP | Artifact/module smoke scripts; actual Obsidian load/unload and clean installation pending |

Known implementation constraints are explicit in architecture.md: recovery sets are bounded per session but older sessions’ sets are retained; pop-out remount resets viewport/tool previews; preview path repair after reopening is manual; structural checks do not simulate a circuit. No unpublished comparative usability claim is made.
