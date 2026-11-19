import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { digitalCapabilities } from '../../components/definitions/digital';
import { DIGITAL_LIMITS, identifyDigitalModels, runDigital, type DigitalDiagnostic, type LogicValue } from '../../core/topology/digital';
import type { CircuitDocument, Component } from '../../core/model/document';
import type { DocumentSession } from '../../core/session/DocumentSession';
import type { DigitalConsumer, DigitalSessions } from '../../core/session/DigitalSessions';
import type { SaveCoordinator } from '../../core/session/SaveCoordinator';
import { simulationTurn } from '../simulation/schedule';
import { SEGMENTS, signalName, signalWord } from '../render/Signals';
import { Icon } from './Controls';

const names: Record<string, string> = { stopped: 'Paused', running: 'Live', paused: 'Paused while hidden', stale: 'Circuit changed', valid: 'Live', invalid: 'Needs attention', failed: 'Simulation failed', cancelled: 'Paused' };
const options: { value: LogicValue; label: string }[] = [{ value: 0, label: '0 · Low' }, { value: 1, label: '1 · High' }, { value: 'X', label: 'X · Unknown' }, { value: 'Z', label: 'Z · Floating' }];
const parseValue = (text: string): LogicValue => text === '0' ? 0 : text === '1' ? 1 : text === 'Z' ? 'Z' : 'X';
/** Exhaustive tables stay small enough to scan and to compute without freezing a phone. */
export const TRUTH_TABLE_INPUTS = 6;
const registry = digitalCapabilities();

export function SimulationPanel({ session, sessions, save, close, inspect, onHeight, onReady, onConsumer }: { session: DocumentSession; sessions: DigitalSessions; save?: SaveCoordinator; close: () => void; inspect: (ids: string[]) => void; onHeight: (height: number) => void; onReady?: () => void; onConsumer?: (consumer: DigitalConsumer | undefined) => void }) {
  const element = useRef<HTMLElement>(null), heading = useId();
  const [consumer, setConsumer] = useState<DigitalConsumer>();
  useLayoutEffect(() => {
    const panel = element.current, win = panel?.ownerDocument.defaultView; if (!panel || !win) return;
    const measure = () => onHeight(panel.getBoundingClientRect().height);
    measure(); const observer = new win.ResizeObserver(measure); observer.observe(panel);
    return () => { observer.disconnect(); onHeight(0); };
  }, [onHeight]);
  useEffect(() => {
    const panel = element.current, owner = panel?.ownerDocument, win = owner?.defaultView;
    if (!panel || !owner || !win) return;
    const bounds = panel.getBoundingClientRect();
    let inView = bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.right > 0 && bounds.top < win.innerHeight && bounds.left < win.innerWidth, nativePaused = false;
    // Visible controls must work before IntersectionObserver delivers its first frame.
    const lease = sessions.acquire(session, signal => simulationTurn(win, signal), inView && owner.visibilityState !== 'hidden');
    setConsumer(lease); onConsumer?.(lease); onReady?.();
    const update = () => lease.setVisible(inView && !nativePaused && owner.visibilityState !== 'hidden');
    const pause = () => { nativePaused = true; update(); };
    const resume = () => { nativePaused = false; update(); };
    const observer = new win.IntersectionObserver(entries => { inView = entries.some(entry => entry.isIntersecting); update(); });
    observer.observe(panel);
    owner.addEventListener('visibilitychange', update);
    // Android's Cordova WebView can stay document-visible after its Activity stops.
    owner.addEventListener('pause', pause); owner.addEventListener('resume', resume);
    const hide = (event: PageTransitionEvent) => {
      if (event.persisted) lease.setVisible(false); else lease.release();
    };
    const unload = () => lease.release();
    win.addEventListener('pagehide', hide); win.addEventListener('pageshow', update); win.addEventListener('unload', unload);
    const onSave = () => { if (save && ['conflict', 'deleted', 'error'].includes(save.getSnapshot().status)) lease.stop(); };
    const offSave = save?.subscribe(onSave); onSave();
    return () => { offSave?.(); observer.disconnect(); owner.removeEventListener('visibilitychange', update); owner.removeEventListener('pause', pause); owner.removeEventListener('resume', resume); win.removeEventListener('pagehide', hide); win.removeEventListener('pageshow', update); win.removeEventListener('unload', unload); onConsumer?.(undefined); lease.release(); };
  }, [session, sessions, save, onReady, onConsumer]);
  return <section className="lec-simulation" ref={element} aria-labelledby={heading} data-ignore-swipe="true" onTouchStart={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }}>
    {consumer ? <SimulationControls heading={heading} close={close} session={session} consumer={consumer} save={save} inspect={inspect} /> : <h2 id={heading}>Digital simulation</h2>}
  </section>;
}

interface Device { component: Component; name: string; }
function SimulationControls({ session, consumer, save, inspect, heading, close }: { heading: string; close: () => void; session: DocumentSession; consumer: DigitalConsumer; save?: SaveCoordinator; inspect: (ids: string[]) => void }) {
  const header = useRef<HTMLDivElement>(null);
  const state = useSyncExternalStore(consumer.subscribe, consumer.getSnapshot);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const saveState = useSyncExternalStore(save?.subscribe ?? (() => () => {}), save?.getSnapshot ?? (() => undefined));
  const [tab, setTab] = useState<'signals' | 'table'>('signals');
  // Collapsed keeps only the header: the drawing's switches and lamps carry the run.
  const [collapsed, setCollapsed] = useState(false);
  // The table view may take more of the pane; the drawing stays visible below it.
  useLayoutEffect(() => { const section = header.current?.closest<HTMLElement>('.lec-simulation'); if (section) { section.dataset.view = tab; section.dataset.collapsed = String(collapsed); } }, [tab, collapsed]);
  const doc = snapshot.document;
  const groups = useMemo(() => {
    const empty = { inputs: [] as Device[], probes: [] as Device[], displays: [] as Device[] };
    if (doc.components.length > DIGITAL_LIMITS.components || doc.definitions.length > DIGITAL_LIMITS.definitions) return empty;
    const models = identifyDigitalModels(doc.definitions, registry);
    for (const component of doc.components) {
      const model = models.get(component.definitionId);
      if (model === 'input-v1') empty.inputs.push({ component, name: component.reference || 'Logic input' });
      if (model === 'probe-v1') empty.probes.push({ component, name: component.reference || 'Output probe' });
      if (model === 'display7-v1') empty.displays.push({ component, name: component.reference || 'Display' });
    }
    return empty;
  }, [doc]);
  const blocked = !!saveState && ['conflict', 'deleted', 'error'].includes(saveState.status);
  const current = !blocked && state.status === 'valid' && state.result?.revision === snapshot.revision;
  // A quick live recompute keeps showing the previous reading rather than blinking to "–".
  const lastReading = useRef(state.result);
  if (current) lastReading.current = state.result; else if (blocked || !state.active || state.status !== 'running') lastReading.current = undefined;
  const reading = current ? state.result : lastReading.current;
  const inputValue = (id: string) => state.inputs.find(i => i.componentId === id)?.value ?? 0;
  // Opening simulation starts it: the drawing comes alive without hunting for Run.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    if (!blocked && !state.active && state.status === 'stopped' && doc.components.length) void consumer.run();
    header.current?.querySelector<HTMLButtonElement>('.lec-simulation-actions button:not(:disabled)')?.focus({ preventScroll: true });
  }, [blocked, consumer, doc.components.length, state.active, state.status]);
  // Only long evaluations announce themselves; quick updates keep a calm "Live" status.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (state.status !== 'running') { setSlow(false); return; }
    const win = header.current?.ownerDocument.defaultView; if (!win) return;
    const timer = win.setTimeout(() => setSlow(true), 300); return () => win.clearTimeout(timer);
  }, [state.status]);
  const diagnostics = state.result?.diagnostics ?? [];
  const attention = blocked || state.status === 'invalid' || state.status === 'failed' || (current && diagnostics.length > 0);
  const status = blocked ? 'Save problem' : slow ? 'Updating…' : state.status === 'valid' && diagnostics.length ? 'Live · check signals' : names[state.status];
  const dot = attention ? 'attention' : state.active && state.status !== 'paused' ? 'live' : 'paused';
  const actionsHeading = useId(), inputHeading = useId(), outputHeading = useId(), panelId = useId();
  const hasDevices = groups.inputs.length + groups.probes.length + groups.displays.length > 0;
  return <>
    <div ref={header} className="lec-simulation-actions" role="group" aria-labelledby={actionsHeading}><span id={actionsHeading} hidden>Simulation controls</span>
      <div className="lec-simulation-title"><span className="lec-sim-dot" data-state={dot} aria-hidden="true" /><h2 id={heading}>Digital simulation</h2><span className="lec-simulation-state" role="status">{status}</span></div>
      {!collapsed && <div className="lec-sim-tabs" role="tablist" aria-label="Simulation view">
        <button type="button" role="tab" id={`${panelId}-signals`} aria-selected={tab === 'signals'} aria-controls={`${panelId}-body`} onClick={() => setTab('signals')}>Signals</button>
        <button type="button" role="tab" id={`${panelId}-table`} aria-selected={tab === 'table'} aria-controls={`${panelId}-body`} onClick={() => setTab('table')}><Icon name="table" />Truth table</button>
      </div>}
      <div className="lec-sim-buttons">
        {state.active
          ? <button type="button" className="lec-sim-run" onClick={consumer.stop}><Icon name="pause" />Pause</button>
          : <button type="button" className="lec-primary lec-sim-run" disabled={blocked || !doc.components.length} onClick={() => void consumer.run()}><Icon name="play" />Run</button>}
        <button type="button" disabled={blocked || !groups.inputs.length} onClick={consumer.reset}><Icon name="reset" />Reset</button>
        <button type="button" className="lec-sim-collapse" aria-expanded={!collapsed} aria-controls={`${panelId}-body`} aria-label={collapsed ? 'Show simulation details' : 'Hide simulation details'} onClick={() => setCollapsed(!collapsed)}><Icon name={collapsed ? 'expand' : 'collapse'} /></button>
      </div>
      <button type="button" className="lec-simulation-close" onClick={close} aria-label="Close simulation">×</button>
    </div>
    {collapsed ? <div id={`${panelId}-body`} hidden /> : <div className="lec-simulation-body" id={`${panelId}-body`} role="tabpanel" aria-labelledby={`${panelId}-${tab}`}>
      {blocked && <p className="lec-error">Resolve the file’s save or conflict problem before running simulation.</p>}
      {tab === 'signals' && (hasDevices ? <div className="lec-sim-flow">
        <div className="lec-sim-group" role="group" aria-labelledby={inputHeading}><h3 id={inputHeading}>Inputs</h3><span id={`${inputHeading}-suffix`} hidden>input</span>
          <div className="lec-sim-chips">{groups.inputs.length ? groups.inputs.map(({ component, name }) => <InputChip key={component.id} id={component.id} name={name} suffix={`${inputHeading}-suffix`} value={inputValue(component.id)} disabled={blocked} set={value => consumer.setInput(component.id, value)} />) : <p className="lec-muted">Add a Logic input to drive a signal.</p>}</div>
        </div>
        <span className="lec-sim-arrow" aria-hidden="true">→</span>
        <div className="lec-sim-group" role="group" aria-labelledby={outputHeading}><h3 id={outputHeading}>Outputs</h3><span id={`${outputHeading}-suffix`} hidden>output</span>
          <div className="lec-sim-chips">
            {groups.probes.map(({ component, name }) => { const value = reading?.probes.find(p => p.componentId === component.id)?.value; return <OutputChip key={component.id} id={component.id} name={name} suffix={`${outputHeading}-suffix`} value={value} />; })}
            {groups.displays.map(({ component, name }) => <DisplayChip key={component.id} name={name} segments={reading?.displays.find(d => d.componentId === component.id)?.segments} />)}
            {!groups.probes.length && !groups.displays.length && <p className="lec-muted">Add an Output probe where you want to read a signal.</p>}
          </div>
        </div>
      </div> : <div className="lec-sim-empty"><strong>Build a logic circuit to bring it to life</strong><p>Add Logic inputs, gates and Output probes from Add → Logic, then wire them. Wires light up as signals change.</p></div>)}
      {tab === 'table' && <TruthTable doc={doc} revision={snapshot.revision} inputs={groups.inputs} probes={groups.probes} values={groups.inputs.map(i => inputValue(i.component.id))} disabled={blocked} apply={row => row.forEach((value, i) => consumer.setInput(groups.inputs[i].component.id, value))} />}
      {current || state.status === 'invalid' || state.status === 'failed' ? <Diagnostics diagnostics={diagnostics} doc={doc} inspect={inspect} /> : null}
      {tab === 'signals' && <details className="lec-simulation-help"><summary>How it works</summary>
        <p>Tap a switch on the drawing or here to flip an input. Wires show <span className="lec-sim-key" data-signal="1">1 high</span> <span className="lec-sim-key" data-signal="0">0 low</span> <span className="lec-sim-key" data-signal="X">X unknown</span> <span className="lec-sim-key" data-signal="Z">Z floating</span>. Use an input’s menu to choose X or Z deliberately.</p>
        <p>Supported: Logic input, Output probe, seven-segment display, Buffer, NOT, and AND, NAND, OR, NOR, XOR, XNOR with 2–8 inputs (XOR is odd parity). Electrical devices, custom blocks, clocks and feedback loops cannot run yet.</p>
        <p>Edits re-evaluate automatically. Switch values are temporary: your file and undo history never change. Closing the last simulation panel ends the run.</p>
      </details>}
    </div>}
  </>;
}

function InputChip({ id, name, suffix, value, disabled, set }: { id: string; name: string; suffix: string; value: LogicValue; disabled: boolean; set: (value: LogicValue) => void }) {
  const nameId = `${suffix}-${id}`, on = value === 1;
  return <div className="lec-sim-chip is-input" data-signal={signalName(value)}>
    <button type="button" role="switch" aria-checked={on} aria-labelledby={`${nameId} ${suffix}`} aria-describedby={`${nameId}-value`} disabled={disabled} onClick={() => set(on ? 0 : 1)}>
      <span className="lec-sim-chip-name" id={nameId}>{name}</span>
      <span className="lec-sim-toggle" aria-hidden="true"><span className="lec-sim-knob" /></span>
      <span className="lec-sim-chip-value" id={`${nameId}-value`}>{String(value)}</span>
    </button>
    <span className="lec-sim-more" title="More values"><select aria-label={`${name} value`} value={String(value)} disabled={disabled} onChange={e => set(parseValue(e.target.value))}>{options.map(option => <option key={option.label} value={String(option.value)}>{option.label}</option>)}</select></span>
  </div>;
}
function OutputChip({ id, name, suffix, value }: { id: string; name: string; suffix: string; value?: LogicValue }) {
  const nameId = `${suffix}-${id}`;
  return <div className="lec-sim-chip is-output" data-signal={signalName(value)}>
    <span className="lec-sim-led" aria-hidden="true" />
    <span className="lec-sim-chip-name" id={nameId}>{name}</span>
    <output aria-labelledby={`${nameId} ${suffix}`}>{value === undefined ? '–' : <>{String(value)}<small> · {signalWord(value)}</small></>}</output>
  </div>;
}
function DisplayChip({ name, segments }: { name: string; segments?: readonly LogicValue[] }) {
  const lit = segments?.map(v => v === 1 ? '1' : v === 0 ? '0' : String(v)).join('') ?? '';
  return <div className="lec-sim-chip is-display" role="img" aria-label={`${name} display${segments ? ` segments a to dp: ${lit}` : ': no reading'}`}>
    <span className="lec-sim-chip-name">{name}</span>
    <svg viewBox="-6 -44 52 76" width="20" height="30" aria-hidden="true">{SEGMENTS.map((d, i) => <path key={i} d={d} data-signal={signalName(segments?.[i])} />)}<circle cx="38" cy="28" r="3" data-signal={signalName(segments?.[7])} /></svg>
  </div>;
}
function Diagnostics({ diagnostics, doc, inspect }: { diagnostics: readonly DigitalDiagnostic[]; doc: CircuitDocument; inspect: (ids: string[]) => void }) {
  if (!diagnostics.length) return null;
  return <div className="lec-simulation-diagnostics">{diagnostics.map((diagnostic, i) => <div className="lec-sim-diagnostic" key={`${diagnostic.code}-${i}`}><span aria-hidden="true">⚠</span><p>{diagnostic.message}</p>{diagnostic.objectIds.length > 0 && <button type="button" onClick={() => inspect(diagnostic.objectIds)}>Inspect {diagnostic.objectIds.length === 1 ? doc.components.find(c => c.id === diagnostic.objectIds[0])?.reference || 'object' : `${diagnostic.objectIds.length} objects`}</button>}</div>)}</div>;
}

type TableState = { status: 'idle' | 'busy' } | { status: 'ready'; revision: number; rows: { inputs: LogicValue[]; outputs: LogicValue[] }[] } | { status: 'error'; message: string };
/** Every 0/1 input combination, evaluated by the same engine without touching the live run. */
function TruthTable({ doc, revision, inputs, probes, values, disabled, apply }: { doc: CircuitDocument; revision: number; inputs: Device[]; probes: Device[]; values: LogicValue[]; disabled: boolean; apply: (row: LogicValue[]) => void }) {
  const [table, setTable] = useState<TableState>({ status: 'idle' });
  const host = useRef<HTMLDivElement>(null);
  const usable = inputs.length > 0 && inputs.length <= TRUTH_TABLE_INPUTS && probes.length > 0;
  useEffect(() => {
    const win = host.current?.ownerDocument.defaultView; if (!usable || !win) return;
    const controller = new AbortController(); setTable({ status: 'busy' });
    void (async () => {
      const rows: { inputs: LogicValue[]; outputs: LogicValue[] }[] = [];
      for (let mask = 0; mask < 1 << inputs.length; mask++) {
        const row = inputs.map((_, i): LogicValue => (mask >> (inputs.length - 1 - i)) & 1 ? 1 : 0);
        const result = await runDigital({ sessionId: 'truth-table', runId: mask, revision, document: doc, inputs: inputs.map((input, i) => ({ componentId: input.component.id, value: row[i] })) }, registry, controller.signal, async () => {});
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
    {message ? <p className="lec-muted">{message}</p> : table.status !== 'ready' || table.revision !== revision ? <p className="lec-muted">Calculating every combination…</p> : <>
      <p className="lec-sim-table-hint">Every 0/1 combination of the inputs. Choose a row to apply it.</p>
      <div className="lec-sim-table-scroll" data-long={table.rows.length > 16 || undefined}><table className="lec-sim-table">
        <thead><tr>{inputs.map((input, i) => <th key={input.component.id} scope="col" className={i === inputs.length - 1 ? 'is-last-input' : undefined}>{input.name}</th>)}{probes.map(probe => <th key={probe.component.id} scope="col" className="is-output">{probe.name}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, r) => {
          const active = row.inputs.every((value, i) => value === values[i]), label = inputs.map((input, i) => `${input.name} ${row.inputs[i]}`).join(', ');
          return <tr key={r} className={active ? 'is-current' : undefined} aria-current={active || undefined}>
            {row.inputs.map((value, i) => <td key={i} className={i === inputs.length - 1 ? 'is-last-input' : undefined} data-signal={signalName(value)}>{i === 0 && <button type="button" className="lec-sim-row-button" disabled={disabled} aria-label={`Apply ${label}`} onClick={() => apply(row.inputs)} />}{String(value)}</td>)}
            {row.outputs.map((value, i) => <td key={`o${i}`} className="is-output" data-signal={signalName(value)}>{String(value)}</td>)}
          </tr>;
        })}</tbody>
      </table></div>
    </>}
  </div>;
}
