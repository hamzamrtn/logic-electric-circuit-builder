import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Point } from '../../core/model/document';

interface PointFeedback { point: Point; kind: 'snap' | 'connection'; key: number; until: number; }
interface Feedback { parts: Map<string, number>; wires: Map<string, { key: number; until: number }>; points: PointFeedback[]; }
const empty = (): Feedback => ({ parts: new Map(), wires: new Map(), points: [] });
function prune(value: Feedback, now: number): Feedback {
  return {
    parts: [...value.parts.values()].some(until => until <= now) ? new Map([...value.parts].filter(([, until]) => until > now)) : value.parts,
    wires: [...value.wires.values()].some(pulse => pulse.until <= now) ? new Map([...value.wires].filter(([, pulse]) => pulse.until > now)) : value.wires,
    points: value.points.filter(point => point.until > now),
  };
}
export function useInteractionFeedback(owner: RefObject<HTMLElement>) {
  const [state, setState] = useState<Feedback>(empty), current = useRef(state), sequence = useRef(0), lastSnap = useRef('');
  const timer = useRef<{ win: Window; id: number }>();
  const schedule = useCallback(function arm(win: Window): void {
    if (timer.current) timer.current.win.clearTimeout(timer.current.id);
    timer.current = undefined;
    const deadlines = [...current.current.parts.values(), ...[...current.current.wires.values()].map(pulse => pulse.until), ...current.current.points.map(point => point.until)];
    if (!deadlines.length) return;
    timer.current = { win, id: win.setTimeout(() => { current.current = prune(current.current, win.performance.now()); setState(current.current); arm(win); }, Math.max(1, Math.min(...deadlines) - win.performance.now())) };
  }, []);
  const clear = useCallback(() => { if (timer.current) timer.current.win.clearTimeout(timer.current.id); timer.current = undefined; lastSnap.current = ''; current.current = empty(); setState(current.current); }, []);
  const emit = useCallback((update: (previous: Feedback, key: number, until: number) => Feedback) => {
    const win = owner.current?.ownerDocument.defaultView; if (!win) return;
    const now = win.performance.now(); current.current = update(prune(current.current, now), ++sequence.current, now + 240); setState(current.current); schedule(win);
  }, [owner, schedule]);
  const placed = useCallback((id: string) => emit((previous, _key, until) => ({ ...previous, parts: new Map([...previous.parts, [id, until] as const].slice(-8)), points: [] })), [emit]);
  const connected = useCallback((id: string | undefined, points: Point[]) => emit((previous, key, until) => ({
    ...previous, wires: id ? new Map([...previous.wires, [id, { key, until }] as const].slice(-8)) : previous.wires,
    points: points.slice(-4).map((point, index) => ({ point, key: key * 4 + index, kind: 'connection', until })),
  })), [emit]);
  const snapped = useCallback((point: Point) => {
    const value = `${point.x},${point.y}`; if (value === lastSnap.current) return; lastSnap.current = value;
    emit((previous, key, until) => ({ ...previous, points: [{ point, key: key * 4, kind: 'snap', until }] }));
  }, [emit]);
  const parts = useMemo(() => new Set(state.parts.keys()), [state.parts]), wires = useMemo(() => new Map([...state.wires].map(([id, pulse]) => [id, pulse.key])), [state.wires]);
  useEffect(() => () => { if (timer.current) timer.current.win.clearTimeout(timer.current.id); }, []);
  return { feedback: { parts, wires, points: state.points }, placed, connected, snapped, clear };
}

export function useSelectionPresence(selection: Set<string>, owner: RefObject<HTMLElement>) {
  const [present, setPresent] = useState(() => new Set(selection));
  useEffect(() => {
    const win = owner.current?.ownerDocument.defaultView; if (!win) return;
    setPresent(previous => new Set([...previous, ...selection]));
    const timer = win.setTimeout(() => setPresent(new Set(selection)), 112);
    return () => win.clearTimeout(timer);
  }, [selection, owner]);
  return present;
}
