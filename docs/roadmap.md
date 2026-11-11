# Capability roadmap and engineering delivery contract

**Logic-Electric Circuit Builder** · Planning baseline: 2026-11-11

**Status:** proposed future capabilities, not an implementation-completion record or authorization to publish. The owner requested this roadmap. Implementing a milestone remains a separate scoped task. [Product goals](product-goals.md) and the [UI contract](ui-contract.md) remain the standing product requirements.

## 1. Capability and product outcome

Develop the existing offline schematic editor into a dependable environment for designing, understanding, reusing and documenting electrical and digital circuits inside Obsidian. The next major capability should let someone build a supported logic circuit, run it, change inputs and inspect correct outputs on desktop, tablet and phone. Subsequent milestones add sequential behavior, reusable subcircuits, analog analysis and repeatable experiments.

Power and approachability must advance together. Each milestone must deliver a complete workflow with clear entry, feedback, cancellation, correction and recovery. A new control, animated wire or additional symbol does not by itself constitute a working simulator.

### Current baseline

- The editor already supports explicit connections, stable pins, named nets and buses, connected transformations, history, custom drawing blocks, reusable snippets, note previews and SVG/PNG export.
- Simulation is **not implemented**. [SimulationAdapter](../src/core/topology/simulation.ts) is an initial asynchronous analysis boundary, not an engine. Its scalar measurements and single analysis call are insufficient for a complete timed, vector-valued simulation API.
- Current custom blocks describe symbols and ports; they are not automatically executable subcircuits or behavioral models.
- The worktree currently contains local 0.1.11 feedback/release-review work. Its implementation and qualification status belong in [the dated validation record](evidence/feedback-scorecard/validation.md), not in this roadmap. Do not discard or implicitly publish it while starting future work.
- Current production packaging has one browser-safe bundle, three install assets and no workers, native helpers or runtime asset downloads. Background execution or a WebAssembly engine would require an explicit architecture and packaging decision.

## 2. Constraints and invariants

| Area | Required contract |
| --- | --- |
| Connectivity | Derive simulation from explicit graph anchors and validated net/lane semantics. Proximity, wire crossings and drawing colors never establish a connection. |
| Identity | Keep component, pin, node and instance identities stable through editing. Display references and labels do not identify devices or select their behavior. |
| Data integrity | Preserve existing files, embedded definitions, atomic commands, undo/redo and conflict recovery. Simulation must not bypass model validation or the serialized save coordinator. |
| Runtime separation | Running, pausing, probing, clock ticks and temporary input toggles must not rewrite the circuit or create undo entries. Persisted model/default changes are explicit, validated edits. |
| Truthful results | Clearly distinguish valid results, unknown states, high impedance, stale results and execution failures. Never substitute plausible values for unsupported models or failed computations. |
| Platforms | Essential workflows work without hover, precision dragging, hardware keyboards, desktop-only APIs or a required external installation. Offline use remains a product requirement. |
| Interface | Preserve the schematic as the main surface. Reveal simulation and analysis controls when requested; keep typing, canvas navigation, dock targets and host chrome independent. |
| Accessibility | Provide keyboard and simple click/tap alternatives, meaningful names, focus restoration and non-color-only state indicators. Honor Reduce Motion. |
| Resource limits | Bound compilation, event processing, trace retention and result delivery. Cancellation and failure leave editing, exports and saved data usable. |

Strict schema validation, unjoined crossings, per-lane buses, case-sensitive net names and value-prefix interpretation remain governed by [the format contract](format.md). Do not hide unvalidated executable models in generic metadata to avoid a schema migration.

## 3. Recommended sequence and dependencies

These are milestone boundaries, not calendar estimates. Close one capability's acceptance gates before expanding it.

| Milestone | User-visible result | Dependency and completion boundary |
| --- | --- | --- |
| M0 — qualification foundation | Existing editing is dependable across the supported host layouts and input methods. | Establish repeatable host/device evidence, benchmark fixtures and regression gates. Resolve critical persistence/input defects first. |
| D0 — simulation feasibility | Engineering can demonstrate a bounded, deterministic engine integrated with the real host. | Resolve execution transport, model representation, packaging and result lifecycle before building a broad simulation UI. |
| D1 — combinational digital simulation | Run a supported gate circuit, toggle inputs and inspect correct outputs. | M0 and D0. Complete the small model set, lifecycle, diagnostics and end-to-end workflow. |
| D2 — sequential logic and timing | Use clocks and stateful components with pause, step and timing traces. | D1. Define initialization, event order, delays and clock semantics before adding devices. |
| H1 — hierarchical subcircuits | Turn working circuits into reusable blocks and inspect their internals. | Stable ports and model contracts. Build before promising simulation of user-created composite blocks. |
| L1 — personal circuit library | Find and reuse saved parts, configured devices and circuit sections. | Can follow the existing snippet foundation independently; behavioral entries depend on H1/model versioning. |
| A0/A1 — analog feasibility and DC | Solve a documented supported electrical subset and inspect voltages/currents. | Engine, model, licensing, numeric and mobile feasibility gates; separate from digital completion. |
| A2 — transient and AC analysis | Inspect time-domain waveforms and frequency response. | Validated A1 engine/model integration and bounded measurement infrastructure. |
| E1 — experiments and documentation | Repeat an analysis and attach understandable results to notes. | Build digital truth tables/traces after D1/D2; add analog plots/sweeps only after their analyses are qualified. |

M0 continues throughout the roadmap. Analog feasibility research may run separately, but it must not continually interrupt delivery of the first complete digital workflow.

## 4. Implementation contract

### 4.1 M0: engineering-owned qualification

The owner should not be the default regression tester. Engineering must reproduce reports, add meaningful automated coverage, inspect the actual changed UI and run appropriate release checks before handoff. User feedback supplements this process.

Build and maintain three distinct evidence layers:

1. **Core verification:** independent expected outcomes, property tests, migrations, topology preservation, save/conflict failures and exact undo.
2. **Browser integration:** desktop, tablet, phone, narrow splits, orientation/keyboard-sized panes, both themes, keyboard/touch input and reduced motion. Include native host CSS and overlapping host chrome in relevant fixtures.
3. **Actual Obsidian:** controlled test vaults and isolated profiles, enable/disable/reload, real file lifecycle, previews, pop-outs, phone gestures, soft keyboards, Sync conflicts and recovery. Automate real-host interactions where supported, and retain device/host versions and evidence.

Browser emulation is not actual Android/iOS Obsidian qualification. If hardware or host automation is unavailable, record the specific missing coverage and arrange engineering-operated testing; do not silently assign it to the owner or label it passed. A milestone cannot claim platform coverage that was not executed.

Use existing large-drawing fixtures as the editing baseline. Add supported simulation workloads separately; symbol count alone does not describe engine cost. Before D1 implementation, record reference hardware, repeatable workloads, cancellation behavior, memory limits and measurable responsiveness budgets. Proposed initial interaction targets are p95 response within 100 ms and cancellation acknowledgment within 250 ms on the agreed reference workloads; validate their feasibility in D0 rather than presenting them as current performance claims.

**Exit gate:** reproducible baseline, no unexplained failures in required checks, regression fixtures for reported defects and a documented qualification matrix. A zero-bug guarantee is not a substitute for this evidence.

### 4.2 D0: runtime and model feasibility

Prove a small vertical slice before committing to an engine or a large UI. Compare suitable existing implementations with a narrowly scoped original digital evaluator. Select through recorded correctness, determinism, cancellation, resource, dependency and packaging evidence.

Evaluate background execution and bounded cooperative execution against actual Obsidian desktop/mobile constraints. The current no-worker/no-extra-asset package is a real boundary: record an ADR and update build, install, artifact and release contracts before changing it. Do not assume worker URLs, blob execution, WebAssembly loading or a desktop executable will work on every target.

Create an explicit capability registry: supported device/model versions, pin mappings, parameter types, signal widths and permitted analyses. A symbol's name, appearance or reference must never imply an implemented model. Ordinary unsupported electrical devices in a requested digital run must produce an actionable preflight result; do not partially simulate a circuit as though the omitted devices did not exist. Drawing-only annotations can be excluded explicitly.

**Exit gate:** one representative circuit executes through the proposed boundary inside the target host, with deterministic outputs, bounded execution and successful cancel/error recovery. Resolve the architecture and compatibility decisions in section 7 before D1.

### 4.3 Shared simulation lifecycle and interfaces

The concrete TypeScript API is a D0 deliverable. It must support these semantics, rather than merely copying the current placeholder interface:

| Contract | Required information/behavior |
| --- | --- |
| Run request | Session identity, document revision, unique run ID, validated document/net snapshot, engine/model versions, analysis settings and deterministic initial conditions. |
| Compiled model | Stable mapping back to components, pins, nets, bus lanes and hierarchical instance paths; explicit support and validation diagnostics. |
| Result batch | Matching run/revision/model identities, simulation time or event index, typed scalar/vector values with units where applicable, and bounded measurements/diagnostics. |
| Cancellation | An abort request plus a run-ID guard on every result, progress event and completion path. A late result cannot change a newer run or edited document. |
| Limits and errors | Explicit size/event/time/memory/trace limits. Exceeding a limit terminates or pauses with a clear diagnostic, never a fabricated successful result. |

Required states are **stopped → validating/compiling → running ↔ paused → stopped/completed/error**. Invalid or unsupported inputs return to an editable state with clear diagnostics. Reset returns runtime inputs/state/time to the declared initial conditions; it does not clear the drawing or undo history. Define Step precisely for each analysis: a digital event/time step is not an analog solver iteration.

Initial policy: any document edit or external document replacement stops the active run and marks results stale. Results may remain inspectable with that label, but must not look current. Optimize presentation-only edits later only if a tested semantic fingerprint makes reuse safe.

Use one runtime owner per document session so two editor views do not operate conflicting copies. Share runtime inputs/results between those views, while keeping viewport and selection local. Reading previews do not automatically start an engine. Stop the runtime when its last simulation consumer closes. Pause when no relevant editor is visible; resuming must not silently replay a large wall-clock backlog. App suspension and force-kill behavior need actual-host evidence.

A simulation failure must not disable ordinary drawing or saving. Runtime traces are ephemeral by default. Saving model parameters, initial conditions or reusable experiments is a separate, validated operation with explicit persistence rules.

### 4.4 D1: complete combinational digital simulation

Start with a deliberately small set: logic input, logic output/probe and supported AND/OR/NOT/XOR gates. Add other gates only with defined semantics and tests. Wire/network support must preserve existing junction, crossing, bus-lane and named-net behavior.

Define per-bit `0`, `1`, `X` (unknown) and `Z` (high impedance) values. Specify how each supported model consumes them, and how multiple drivers resolve. Conflicting driven values produce an unknown/conflict diagnostic; unknown inputs are not silently coerced to zero. Introduce tri-state devices and bus models only with their complete resolution/width contracts.

The first release supports the advertised combinational subset. Combinational feedback that fails the chosen stable-evaluation policy is reported, not allowed to spin indefinitely. Deliberately modeled stateful devices arrive in D2.

Provide Run, Stop and Reset, runtime input controls and a readable probe/output surface. Distinguish stopped, stale, unsupported and valid results using labels as well as restrained color. Keep source edits separate from temporary input toggles. Entering simulation must preserve the current drawing, selection and recoverable unfinished editing state; define how that state resumes or is explicitly canceled before implementation.

**Acceptance:** exhaustively verify the supported gates' truth tables and unknown-state rules; run independent half-adder and gate-built multiplexer fixtures; exercise driver conflicts, unjoined crossings, bus-width rejection, unsupported devices, feedback limits, stop/restart, cancellation and late results. Repeat a complete build → run → toggle → inspect → edit → rerun workflow in wide and compact layouts. Opening, running and stopping must leave the serialized drawing unchanged.

### 4.5 D2: clocks, state and timing

Add a deterministic virtual-time event scheduler, then documented clock, flip-flop/register and counter models. Specify reset priority, initial state, edge detection, same-time event ordering and propagation-delay policy. Define Step and Pause behavior before exposing them in the UI. Zero-delay loops and oscillators require bounded handling and clear errors.

Add bounded timing traces with labeled signals, zoomable time ranges and exact values. Generated truth tables apply to a declared combinational input/output set; sequential circuits need initial state and input sequences, not a misleading state-independent truth table. Timestamp/order results deterministically and cap exhaustive enumeration before large input counts freeze the device.

**Acceptance:** reference sequences for a D flip-flop, register and counter; clock/reset races; deterministic replay; paused input changes; event-limit exhaustion; suspension/resume; and trace truncation that is explicit to the user. Runtime scheduling and graph results remain identical across equivalent rendering layouts.

### 4.6 H1 and L1: reuse with explicit boundaries

**Hierarchical subcircuits:** convert a selection into a reusable definition with stable named ports, inspect its internal circuit and preserve its external connections. Define document-local internal nets, public/global net policy, instance paths and recursion limits. Reject recursive expansion that cannot be compiled within limits. Model and definition versions must be recorded so updating a reusable block never silently changes existing drawings.

Support visual-only blocks explicitly. A block becomes simulatable only when it has a validated behavioral model or a supported internal circuit. Flattening must retain instance identity so diagnostics and probes can point back to the correct internal object. Acceptance compares the original and encapsulated circuits for boundary connectivity and simulated outputs, including multiple instances with identical internal labels, copy/paste, file round trips and undo.

**Personal library:** build on snippets and embedded definitions to provide saved circuit sections, configured parts, favorites and useful recent items. Distinguish a linked library source from the version embedded in a drawing. Missing or changed library files must not invalidate existing circuits. Import/update operations need preview, conflict handling, cancellation and undo. Untrusted library content never becomes executable application code.

Do not require hierarchy before shipping the first digital gate workflow. Require it before promising simulation of arbitrary user-created composite blocks.

### 4.7 A0/A1: analog feasibility and DC

Evaluate an established solver such as ngspice as a candidate, not an already selected dependency. Its documented analysis capabilities are relevant, but do not establish that a particular browser/mobile integration is suitable. Test offline delivery, license/notice obligations, bundle size, model coverage, numeric behavior, cancellation, memory and host restrictions before selection.

Begin with ideal resistors, independent DC sources, ground and measurements. Define reference-node requirements, units, sign conventions and parameter validation. Expand to nonlinear devices only with supported, documented models. LEDs, op-amps, timers and custom IC symbols are not simulation-ready by virtue of being drawable.

Treat netlists and imported models as untrusted data. Use validated structured model inputs and controlled netlist generation. Do not permit arbitrary control scripts, shell access, automatic external downloads or unrestricted includes. Preserve current case-sensitive prefixes such as `m` versus `M`; require model-appropriate units and finite numeric values. Report floating/singular networks, invalid models and convergence failures without displaying them as valid measurements.

**Acceptance:** compare against analytical series/parallel networks and voltage/current dividers, including a 10 V source with two equal 1 kΩ resistors yielding a 5 V midpoint under the stated ideal assumptions. Compare nonlinear fixtures with an independently configured reference solver/model set. Declare absolute/relative tolerances per fixture before validation; do not rely only on comparing an integration with itself.

### 4.8 A2 and E1: waveforms, analyses and repeatable experiments

Add capacitor/inductor models, controlled initial conditions and transient analysis after DC is qualified. Follow with AC small-signal frequency response. Define supported ranges, sampling, integration/time-step behavior and error handling; distinguish an output sampling interval from an internal solver step.

Validate ideal RC step behavior against `V(t) = Vstep × (1 − exp(−t/RC))` for the declared zero initial voltage, and low-pass cutoff against `fc = 1/(2πRC)`. These checks need explicit component models, tolerances and time/frequency settings. Solver non-convergence, invalid configurations and truncated traces must remain visible.

Add probes, readable plots and bounded parameter sweeps as analysis capabilities mature. Every saved experiment/result needs the source circuit revision or snapshot identity, model/engine versions, settings, units and initial conditions. A later edit cannot silently relabel old results as current. Export plots/tables with that provenance and a useful static fallback in notes; viewing a note must not unexpectedly launch a costly simulation or rewrite a circuit.

## 5. Definition of done and autonomous verification

Engineering owns this checklist for each milestone. The owner should receive a concrete, reviewable result with evidence, rather than a feature whose basic correctness they must discover manually.

- [ ] Define the supported scope, states, failure behavior and acceptance fixtures before implementation.
- [ ] Build the first working vertical slice and inspect wide/narrow views, native host styles/chrome and transitions back to normal editing before polishing variants.
- [ ] Verify correct outputs with independent oracles, round-trip/migration tests, topology/history invariants and targeted property tests.
- [ ] Cover the entire user workflow, including cancel, retry, unsupported input, stale completion, external edits, multiple views and close/reopen.
- [ ] Measure responsiveness and resource limits using recorded reference workloads; prove cancellation under load.
- [ ] Run required source, artifact, install and browser checks after behavior settles. Preserve meaningful regression coverage; do not force clicks through controls or weaken assertions to obtain green results.
- [ ] Run the applicable actual-host/device scenarios through engineering-operated automation or testing. Record unavailable coverage honestly and restrict release claims accordingly.
- [ ] Check both themes, touch targets, keyboard/click alternatives, focus, text entry, reduced motion and unobstructed controls at every advertised layout/dock position.
- [ ] Update documentation and relevant captures once the interface settles. Keep product claims within demonstrated model/analysis support.
- [ ] Verify the exact tagged package, required install assets and current release-review results. Publication requires authorization; this roadmap grants none.

Retain dated evidence identifying the tested source revision, environment, fixtures, expected outcomes, failures and remaining limits. Test counts alone do not prove correctness. No universal zero-defect or force-kill-durability claim may replace tested guarantees and an explicit recovery boundary.

## 6. Non-goals for the initial simulation milestone

D1 does not include analog or mixed-signal solving, arbitrary IC support, HDL synthesis, PCB layout/manufacturing, unrestricted code execution, cloud-required computation or an entire instrumentation suite. Do not rename structural checks as simulation or add animated signals before a correct engine backs them. Existing drafting remains available for unsupported devices and ordinary non-simulation documents.

## 7. Decisions required before implementation

These are engineering investigations, not reasons to ask the owner to repeat established product goals.

| Decision | Evidence needed | Required before |
| --- | --- | --- |
| Digital evaluator and scheduling policy | Capability/maintenance comparison, deterministic reference fixtures, cycle handling and licensing review. | D1 |
| Execution transport and packaging | Desktop/Android/iOS host experiment, CSP/loading behavior, cancellation, payload/memory measurements and revised artifact checks where needed. | D1; repeat for analog |
| Model/configuration persistence | Schema proposal, identity/version rules, migration fixtures, safe old/future-file behavior and undo boundaries. | Persisting any new model data |
| Shared runtime ownership | Multi-view, preview, close/unload and suspension scenarios with no conflicting or orphaned runs. | D1 |
| Numeric/trace and performance limits | Recorded reference devices/workloads, justified budgets and fail-safe limit behavior. | Advertising supported simulation sizes |
| Hierarchy semantics | Port identity, internal/global net scope, version/update policy and flattening-equivalence fixtures. | H1 |
| Analog engine and model distribution | Solver/model comparison, offline/mobile prototype, dependency/notice review and independently checked numeric fixtures. | A1 |

Use [ADRs](adr/001-foundation.md) to record architecture decisions once evidence supports a choice. Preserve existing architecture until its replacement is explicitly adopted.

## 8. Handoff

**Ready for direct scoped work:** M0 evidence/automation inventory and a bounded D0 feasibility task. Produce the benchmark/qualification baseline, compare execution approaches, prove one gate circuit and record the architecture recommendation.

**Needs architecture review before broad implementation:** the runtime API, model/persistence schema and any worker/WebAssembly/package changes. Then deliver D1 as one complete supported workflow. No further clarification of the owner's intuitive/powerful/clean-interface goals is needed.

Do not start every workstream at once, promise dates without measured scope or turn unresolved engine choices into a large speculative implementation. Finish each verified milestone, record actual status and stop before unrelated expansion.

## References and current contracts

- [Product goals](product-goals.md), [UI contract](ui-contract.md), [architecture](architecture.md), [file format](format.md) and [validation](validation.md).
- [ngspice documentation](https://ngspice.sourceforge.io/docs.html): reference for established electrical analysis and model concepts, not evidence of a selected integration.
- [Digital project](https://github.com/hneemann/Digital): feature/reference examples; its engine is not selected or incorporated into this MIT plugin.
- [W3C guidance on dragging alternatives](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html): click/tap alternatives and keyboard access address different input requirements.
