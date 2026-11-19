import { clone } from '../model/document';
import { DIGITAL_LIMITS, identifyDigitalModels, runDigital, type DigitalCapability, type DigitalRequest, type LogicValue } from '../topology/digital';
import { DocumentSession } from './DocumentSession';
import { DigitalRuntime, type DigitalState } from './DigitalRuntime';

/** `inputs` lists every supported Logic input with its effective value (0 unless changed). */
export interface SharedDigitalState extends DigitalState { inputs: DigitalRequest['inputs']; active: boolean; }
/** A Logic input behaves like a switch that starts off. X and Z remain explicit choices. */
export const DEFAULT_INPUT: LogicValue = 0;
export interface DigitalConsumer {
  getSnapshot: () => SharedDigitalState;
  subscribe: (listener: () => void) => () => void;
  run: () => Promise<void>;
  setInput: (componentId: string, value: LogicValue) => void;
  stop: () => void;
  reset: () => void;
  setVisible: (visible: boolean) => void;
  release: () => void;
}
export type DigitalSchedule = (signal: AbortSignal) => Promise<void>;
interface Consumer { visible: boolean; schedule: DigitalSchedule; listeners: Set<() => void>; }
interface Entry {
  runtime: DigitalRuntime; consumers: Set<Consumer>; inputs: Map<string, LogicValue>; inputIds: Set<string>;
  state: SharedDigitalState; active: boolean; revision: number; unsubscribe: () => void;
}
const stopped: SharedDigitalState = { status: 'stopped', inputs: [], active: false };
/** One owner per live session. Reading previews never acquire a simulation consumer. */
export class DigitalSessions {
  private entries = new Map<DocumentSession, Entry>();
  private disposed = false;
  private registry: DigitalCapability[];
  constructor(registry: readonly DigitalCapability[], private engine = runDigital) { this.registry = clone(registry) as DigitalCapability[]; }
  get size() { return this.entries.size; }
  private publish(entry: Entry) {
    const runtime = entry.runtime.getSnapshot();
    // Invalid results stay live so the next correcting edit re-evaluates automatically.
    if (runtime.status === 'stopped' || runtime.status === 'failed') entry.active = false;
    entry.state = { ...runtime, inputs: this.effectiveInputs(entry), active: entry.active };
    for (const consumer of entry.consumers) for (const listener of consumer.listeners) listener();
  }
  private refreshDocument(entry: Entry, session: DocumentSession): boolean {
    const { document, revision } = session.getSnapshot();
    if (entry.revision === revision) return false;
    // Prepare shared fields without notifying observers before a caller commits its intent.
    entry.revision = revision;
    if (document.components.length > DIGITAL_LIMITS.components || document.definitions.length > DIGITAL_LIMITS.definitions) { entry.inputIds.clear(); entry.inputs.clear(); }
    else {
      const models = identifyDigitalModels(document.definitions, this.registry);
      entry.inputIds = new Set(document.components.filter(c => models.get(c.definitionId) === 'input-v1').map(c => c.id));
      for (const id of entry.inputs.keys()) if (!entry.inputIds.has(id)) entry.inputs.delete(id);
    }
    return true;
  }
  private notifyDocument(entry: Entry) { if (!entry.runtime.synchronize()) this.publish(entry); }
  private effectiveInputs(entry: Entry) { return [...entry.inputIds].map(componentId => ({ componentId, value: entry.inputs.get(componentId) ?? DEFAULT_INPUT })); }
  private launch(entry: Entry) { return entry.runtime.run(this.effectiveInputs(entry)); }
  /** A live simulation follows committed edits: recompute when visible, otherwise wait paused. */
  private follow(entry: Entry) {
    if ([...entry.consumers].some(c => c.visible)) void this.launch(entry); else entry.runtime.pause();
  }
  private visibility(entry: Entry) {
    // Abort a pending timer before its owning window can disappear, then restart on a live consumer.
    if (entry.active && (entry.runtime.getSnapshot().status === 'running' || ![...entry.consumers].some(c => c.visible))) entry.runtime.pause();
    if (entry.active && entry.runtime.getSnapshot().status === 'paused' && [...entry.consumers].some(c => c.visible)) void this.launch(entry);
  }
  acquire(session: DocumentSession, schedule: DigitalSchedule, visible = true): DigitalConsumer {
    if (this.disposed) throw new Error('Simulation sessions are closed');
    let entry = this.entries.get(session);
    if (!entry) {
      const consumers = new Set<Consumer>();
      const runtime = new DigitalRuntime(session, this.registry, (request, registry, signal) => this.engine(request, registry, signal, async () => {
        const owner = [...consumers].find(c => c.visible);
        if (!owner) throw new Error('No visible simulation consumer');
        await owner.schedule(signal);
      }));
      entry = { runtime, consumers, inputs: new Map(), inputIds: new Set(), state: stopped, active: false, revision: -1, unsubscribe: () => {} };
      const record = entry;
      this.refreshDocument(record, session); record.state = { ...stopped, inputs: this.effectiveInputs(record) };
      const offRuntime = runtime.subscribe(() => {
        if (this.refreshDocument(record, session) && runtime.synchronize()) return;
        if (record.active && runtime.getSnapshot().status === 'stale') { this.follow(record); return; }
        this.publish(record);
      });
      const offDocument = session.subscribe(() => { if (this.refreshDocument(record, session)) this.notifyDocument(record); });
      record.unsubscribe = () => { offRuntime(); offDocument(); };
      this.entries.set(session, record);
    }
    const record = entry, consumer: Consumer = { visible, schedule, listeners: new Set() }; record.consumers.add(consumer);
    let released = false;
    const live = () => !released && !this.disposed;
    const canRun = () => live() && consumer.visible;
    this.visibility(record);
    return {
      getSnapshot: () => live() ? record.state : stopped,
      subscribe: listener => { if (!live()) return () => {}; consumer.listeners.add(listener); return () => { consumer.listeners.delete(listener); }; },
      run: async () => { if (!canRun()) return; this.refreshDocument(record, session); record.active = true; await this.launch(record); },
      setInput: (componentId, value) => {
        if (!canRun()) return;
        const changed = this.refreshDocument(record, session);
        if (!record.inputIds.has(componentId) || ![0, 1, 'X', 'Z'].includes(value)) { if (changed) this.notifyDocument(record); return; }
        record.inputs.set(componentId, value);
        if (record.active) void this.launch(record); else this.notifyDocument(record);
      },
      stop: () => { if (live()) { record.active = false; record.runtime.stop(); } },
      reset: () => {
        if (!live()) return; this.refreshDocument(record, session); record.inputs.clear();
        if (record.active) this.follow(record); else this.publish(record);
      },
      setVisible: next => { if (!live() || consumer.visible === next) return; consumer.visible = next; this.visibility(record); },
      release: () => {
        if (!live()) return; released = true; consumer.listeners.clear(); record.consumers.delete(consumer);
        if (!record.consumers.size) { this.entries.delete(session); record.unsubscribe(); record.active = false; record.runtime.dispose(); record.inputs.clear(); }
        else this.visibility(record);
      },
    };
  }
  /** Host conflicts/deletion must also cancel runs that have no new document revision. */
  stop(session: DocumentSession) { const entry = this.entries.get(session); if (entry) { entry.active = false; entry.runtime.stop(); } }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    for (const entry of this.entries.values()) { entry.active = false; entry.inputs.clear(); entry.runtime.dispose(); entry.unsubscribe(); entry.consumers.clear(); }
    this.entries.clear();
  }
}
