# Electrical analysis: in-house modified nodal analysis

Date: 2026-11-19. Status: adopted for the local unreleased simulation studio, at the owner's explicit request ("implement electrical analysis"). Release qualification remains open.

## Decision

Implement an original, dependency-free TypeScript analog engine (`src/core/analog/`) beside the digital engine, inside the existing single browser-safe bundle. No worker, WebAssembly, network or persisted simulation field is introduced; results stay ephemeral.

- **Formulation:** modified nodal analysis. Unknowns are node voltages plus branch currents for voltage sources, inductors, ammeters, controlled sources and op-amp outputs. A dense LU solve with partial pivoting suits the bounded size (operating point ≤ 200 unknowns, transient ≤ 120).
- **Nonlinear devices:** Newton–Raphson with SPICE-style `pnjlim` junction limiting, an exponential with linear continuation above 40·nV_T, and gmin conductance on every node. When direct Newton fails, gmin stepping (10⁻² → 10⁻¹² S) and then source stepping run before reporting non-convergence.
- **Transient:** backward Euler companion models from a power-on state. A tiny first step makes capacitors act as 0 V and inductors as 0 A at t = 0. Steps are 200–2,000, chosen from a work budget, with up to 8 sub-steps on a failed step. Every 25 steps yields to the host scheduler and honors cancellation.
- **Models:** an explicit allowlist of canonical library definitions (`src/components/definitions/analog.ts`), matched by complete definition signature exactly like digital capabilities. Unlike digital, the component's Value property is the electrical parameter, parsed in engineering notation. Models are listed in [simulation.md](../simulation.md).
- **Engine selection:** any electrical model selects analog analysis. A circuit containing both logic and electrical parts fails with a mixed-signal diagnostic instead of guessing at an interface.
- **Errors are explicit:** missing ground (with sources), unmodeled parts, missing or wrong-unit values, shorted or disagreeing supply rails and non-convergence each return a diagnostic with Inspect targets and no partial readings.

## Alternatives considered

ngspice compiled to WebAssembly would add a large binary asset, licensing review and worker/CSP questions that conflict with the three-asset package. Existing JavaScript simulators (for example the Falstad-derived codebases) are GPL or entangled with their UI. A focused MNA core covering student circuits is auditable with hand-calculated fixtures and fits the bundle.

## Consequences

The engine is verified against analytic answers: dividers and Ohm's law, meters, diode, LED and Zener drops, a BJT bias point (I_C ≈ β·I_B), linear and clipping op-amp stages, RC and RL step responses, AC amplitude, and the error paths (`tests/unit/analog.test.ts`). Models are idealized teaching models, not vendor SPICE models. The op-amp has no supply current, bandwidth or slew limit. MOSFET bodies, the potentiometer wiper position, transformers and AC small-signal (frequency-response) analysis are not modeled. These are candidates for the roadmap's A2 milestone. Accuracy limits are those of backward Euler at the chosen step count. Physical Android and iOS performance has not been measured for the analog engine.
