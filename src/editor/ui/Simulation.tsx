import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { digitalCapabilities } from '../../components/definitions/digital';
import { analogCapabilities } from '../../components/definitions/analog';
import { DIGITAL_LIMITS, identifyDigitalModels, runDigital, type DigitalDiagnostic, type LogicValue } from '../../core/topology/digital';
import { identifyAnalogModels, SWITCH_MODELS, switchDefault, type AnalogModel } from '../../core/analog/models';
import { suggestDuration, type AnalogDiagnostic, type OperatingPoint, type Waveforms } from '../../core/analog/engine';
import { formatQuantity } from '../../core/analog/units';
import { deriveNets, type Net } from '../../core/topology/nets';
import { anchorKey, type CircuitDocument, type Component } from '../../core/model/document';
import type { DocumentSession } from '../../core/session/DocumentSession';
import type { DigitalConsumer, DigitalSessions, SharedDigitalState } from '../../core/session/DigitalSessions';
import type { SaveCoordinator } from '../../core/session/SaveCoordinator';
import { simulationTurn } from '../simulation/schedule';
import { useElectrical } from '../simulation/useElectrical';
import { SEGMENTS, signalName, signalWord } from '../render/Signals';
import { Icon } from './Controls';
import { Scope, type Trace } from './Scope';

const digitalRegistry = digitalCapabilities(), analogRegistry = analogCapabilities();
const idle: SharedDigitalState = { status: 'stopped', inputs: [], active: false };
const noop = () => () => {};
export const TRUTH_TABLE_INPUTS = 6;
export const MAX_PROBES = 8;
export type DockTab = 'scope' | 'op' | 'messages' | 'signals' | 'table';
export interface Probe { id: string; kind: 'net' | 'part'; target: string; unit: 'V' | 'A'; slot: number; }
const digitalNames: Record<string, string> = { stopped: 'Paused', running: 'Live', paused: 'Paused while hidden', stale: 'Circuit changed', valid: 'Live', invalid: 'Needs attention', failed: 'Simulation failed', cancelled: 'Paused' };
const durations = [1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2, 2e-2, 5e-2, 0.1, 0.2, 0.5, 1, 2, 5, 10];
const modelNames: Partial<Record<AnalogModel, string>> = { 'dc-voltage': 'DC source', 'ac-voltage': 'AC source', 'current-source': 'Current source', 'power-rail': 'Supply rail', 'op-amp': 'Op-amp', 'scope-probe': 'Scope probe', 'push-no': 'Button (NO)', 'push-nc': 'Button (NC)', spst: 'Switch', spdt: 'Changeover switch', npn: 'NPN', pnp: 'PNP', nmos: 'NMOS', pmos: 'PMOS', led: 'LED', vcvs: 'VCVS', vccs: 'VCCS', ccvs: 'CCVS', cccs: 'CCCS' };
export const modelLabel = (model: AnalogModel) => modelNames[model] ?? model.charAt(0).toUpperCase() + model.slice(1).replace(/-/g, ' ');

/** All simulation state for one editor view. Nothing here is written to the circuit. */
export function useSimulation({ session, sessions, save, active, root, onReady }: { session: DocumentSession; sessions?: DigitalSessions; save?: SaveCoordinator; active: boolean; root: HTMLElement | null; onReady?: () => void }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot), doc = snapshot.document;
  const saveState = useSyncExternalStore(save?.subscribe ?? noop, save?.getSnapshot ?? (() => undefined));
  const blocked = !!saveState && ['conflict', 'deleted', 'error'].includes(saveState.status);
  const digitalModels = useMemo(() => identifyDigitalModels(doc.definitions, digitalRegistry), [doc.definitions]);
  const analogModels = useMemo(() => identifyAnalogModels(doc.definitions, analogRegistry), [doc.definitions]);
  const isDigital = useCallback((id: string) => !!digitalModels.get(id), [digitalModels]);
  const engine: 'digital' | 'electrical' = useMemo(() => doc.components.some(c => { const m = analogModels.get(c.definitionId); return m && m !== 'test-point'; }) ? 'electrical' : 'digital', [doc.components, analogModels]);
  const partModel = useCallback((id: string) => { const c = doc.components.find(x => x.id === id); return c ? analogModels.get(c.definitionId) : undefined; }, [doc.components, analogModels]);
  const nets = useMemo(() => deriveNets(doc), [doc]);

  // Digital: one shared runtime lease while this view simulates a logic circuit.
  const [consumer, setConsumer] = useState<DigitalConsumer>();
  useEffect(() => {
    const owner = root?.ownerDocument, win = owner?.defaultView;
    if (!active || engine !== 'digital' || !sessions || !root || !owner || !win) return;
    const bounds = root.getBoundingClientRect();
    let inView = bounds.width > 0 && bounds.height > 0, nativePaused = false;
    // Visible controls must work before IntersectionObserver delivers its first frame.
    const lease = sessions.acquire(session, signal => simulationTurn(win, signal), inView && owner.visibilityState !== 'hidden');
    setConsumer(lease); onReady?.();
    const update = () => lease.setVisible(inView && !nativePaused && owner.visibilityState !== 'hidden');
    const pause = () => { nativePaused = true; update(); }, resume = () => { nativePaused = false; update(); };
    const observer = new win.IntersectionObserver(entries => { inView = entries.some(entry => entry.isIntersecting); update(); });
    observer.observe(root);
    owner.addEventListener('visibilitychange', update);
    // Android's Cordova WebView can stay document-visible after its Activity stops.
    owner.addEventListener('pause', pause); owner.addEventListener('resume', resume);
    const hide = (event: PageTransitionEvent) => { if (event.persisted) lease.setVisible(false); else lease.release(); };
    const unload = () => lease.release();
    win.addEventListener('pagehide', hide); win.addEventListener('pageshow', update); win.addEventListener('unload', unload);
    const onSave = () => { if (save && ['conflict', 'deleted', 'error'].includes(save.getSnapshot().status)) lease.stop(); };
    const offSave = save?.subscribe(onSave); onSave();
    // Entering simulation starts it: the drawing comes alive without hunting for Run.
    if (!lease.getSnapshot().active && lease.getSnapshot().status === 'stopped' && session.getSnapshot().document.components.length && !(save && ['conflict', 'deleted', 'error'].includes(save.getSnapshot().status))) void lease.run();
    return () => { offSave?.(); observer.disconnect(); owner.removeEventListener('visibilitychange', update); owner.removeEventListener('pause', pause); owner.removeEventListener('resume', resume); win.removeEventListener('pagehide', hide); win.removeEventListener('pageshow', update); win.removeEventListener('unload', unload); setConsumer(undefined); lease.release(); };
  }, [active, engine, sessions, root, session, save, onReady]);
  const digitalState = useSyncExternalStore(consumer?.subscribe ?? noop, consumer?.getSnapshot ?? (() => idle));
  // Electrical runs need no shared lease, but a pop-out handoff still waits for this view to be ready.
  useEffect(() => { if (active && engine === 'electrical') onReady?.(); }, [active, engine, onReady]);

  // Electrical: temporary switch states, probes and analysis choices.
  const [live, setLive] = useState(true), [switches, setSwitches] = useState<Map<string, boolean>>(() => new Map());
  const [durationChoice, setDurationChoice] = useState<'auto' | number>('auto');
  const [probes, setProbes] = useState<Probe[]>([]), [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [probing, setProbing] = useState(false), [labels, setLabels] = useState(true);
  const [tab, setTab] = useState<DockTab>('scope'), [dockOpen, setDockOpen] = useState(true);
  useEffect(() => { if (active) { setLive(true); setTab(t => engine === 'electrical' ? (t === 'signals' || t === 'table' ? 'scope' : t) : (t === 'signals' || t === 'table' ? t : 'signals')); } else setProbing(false); }, [active, engine]);
  const owner = root?.ownerDocument.defaultView ?? undefined;
  const suggested = useMemo(() => suggestDuration({ document: doc }, analogRegistry), [doc]), duration = durationChoice === 'auto' ? suggested : durationChoice;
  const { op, waves } = useElectrical({ owner, document: doc, revision: snapshot.revision, live: active && engine === 'electrical' && live && !blocked, switches, transient: dockOpen && tab === 'scope', duration, registry: analogRegistry, digital: isDigital });
  const point = op.status === 'done' ? op.result : op.status === 'busy' ? op.previous : undefined;
  const wave = waves.status === 'done' ? waves.result : waves.status === 'busy' ? waves.previous : undefined;
  const toggleSwitch = useCallback((id: string) => { const model = partModel(id); if (!model || !SWITCH_MODELS.includes(model)) return false; setSwitches(m => new Map(m).set(id, !(m.get(id) ?? switchDefault(model)))); return true; }, [partModel]);
  const switchState = useCallback((id: string) => { const model = partModel(id); return model ? switches.get(id) ?? switchDefault(model) : false; }, [partModel, switches]);
  const toggleProbe = useCallback((kind: 'net' | 'part', target: string) => {
    let added = true;
    setProbes(list => {
      const existing = list.find(p => p.kind === kind && p.target === target);
      if (existing) { added = false; return list.filter(p => p !== existing); }
      const used = new Set(list.map(p => p.slot)), slot = [1, 2, 3, 4, 5, 6, 7, 8].find(s => !used.has(s));
      if (!slot) { added = false; return list; }
      const model = kind === 'part' ? partModel(target) : undefined, unit: 'V' | 'A' = kind === 'net' || model === 'voltmeter' || model === 'scope-probe' || model === 'capacitor' ? 'V' : 'A';
      return [...list, { id: `${kind}:${target}`, kind, target, unit, slot }];
    });
    setTab('scope'); setDockOpen(true);
    return added;
  }, [partModel]);
  const reset = useCallback(() => { if (engine === 'digital') consumer?.reset(); else setSwitches(new Map()); }, [engine, consumer]);
  return { active, engine, doc, revision: snapshot.revision, blocked, nets, digitalModels, analogModels, partModel, consumer, digitalState, live, setLive, switches, switchState, toggleSwitch, durationChoice, setDurationChoice, duration, suggested, op, waves, point, wave, probes, setProbes, toggleProbe, hidden, setHidden, probing, setProbing, labels, setLabels, tab, setTab, dockOpen, setDockOpen, reset };
}
export type Simulation = ReturnType<typeof useSimulation>;

/** Traces shown on the scope: explicit probes, else instruments, else energy-storage parts. */
export function useTraces(sim: Simulation): Trace[] {
  return useMemo(() => {
    const wave = sim.wave; if (!wave || wave.status !== 'valid') return [];
    const refs = new Map(sim.doc.components.map(c => [c.id, c.reference || 'part'])), netName = new Map(sim.nets.map(n => [n.id, n.name]));
    const out: Trace[] = [];
    const push = (id: string, label: string, unit: 'V' | 'A', data: Float64Array | undefined, slot: number) => { if (data && out.length < MAX_PROBES) out.push({ id, label, unit, data, slot }); };
    if (sim.probes.length) {
      for (const p of sim.probes) p.kind === 'net' ? push(p.id, `V(${netName.get(p.target) ?? 'net'})`, 'V', wave.net.get(p.target), p.slot) : push(p.id, `${p.unit === 'V' ? 'V' : 'I'}(${refs.get(p.target)})`, p.unit, (p.unit === 'V' ? wave.partVoltage : wave.partCurrent).get(p.target), p.slot);
      return out;
    }
    let slot = 1;
    const defaults = (models: AnalogModel[]) => { for (const c of sim.doc.components) { const m = sim.analogModels.get(c.definitionId); if (m && models.includes(m)) { const unit = m === 'ammeter' || m === 'inductor' ? 'A' : 'V'; push(`auto:${c.id}`, `${unit === 'V' ? 'V' : 'I'}(${refs.get(c.id)})`, unit, (unit === 'V' ? wave.partVoltage : wave.partCurrent).get(c.id), slot++); } } };
    defaults(['voltmeter', 'ammeter', 'scope-probe']);
    if (!out.length) defaults(['capacitor', 'inductor']);
    return out;
  }, [sim.wave, sim.probes, sim.doc.components, sim.nets, sim.analogModels]);
}

function electricalStatus(sim: Simulation): { text: string; dot: 'live' | 'paused' | 'attention' | 'busy' } {
  if (sim.blocked) return { text: 'Save problem', dot: 'attention' };
  if (!sim.live) return { text: 'Paused', dot: 'paused' };
  const result = sim.point;
  if (result && result.status !== 'valid') return { text: 'Needs attention', dot: 'attention' };
  if (result?.diagnostics.some(d => d.severity === 'warning')) return { text: 'Live · warnings', dot: 'attention' };
  return { text: 'Live', dot: 'live' };
}
function digitalStatus(sim: Simulation) {
  const state = sim.digitalState, diagnostics = state.result?.diagnostics ?? [];
  if (sim.blocked) return { text: 'Save problem', dot: 'attention' as const };
  const attention = state.status === 'invalid' || state.status === 'failed' || (state.status === 'valid' && diagnostics.length > 0);
  return { text: state.status === 'valid' && diagnostics.length ? 'Live · check signals' : digitalNames[state.status], dot: attention ? 'attention' as const : state.active && state.status !== 'paused' ? 'live' as const : 'paused' as const };
}
const durationLabel = (value: number) => formatQuantity(value, 's', 3).replace('.00 ', ' ').replace(/\.0 /, ' ');

/** One dense row of run controls. Wide panes place it in the top bar where the drawing tools were. */
export function SimulationStrip({ sim, onExit }: { sim: Simulation; onExit: () => void }) {
  const electrical = sim.engine === 'electrical', status = electrical ? electricalStatus(sim) : digitalStatus(sim);
  const running = electrical ? sim.live : sim.digitalState.active;
  const kindLabel = electrical ? 'Electrical' : 'Logic';
  return <div className="lec-sim-strip" role="toolbar" aria-label="Simulation controls" data-ignore-swipe="true" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onExit(); } }}>
    <span className="lec-sim-status"><span className="lec-sim-dot" data-state={status.dot} aria-hidden="true" /><span className="lec-sim-kind">{kindLabel}</span><span className="lec-simulation-state" role="status">{status.text}</span></span>
    <span className="lec-sim-group">
      {running
        ? <button type="button" className="lec-sim-run" onClick={() => electrical ? sim.setLive(false) : sim.consumer?.stop()}><Icon name="pause" />Pause</button>
        : <button type="button" className="lec-primary lec-sim-run" disabled={sim.blocked || !sim.doc.components.length} onClick={() => electrical ? sim.setLive(true) : void sim.consumer?.run()}><Icon name="play" />Run</button>}
      <button type="button" disabled={sim.blocked} title={electrical ? 'Return switches to their default positions' : 'Return logic inputs to 0'} onClick={sim.reset}><Icon name="reset" />Reset</button>
    </span>
    {electrical && <span className="lec-sim-group">
      <button type="button" aria-pressed={sim.probing} title="Click wires to plot voltage and parts to plot current" onClick={() => sim.setProbing(!sim.probing)}><Icon name="probe" />Probe</button>
      <label className="lec-sim-field" title="Transient window"><span>Window</span><select value={sim.durationChoice === 'auto' ? 'auto' : String(sim.durationChoice)} onChange={e => sim.setDurationChoice(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}><option value="auto">Auto · {durationLabel(sim.suggested)}</option>{durations.map(d => <option key={d} value={String(d)}>{durationLabel(d)}</option>)}</select></label>
      <button type="button" aria-pressed={sim.labels} title="Show node voltages on the schematic" onClick={() => sim.setLabels(!sim.labels)}><Icon name="tag" />Values</button>
    </span>}
    <span className="lec-sim-group lec-sim-end">
      <button type="button" aria-pressed={sim.dockOpen} aria-label={sim.dockOpen ? 'Hide analysis panel' : 'Show analysis panel'} title={sim.dockOpen ? 'Hide analysis panel' : 'Show analysis panel'} onClick={() => sim.setDockOpen(!sim.dockOpen)}><Icon name="dock" /></button>
    </span>
  </div>;
}

/** Docked analysis area below the schematic, resizable by its top edge. */
export function AnalysisDock({ sim, height, setHeight, inspect }: { sim: Simulation; height: number; setHeight: (height: number) => void; inspect: (ids: string[]) => void }) {
  const traces = useTraces(sim), panelId = useId(), electrical = sim.engine === 'electrical';
  const drag = useRef<{ start: number; height: number }>();
  const tabs: { id: DockTab; label: string; count?: number }[] = electrical
    ? [{ id: 'scope', label: 'Scope' }, { id: 'op', label: 'Operating point' }, { id: 'messages', label: 'Messages', count: (sim.point?.diagnostics.length ?? 0) + (sim.wave?.status === 'invalid' || sim.wave?.status === 'failed' ? sim.wave.diagnostics.length : 0) }]
    : [{ id: 'signals', label: 'Signals' }, { id: 'table', label: 'Truth table' }];
  const onResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.type === 'pointerdown') { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { start: event.clientY, height }; return; }
    if (event.type === 'pointerup' || event.type === 'pointercancel') { drag.current = undefined; return; }
    if (drag.current) setHeight(drag.current.height + drag.current.start - event.clientY);
  };
  return <section className="lec-analysis-dock" aria-label="Analysis" style={{ height: `calc(${height}px + var(--lec-navbar-inset, 0px))` }} data-ignore-swipe="true" onTouchStart={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
    <div className="lec-dock-resize" role="separator" aria-orientation="horizontal" aria-label="Resize analysis panel" tabIndex={0} onPointerDown={onResize} onPointerMove={onResize} onPointerUp={onResize} onPointerCancel={onResize} onKeyDown={e => { if (e.key === 'ArrowUp') setHeight(height + 24); if (e.key === 'ArrowDown') setHeight(height - 24); }} />
    <div className="lec-dock-tabs" role="tablist" aria-label="Analysis view">
      {tabs.map(t => <button key={t.id} type="button" role="tab" id={`${panelId}-${t.id}`} aria-selected={sim.tab === t.id} aria-controls={`${panelId}-body`} onClick={() => sim.setTab(t.id)}>{t.label}{t.count ? <small>{t.count}</small> : null}</button>)}
      {electrical && sim.tab === 'scope' && sim.probes.length > 0 && <button type="button" className="lec-dock-action" onClick={() => sim.setProbes([])}>Clear probes</button>}
    </div>
    <div className="lec-dock-body" id={`${panelId}-body`} role="tabpanel" aria-labelledby={`${panelId}-${sim.tab}`}>
      {electrical && sim.tab === 'scope' && <ScopeView sim={sim} traces={traces} />}
      {electrical && sim.tab === 'op' && <OperatingPointTable sim={sim} inspect={inspect} />}
      {electrical && sim.tab === 'messages' && <Messages diagnostics={[...(sim.point?.diagnostics ?? []), ...(sim.wave && sim.wave.status !== 'valid' ? sim.wave.diagnostics : [])]} doc={sim.doc} inspect={inspect} />}
      {!electrical && sim.tab === 'signals' && <DigitalSignals sim={sim} inspect={inspect} />}
      {!electrical && sim.tab === 'table' && <DigitalTruthTable sim={sim} />}
    </div>
  </section>;
}

function ScopeView({ sim, traces }: { sim: Simulation; traces: Trace[] }) {
  const wave = sim.wave;
  if (!sim.live) return <p className="lec-dock-empty">Run the simulation to record waveforms.</p>;
  if (sim.point && sim.point.status !== 'valid') return <p className="lec-dock-empty">Resolve the messages to record waveforms.</p>;
  if (!wave) return <p className="lec-dock-empty">Recording a {formatQuantity(sim.duration, 's')} power-on transient…</p>;
  if (wave.status !== 'valid') return <p className="lec-dock-empty">{wave.diagnostics[0]?.message ?? 'The transient run did not complete.'}</p>;
  return <Scope time={wave.time} duration={wave.duration} traces={traces} hidden={sim.hidden} busy={sim.waves.status === 'busy'}
    onToggle={id => sim.setHidden(h => { const next = new Set(h); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
    onRemove={sim.probes.length ? id => sim.setProbes(list => list.filter(p => p.id !== id)) : undefined} />;
}

function OperatingPointTable({ sim, inspect }: { sim: Simulation; inspect: (ids: string[]) => void }) {
  const point = sim.point;
  if (!sim.live) return <p className="lec-dock-empty">Run the simulation to solve the operating point.</p>;
  if (!point) return <p className="lec-dock-empty">Solving…</p>;
  if (point.status !== 'valid') return <Messages diagnostics={point.diagnostics} doc={sim.doc} inspect={inspect} />;
  const named = sim.nets.filter(n => n.wireIds.length && point.netVoltages.has(n.id));
  const rows = sim.doc.components.map(c => ({ c, r: point.parts.get(c.id) })).filter(x => x.r && !['ground', 'test-point'].includes(x.r.model));
  const supplied = rows.reduce((sum, { r }) => sum + (r!.power < 0 ? -r!.power : 0), 0);
  return <div className="lec-op">
    <div className="lec-op-summary"><span>{named.length} nodes · {rows.length} parts</span><span>Supplied {formatQuantity(supplied, 'W')}</span><span>{point.iterations} Newton iterations</span></div>
    <div className="lec-op-grid">
      <table className="lec-data-table"><caption>Node voltages</caption><thead><tr><th scope="col">Net</th><th scope="col">Voltage</th></tr></thead>
        <tbody>{named.map(n => <tr key={n.id}><th scope="row">{n.name}</th><td>{formatQuantity(point.netVoltages.get(n.id)!, 'V')}</td></tr>)}</tbody></table>
      <table className="lec-data-table"><caption>Parts</caption><thead><tr><th scope="col">Part</th><th scope="col">Type</th><th scope="col">Voltage</th><th scope="col">Current</th><th scope="col">Power</th><th scope="col">State</th></tr></thead>
        <tbody>{rows.map(({ c, r }) => <tr key={c.id}><th scope="row"><button type="button" className="lec-link" onClick={() => inspect([c.id])}>{c.reference || 'part'}</button></th><td>{modelLabel(r!.model)}</td><td>{formatQuantity(r!.voltage, 'V')}</td><td>{formatQuantity(r!.current, 'A')}</td><td>{formatQuantity(r!.power, 'W')}</td><td>{r!.state ?? ''}</td></tr>)}</tbody></table>
    </div>
  </div>;
}

function Messages({ diagnostics, doc, inspect }: { diagnostics: readonly (AnalogDiagnostic | DigitalDiagnostic)[]; doc: CircuitDocument; inspect: (ids: string[]) => void }) {
  if (!diagnostics.length) return <p className="lec-dock-empty">No messages. The circuit solved cleanly.</p>;
  return <ul className="lec-messages">{diagnostics.map((d, i) => { const severity = 'severity' in d ? d.severity : 'warning'; return <li key={`${d.code}-${i}`} data-severity={severity}>
    <span className="lec-message-mark" aria-hidden="true">{severity === 'error' ? '●' : severity === 'warning' ? '▲' : 'i'}</span><span className="lec-visually-hidden">{severity}: </span><p>{d.message}</p>
    {d.objectIds.length > 0 && <button type="button" onClick={() => inspect(d.objectIds)}>Inspect {d.objectIds.length === 1 ? doc.components.find(c => c.id === d.objectIds[0])?.reference || 'object' : `${d.objectIds.length} objects`}</button>}
  </li>; })}</ul>;
}

/** Hover card for the schematic: the reading under the pointer. */
export function Readout({ sim, objectId, x, y, bounds }: { sim: Simulation; objectId: string; x: number; y: number; bounds: { width: number; height: number } }) {
  const card = useRef<HTMLDivElement>(null), [placed, setPlaced] = useState({ left: x, top: y });
  // Keep the whole card inside the canvas: flip above or left of the pointer near an edge.
  useLayoutEffect(() => {
    const element = card.current; if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setPlaced({ left: x + width + 8 > bounds.width ? Math.max(4, x - width - 28) : x, top: y + height + 8 > bounds.height ? Math.max(4, y - height - 28) : y });
  }, [x, y, bounds.width, bounds.height, objectId]);
  const point = sim.point; if (!point || point.status !== 'valid') return null;
  const component = sim.doc.components.find(c => c.id === objectId);
  let title = '', rows: [string, string][] = [];
  if (component) {
    const r = point.parts.get(component.id); if (!r || r.model === 'ground' || r.model === 'test-point') return null;
    title = `${component.reference || 'Part'} · ${modelLabel(r.model)}${component.properties.value ? ` ${component.properties.value}` : ''}`;
    if (r.detail.length) rows = r.detail.map(d => [d.label, d.unit ? formatQuantity(d.value, d.unit) : String(d.value)]);
    else if (r.model === 'power-rail') rows = [['Voltage', formatQuantity(r.voltage, 'V')], ['Current', formatQuantity(r.current, 'A')]];
    else rows = [['Voltage', formatQuantity(r.voltage, 'V')], ['Current', formatQuantity(r.current, 'A')]];
    rows.push(['Power', formatQuantity(r.power, 'W')]);
    if (r.state) rows.push(['State', r.state]);
    const dynamic = [...waveRows(sim, sim.wave?.partVoltage.get(component.id), 'V'), ...waveRows(sim, sim.wave?.partCurrent.get(component.id), 'A')];
    if (dynamic.length) rows = rows.map(([k, v]) => [k === 'Voltage' ? 'V DC' : k === 'Current' ? 'I DC' : k === 'Power' ? 'P DC' : k, v]);
    rows.push(...dynamic);
  } else {
    const net = sim.nets.find(n => n.wireIds.includes(objectId) || n.members.includes(`${anchorKey({ kind: 'node', nodeId: objectId })}[0]`));
    if (!net) return null;
    title = `Net ${net.name}`; rows = [['Voltage', formatQuantity(point.netVoltages.get(net.id) ?? 0, 'V')]];
    const current = wireCurrent(sim, net, point);
    if (current !== undefined) rows.push(['Current', formatQuantity(current, 'A')]);
    const dynamic = waveRows(sim, sim.wave?.net.get(net.id), 'V');
    if (dynamic.length) rows = rows.map(([k, v]) => [k === 'Voltage' ? 'V DC' : k === 'Current' ? 'I DC' : k, v]);
    rows.push(...dynamic);
  }
  return <div ref={card} className="lec-readout" style={{ left: placed.left, top: placed.top }} role="status" aria-live="polite"><strong>{title}</strong>{rows.map(([k, v]) => <span key={k}><em>{k}</em><b>{v}</b></span>)}</div>;
}
/** Time-varying signals also report their RMS and peak from the transient run. */
function waveRows(sim: Simulation, data: Float64Array | undefined, unit: 'V' | 'A'): [string, string][] {
  const wave = sim.wave; if (!data || !wave || wave.status !== 'valid' || data.length < 3) return [];
  // Only alternating sources make RMS and peak meaningful; DC circuits keep a compact card.
  if (!sim.doc.components.some(c => sim.analogModels.get(c.definitionId) === 'ac-voltage')) return [];
  let min = Infinity, max = -Infinity, square = 0;
  for (let i = 0; i < data.length; i++) { min = Math.min(min, data[i]); max = Math.max(max, data[i]); if (i) square += (data[i] ** 2 + data[i - 1] ** 2) / 2 * (wave.time[i] - wave.time[i - 1]); }
  if (max - min < 1e-9 * Math.max(1, Math.abs(max))) return [];
  const label = unit === 'V' ? 'V' : 'I';
  return [[`${label} RMS`, formatQuantity(Math.sqrt(square / wave.duration), unit)], [`${label} peak`, formatQuantity(Math.max(Math.abs(min), Math.abs(max)), unit)]];
}
/** A net joining exactly two terminals carries one current; report it for such series wires. */
function wireCurrent(sim: Simulation, net: Net, point: OperatingPoint): number | undefined {
  const pins = net.members.filter(m => m.startsWith('p:'));
  if (pins.length !== 2) return undefined;
  const match = /^p:([^:]+):(.+)\[0\]$/.exec(pins[0]), componentId = match && decodeURIComponent(match[1]), pinId = match && decodeURIComponent(match[2]);
  const r = componentId ? point.parts.get(componentId) : undefined, component = sim.doc.components.find(c => c.id === componentId);
  if (!r || !component) return undefined;
  const definition = sim.doc.definitions.find(d => d.id === component.definitionId);
  if (!definition || definition.pins.length !== 2) return undefined;
  return Math.abs(pinId === definition.pins[0].id ? r.current : -r.current);
}
export type { OperatingPoint, Waveforms };

/* ---------- Logic views ---------- */
interface Device { component: Component; name: string; }
function useDigitalGroups(sim: Simulation) {
  return useMemo(() => {
    const groups = { inputs: [] as Device[], probes: [] as Device[], displays: [] as Device[] };
    if (sim.doc.components.length > DIGITAL_LIMITS.components) return groups;
    for (const component of sim.doc.components) {
      const model = sim.digitalModels.get(component.definitionId);
      if (model === 'input-v1') groups.inputs.push({ component, name: component.reference || 'Logic input' });
      if (model === 'probe-v1') groups.probes.push({ component, name: component.reference || 'Output probe' });
      if (model === 'display7-v1') groups.displays.push({ component, name: component.reference || 'Display' });
    }
    return groups;
  }, [sim.doc.components, sim.digitalModels]);
}
function useDigitalReading(sim: Simulation) {
  const state = sim.digitalState, current = !sim.blocked && state.status === 'valid' && state.result?.revision === sim.revision;
  // A quick live recompute keeps showing the previous reading rather than blinking to "–".
  const last = useRef(state.result);
  if (current) last.current = state.result; else if (sim.blocked || !state.active || state.status !== 'running') last.current = undefined;
  return { current, reading: current ? state.result : last.current };
}
const options: { value: LogicValue; label: string }[] = [{ value: 0, label: '0 · Low' }, { value: 1, label: '1 · High' }, { value: 'X', label: 'X · Unknown' }, { value: 'Z', label: 'Z · Floating' }];
const parseValue = (text: string): LogicValue => text === '0' ? 0 : text === '1' ? 1 : text === 'Z' ? 'Z' : 'X';
function DigitalSignals({ sim, inspect }: { sim: Simulation; inspect: (ids: string[]) => void }) {
  const groups = useDigitalGroups(sim), { current, reading } = useDigitalReading(sim), inputHeading = useId(), outputHeading = useId();
  const value = (id: string) => sim.digitalState.inputs.find(i => i.componentId === id)?.value ?? 0;
  const diagnostics = sim.digitalState.result?.diagnostics ?? [];
  if (!groups.inputs.length && !groups.probes.length && !groups.displays.length) return <div className="lec-dock-empty"><strong>Build a logic circuit to simulate it.</strong> Add Logic inputs, gates and Output probes from Add → Logic, or electrical parts with a Ground for circuit analysis.</div>;
  return <div className="lec-sim-signals-view">
    <div className="lec-sim-flow">
      <div className="lec-sim-group-box" role="group" aria-labelledby={inputHeading}><h3 id={inputHeading}>Inputs</h3><span id={`${inputHeading}-suffix`} hidden>input</span>
        <div className="lec-sim-chips">{groups.inputs.length ? groups.inputs.map(({ component, name }) => <InputChip key={component.id} id={component.id} name={name} suffix={`${inputHeading}-suffix`} value={value(component.id)} disabled={sim.blocked} set={v => sim.consumer?.setInput(component.id, v)} />) : <p className="lec-muted">Add a Logic input to drive a signal.</p>}</div>
      </div>
      <span className="lec-sim-arrow" aria-hidden="true">→</span>
      <div className="lec-sim-group-box" role="group" aria-labelledby={outputHeading}><h3 id={outputHeading}>Outputs</h3><span id={`${outputHeading}-suffix`} hidden>output</span>
        <div className="lec-sim-chips">
          {groups.probes.map(({ component, name }) => <OutputChip key={component.id} id={component.id} name={name} suffix={`${outputHeading}-suffix`} value={reading?.probes.find(p => p.componentId === component.id)?.value} />)}
          {groups.displays.map(({ component, name }) => <DisplayChip key={component.id} name={name} segments={reading?.displays.find(d => d.componentId === component.id)?.segments} />)}
          {!groups.probes.length && !groups.displays.length && <p className="lec-muted">Add an Output probe where you want to read a signal.</p>}
        </div>
      </div>
    </div>
    {(current || sim.digitalState.status === 'invalid' || sim.digitalState.status === 'failed') && diagnostics.length > 0 && <Messages diagnostics={diagnostics} doc={sim.doc} inspect={inspect} />}
  </div>;
}
function InputChip({ id, name, suffix, value, disabled, set }: { id: string; name: string; suffix: string; value: LogicValue; disabled: boolean; set: (value: LogicValue) => void }) {
  const nameId = `${suffix}-${id}`, on = value === 1;
  return <div className="lec-sim-chip is-input" data-signal={signalName(value)}>
    <button type="button" role="switch" aria-checked={on} aria-labelledby={`${nameId} ${suffix}`} aria-describedby={`${nameId}-value`} disabled={disabled} onClick={() => set(on ? 0 : 1)}>
      <span className="lec-sim-chip-name" id={nameId}>{name}</span><span className="lec-sim-toggle" aria-hidden="true"><span className="lec-sim-knob" /></span><span className="lec-sim-chip-value" id={`${nameId}-value`}>{String(value)}</span>
    </button>
    <span className="lec-sim-more" title="More values"><select aria-label={`${name} value`} value={String(value)} disabled={disabled} onChange={e => set(parseValue(e.target.value))}>{options.map(option => <option key={option.label} value={String(option.value)}>{option.label}</option>)}</select></span>
  </div>;
}
function OutputChip({ id, name, suffix, value }: { id: string; name: string; suffix: string; value?: LogicValue }) {
  const nameId = `${suffix}-${id}`;
  return <div className="lec-sim-chip is-output" data-signal={signalName(value)}><span className="lec-sim-led" aria-hidden="true" /><span className="lec-sim-chip-name" id={nameId}>{name}</span>
    <output aria-labelledby={`${nameId} ${suffix}`}>{value === undefined ? '–' : <>{String(value)}<small> · {signalWord(value)}</small></>}</output></div>;
}
function DisplayChip({ name, segments }: { name: string; segments?: readonly LogicValue[] }) {
  const lit = segments?.map(v => String(v)).join('') ?? '';
  return <div className="lec-sim-chip is-display" role="img" aria-label={`${name} display${segments ? ` segments a to dp: ${lit}` : ': no reading'}`}><span className="lec-sim-chip-name">{name}</span>
    <svg viewBox="-6 -44 52 76" width="20" height="30" aria-hidden="true">{SEGMENTS.map((d, i) => <path key={i} d={d} data-signal={signalName(segments?.[i])} />)}<circle cx="38" cy="28" r="3" data-signal={signalName(segments?.[7])} /></svg></div>;
}
type TableState = { status: 'idle' | 'busy' } | { status: 'ready'; revision: number; rows: { inputs: LogicValue[]; outputs: LogicValue[] }[] } | { status: 'error'; message: string };
/** Every 0/1 input combination, evaluated by the same engine without touching the live run. */
function DigitalTruthTable({ sim }: { sim: Simulation }) {
  const groups = useDigitalGroups(sim), { inputs, probes } = groups, [table, setTable] = useState<TableState>({ status: 'idle' }), host = useRef<HTMLDivElement>(null);
  const values = inputs.map(i => sim.digitalState.inputs.find(x => x.componentId === i.component.id)?.value ?? 0);
  const usable = inputs.length > 0 && inputs.length <= TRUTH_TABLE_INPUTS && probes.length > 0, doc = sim.doc, revision = sim.revision;
  useLayoutEffect(() => {
    const win = host.current?.ownerDocument.defaultView; if (!usable || !win) return;
    const controller = new AbortController(); setTable({ status: 'busy' });
    void (async () => {
      const rows: { inputs: LogicValue[]; outputs: LogicValue[] }[] = [];
      for (let mask = 0; mask < 1 << inputs.length; mask++) {
        const row = inputs.map((_, i): LogicValue => (mask >> (inputs.length - 1 - i)) & 1 ? 1 : 0);
        const result = await runDigital({ sessionId: 'truth-table', runId: mask, revision, document: doc, inputs: inputs.map((input, i) => ({ componentId: input.component.id, value: row[i] })) }, digitalRegistry, controller.signal, async () => {});
        if (controller.signal.aborted) return;
        if (result.status !== 'valid') { setTable({ status: 'error', message: result.diagnostics[0]?.message ?? 'This circuit cannot be tabulated.' }); return; }
        rows.push({ inputs: row, outputs: probes.map(probe => result.probes.find(p => p.componentId === probe.component.id)?.value ?? 'X') });
        if (mask % 8 === 7) { await simulationTurn(win, controller.signal); if (controller.signal.aborted) return; }
      }
      setTable({ status: 'ready', revision, rows });
    })();
    return () => controller.abort();
  }, [doc, revision, inputs, probes, usable]);
  const message = !inputs.length || !probes.length ? 'Add Logic inputs and Output probes to tabulate a circuit.' : inputs.length > TRUTH_TABLE_INPUTS ? `Truth tables cover up to ${TRUTH_TABLE_INPUTS} inputs (${1 << TRUTH_TABLE_INPUTS} rows). This circuit has ${inputs.length}.` : table.status === 'error' ? table.message : undefined;
  return <div className="lec-sim-table-host" ref={host}>
    {message ? <p className="lec-dock-empty">{message}</p> : table.status !== 'ready' || table.revision !== revision ? <p className="lec-dock-empty">Calculating every combination…</p> : <>
      <p className="lec-sim-table-hint">Every 0/1 combination of the inputs. Choose a row to apply it.</p>
      <div className="lec-sim-table-scroll" data-long={table.rows.length > 16 || undefined}><table className="lec-sim-table">
        <thead><tr>{inputs.map((input, i) => <th key={input.component.id} scope="col" className={i === inputs.length - 1 ? 'is-last-input' : undefined}>{input.name}</th>)}{probes.map(probe => <th key={probe.component.id} scope="col" className="is-output">{probe.name}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, r) => {
          const active = row.inputs.every((value, i) => value === values[i]), label = inputs.map((input, i) => `${input.name} ${row.inputs[i]}`).join(', ');
          return <tr key={r} className={active ? 'is-current' : undefined} aria-current={active || undefined}>
            {row.inputs.map((value, i) => <td key={i} className={i === inputs.length - 1 ? 'is-last-input' : undefined} data-signal={signalName(value)}>{i === 0 && <button type="button" className="lec-sim-row-button" disabled={sim.blocked} aria-label={`Apply ${label}`} onClick={() => row.inputs.forEach((v, j) => sim.consumer?.setInput(inputs[j].component.id, v))} />}{String(value)}</td>)}
            {row.outputs.map((value, i) => <td key={`o${i}`} className="is-output" data-signal={signalName(value)}>{String(value)}</td>)}
          </tr>;
        })}</tbody>
      </table></div>
    </>}
  </div>;
}
