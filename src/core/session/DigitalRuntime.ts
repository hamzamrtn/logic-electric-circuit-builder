import { clone } from '../model/document';
import { type DigitalCapability, type DigitalRequest, type DigitalResult } from '../topology/digital';
import { DocumentSession } from './DocumentSession';

export interface DigitalState { status: 'stopped' | 'running' | 'stale' | 'paused' | DigitalResult['status']; result?: DigitalResult; }
export type DigitalExecutor = (request: DigitalRequest, registry: readonly DigitalCapability[], signal: AbortSignal) => Promise<DigitalResult>;
let serial = 0;
/** Experimental session owner; consumers must share this owner and dispose it on close. */
export class DigitalRuntime {
  private state: DigitalState = { status: 'stopped' };
  private listeners = new Set<() => void>();
  private controller?: AbortController;
  private generation = 0;
  private documentRevision: number;
  private disposed = false;
  private unsubscribe: () => void;
  private readonly sessionId = `digital-session-${++serial}`;
  private readonly registry: DigitalCapability[];
  constructor(private session: DocumentSession, registry: readonly DigitalCapability[], private execute: DigitalExecutor) {
    this.registry = clone(registry) as DigitalCapability[];
    this.documentRevision = session.getSnapshot().revision;
    this.unsubscribe = session.subscribe(this.synchronize);
  }
  /** Invalidate older work once; return whether a stale-state notification was emitted. */
  synchronize = (): boolean => {
    const revision = this.session.getSnapshot().revision;
    if (revision === this.documentRevision) return false;
    this.documentRevision = revision; this.cancel();
    if (this.state.status === 'stopped') return false;
    this.publish({ status: 'stale' }); return true;
  };
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: DigitalState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private cancel() { this.generation++; this.controller?.abort(); this.controller = undefined; }
  async run(inputs: DigitalRequest['inputs']): Promise<void> {
    if (this.disposed) return;
    this.cancel();
    const runId = this.generation, snapshot = this.session.getSnapshot(), controller = new AbortController(); this.controller = controller;
    const request: DigitalRequest = { sessionId: this.sessionId, runId, revision: snapshot.revision, document: snapshot.document, inputs: inputs.map(input => ({ ...input })) };
    this.documentRevision = snapshot.revision;
    this.publish({ status: 'running' });
    let result: DigitalResult;
    try { result = await this.execute(request, this.registry, controller.signal); }
    catch { result = { sessionId: this.sessionId, runId, revision: snapshot.revision, engine: 'digital-d0-v1', status: 'failed', models: [], nets: [], probes: [], displays: [], diagnostics: [{ code: 'execution', message: 'Simulation failed. Stop and retry.', objectIds: [] }], work: 0 }; }
    if (this.disposed || controller.signal.aborted || runId !== this.generation || snapshot.revision !== this.session.getSnapshot().revision) return;
    this.controller = undefined;
    if (result.sessionId !== this.sessionId || result.runId !== runId || result.revision !== snapshot.revision || result.engine !== 'digital-d0-v1') {
      this.publish({ status: 'failed' }); return;
    }
    this.publish({ status: result.status, result });
  }
  pause() { if (!this.disposed && this.state.status !== 'stopped') { this.cancel(); this.publish({ status: 'paused' }); } }
  stop() { if (!this.disposed) { this.cancel(); this.publish({ status: 'stopped' }); } }
  dispose() { if (this.disposed) return; this.disposed = true; this.cancel(); this.publish({ status: 'stopped' }); this.unsubscribe(); this.listeners.clear(); }
}
