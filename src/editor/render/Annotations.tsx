import type { Annotation } from '../../core/model/document';
import { annotationCorners, annotationLocalBounds, annotationTransform } from '../../core/geometry/annotations';
export function AnnotationDrawing({ annotation: a, selected }: { annotation: Annotation; selected: boolean }) {
  const b = annotationLocalBounds(a);
  return <g data-object={a.id} transform={annotationTransform(a)} className={`lec-annotation${selected ? ' is-selected' : ''}`}>
    <rect className="lec-annotation-hit" x={b.x - 4} y={b.y - 4} width={b.width + 8} height={b.height + 8} fill="transparent" stroke="none" />
    {a.kind === 'box' ? <><rect x="0" y="0" width={a.size.x} height={a.size.y} fill="none" stroke="currentColor" strokeDasharray="6 4" /><text x="8" y={a.fontSize + 5} style={{ fontSize: a.fontSize }}>{a.text}</text></> : a.kind === 'no-connect' ? <path d="M -5 -5 L 5 5 M -5 5 L 5 -5" fill="none" stroke="currentColor" strokeWidth="2" /> : a.kind === 'arrow' || a.kind === 'current' ? <><path d={`M 0 0 h ${a.size.x} l -12 -6 m 12 6 l -12 6`} stroke="currentColor" fill="none" /><text x="0" y="-8" style={{ fontSize: a.fontSize }}>{a.text}</text></> : <text x="0" y="0" className={a.kind === 'label' ? 'lec-net-label' : ''} style={{ fontSize: a.fontSize }}>{a.text}</text>}
  </g>;
}
export function AnnotationHandles({ annotation: a, zoom }: { annotation: Annotation; zoom: number }) {
  const points = annotationCorners(a), top = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
  const angle = a.rotation * Math.PI / 180, rotate = { x: top.x + Math.sin(angle) * 26 / zoom, y: top.y - Math.cos(angle) * 26 / zoom };
  return <g className="lec-annotation-handles"><polygon points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--lec-accent)" vectorEffect="non-scaling-stroke" pointerEvents="none" /><path d={`M ${top.x} ${top.y} L ${rotate.x} ${rotate.y}`} stroke="var(--lec-accent)" vectorEffect="non-scaling-stroke" pointerEvents="none" />
    {[...points.map((p, i) => ({ point: p, handle: ['nw', 'ne', 'se', 'sw'][i] })), { point: rotate, handle: 'rotate' }].map(({ point: p, handle }) => <g key={handle} data-annotation={a.id} data-annotation-handle={handle} className={`lec-annotation-handle lec-handle-${handle}`}><title>{handle === 'rotate' ? 'Rotate annotation' : `Resize annotation ${handle}`}</title><rect x={p.x - 12 / zoom} y={p.y - 12 / zoom} width={24 / zoom} height={24 / zoom} fill="transparent" stroke="none" />{handle === 'rotate' ? <circle cx={p.x} cy={p.y} r={5 / zoom} fill="var(--lec-paper)" stroke="var(--lec-accent)" vectorEffect="non-scaling-stroke" /> : <rect x={p.x - 4 / zoom} y={p.y - 4 / zoom} width={8 / zoom} height={8 / zoom} fill="var(--lec-paper)" stroke="var(--lec-accent)" vectorEffect="non-scaling-stroke" />}</g>)}
  </g>;
}
