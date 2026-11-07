import { type Anchor, type CircuitDocument, type Component, type Point, anchorKey, getDefinition } from '../../core/model/document';
import { distanceToSegment, intersection, transform, wirePoints } from '../../core/geometry/geometry';
export function componentTransform(c: Component) { return `translate(${c.position.x} ${c.position.y}) rotate(${c.rotation}) scale(${c.mirrorX ? -1 : 1} ${c.mirrorY ? -1 : 1})`; }
export const pathData = (points: Point[]) => points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
export interface Crossing { wireId: string; point: Point; }
export function findCrossings(doc: CircuitDocument): Crossing[] {
  const buckets = new Map<string, { wire: number; a: Point; b: Point; index: number }[]>(), checked = new Set<string>(), result: Crossing[] = [];
  let serial = 0;
  for (let wi = 0; wi < doc.wires.length; wi++) {
    const pts = wirePoints(doc, doc.wires[wi]);
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1], b = pts[j], segment = { wire: wi, a, b, index: serial++ };
      const left = Math.floor(Math.min(a.x, b.x) / 128), right = Math.floor(Math.max(a.x, b.x) / 128), top = Math.floor(Math.min(a.y, b.y) / 128), bottom = Math.floor(Math.max(a.y, b.y) / 128);
      // Pathological long diagonals are bounded; overlap diagnostics still remain available.
      if ((right - left + 1) * (bottom - top + 1) > 4096) continue;
      for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) {
        const k = `${x},${y}`, existing = buckets.get(k) ?? [];
        for (const prev of existing) {
          if (prev.wire === wi) continue; const pair = `${prev.index}:${segment.index}`; if (checked.has(pair)) continue; checked.add(pair);
          const point = intersection(a, b, prev.a, prev.b);
          if (point) result.push({ wireId: doc.wires[wi].id, point });
        }
        existing.push(segment); buckets.set(k, existing);
      }
    }
  }
  return result;
}
export function overlapWarnings(doc: CircuitDocument): { message: string; objectIds: string[] }[] {
  const out: { message: string; objectIds: string[] }[] = [];
  const limit = 200;
  type Body = { id: string; left: number; right: number; top: number; bottom: number };
  const cells = new Map<string, Body[]>(), checked = new Set<string>();
  for (const c of doc.components) {
    const b = getDefinition(doc, c).bounds, corners = [transform({ x: b.x, y: b.y }, c), transform({ x: b.x + b.width, y: b.y }, c), transform({ x: b.x, y: b.y + b.height }, c), transform({ x: b.x + b.width, y: b.y + b.height }, c)];
    const body: Body = { id: c.id, left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)), top: Math.min(...corners.map(p => p.y)), bottom: Math.max(...corners.map(p => p.y)) };
    const occupiedCells = (Math.floor(body.right / 128) - Math.floor(body.left / 128) + 1) * (Math.floor(body.bottom / 128) - Math.floor(body.top / 128) + 1);
    if (occupiedCells > 256) {
      out.push({ message: 'Very large symbol bounds: inspect placement in the object list; detailed overlap checks are bounded.', objectIds: [c.id] });
      if (out.length >= limit) return out;
      continue;
    }
    for (let x = Math.floor(body.left / 128); x <= Math.floor(body.right / 128); x++) for (let y = Math.floor(body.top / 128); y <= Math.floor(body.bottom / 128); y++) {
      const key = `${x},${y}`, current = cells.get(key) ?? [];
      for (const p of current) { const pair = `${p.id}:${c.id}`; if (checked.has(pair)) continue; checked.add(pair);
        if (p.left < body.right && p.right > body.left && p.top < body.bottom && p.bottom > body.top) out.push({ message: 'Component bodies overlap; no electrical connection is implied', objectIds: [p.id, c.id] });
        if (out.length >= limit) return [...out, { message: 'Additional overlap diagnostics omitted; simplify this region to inspect more.', objectIds: [] }];
      }
      current.push(body); cells.set(key, current);
    }
  }
  // Normalize every integer segment's line, then sweep its projected intervals.
  // This includes partial collinear overlap in orthogonal and free-angle routes.
  const lines = new Map<string, { start: number; end: number; wireId: string }[]>();
  const gcd = (a: number, b: number) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
  for (const w of doc.wires) {
    const pts = wirePoints(doc, w);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], divisor = gcd(b.x - a.x, b.y - a.y); if (!divisor) continue;
      let dx = (b.x - a.x) / divisor, dy = (b.y - a.y) / divisor; if (dx < 0 || dx === 0 && dy < 0) { dx = -dx; dy = -dy; }
      const key = `${dx},${dy},${dx * a.y - dy * a.x}`, list = lines.get(key) ?? [], t1 = dx * a.x + dy * a.y, t2 = dx * b.x + dy * b.y;
      list.push({ start: Math.min(t1, t2), end: Math.max(t1, t2), wireId: w.id }); lines.set(key, list);
    }
  }
  const pairs = new Set<string>();
  for (const list of lines.values()) {
    list.sort((a, b) => a.start - b.start); let active: typeof list = [];
    for (const interval of list) {
      active = active.filter(p => p.end > interval.start).slice(-512);
      for (const p of active) {
        if (p.wireId === interval.wireId) continue; const pair = [p.wireId, interval.wireId].sort().join(':'); if (pairs.has(pair)) continue; pairs.add(pair);
        out.push({ message: 'Wire paths overlap. Select a wire from the object list to inspect its connections.', objectIds: [p.wireId, interval.wireId] });
        if (out.length >= limit) return [...out, { message: 'Additional overlap diagnostics omitted; simplify this region to inspect more.', objectIds: [] }];
      }
      active.push(interval);
    }
  }
  return out;
}
export function objectDescription(doc: CircuitDocument, id: string): string {
  const c = doc.components.find(c => c.id === id); if (c) return [c.reference, getDefinition(doc, c).name].filter(Boolean).join(' · ');
  const index = doc.wires.findIndex(w => w.id === id), w = doc.wires[index];
  if (w) return `${w.width > 1 ? 'Bus' : 'Wire'} ${index + 1}: ${anchorDescription(doc, w.a)} → ${anchorDescription(doc, w.b)}${w.width > 1 ? ` (${w.width} bits)` : ''}`;
  const annotation = doc.annotations.find(a => a.id === id); if (annotation) return annotation.text || `${annotation.kind} annotation`;
  if (doc.nodes.some(n => n.id === id)) return anchorDescription(doc, { kind: 'node', nodeId: id });
  return doc.groups.find(g => g.id === id)?.name || 'Group';
}
export function anchorDescription(doc: CircuitDocument, anchor: Anchor): string {
  if (anchor.kind === 'pin') {
    const c = doc.components.find(c => c.id === anchor.componentId); if (!c) return 'Unknown pin';
    const definition = getDefinition(doc, c), pin = definition.pins.find(p => p.id === anchor.pinId);
    return `${c.reference || definition.name} · ${pin?.name || 'Pin'}`;
  }
  const index = doc.nodes.findIndex(n => n.id === anchor.nodeId); if (index < 0) return 'Wire end';
  const degree = doc.wires.filter(w => [w.a, w.b].some(a => anchorKey(a) === anchorKey(anchor))).length;
  return `${degree > 1 ? 'Junction' : 'Wire end'} ${index + 1}`;
}
export function terminalDescription(doc: CircuitDocument, terminal: string): string {
  const match = terminal.match(/^(.*)\[(\d+)\]$/); if (!match) return 'Terminal';
  const key = match[1], lane = Number(match[2]);
  for (const c of doc.components) for (const pin of getDefinition(doc, c).pins) {
    const anchor: Anchor = { kind: 'pin', componentId: c.id, pinId: pin.id };
    if (anchorKey(anchor) === key) return `${anchorDescription(doc, anchor)}${pin.width > 1 ? ` [${lane}]` : ''}`;
  }
  const node = doc.nodes.find(n => anchorKey({ kind: 'node', nodeId: n.id }) === key);
  if (node) return anchorDescription(doc, { kind: 'node', nodeId: node.id });
  return 'Terminal';
}
export function closestSegment(doc: CircuitDocument, wireId: string, point: Point): number {
  const w = doc.wires.find(w => w.id === wireId); if (!w) return 0; const pts = wirePoints(doc, w); let best = Infinity, index = 0;
  for (let i = 1; i < pts.length; i++) { const distance = distanceToSegment(point, pts[i - 1], pts[i]).distance; if (distance < best) { best = distance; index = i - 1; } } return index;
}
