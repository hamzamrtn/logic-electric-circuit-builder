import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { formatQuantity } from '../../core/analog/units';

export interface Trace { id: string; label: string; unit: 'V' | 'A'; data: Float64Array; slot: number; }
interface Stats { min: number; max: number; pp: number; avg: number; rms: number; frequency?: number; }
function stats(time: Float64Array, data: Float64Array): Stats {
  let min = Infinity, max = -Infinity, sum = 0, square = 0;
  for (let i = 0; i < data.length; i++) { const v = data[i]; if (v < min) min = v; if (v > max) max = v; }
  // Trapezoidal time averages stay correct for any step size.
  const span = time[time.length - 1] - time[0];
  for (let i = 1; i < data.length; i++) { const dt = time[i] - time[i - 1]; sum += (data[i] + data[i - 1]) / 2 * dt; square += (data[i] ** 2 + data[i - 1] ** 2) / 2 * dt; }
  const avg = span > 0 ? sum / span : data[0] ?? 0, rms = span > 0 ? Math.sqrt(square / span) : Math.abs(data[0] ?? 0);
  // Frequency from rising crossings of the mean, with 5 % hysteresis against numerical ripple.
  let frequency: number | undefined; const band = (max - min) * 0.05, crossings: number[] = [];
  if (max - min > 1e-12) { let armed = false; for (let i = 0; i < data.length; i++) { if (data[i] < avg - band) armed = true; else if (armed && data[i] > avg + band) { crossings.push(time[i]); armed = false; } } }
  if (crossings.length >= 3) frequency = (crossings.length - 1) / (crossings[crossings.length - 1] - crossings[0]);
  return { min, max, pp: max - min, avg, rms, frequency };
}
function ticks(min: number, max: number, count: number): number[] {
  const range = max - min; if (!(range > 0)) return [min];
  const raw = range / count, decade = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map(m => m * decade).find(s => s >= raw) ?? raw;
  const out: number[] = []; for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}
function extent(traces: Trace[]): [number, number] {
  let min = Infinity, max = -Infinity;
  for (const t of traces) for (let i = 0; i < t.data.length; i++) { const v = t.data[i]; if (v < min) min = v; if (v > max) max = v; }
  if (!Number.isFinite(min)) return [-1, 1];
  if (max - min < 1e-12) { const pad = Math.max(Math.abs(max) * 0.1, max === 0 ? 1 : 1e-9); return [min - pad, max + pad]; }
  const pad = (max - min) * 0.08; return [min - pad, max + pad];
}
const nearest = (time: Float64Array, t: number) => { let lo = 0, hi = time.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (time[mid] < t) lo = mid; else hi = mid; } return t - time[lo] < time[hi] - t ? lo : hi; };
const MARGIN = { left: 58, right: 18, top: 18, bottom: 24 };

/** Oscilloscope-style plot: one panel per unit (never a dual axis), shared time axis, hover crosshair and two cursors. */
export function Scope({ time, duration, traces, hidden, onToggle, onRemove, busy }: { time: Float64Array; duration: number; traces: Trace[]; hidden: ReadonlySet<string>; onToggle: (id: string) => void; onRemove?: (id: string) => void; busy: boolean }) {
  const host = useRef<HTMLDivElement>(null), [size, setSize] = useState({ width: 600, height: 240 });
  const [hover, setHover] = useState<number>(), [cursors, setCursors] = useState<number[]>([]);
  useLayoutEffect(() => {
    const element = host.current, win = element?.ownerDocument.defaultView; if (!element || !win) return;
    const measure = () => { const r = element.getBoundingClientRect(); if (r.width && r.height) setSize({ width: r.width, height: r.height }); };
    measure(); const observer = new win.ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
  }, []);
  const visible = traces.filter(t => !hidden.has(t.id));
  const panels = (['V', 'A'] as const).map(unit => ({ unit, traces: visible.filter(t => t.unit === unit) })).filter(p => p.traces.length);
  const measures = useMemo(() => new Map(traces.map(t => [t.id, stats(time, t.data)])), [time, traces]);
  const plotWidth = Math.max(40, size.width - MARGIN.left - MARGIN.right);
  const panelHeight = panels.length ? Math.max(60, (size.height - MARGIN.bottom - MARGIN.top * panels.length) / panels.length) : 0;
  const x = (t: number) => MARGIN.left + t / duration * plotWidth;
  const at = (event: ReactMouseEvent<SVGSVGElement>) => { const r = event.currentTarget.getBoundingClientRect(); return Math.min(duration, Math.max(0, (event.clientX - r.left - MARGIN.left) / plotWidth * duration)); };
  const timeTicks = ticks(0, duration, Math.max(2, Math.floor(plotWidth / 90)));
  const readAt = (t: number) => nearest(time, t);
  const pair = cursors.length === 2 ? [Math.min(...cursors), Math.max(...cursors)] : undefined;
  return <div className="lec-scope">
    <div className="lec-scope-legend" role="list" aria-label="Traces">
      {traces.map(t => <span role="listitem" key={t.id} className={`lec-scope-chip${hidden.has(t.id) ? ' is-hidden' : ''}`}>
        <button type="button" aria-pressed={!hidden.has(t.id)} onClick={() => onToggle(t.id)} title={hidden.has(t.id) ? 'Show trace' : 'Hide trace'}><i style={{ background: `var(--lec-trace-${t.slot})` }} />{t.label}</button>
        {onRemove && <button type="button" className="lec-scope-remove" aria-label={`Remove ${t.label}`} onClick={() => onRemove(t.id)}>×</button>}
      </span>)}
      <span className="lec-scope-meta">{busy ? 'Calculating…' : `${formatQuantity(duration, 's')} · ${time.length - 1} steps`}</span>
      {cursors.length > 0 && <button type="button" className="lec-scope-clear" onClick={() => setCursors([])}>Clear cursors</button>}
    </div>
    <div className="lec-scope-body">
      <div className="lec-scope-plot" ref={host}>
        <svg width={size.width} height={size.height} role="img" aria-label={`Transient plot over ${formatQuantity(duration, 's')}`}
          onPointerMove={e => setHover(at(e))} onPointerLeave={() => setHover(undefined)}
          onClick={e => { const t = time[readAt(at(e))]; setCursors(c => c.length >= 2 ? [t] : [...c, t]); }}>
          {panels.map((panel, index) => {
            const top = MARGIN.top + index * (panelHeight + MARGIN.top), [lo, hi] = extent(panel.traces), y = (v: number) => top + (hi - v) / (hi - lo) * panelHeight;
            const valueTicks = ticks(lo, hi, Math.max(2, Math.floor(panelHeight / 36)));
            return <g key={panel.unit} className="lec-scope-panel">
              <rect className="lec-scope-frame" x={MARGIN.left} y={top} width={plotWidth} height={panelHeight} />
              {valueTicks.map(v => <g key={v}><line className={v === 0 ? 'lec-scope-zero' : 'lec-scope-grid'} x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={y(v)} y2={y(v)} /><text className="lec-scope-tick" x={MARGIN.left - 6} y={y(v) + 3.5} textAnchor="end">{formatQuantity(v, panel.unit, 3)}</text></g>)}
              {timeTicks.map(t => <line key={t} className="lec-scope-grid" x1={x(t)} x2={x(t)} y1={top} y2={top + panelHeight} />)}
              {panel.traces.map(t => { let d = ''; for (let i = 0; i < t.data.length; i++) d += `${i ? 'L' : 'M'}${x(time[i]).toFixed(1)} ${y(t.data[i]).toFixed(1)}`; return <path key={t.id} d={d} className="lec-scope-line" style={{ stroke: `var(--lec-trace-${t.slot})` }} />; })}
              {hover !== undefined && panel.traces.map(t => <circle key={t.id} className="lec-scope-dot" cx={x(time[readAt(hover)])} cy={y(t.data[readAt(hover)])} r="3.5" style={{ fill: `var(--lec-trace-${t.slot})` }} />)}
              <text className="lec-scope-unit" x={MARGIN.left} y={top - 6}>{panel.unit === 'V' ? 'Voltage' : 'Current'}</text>
            </g>;
          })}
          {panels.length > 0 && <g className="lec-scope-axis">{timeTicks.map((t, i) => <text key={t} className="lec-scope-tick" x={x(t)} y={size.height - 7} textAnchor={i === 0 ? 'start' : x(t) > MARGIN.left + plotWidth - 30 ? 'end' : 'middle'}>{formatQuantity(t, 's', 3)}</text>)}</g>}
          {cursors.map((t, i) => <g key={i} className="lec-scope-cursor"><line x1={x(t)} x2={x(t)} y1={MARGIN.top} y2={size.height - MARGIN.bottom} /><text x={x(t) + 4} y={MARGIN.top + 10}>{i ? 'B' : 'A'}</text></g>)}
          {hover !== undefined && <line className="lec-scope-crosshair" x1={x(hover)} x2={x(hover)} y1={MARGIN.top} y2={size.height - MARGIN.bottom} />}
          {!panels.length && <text className="lec-scope-empty" x={size.width / 2} y={size.height / 2} textAnchor="middle">{traces.length ? 'All traces are hidden.' : 'Choose Probe, then click a wire or part to plot it.'}</text>}
        </svg>
        {hover !== undefined && visible.length > 0 && <div className="lec-scope-tooltip" style={{ left: Math.min(x(hover) + 12, size.width - 170) }}>
          <strong>{formatQuantity(time[readAt(hover)], 's')}</strong>
          {visible.map(t => <span key={t.id}><i style={{ background: `var(--lec-trace-${t.slot})` }} />{t.label}<b>{formatQuantity(t.data[readAt(hover)], t.unit)}</b></span>)}
        </div>}
      </div>
      <table className="lec-scope-measures">
        <thead><tr><th scope="col">Trace</th>{pair && <><th scope="col">@A</th><th scope="col">@B</th><th scope="col">Δ</th></>}<th scope="col">Min</th><th scope="col">Max</th><th scope="col">Pk-pk</th><th scope="col">Avg</th><th scope="col">RMS</th><th scope="col">Freq</th></tr></thead>
        <tbody>{traces.map(t => { const s = measures.get(t.id)!, a = pair ? t.data[readAt(pair[0])] : 0, b = pair ? t.data[readAt(pair[1])] : 0; return <tr key={t.id} className={hidden.has(t.id) ? 'is-hidden' : undefined}>
          <th scope="row"><i style={{ background: `var(--lec-trace-${t.slot})` }} />{t.label}</th>
          {pair && <><td>{formatQuantity(a, t.unit)}</td><td>{formatQuantity(b, t.unit)}</td><td>{formatQuantity(b - a, t.unit)}</td></>}
          <td>{formatQuantity(s.min, t.unit)}</td><td>{formatQuantity(s.max, t.unit)}</td><td>{formatQuantity(s.pp, t.unit)}</td><td>{formatQuantity(s.avg, t.unit)}</td><td>{formatQuantity(s.rms, t.unit)}</td><td>{s.frequency ? formatQuantity(s.frequency, 'Hz') : '—'}</td>
        </tr>; })}
        {pair && <tr className="lec-scope-delta"><th scope="row">Δt</th><td colSpan={9}>{formatQuantity(pair[1] - pair[0], 's')}{pair[1] > pair[0] ? ` · 1/Δt ${formatQuantity(1 / (pair[1] - pair[0]), 'Hz')}` : ''}</td></tr>}
        </tbody>
      </table>
    </div>
  </div>;
}
