# Simulation hardening and native Android checks — 2026-11-13

**The owner-approved hardening criterion is met: no known reproducible defects after the documented desktop and real-Android checks, with iOS explicitly unverified.** The owner confirmed that criterion on 2026-11-13 and left later roadmap milestones for a separate task. All reproduced defects in this pass are fixed and the exercised workflows pass. This is local, unpublished work based on `35c781fdf96a8ac4c6a239e5ab83b1f698aefc90`; it is not a universal zero-bug proof. The earlier [initial implementation record](../digital-simulation/validation.md) is a separate dated baseline.

## Fixes and regression evidence

- Shared invalidation now publishes stale results, inactive intent and pruned input identities atomically. Explicit reruns survive observer ordering; terminal failures clear live intent before publication; disposal notifies attached consumers.
- Direct runtime disposal becomes terminal before notifying observers, preventing a stopped-state callback from restarting work during teardown.
- The save writer is reserved before observer notifications. Committed original-file writes are distinguished from pending backups, so clean external updates do not become false conflicts merely because recovery is still running.
- Late backup/write errors preserve newer conflict/deletion states. Deletion remains terminal across pending compare results, conflict resolution, reads, recovery and reentrant document notifications. Resolution epochs cancel obsolete choices; newer local edits are not silently discarded or falsely acknowledged as durable.
- Actual Android testing found that Activity backgrounding emitted Cordova pause/resume while `document.hidden` remained false. Simulation now consumes both native events and browser visibility, pauses on Android Home, and recomputes once on return.
- A delayed first IntersectionObserver notification could discard an immediately visible input/Run action. Initial visibility is measured synchronously; subsequent observer notifications retain normal hidden-pane behavior.

Tests include the seven publication/ordering cases, direct teardown reproduction, twelve save-race cases and a permanent **500-case four-state multi-driver DAG oracle** checking every probe and conflict diagnostic. Each confirmed defect was reproduced before its fix. Browser regressions retain strict output/file/history assertions; no clicks are forced and no failure state is presented as a valid measurement.

## Current results

| Layer | Executed evidence |
| --- | --- |
| Core/adapter/property | **237 tests, 37 files pass**; strict TypeScript passes. |
| Full browser matrix | **310 passed, 17 intentional skips**, about one minute; [log](browser-regression.txt). Desktop, tablet and phone Chromium projects include native-event and delayed-observer startup regressions. |
| Focused UI | **21 passed**, including all four docks and wide/narrow/short transitions; [log](focused-browser.txt). |
| Desktop Obsidian | Shared inputs/results, hidden-tab pause/resume, pop-out migration/cleanup, preview non-execution and disable/re-enable pass on **1.14.4**; [report](desktop-host.json). |
| File-failure integration | External replacement, malformed future-file protection, explicit Keep local, in-flight Stop/restart and deletion without recreation pass; [report](file-failures.json). The large stress fixture is loaded while stopped because a raw non-atomic OS write can legitimately expose partial JSON and stop simulation. |
| Physical Android tablet | **Samsung SM-T733, Android 14, Obsidian 1.15.0**: exhaustive half-adder, live input, Stop/Reset/X, unchanged bytes, native Home/pause/resume, last-consumer release and fresh reopen pass; [final report](android-tablet.json). |
| Physical Android phone | **Pixel 7 Pro, Android 17, Obsidian 1.15.1**: same checks pass; [final report](android-phone.json). |
| Runtime resources | Repeated acquisition/run/release and bounded stress workloads pass; [heap report](memory-browser.json). Earlier workload-specific desktop measurements remain dated evidence, not universal latency/peak guarantees. |
| Packaging | Build, artifact audit, official lint, three-asset install smoke, package generation, ZIP CRC and byte identity checks pass. Manifest metadata remains 0.1.11; this is an unreleased development build, not the published artifact. |

The final phone and tablet reports contain matching candidate asset hashes and source identities. Actual-host and memory reports may precede harness-only capture changes; their tested core sources are identified in their own reports. [Current candidate identity](final-checks.json).

## Device execution and captures

The devices were USB-authorized by the owner. Testing used new **LEC Simulation Test** vaults in app storage. Candidate assets were checked against the local files before running; no helper APK was installed. The script writes uniquely named test drawings, checks bytes before and after runtime/lifecycle/camera operations, and leaves test data available for inspection. Normal vaults were not used for test fixtures.

Controls were exercised through the real Obsidian Android WebView via CDP; backgrounding/resume used Android Home and the actual Activity. This proves those executed app/runtime paths, not every physical-finger, accessibility, gesture, rotation, OS-process-kill or device-size combination. The final screenshots are real captures: [tablet](sm-t733-simulation.png), [phone](pixel-7-pro-simulation.png).

The phone's element-capture helper initially timed out on a full-height fractional viewport boundary. Measured editor bounds were stable and animation frames were running. A viewport-bounded page capture avoided that tooling issue without removing any behavior/file assertion. The earlier tablet-before-startup-fix report/capture is retained as a baseline; the final tablet run reinstalled and verified the same candidate as the phone.

For reproduction, prepare an empty app-storage vault named `LEC Simulation Test`, install the candidate there, and authorize the device through a dedicated ADB server. Then run:

```sh
LEC_ANDROID_SERIAL=YOUR_DEVICE_SERIAL LEC_ADB_PORT=5039 \
  LEC_ANDROID_OUTPUT=docs/evidence/simulation-hardening \
  node scripts/check-simulation-android.mjs
node scripts/check-simulation-failures.mjs
node scripts/check-simulation-host.mjs
```

Android platform-tools 37.0.1 were obtained from Google's SDK download and kept in `/tmp`; device serials are not stored in these reports. A cable-switch discovery miss was resolved by refreshing only the dedicated test server after verifying the tablet's USB ADB interface. This was a connection-tool issue, not an application result.

## Review scope and remaining limits

Three bounded, isolated dual-review rounds were used. The initial pair found no defect; separate publication regressions still exposed gaps. Later reviewers reproduced deletion and direct-runtime teardown bugs, which were fixed with regression tests. The last round had one PASS and one reproduced teardown FAIL before its correction. **No fresh final dual-PASS gate is claimed** for subsequent corrections/native UI changes; release review remains outstanding. Reviews and green suites are evidence, not a proof that no bugs exist.

WebKit installation was attempted with a bounded download and failed; [installer log](webkit-install.txt). Actual iOS, other desktop OS/host versions, broader mobile input/device/lifecycle coverage and production release/CI checks remain unverified. No commit, push, release or public simulation availability claim was made. The literal goal of universal absence of bugs has not been proven.

## Completion clarification

The owner-approved criterion closes this hardening task; it does not assert universal absence of bugs or close the whole roadmap. A follow-up system-client download obtained the official WebKit archive, but the focused runner failed before application execution on a shared-library extraction error. No WebKit/iOS application test is counted as passed. The incomplete temporary install marker was removed; further browser/iOS setup is separate qualification work. No application source changed during this final clarification.
