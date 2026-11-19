import { useEffect, useMemo, useState } from 'react';
import type { CircuitDocument } from '../../core/model/document';
import { analyzeOperatingPoint, analyzeTransient, type OperatingPoint, type Waveforms } from '../../core/analog/engine';
import type { AnalogCapability } from '../../core/analog/models';
import { simulationTurn } from './schedule';

export type ElectricalRun<T> = { status: 'idle' } | { status: 'busy'; previous?: T } | { status: 'done'; revision: number; result: T };
/**
 * Live electrical analysis: the operating point follows every committed edit and switch change;
 * the transient run recomputes only while its view is open. Both are cancelled when superseded.
 */
export function useElectrical({ owner, document, revision, live, switches, transient, duration, registry, digital }: {
  owner?: Window; document: CircuitDocument; revision: number; live: boolean; switches: ReadonlyMap<string, boolean>;
  transient: boolean; duration: number; registry: readonly AnalogCapability[]; digital: (definitionId: string) => boolean;
}) {
  const [op, setOp] = useState<ElectricalRun<OperatingPoint>>({ status: 'idle' });
  const [waves, setWaves] = useState<ElectricalRun<Waveforms>>({ status: 'idle' });
  const switchKey = useMemo(() => [...switches].map(([id, on]) => `${id}:${on ? 1 : 0}`).join(','), [switches]);
  useEffect(() => {
    if (!live || !owner) { setOp({ status: 'idle' }); return; }
    const controller = new AbortController();
    setOp(previous => ({ status: 'busy', previous: previous.status === 'done' ? previous.result : previous.status === 'busy' ? previous.previous : undefined }));
    void analyzeOperatingPoint({ document, switches }, registry, digital, controller.signal, () => simulationTurn(owner, controller.signal)).then(result => {
      if (!controller.signal.aborted) setOp({ status: 'done', revision, result });
    });
    return () => controller.abort();
    // switchKey stands for the switch map's contents.
  }, [live, owner, document, revision, switchKey, registry, digital]);
  useEffect(() => {
    if (!live || !owner || !transient) { setWaves(current => current.status === 'idle' ? current : { status: 'idle' }); return; }
    const controller = new AbortController();
    setWaves(previous => ({ status: 'busy', previous: previous.status === 'done' ? previous.result : previous.status === 'busy' ? previous.previous : undefined }));
    // Let the operating point and the drawing update first.
    const timer = owner.setTimeout(() => {
      void analyzeTransient({ document, switches, duration }, registry, digital, controller.signal, () => simulationTurn(owner, controller.signal)).then(result => {
        if (!controller.signal.aborted) setWaves({ status: 'done', revision, result });
      });
    }, 60);
    return () => { owner.clearTimeout(timer); controller.abort(); };
  }, [live, owner, document, revision, switchKey, transient, duration, registry, digital]);
  return { op, waves };
}
