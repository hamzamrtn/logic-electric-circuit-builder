import { type CircuitDocument, assertGraph, clone, documentSchema, parseDocument, serializeDocument } from '../model/document';
export interface Snapshot { document: CircuitDocument; revision: number; canUndo: boolean; canRedo: boolean; lastAction: string; }
interface HistoryEntry { before: CircuitDocument; after: CircuitDocument; label: string; bytes: number; }
export class DocumentSession {
  private listeners = new Set<() => void>();
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private snapshot: Snapshot;
  private lastCoalesce?: { key: string; time: number };
  constructor(document: CircuitDocument) { assertGraph(document); this.snapshot = { document: clone(document), revision: 0, canUndo: false, canRedo: false, lastAction: 'Opened' }; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(document: CircuitDocument, label: string) {
    this.snapshot = { document, revision: this.snapshot.revision + 1, canUndo: !!this.undoStack.length, canRedo: !!this.redoStack.length, lastAction: label };
    this.listeners.forEach(l => l());
  }
  edit(label: string, operation: (document: CircuitDocument) => void, coalesceKey?: string) {
    const before = this.snapshot.document, after = clone(before); operation(after);
    documentSchema.parse(after); assertGraph(after);
    const old = serializeDocument(before), next = serializeDocument(after);
    if (old === next) return;
    const last = this.undoStack.at(-1), now = Date.now();
    if (coalesceKey && this.lastCoalesce?.key === coalesceKey && now - this.lastCoalesce.time < 400 && last?.after === before) { last.after = after; last.bytes = serializeDocument(last.before).length + next.length; }
    else this.undoStack.push({ before, after, label, bytes: old.length + next.length });
    this.lastCoalesce = coalesceKey ? { key: coalesceKey, time: now } : undefined; this.redoStack = [];
    while (this.undoStack.length > 100 || this.undoStack.length > 1 && this.undoStack.reduce((n, e) => n + e.bytes, 0) > 8 * 1024 * 1024) this.undoStack.shift();
    this.publish(after, label);
  }
  undo() { this.lastCoalesce = undefined; const e = this.undoStack.pop(); if (e) { this.redoStack.push(e); this.publish(e.before, `Undo ${e.label}`); } }
  redo() { this.lastCoalesce = undefined; const e = this.redoStack.pop(); if (e) { this.undoStack.push(e); this.publish(e.after, `Redo ${e.label}`); } }
  replaceRaw(raw: string) { const doc = parseDocument(raw); this.undoStack = []; this.redoStack = []; this.lastCoalesce = undefined; this.publish(doc, 'Reloaded external version'); }
}
