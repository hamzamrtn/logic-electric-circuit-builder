import { type Anchor, type CircuitDocument, type Component, type Definition, type Point, type Wire, getDefinition } from '../model/document';
import { annotationCorners } from './annotations';
export const GRID = 8;
export const snap = (p: Point, enabled = true): Point => ({ x: Math.round(p.x / (enabled ? GRID : 1)) * (enabled ? GRID : 1) || 0, y: Math.round(p.y / (enabled ? GRID : 1)) * (enabled ? GRID : 1) || 0 });
export function transform(p: Point, c: Component): Point {
  let x = p.x * (c.mirrorX ? -1 : 1), y = p.y * (c.mirrorY ? -1 : 1);
  if (c.rotation === 90) [x, y] = [-y, x];
  if (c.rotation === 180) [x, y] = [-x, -y];
  if (c.rotation === 270) [x, y] = [y, -x];
  return { x: x + c.position.x, y: y + c.position.y };
}
export function anchorPosition(doc: CircuitDocument, a: Anchor): Point {
  if (a.kind === 'node') {
    const n = doc.nodes.find(n => n.id === a.nodeId); if (!n) throw new Error('Missing node'); return n.position;
  }
  const c = doc.components.find(c => c.id === a.componentId); if (!c) throw new Error('Missing component');
  const pin = getDefinition(doc, c).pins.find(p => p.id === a.pinId); if (!pin) throw new Error('Missing pin'); return transform(pin, c);
}
export function wirePoints(doc: CircuitDocument, w: Wire): Point[] {
  const input = [anchorPosition(doc, w.a), ...w.route.vertices, anchorPosition(doc, w.b)];
  const out: Point[] = [input[0]];
  for (const p of input.slice(1)) {
    const last = out[out.length - 1];
    if (w.route.geometry === 'orthogonal' && last.x !== p.x && last.y !== p.y) out.push(w.route.horizontalFirst ? { x: p.x, y: last.y } : { x: last.x, y: p.y });
    if (last.x !== p.x || last.y !== p.y) out.push({ x: p.x, y: p.y });
  }
  return out;
}
export function distanceToSegment(p: Point, a: Point, b: Point): { distance: number; point: Point } {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  const point = { x: Math.round(a.x + t * dx), y: Math.round(a.y + t * dy) };
  return { distance: Math.hypot(point.x - p.x, point.y - p.y), point };
}
export function snapToSegment(p: Point, a: Point, b: Point, snapping = true): { distance: number; point: Point } {
  const nearest = distanceToSegment(p, a, b);
  if (!snapping) return nearest;
  const clamp = (value: number, lo: number, hi: number) => Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), value));
  if (a.y === b.y) return { distance: nearest.distance, point: { x: clamp(Math.round(p.x / GRID) * GRID, a.x, b.x), y: a.y } };
  if (a.x === b.x) return { distance: nearest.distance, point: { x: a.x, y: clamp(Math.round(p.y / GRID) * GRID, a.y, b.y) } };
  // On a free-angle route prefer a nearby integer-lattice point whose dominant
  // coordinate is on the visible grid. Never pull the target far along the wire.
  let x = Math.abs(b.x - a.x), y = Math.abs(b.y - a.y); while (y) [x, y] = [y, x % y];
  const count = x, dx = (b.x - a.x) / count, dy = (b.y - a.y) / count, dominant = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
  const ratio = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2), ideal = ratio * count;
  let best = Infinity, point = nearest.point;
  for (let remainder = 0; remainder < GRID; remainder++) {
    if ((a[dominant] + remainder * (dominant === 'x' ? dx : dy)) % GRID !== 0) continue;
    const k = remainder + Math.round((ideal - remainder) / GRID) * GRID; if (k < 0 || k > count) continue;
    const candidate = { x: a.x + k * dx, y: a.y + k * dy };
    if (Math.abs(candidate[dominant] - nearest.point[dominant]) > GRID / 2) continue;
    const distance = Math.hypot(candidate.x - p.x, candidate.y - p.y); if (distance < best) { best = distance; point = candidate; }
  }
  return { distance: nearest.distance, point };
}
export function intersection(a: Point, b: Point, c: Point, d: Point, includeEnds = false): Point | undefined {
  const cross = (x: Point, y: Point) => x.x * y.y - x.y * y.x;
  const sub = (x: Point, y: Point) => ({ x: x.x - y.x, y: x.y - y.y });
  const r = sub(b, a), s = sub(d, c), denom = cross(r, s);
  if (!denom) return undefined;
  const t = cross(sub(c, a), s) / denom, u = cross(sub(c, a), r) / denom;
  if (includeEnds ? t < 0 || t > 1 || u < 0 || u > 1 : t <= 0 || t >= 1 || u <= 0 || u >= 1) return undefined;
  const p = { x: Math.round(a.x + t * r.x) || 0, y: Math.round(a.y + t * r.y) || 0 };
  // Remove floating-point residue only when the integer point lies exactly on both lines.
  return cross(sub(p, a), r) === 0 && cross(sub(p, c), s) === 0 ? p : undefined;
}
export function wireContainsPoint(doc: CircuitDocument, wire: Wire, point: Point, tolerance = 0): boolean {
  const points = wirePoints(doc, wire);
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y) <= tolerance;
  return points.slice(1).some((b, index) => {
    const a = points[index];
    if (tolerance) return distanceToSegment(point, a, b).distance <= tolerance;
    return (point.x - a.x) * (b.y - a.y) === (point.y - a.y) * (b.x - a.x) && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x) && point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y);
  });
}
export function componentBounds(component: Component, definition: Definition) {
  const points: Point[] = [];
  const b = definition.bounds;
  for (const x of [b.x - 24, b.x + b.width + 24]) for (const y of [b.y - 24, b.y + b.height + 36]) points.push(transform({ x, y }, component));
  for (const pin of definition.pins) { const p = transform(pin, component); points.push({ x: p.x - 4, y: p.y - 4 }, { x: p.x + 4, y: p.y + 4 }); }
  const l = labelLayout(component, definition);
  for (const [text, y] of [[component.reference, l.referenceY], [String(component.properties.value ?? ''), l.valueY], [String(component.properties.label ?? ''), l.labelY]] as const) {
    if (!text) continue; const width = text.length * 10, left = l.anchor === 'start' ? l.x : l.x - width / 2;
    points.push({ x: left, y: y - 16 }, { x: left + width, y: y + 4 });
  }
  const extents = points.reduce((b, p) => ({ left: Math.min(b.left, p.x), top: Math.min(b.top, p.y), right: Math.max(b.right, p.x), bottom: Math.max(b.bottom, p.y) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  return { x: extents.left, y: extents.top, width: extents.right - extents.left, height: extents.bottom - extents.top };
}
export function bounds(doc: CircuitDocument, ids?: Set<string>) {
  const points: Point[] = [];
  for (const c of doc.components) if (!ids || ids.has(c.id)) {
    const b = componentBounds(c, getDefinition(doc, c));
    points.push({ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y + b.height });
  }
  for (const w of doc.wires) if (!ids || ids.has(w.id)) points.push(...wirePoints(doc, w));
  for (const a of doc.annotations) if (!ids || ids.has(a.id)) points.push(...annotationCorners(a).flatMap(p => [{ x: p.x - 8, y: p.y - 8 }, { x: p.x + 8, y: p.y + 8 }]));
  if (!points.length) return { x: -160, y: -120, width: 320, height: 240 };
  const extents = points.reduce((b, p) => ({ left: Math.min(b.left, p.x), top: Math.min(b.top, p.y), right: Math.max(b.right, p.x), bottom: Math.max(b.bottom, p.y) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  return { x: extents.left, y: extents.top, width: Math.max(80, extents.right - extents.left), height: Math.max(80, extents.bottom - extents.top) };
}
export function labelLayout(c: Component, def: Definition) {
  const vertical = c.rotation === 90 || c.rotation === 270;
  const right = Math.max(...[def.bounds.y, def.bounds.y + def.bounds.height].map(y => transform({ x: 0, y }, { ...c, position: { x: 0, y: 0 } }).x));
  return { x: c.position.x + (vertical ? Math.max(40, right + 8) : 0), referenceY: vertical ? c.position.y - 8 : c.position.y + def.bounds.y - 16, valueY: vertical ? c.position.y + 12 : c.position.y + def.bounds.y + def.bounds.height + 22, labelY: vertical ? c.position.y + 30 : c.position.y + def.bounds.y + def.bounds.height + 40, anchor: vertical ? 'start' as const : 'middle' as const };
}
export class SpatialIndex<T> {
  private buckets = new Map<string, T[]>();
  constructor(private cellSize = 128) {}
  insert(point: Point, value: T) { const key = `${Math.floor(point.x / this.cellSize)},${Math.floor(point.y / this.cellSize)}`; const list = this.buckets.get(key) ?? []; list.push(value); this.buckets.set(key, list); }
  near(point: Point, radius: number): T[] {
    const out: T[] = [];
    for (let x = Math.floor((point.x - radius) / this.cellSize); x <= Math.floor((point.x + radius) / this.cellSize); x++)
      for (let y = Math.floor((point.y - radius) / this.cellSize); y <= Math.floor((point.y + radius) / this.cellSize); y++) out.push(...(this.buckets.get(`${x},${y}`) ?? []));
    return out;
  }
}
