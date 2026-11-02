import { type Anchor, type CircuitDocument, type Point, type Wire, getDefinition, uid } from '../model/document';
import { anchorPosition, GRID, transform } from './geometry';
export function routeWire(doc: CircuitDocument, wire: Wire, budget = 2500): { points: Point[]; exhausted: boolean } {
  const start = anchorPosition(doc, wire.a), end = anchorPosition(doc, wire.b);
  const excluded = new Set([wire.a, wire.b].filter(a => a.kind === 'pin').map(a => a.componentId));
  const obstacles = doc.components.filter(c => !excluded.has(c.id)).map(c => {
    const b = getDefinition(doc, c).bounds, pts = [transform({ x: b.x, y: b.y }, c), transform({ x: b.x + b.width, y: b.y }, c), transform({ x: b.x, y: b.y + b.height }, c), transform({ x: b.x + b.width, y: b.y + b.height }, c)];
    return { left: Math.min(...pts.map(p => p.x)) - 8, right: Math.max(...pts.map(p => p.x)) + 8, top: Math.min(...pts.map(p => p.y)) - 8, bottom: Math.max(...pts.map(p => p.y)) + 8 };
  });
  const step = GRID, s = { x: Math.round(start.x / step), y: Math.round(start.y / step) }, e = { x: Math.round(end.x / step), y: Math.round(end.y / step) };
  const key = (p: Point) => `${p.x},${p.y}`;
  const left = Math.min(s.x, e.x) - 12, right = Math.max(s.x, e.x) + 12, top = Math.min(s.y, e.y) - 12, bottom = Math.max(s.y, e.y) + 12;
  const blocked = (p: Point) => obstacles.some(b => p.x * step > b.left && p.x * step < b.right && p.y * step > b.top && p.y * step < b.bottom);
  const queue = [{ ...s, score: 0 }], costs = new Map([[key(s), 0]]), previous = new Map<string, Point>(); let found = false, expansions = 0;
  while (queue.length && expansions++ < budget) {
    let best = 0; for (let i = 1; i < queue.length; i++) if (queue[i].score < queue[best].score) best = i;
    const current = queue.splice(best, 1)[0];
    if (current.x === e.x && current.y === e.y) { found = true; break; }
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (next.x < left || next.x > right || next.y < top || next.y > bottom || blocked(next)) continue;
      const prev = previous.get(key(current)), bend = prev && (current.x - prev.x !== dx || current.y - prev.y !== dy) ? 0.4 : 0;
      const cost = costs.get(key(current))! + 1 + bend;
      if ((costs.get(key(next)) ?? Infinity) <= cost) continue;
      costs.set(key(next), cost); previous.set(key(next), current); queue.push({ ...next, score: cost + Math.abs(next.x - e.x) + Math.abs(next.y - e.y) });
    }
  }
  if (!found) return { points: [start, { x: end.x, y: start.y }, end], exhausted: true };
  const route: Point[] = []; let p = e;
  for (let i = 0; i <= budget; i++) { route.push({ x: p.x * step || 0, y: p.y * step || 0 }); const parent = previous.get(key(p)); if (!parent) break; p = parent; }
  route.reverse(); route.unshift(start); route.push(end);
  const simplified: Point[] = [];
  for (const p of route) { const last = simplified.at(-1); if (last && p.x === last.x && p.y === last.y) continue; while (simplified.length >= 2) { const a = simplified[simplified.length - 2], b = simplified[simplified.length - 1]; if ((b.x - a.x) * (p.y - b.y) !== (b.y - a.y) * (p.x - b.x)) break; simplified.pop(); } simplified.push(p); }
  return { points: simplified, exhausted: false };
}
export function reroute(doc: CircuitDocument, wire: Wire): boolean {
  if (wire.route.vertices.some(p => p.locked)) return false;
  const result = routeWire(doc, wire); wire.route.mode = 'auto'; wire.route.vertices = result.points.slice(1, -1).map(p => ({ ...p, id: uid('bend'), locked: false })); return !result.exhausted;
}
export function routeThroughPoints(doc: CircuitDocument, anchors: (Anchor | Point)[], horizontalFirst = true): Point[] {
  const result: Point[] = [];
  for (let i = 1; i < anchors.length; i++) {
    const nodes = [...doc.nodes];
    const resolve = (value: Anchor | Point): Anchor => {
      if ('kind' in value) return value;
      const id = uid('preview'); nodes.push({ id, position: value, explicit: false }); return { kind: 'node', nodeId: id };
    };
    const a = resolve(anchors[i - 1]), b = resolve(anchors[i]);
    const wire: Wire = { id: 'preview', a, b, width: 1, locked: false, route: { mode: 'auto', geometry: 'orthogonal', horizontalFirst, vertices: [] } };
    const routed = routeWire({ ...doc, nodes }, wire, 1200).points;
    result.push(...(result.length ? routed.slice(1) : routed));
  }
  return result;
}
