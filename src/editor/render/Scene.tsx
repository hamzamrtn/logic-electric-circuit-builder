import { memo } from 'react';
import { AnnotationDrawing } from './Annotations';
import { type CircuitDocument, type Component, type Definition, type Point, getDefinition } from '../../core/model/document';
import { componentBounds, labelLayout, wirePoints } from '../../core/geometry/geometry';
import { componentTransform, pathData, type Crossing } from './drawing';
import type { Camera } from '../input/types';
export function SymbolDrawing({ definition }: { definition: Definition }) {
  return <>{definition.primitives.map((p, i) => p.kind === 'path' ? <path key={i} d={p.d} fill={p.fill ? 'currentColor' : 'none'} /> : p.kind === 'circle' ? <circle key={i} cx={p.x} cy={p.y} r={p.radius} fill="var(--lec-paper, #fafbf9)" /> : p.kind === 'rect' ? <rect key={i} x={p.x} y={p.y} width={p.width} height={p.height} fill="var(--lec-paper, #fafbf9)" /> : <text key={i} x={p.x} y={p.y} textAnchor="middle" fontSize={p.size} fill="currentColor" stroke="none">{p.text}</text>)}</>;
}
const Part = memo(function Part({ component: c, definition: def, selected, showPins, settling }: { component: Component; definition: Definition; selected: boolean; showPins: boolean; settling: boolean }) {
  const labels = labelLayout(c, def);
  return <g data-object={c.id} className={`lec-part${selected ? ' is-selected' : ''}${c.locked ? ' is-locked' : ''}`}>
    <g transform={componentTransform(c)} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none">
      <rect className="lec-part-hit" x={def.bounds.x - 8} y={def.bounds.y - 8} width={def.bounds.width + 16} height={def.bounds.height + 16} fill="transparent" stroke="none" />
      {(showPins || selected) && <rect opacity={selected ? 1 : 0} pointerEvents="none" className="lec-selection-frame" x={def.bounds.x - 8} y={def.bounds.y - 8} width={def.bounds.width + 16} height={def.bounds.height + 16} rx="4" fill="none" />}
      <g className={`lec-placement-ink${settling ? ' is-settling' : ''}`}><SymbolDrawing definition={def} /></g>
      {showPins && def.pins.map(p => <circle key={p.id} data-pin={p.id} data-component={c.id} className="lec-pin" cx={p.x} cy={p.y} r="3.5"><title>{c.reference} · {p.name}{p.width > 1 ? ` (${p.width} bits)` : ''}</title></circle>)}
    </g>
    <text x={labels.x} y={labels.referenceY} textAnchor={labels.anchor} className="lec-reference">{c.reference}{c.locked ? ' 🔒' : ''}</text>
    {c.properties.value && <text x={labels.x} y={labels.valueY} textAnchor={labels.anchor} className="lec-value">{String(c.properties.value)}</text>}
    {c.properties.label && <text x={labels.x} y={labels.labelY} textAnchor={labels.anchor} className="lec-value">{String(c.properties.label)}</text>}
  </g>;
});
export interface SceneProps { document: CircuitDocument; selection?: Set<string>; crossings?: Crossing[]; camera?: Camera; width?: number; height?: number; showPins?: boolean; highlighted?: Set<string>; settling?: ReadonlySet<string>; wireFeedback?: ReadonlyMap<string, number>; }
export const Scene = memo(function Scene({ document: doc, selection = new Set(), camera, width = 1000, height = 800, showPins = true, highlighted = new Set(), settling = new Set(), wireFeedback = new Map() }: SceneProps) {
  const degrees = new Map<string, number>(); for (const w of doc.wires) for (const a of [w.a, w.b]) if (a.kind === 'node') degrees.set(a.nodeId, (degrees.get(a.nodeId) ?? 0) + 1);
  const visible = (p: Point, margin = 200) => !camera || p.x >= (-camera.x / camera.zoom) - margin && p.x <= (width - camera.x) / camera.zoom + margin && p.y >= (-camera.y / camera.zoom) - margin && p.y <= (height - camera.y) / camera.zoom + margin;
  const partVisible = (component: Component) => {
    if (!camera) return true;
    const b = componentBounds(component, getDefinition(doc, component));
    return b.x + b.width >= -camera.x / camera.zoom && b.x <= (width - camera.x) / camera.zoom && b.y + b.height >= -camera.y / camera.zoom && b.y <= (height - camera.y) / camera.zoom;
  };
  const wireVisible = (pts: Point[]) => !camera || !(Math.max(...pts.map(p => p.x)) < -camera.x / camera.zoom - 64 || Math.min(...pts.map(p => p.x)) > (width - camera.x) / camera.zoom + 64 || Math.max(...pts.map(p => p.y)) < -camera.y / camera.zoom - 64 || Math.min(...pts.map(p => p.y)) > (height - camera.y) / camera.zoom + 64);
  return <>
    {doc.annotations.filter(a => a.kind === 'box').sort((a, b) => a.zIndex - b.zIndex).map(a => <AnnotationDrawing key={a.id} annotation={a} selected={selection.has(a.id)} />)}
    {doc.wires.map((w, wireIndex) => { const pts = wirePoints(doc, w), next = pts[1] ?? pts[0]; if (!wireVisible(pts)) return null; return <g key={w.id} data-object={w.id} className={`lec-wire${selection.has(w.id) ? ' is-selected' : ''}${highlighted.has(w.id) ? ' is-highlighted' : ''}`}>
      <title>{w.width > 1 ? 'Bus' : 'Wire'} {wireIndex + 1}</title><path d={pathData(pts)} fill="none" stroke="currentColor" strokeWidth={w.width > 1 ? 4 : 2} strokeLinejoin="round" />
      <path className="lec-wire-hit" d={pathData(pts)} fill="none" stroke="transparent" strokeWidth="14" />
      {wireFeedback.has(w.id) && <path key={wireFeedback.get(w.id)} className="lec-wire-feedback" d={pathData(pts)} fill="none" stroke="var(--lec-accent)" strokeWidth="3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      {w.width > 1 && <text x={(pts[0].x + next.x) / 2} y={(pts[0].y + next.y) / 2 - 8} className="lec-bus-width">/{w.width}</text>}
    </g>; })}
    {doc.components.filter(partVisible).map(c => <Part key={c.id} component={c} definition={getDefinition(doc, c)} selected={selection.has(c.id)} showPins={showPins} settling={settling.has(c.id)} />)}
    {doc.nodes.filter(n => visible(n.position)).map(n => { const degree = degrees.get(n.id) ?? 0; return degree ? <circle key={n.id} data-object={n.id} cx={n.position.x} cy={n.position.y} r={degree > 2 || n.explicit ? 4 : 3} className={`lec-node${degree === 1 ? ' is-dangling' : ''}${selection.has(n.id) ? ' is-selected' : ''}`} /> : null; })}
    {doc.annotations.filter(a => a.kind !== 'box').sort((a, b) => a.zIndex - b.zIndex).map(a => <AnnotationDrawing key={a.id} annotation={a} selected={selection.has(a.id)} />)}
  </>;
});
