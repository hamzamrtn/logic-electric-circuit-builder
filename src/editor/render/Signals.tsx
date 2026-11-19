import { memo } from 'react';
import { type CircuitDocument, type Component, getDefinition } from '../../core/model/document';
import { transform } from '../../core/geometry/geometry';
import type { LogicValue } from '../../core/topology/digital';
import { componentTransform } from './drawing';

/** Display-only simulation values. They never become document state. */
export interface SceneSignals {
  wires: ReadonlyMap<string, LogicValue>;
  nodes: ReadonlyMap<string, LogicValue>;
  /** componentId → pinId → value */
  pins: ReadonlyMap<string, ReadonlyMap<string, LogicValue>>;
  inputs: ReadonlyMap<string, LogicValue>;
  probes: ReadonlyMap<string, LogicValue>;
  displays: ReadonlyMap<string, readonly LogicValue[]>;
  electrical?: ElectricalSignals;
}
/** Electrical overlay: voltage-tinted wires, one voltage tag per net, switch contacts and probe markers. */
export interface ElectricalSignals {
  wireColor: ReadonlyMap<string, string>;
  tags: { netId: string; x: number; y: number; vertical: boolean; text: string; slot?: number }[];
  switches: ReadonlyMap<string, boolean>;
  /** probe target (net or component id) → scope trace slot */
  probes: ReadonlyMap<string, number>;
  live: boolean;
}
export const signalName = (value: LogicValue | undefined) => value === undefined ? 'none' : String(value);
export const signalWord = (value: LogicValue) => value === 1 ? 'High' : value === 0 ? 'Low' : value === 'X' ? 'Unknown' : 'Floating';
/** Segment order matches the display's a…g, dp input pins. */
export const SEGMENTS = ['M 4 -38 H 28', 'M 30 -34 V -10', 'M 30 -2 V 22', 'M 4 26 H 28', 'M 0 -2 V 22', 'M 0 -34 V -10', 'M 4 -6 H 28'];

const hitWidth = (zoom: number) => Math.max(64, Math.min(84, 48 / zoom));
const hitHeight = (zoom: number) => Math.max(40, Math.min(58, 44 / zoom));
function InputSwitch({ component: c, value, zoom }: { component: Component; value: LogicValue; zoom: number }) {
  const center = transform({ x: -10, y: -4 }, c), on = value === 1, known = value === 0 || value === 1;
  const name = c.reference || 'Logic input';
  return <g className="lec-sim-switch" data-sim-input={c.id} data-signal={signalName(value)} transform={`translate(${center.x} ${center.y})`}>
    <title>{`${name} is ${value} · ${signalWord(value)}. Tap to switch ${on ? 'off' : 'on'}.`}</title>
    {/* Keep a practical touch target when zoomed out, without covering the part's whole body. */}
    <rect className="lec-sim-switch-hit" x={-hitWidth(zoom) / 2} y={-hitHeight(zoom) / 2} width={hitWidth(zoom)} height={hitHeight(zoom)} rx="12" />
    <rect className="lec-sim-switch-track" x="-22" y="-11" width="44" height="22" rx="11" />
    <circle className="lec-sim-switch-knob" cx={known ? (on ? 11 : -11) : 0} cy="0" r="8" />
    <text className="lec-sim-switch-text" x={known ? (on ? -9 : 9) : 0} y="4" textAnchor="middle">{known ? String(value) : ''}</text>
    {!known && <text className="lec-sim-switch-text is-unknown" x="0" y="4" textAnchor="middle">{String(value)}</text>}
  </g>;
}
function ProbeLamp({ component: c, value }: { component: Component; value: LogicValue }) {
  const center = transform({ x: 10, y: -4 }, c);
  return <g className="lec-sim-lamp" data-signal={signalName(value)} transform={`translate(${center.x} ${center.y})`} pointerEvents="none" aria-hidden="true">
    <circle className="lec-sim-lamp-glow" r="21" />
    <circle className="lec-sim-lamp-body" r="13" />
    <text className="lec-sim-lamp-text" y="4.5" textAnchor="middle">{String(value)}</text>
  </g>;
}
function DisplaySegments({ component: c, segments }: { component: Component; segments: readonly LogicValue[] }) {
  return <g transform={componentTransform(c)} className="lec-sim-segments" pointerEvents="none" aria-hidden="true">
    {SEGMENTS.map((d, i) => <path key={i} d={d} data-signal={signalName(segments[i])} />)}
    <circle cx="38" cy="28" r="2.5" data-signal={signalName(segments[7])} />
  </g>;
}
function SwitchContact({ component: c, closed, model }: { component: Component; closed: boolean; model: string }) {
  // The symbol draws an open contact; a closed one gets a bridging bar, an opened NC button a gap.
  return <g transform={componentTransform(c)} className={`lec-el-switch${closed ? ' is-closed' : ''}`} data-el-switch={c.id} pointerEvents="none" aria-hidden="true">
    {model === 'push-nc' ? (!closed && <rect x="-6" y="-3" width="12" height="6" className="lec-el-gap" />) : closed && <path d={model === 'spdt' ? 'M -20 0 L 20 0' : 'M -20 0 L 20 0'} />}
    {model === 'spdt' && !closed && <path d="M -20 0 L 20 32" />}
  </g>;
}
export const ElectricalOverlay = memo(function ElectricalOverlay({ document: doc, signals, zoom = 1 }: { document: CircuitDocument; signals: ElectricalSignals; zoom?: number }) {
  const scale = Math.max(1, 0.85 / zoom);
  return <g className="lec-el-overlay">
    {doc.components.filter(c => signals.switches.has(c.id)).map(c => <SwitchContact key={c.id} component={c} closed={signals.switches.get(c.id)!} model={getDefinition(doc, c).name === 'Normally closed button' ? 'push-nc' : getDefinition(doc, c).name === 'SPDT switch' ? 'spdt' : 'spst'} />)}
    {doc.components.filter(c => signals.probes.has(c.id)).map(c => { const b = getDefinition(doc, c).bounds, p = transform({ x: b.x + b.width, y: b.y }, c); return <circle key={c.id} className="lec-el-probe" cx={p.x} cy={p.y} r={5 * scale} style={{ fill: `var(--lec-trace-${signals.probes.get(c.id)})` }} />; })}
    {signals.tags.map(t => {
      const width = (t.text.length * 6.4 + (t.slot ? 14 : 8)) * scale, height = 15 * scale, x = t.vertical ? t.x + 6 * scale : t.x - width / 2, y = t.vertical ? t.y - height / 2 : t.y - height - 4 * scale;
      return <g key={t.netId} className="lec-el-tag" pointerEvents="none" aria-hidden="true">
        <rect x={x} y={y} width={width} height={height} rx={4 * scale} />
        {t.slot && <circle cx={x + 7 * scale} cy={y + height / 2} r={3.5 * scale} style={{ fill: `var(--lec-trace-${t.slot})` }} />}
        <text x={x + (t.slot ? 13 : 4) * scale} y={y + height - 4 * scale} style={{ fontSize: 10.5 * scale }}>{t.text}</text>
      </g>;
    })}
  </g>;
});
/** Canvas affordances for a live simulation: switches, lamps and lit segments. */
export const SignalOverlay = memo(function SignalOverlay({ document: doc, signals, visible, zoom = 1 }: { document: CircuitDocument; signals: SceneSignals; visible: (component: Component) => boolean; zoom?: number }) {
  return <g className="lec-sim-overlay">
    {doc.components.filter(visible).map(c => {
      const input = signals.inputs.get(c.id), probe = signals.probes.get(c.id), display = signals.displays.get(c.id);
      if (input !== undefined) return <InputSwitch key={c.id} component={c} value={input} zoom={zoom} />;
      if (probe !== undefined) return <ProbeLamp key={c.id} component={c} value={probe} />;
      if (display && getDefinition(doc, c).pins.length === 8) return <DisplaySegments key={c.id} component={c} segments={display} />;
      return null;
    })}
  </g>;
});
