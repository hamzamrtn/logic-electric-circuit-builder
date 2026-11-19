# D0 digital simulation experiment — 2026-11-13

This is the dated feasibility baseline. The [later initial-workflow implementation record](../digital-simulation/validation.md) supersedes its integration status; the results and hashes below describe the earlier snapshot.

Status: **working prototype; desktop feasibility demonstrated; full D0 and D1 remain open**. Changed and verified locally on `main`, based on `35c781fdf96a8ac4c6a239e5ab83b1f698aefc90`. Not committed, pushed or published. The pre-existing `docs/release.md` changes and `release-0.1.11.md` evidence were preserved.

Production remains the 0.1.11 schematic editor. The new modules are absent from its bundle, confirmed against `build-meta.json`. There is no production simulation UI, file migration, dependency addition, worker or runtime download. [ADR 002](../../adr/002-digital-feasibility.md) records the evaluator/source comparison, semantics and integration boundaries.

## Implemented and checked

- Explicit canonical definition/model registry for Logic input, Output probe, two-input AND/OR/XOR and NOT. Modified/unsupported definitions reject the whole run. Display references and geometry never select behavior.
- Four-state `0/1/X/Z` evaluation through the existing explicit net graph; high-impedance resolution, unknown inputs, floating probes and conflict diagnostics.
- Deterministic acyclic evaluation, conservative feedback rejection, size/lane/work limits, host-injected task yields and cancellation with no partial results.
- Session/revision/run identities and per-component model versions. Stop, a newer run, edits, undo, external replacement and disposal invalidate pending work. Wrong identities and executor errors fail safely.
- Literal exhaustive gate/driver tables, independent arithmetic half-adder and gate-built mux fixtures, explicit junction/named-net/width checks, geometry/order independence, dense dependency budget exhaustion, cancellation/retry, and 100 seeded generated networks compared with a separate Boolean oracle.
- Exact document/snapshot/history preservation during run/toggle/stop. The development probe subsequently performs a deliberate title edit/undo to check invalidation and confirms restored serialized content; that deliberate edit is distinct from the unchanged-run-history assertion.

## Verification

| Command/check | Current result |
| --- | --- |
| `npx vitest run tests/unit/digital.test.ts` | 18 tests pass, including exhaustive tables and 100 generated networks. |
| `npm run check` | 208 tests in 32 files, strict TypeScript, production build and artifact audit pass. |
| `npm run lint` | Runtime boundaries and official Obsidian rules pass, zero warnings. Timers are injected by the owning host window; no lint-rule suppression. The existing checker bootstrapped its pinned separate toolchain in `/tmp`. |
| `npm run check:install` | Three-asset public-host-stub smoke passes: seven commands, one view. |
| `npm run preview:build` | Pass; existing browser editor harness built. |
| `node scripts/check-digital-d0.mjs` | Pass: desktop Chromium and phone browser emulation; no page errors. |
| `node scripts/check-digital-d0.mjs --host` | Pass: actual installed Obsidian 1.14.4, isolated headless temporary profile/vault, native editor mounted, two views share the real document session, save coordinator content matches the restored fixture; no page errors. |
| Production metadata | No experimental digital modules are inputs to `main.js`; only `obsidian` remains external. Manifest/schema/dependencies unchanged. |

Browser and actual-host commands require a runnable browser outside this environment's execution sandbox; sandbox launch failed before testing. The host probe's first attempt mounted an editor without a usable headless viewport; explicitly setting viewport/CDP device metrics resolved that harness issue. No production layout change was made.

The broad existing editor E2E matrix was not rerun: this pass adds no production UI/runtime imports. Current focused engine/host measurements are recorded here; older browser counts are not being presented as fresh results.

## Measured reference workloads

Reference machine: AMD Ryzen AI 7 350, 16 logical CPUs, approximately 30.1 GiB RAM, Linux. Browser: Chromium 153.0.8010.12. The phone run uses desktop hardware and emulates a 390×844 touch viewport; it does not measure phone CPU or actual Obsidian mobile. Each environment ran 20 half-adder cases, ten 128-inverter-chain runs and one cancellation during a 250-inverter run. P95 uses the nearest-rank sample, including compilation. With ten samples the chain p95 is the slowest observed sample; this is a small feasibility benchmark, not a statistical platform certification.

| Environment | Half-adder p95 | 128-gate p95 | Largest timer-heartbeat gap | Cancel acknowledgement |
| --- | --- | --- | --- | --- |
| Desktop Chromium | 4.3 ms | 31.0 ms | 4.5 ms | 1.3 ms |
| Phone Chromium emulation | 4.4 ms | 31.7 ms | 5.1 ms | 1.7 ms |
| Actual Obsidian 1.14.4 desktop | 6.1 ms | 30.9 ms | 6.4 ms | 2.1 ms |

All satisfy the experiment's `<100 ms` response/heartbeat and `<250 ms` cancellation gates. Cancellation measures from the abort callback to the result returning; heartbeat gaps separately observe event-loop responsiveness. These do not establish hard real-time guarantees, worst-case latency or responsiveness for every circuit inside the size envelope.

An initial 32-work-unit slice missed the 128-gate response gate at 104.7 ms while cancellation remained responsive. Increasing the bounded slice to 128 units reduced timer overhead and passed the same budgets. The [retained failing baseline](browser-before-slice-adjustment.json) records the earlier measurements without final source hashes; it predates the subsequent contract/lint changes. Final [browser results](browser.json) and [actual-host results](obsidian-desktop.json) include matching SHA-256 hashes of the engine, runtime, registry, fixtures, tests, development probe and probe script.

## Reproduction and qualification gates

Run `npm run check`, `npm run lint`, `npm run check:install` and `npm run preview:build`, then the two probe commands above. `--host` uses `/opt/Obsidian/obsidian` or `LEC_OBSIDIAN_BIN`. All fixture files, plugin installation, recovery writes and host settings belong to new `/tmp/lec-digital-d0-*` directories. The probe is built in memory and injected through DevTools, operating on the real host's DocumentSession; it is not a shipped command. Results print their temporary JSON path.

Before production integration/release:

1. Execute the same feasibility probe on actual Android/iOS Obsidian and record engine scheduling/cancellation under device lifecycle and host restrictions. No device or engineering-operated mobile host was available in this session. Keep D0 open rather than claiming those platforms passed.
2. Measure retained/peak memory and adversarial envelope workloads on reference devices. Current size/work/output caps prevent unbounded growth but are not measured memory guarantees. Worker transport was considered as an alternative, not exercised or adopted.
3. Implement automatic shared runtime acquisition/release, visibility/suspension and pop-out ownership. The prototype requires its caller to share/dispose one owner. The two-view host check proves shared document identity, not complete runtime-consumer lifecycle coverage.
4. Settle production model/configuration persistence and version compatibility before storing any simulation data. Current model/inputs are ephemeral; schema version 1 remains unchanged. Legacy/custom definition matching needs deliberate capability entries.
5. Deliver D1's visible Run/Stop/Reset, input/probe controls, editing-state transitions, error recovery, keyboard/touch/accessibility, native-host layouts and complete workflow qualification. Clocks/state, bus devices, tri-state models and analog analysis remain outside this experiment.

Engineering owns these remaining gates; this record does not delegate routine qualification to the owner or authorize publication.

## Brief ECC self-review

| Axis | Score | Evidence and remaining improvement |
| --- | --- | --- |
| Accuracy | 4/5 | Independent oracles, 208 passing tests and actual desktop results support the bounded claims; native mobile and memory are unmeasured. |
| Completeness | 4/5 | The scoped engine/runtime/probe/decision are reviewable; the full roadmap milestone stays open at the explicit qualification gates above. |
| Clarity | 4/5 | Roadmap and architecture distinguish source prototype from production; the engineering API still needs D1 user-facing presentation. |
| Actionability | 4/5 | Repeatable commands and source hashes identify the result; mobile execution needs an engineering-operated environment. |
| Conciseness | 4/5 | A small model set and unchanged production integration bound the work; the evidence intentionally retains the failed benchmark and qualification details. |

Overall: 4.0/5. Highest-impact follow-ups are actual mobile/memory feasibility, shared consumer ownership, then the complete D1 interface. This assessment should match what the owner can inspect: a tested prototype, with no claim that live simulation has shipped.
