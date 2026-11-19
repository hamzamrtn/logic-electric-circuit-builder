# Simulation studio

Version 1.0.0 (prepared, not yet published) turns the editor into a two-mode studio: **Build** for drawing and **Simulate** for analysis. The published 0.1.11 release predates this workflow. Simulate analyzes logic circuits with a four-state digital engine and electrical circuits with a SPICE-style analog engine. Evidence and qualification limits: [live UI record](evidence/simulation-live-ui/validation.md).

## Workspace

Choose **Simulate** in the top bar's Build | Simulate switch (compact panes show a wave icon; the narrowest panes use More → Simulate circuit). Simulate replaces the drawing tools with a run strip and docks an analysis panel below the schematic:

- **Run strip:** status (Live, Paused, Needs attention), Run/Pause and Reset; for electrical circuits also Probe, the transient Window and Values. Wide panes place it in the top bar where the drawing tools were; compact panes give it its own row.
- **Analysis panel:** resizable by its top edge and hidden with the panel button. Logic circuits show Signals and Truth table; electrical circuits show Scope, Operating point and Messages.
- **Schematic:** drags pan and taps act, so parts never move by accident. Undo/redo, the inspector and menus stay available, and committed edits re-evaluate automatically. Editing tools return in Build.

The engine is chosen from the parts: any electrical model selects electrical analysis. A circuit that mixes logic parts with electrical parts reports a clear error naming the logic parts; mixed-signal simulation is not available yet.

## Electrical analysis

Add parts from Add → Electrical, give them values, wire them and place a **Ground** for the 0 V reference. Simulate solves immediately.

- **Schematic overlay:** wires are tinted by node voltage (warm positive, cool negative, ink at 0 V) and each net carries a compact voltage tag (toggle with Values). Closed switches show a bridging contact.
- **Hover readouts:** pointing at a wire shows its net voltage (and the current, when the net joins exactly two terminals); pointing at a part shows its voltage, current, power and state, or V_BE/V_CE/I_B/I_C for transistors, V_GS/V_DS/I_D for MOSFETs and V_out/differential input/I_out for op-amps. With an AC source, readouts add RMS and peak values. On touch screens, a tap pins the readout.
- **Switches:** tapping an SPST/SPDT switch or push button toggles it. Positions are temporary runtime state; Reset restores the drawn defaults.
- **Scope:** a power-on transient (capacitors start discharged, inductors at 0 A, sources switch on at t = 0). The Window chooses the duration: Auto uses five periods of the slowest AC source, otherwise five of the slowest RC/RL time constants, rounded to a 1–2–5 step. Voltage and current traces get separate stacked panels on one time axis. Hover for a crosshair readout; click to place cursors A and B for values, Δ and Δt with 1/Δt. The measurement table lists min, max, peak-to-peak, average, RMS and frequency per trace. Without probes, the scope plots voltmeters, scope probes and ammeters, or else capacitor voltages and inductor currents.
- **Probe:** choose Probe, then click a wire to plot its net voltage or a part to plot its current (voltage for capacitors, voltmeters and scope probes). Up to 8 traces; colours follow a validated colour-blind-safe order. Remove a trace with its ×, or use Clear probes.
- **Operating point:** node voltages and a per-part table of voltage, current, power and state, with total supplied power and the Newton iteration count. Part names open the inspector.
- **Messages:** errors, warnings (an over-rated fuse, an LED above about 30 mA, a meter with both leads on one net) and notes (default values), each with Inspect.

### Electrical models

Values use engineering notation: `10k`, `4k7`, `4.7kΩ`, `100nF`, `10µF` (or `10uF`), `1meg` (or `1M`), `1m` (milli), `2R2`.

| Parts | Model and value |
| --- | --- |
| Resistor (all styles), Potentiometer | Resistance (required). The potentiometer wiper sits at 50 %. |
| Capacitor, Polarized capacitor | Capacitance; open circuit at DC. |
| Inductor | Inductance; short circuit at DC. |
| Fuse | 10 mΩ; its value is a current rating that raises a warning when exceeded. |
| Battery, DC voltage source | Voltage; pin 1 is positive. |
| AC voltage source | Peak amplitude and frequency, e.g. `5V 1kHz` (50 Hz when omitted); 0 V at DC. |
| Current source | Current flowing through the source in its arrow direction. |
| VCVS, VCCS, CCVS, CCCS | Gain (unit-less, default 1); the control pins sense voltage or current. |
| Diode, LED, Zener diode | Shockley junction (LED: about 2 V at 10 mA; Zener: breakdown voltage, default 5.1 V). |
| NPN, PNP | Ebers–Moll transport model; value is β (default 100). |
| NMOS, PMOS | Square-law (level 1) model; value is V_th (default 1 V). The body pin is not modeled. |
| Op-amp, Comparator | Gain 10⁵ (comparator 10⁶), infinite input impedance, output limited smoothly to its V+/V− rails when both are connected. Supply current is not modeled. |
| Lamp, Motor | Resistive loads; a lamp takes `12V 5W` or a resistance (100 Ω default), a motor a resistance (10 Ω default). |
| Voltmeter, Scope probe, Ammeter | Ideal instruments: open (V) or 0 V (A). |
| Ground, Power rail, Test point | 0 V reference; a rail is a voltage source to ground (non-numeric names such as VCC use 5 V, with a note); a test point is a plain node. |

Transformers, photodiodes, ICs, custom blocks and edited symbols have no electrical model and stop the run with Inspect. The engine uses modified nodal analysis with Newton–Raphson, SPICE-style junction limiting and gmin/source stepping for difficult operating points, and backward Euler for transients. Limits: 256 parts, 200 unknowns for the operating point and 120 for transients, up to 2,000 steps. Details are in [ADR 003](adr/003-electrical-analysis.md).

## Logic simulation

Add Logic inputs, gates and Output probes (or a seven-segment display), wire them, then Simulate. File → Examples → Full adder (simulation) is a ready starting point.

- Every Logic input starts at 0. Tap its switch on the drawing or in Signals to flip it; its ▾ menu offers X (unknown) and Z (floating).
- Wires and pins show their net's value: green 1, blue 0, red X and dashed purple Z. Output probes light up and seven-segment displays light driven segments.
- **Truth table** lists every 0/1 combination of up to 6 inputs against the Output probes, highlights the current row and applies a chosen row.

| Parts | Supported behavior |
| --- | --- |
| Logic input | One temporary scalar input, initially 0. |
| Output probe | Reads its connected scalar net. |
| Seven-segment display | Reads segments a–g and dp; a segment lights when its input is 1. |
| Buffer, NOT | Canonical single-input definitions. |
| AND, NAND, OR, NOR, XOR, XNOR | 2–8 inputs, including the inspector's Gate inputs option. Multi-input XOR is odd parity; XNOR is even parity. |

`0` is low, `1` is high, `X` is unknown and `Z` is high impedance. An undriven net is Z. Gates treat Z as unknown, with AND/NAND's controlling 0 and OR/NOR's controlling 1 still definite. Opposing 0 and 1 drivers produce X with a conflict diagnostic. Unsupported devices, clocks, stateful logic and feedback loops stop the run with Inspect, and recover automatically once corrected.

## Shared views, storage and recovery

Logic inputs and results are shared between editor views of the same file while they simulate; closing the last one releases the runtime. Hidden views pause and resume once without replaying elapsed time. Electrical switch positions, probes and scope settings belong to each view.

Running, pausing, resetting, flipping switches and inputs, probing and applying truth-table rows never modify the circuit file, save state or undo history. A reading-note preview never starts an engine. A save/conflict/deletion problem stops simulation until it is resolved.

The redesigned studio was exercised in an isolated actual Obsidian 1.14.4 desktop profile and in browser desktop/tablet/phone/WebKit-touch workflows with native Obsidian CSS. It also passed on a physical Samsung SM-T733 tablet (Android 14, Obsidian 1.15.0) and a Pixel 7 Pro phone (Android 17, Obsidian 1.15.1), logic and electrical. iOS remains unverified.
