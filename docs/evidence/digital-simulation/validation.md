# Initial digital workflow — 2026-11-13

This is the initial-workflow baseline. [Subsequent hardening and physical Android verification](../simulation-hardening/validation.md) supersede its current-state and qualification summary; the hashes and results below remain the original snapshot.

**Implementation complete and verified locally; unpublished.** The supported initial combinational workflow now ships in the locally built plugin, replacing the development-only D0 integration. Actual Android/iOS and normal release qualification remain open. This does not complete the roadmap's sequential, analog or hierarchical milestones.

Branch: `main`, based on `35c781fdf96a8ac4c6a239e5ab83b1f698aefc90`, with local changes. No commit, push, CI run or publication was performed. Pre-existing release-document work was preserved. Manifest/package metadata still identify 0.1.11; generated local assets are an **unreleased development build**, not the published 0.1.11 artifact or a new release candidate.

## Delivered behavior

More → Digital simulation exposes Run, Stop, Reset, four-state temporary inputs and live probes for canonical Logic input, Output probe, two-input AND/OR/XOR and NOT definitions. Unsupported/modified devices reject the whole run. Feedback and size/work exhaustion return diagnostics without partial measurements; conflicting drivers produce X with an explicit diagnostic.

Selection, tools and unfinished wires survive opening/closing the panel. Runs use committed connectivity. Runtime operations do not change serialized content, saved files or undo history. Committed edits/external replacement invalidate results and require Run again. Save/conflict/deletion problems stop the active run and block Run until resolved. The controls use keyboard/tap/click input and explicit signal text; output text retains the normal theme foreground for contrast.

DigitalSessions shares inputs/results between consumers of one DocumentSession, isolates different sessions, pauses when all consumers hide and releases the last owner. A surviving visible consumer can take over scheduling after another window closes. An abort resolves pending timer turns even if their window is closing. Pop-out remounts retain inputs through a temporary hidden consumer. Pagehide/unload also release consumers: actual-host testing caught a paused owner surviving renderer/window teardown when React cleanup alone was assumed. That path was fixed and rechecked. Reading previews acquire no simulation owner, and plugin disable/re-enable starts a fresh runtime.

[User/developer workflow](../../simulation.md), [architecture decision](../../adr/002-digital-feasibility.md), [earlier D0 baseline](../digital-d0/validation.md).

## Checks executed

| Check | Result |
| --- | --- |
| `npm run check` | **216 tests in 34 files pass**, strict TypeScript, production build and artifact audit pass. |
| `npm run lint` | Runtime boundary/injection checks and official Obsidian rules pass, zero warnings. |
| `npm run check:install` | Three-install-asset public-host-stub smoke passes: seven commands, one view. |
| `npm run package` | Pass; ZIP CRC valid and all three archived install assets match the current files byte-for-byte. |
| `npm run preview:build` | Pass. |
| Full Chromium/tablet/phone browser suite | **304 passed, 17 intentional skips**, 1.1 minutes; [retained log](browser-regression.txt). |
| Native-style simulation checks | **15 passed**, 7.5 seconds, using installed Obsidian CSS and simulated floating phone navigation; [retained log](native-style-browser.txt). |
| Actual-host workflow | **Pass**, installed Obsidian **1.14.4**, isolated temporary vault/profile. Shared views, live updates, hidden-tab pause/resume, pop-out input preservation/cleanup, last-owner release, preview non-execution and plugin disable/re-enable. No page errors; [report](obsidian-host.json). |
| Browser/actual-host heap and stress checks | **Pass**, 300 measured ownership/run/release cycles in each environment, resource-limit fixtures and forced-GC/sampled-heap budgets; [browser](memory-browser.json), [Obsidian](memory-obsidian.json). |
| Visual checks | Inspected wide/light and phone/dark screenshots with native host CSS; [capture metadata](captures.json). The light-theme output accent was too faint; normal theme foreground replaced it and the 15 native-style checks/captures were refreshed. |
| Content/source/package review | Runtime security/boundary checks, source/asset digest comparison, new/tracked-file whitespace and Markdown link checks. [Final source/package record](final-checks.json). |

Tests include literal exhaustive gate/driver tables, independent half-adder and mux oracles, 100 seeded generated Boolean networks, explicit graph/named-net/width cases, cancellation/late identity rejection, dense dependency budget exhaustion, shared ownership, timer cancellation and pop-out handoff. Browser tests build a supported circuit through the actual picker and named-pin dialog, run/toggle outputs, edit/rerun/undo, stop/reset/reopen, recover after unsupported/feedback input, preserve unfinished wiring through Escape, and exercise all four docks across wide, narrow and short views. No clicks are forced or assertions bypassed.

The full browser regression preceded the final color-only contrast correction. The subsequent 15 native-style checks exercise the final CSS and include page-error assertions. Runtime behavior did not change after the full regression. Numeric coverage instrumentation is not configured; no coverage percentage is claimed. The existing independent/generated tests and executed workflows provide the reported evidence.

## Memory/resource measurements

Reference environment: Linux desktop, AMD Ryzen AI 7 350, approximately 30.1 GiB RAM; Chromium 153.0.8010.12 and actual Obsidian 1.14.4. Each environment warmed ten cycles, then measured three batches of 100 acquire/run/release cycles. Forced V8 GC separates retained-heap samples; transient heap was sampled through CDP every approximately 10 ms. These are **JavaScript heap observations**, not process/native memory or absolute peak guarantees.

Both environments stayed below the predeclared **2 MiB retained-growth** and **32 MiB sampled transient-growth** budgets. Raw reports retain exact values; observed retained growth was approximately 0.2 MiB and transient growth approximately 7 MiB. Engine/pool/scheduler/fixture sources in those reports match the final implementation. They precede the final CSS contrast change and host-CSS extraction refinement, neither of which changes the memory-probe workload.

Stress fixtures cover a 254-inverter chain (256 components including input/probe), 3,584 independent undriven lanes, an oversized modified definition, and dense dependencies that hit the 100,000-work-unit budget. The chain returns the independently expected output; lanes return Z; the modified definition rejects quickly; dense work terminates with `work-limit` and no outputs. The lane fixture takes around 0.2 seconds and dense exhaustion around 3.3 seconds; **the earlier 100 ms small-circuit response target is not a claim for every circuit inside the request envelope**. Cooperative task yields leave Stop available. Original D0 response/cancellation measurements remain in the dated baseline.

## Reproduce

Run the ordinary `npm run check`, `npm run lint`, `npm run check:install`, `npm run package`, and `npm run preview:build` checks. Then:

```sh
npx playwright test --project=chromium --project=android-tablet --project=android-phone --workers=3
node scripts/check-simulation-host.mjs
node scripts/check-simulation-memory.mjs
node scripts/check-simulation-memory.mjs --host
```

The host command prints its `nativeCss` path. Use that path for:

```sh
node scripts/check-simulation-browser.mjs --native-css /tmp/lec-simulation-host-EXAMPLE/native-host.css
LEC_SIM_HOST_CSS=/tmp/lec-simulation-host-EXAMPLE/native-host.css node scripts/capture-simulation.mjs
```

Host tests use `/opt/Obsidian/obsidian`, or `LEC_OBSIDIAN_BIN`, with new `/tmp/lec-simulation-host-*` vaults/profiles. User vaults are never opened. Browser launch requires execution outside this environment's sandbox; restricted launch fails before testing. Native-style tests wrap the editor in host layout classes and simulate phone navigation, preserving the distinction from actual mobile-host execution. The host-only CSS snapshot excludes the plugin's stylesheet so the current plugin styles are tested directly.

## Remaining qualification and release boundary

- Actual Android/iOS Obsidian, device suspension/force-kill and device-specific memory/responsiveness remain untested. No mobile device bridge (`adb`) is available here. Engineering owns this qualification; this record does not delegate routine testing to the owner.
- The current browser cache has Chromium and FFmpeg; WebKit is not installed and its project was not executed. Phone browser emulation is not actual iOS or Android qualification.
- Broader desktop OS/host versions were not exercised for simulation. Actual-host evidence is Linux/Obsidian 1.14.4, including the isolated window/renderer teardown scenario.
- Publish only after target qualification, release/version preparation, exact candidate checks and authorization. No release or directory-listing simulation claims were added. Persisted behavioral settings, stateful/timed logic, bus devices, hierarchy and analog solving remain separate roadmap work.

## Brief ECC self-review

Accuracy 4/5: independent oracles, matching runtime/package digests and actual desktop checks support the bounded claims; native mobile remains unmeasured. Completeness 4/5: the requested initial digital workflow is implemented end to end; release qualification remains separate. Clarity 4/5: guide, UI state labels and this record distinguish live/stale/unsupported values and unreleased status; the public release still predates the feature. Actionability 4/5: repeatable isolated checks and exact artifacts are available; device qualification needs an engineering-operated target. Conciseness 4/5: scope stayed at the initial scalar model set; evidence retains the real cleanup fix and qualification limits instead of implying universal coverage. Overall 4.0/5; next work is target qualification and release preparation, rather than expanding models.
