import { type Anchor, type CircuitDocument, type Point, type Wire, getDefinition, uid } from '../model/document';
import { anchorPosition, GRID, transform } from './geometry';

interface Obstacle { id: string; left: number; right: number; top: number; bottom: number; }
interface SearchNode { x: number; y: number; direction: number; cost: number; score: number; estimate: number; turns: number; order: number; key: string; previous?: SearchNode; }
const directions = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }];
const before = (a: SearchNode, b: SearchNode) => a.score < b.score || a.score === b.score && (a.turns < b.turns || a.turns === b.turns && (a.estimate < b.estimate || a.estimate === b.estimate && a.order < b.order));
class Frontier {
  private nodes: SearchNode[] = [];
  get size() { return this.nodes.length; }
  push(node: SearchNode) {
    this.nodes.push(node); let index = this.nodes.length - 1;
    while (index > 0) { const parent = (index - 1) >> 1; if (!before(this.nodes[index], this.nodes[parent])) break; [this.nodes[index], this.nodes[parent]] = [this.nodes[parent], this.nodes[index]]; index = parent; }
  }
  pop(): SearchNode {
    const first = this.nodes[0], last = this.nodes.pop()!;
    if (this.nodes.length) {
      this.nodes[0] = last; let index = 0;
      while (true) { const left = index * 2 + 1, right = left + 1; let best = index; if (left < this.nodes.length && before(this.nodes[left], this.nodes[best])) best = left; if (right < this.nodes.length && before(this.nodes[right], this.nodes[best])) best = right; if (best === index) break; [this.nodes[index], this.nodes[best]] = [this.nodes[best], this.nodes[index]]; index = best; }
    }
    return first;
  }
}
function simplify(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const last = result.at(-1); if (last && last.x === point.x && last.y === point.y) continue;
    while (result.length >= 2) {
      const a = result[result.length - 2], b = result[result.length - 1], dx = b.x - a.x, dy = b.y - a.y, nx = point.x - b.x, ny = point.y - b.y;
      if (dx * ny !== dy * nx || dx * nx + dy * ny < 0) break;
      result.pop();
    }
    result.push({ x: point.x || 0, y: point.y || 0 });
  }
  return result;
}
function clearSegment(a: Point, b: Point, obstacles: Obstacle[], own?: string): boolean {
  return !obstacles.some(rect => rect.id !== own && (a.x === b.x
    ? a.x > rect.left && a.x < rect.right && Math.max(a.y, b.y) > rect.top && Math.min(a.y, b.y) < rect.bottom
    : a.y > rect.top && a.y < rect.bottom && Math.max(a.x, b.x) > rect.left && Math.min(a.x, b.x) < rect.right));
}

export function routeWire(doc: CircuitDocument, wire: Wire, budget = 4000): { points: Point[]; exhausted: boolean } {
  const start = anchorPosition(doc, wire.a), end = anchorPosition(doc, wire.b);
  const fallback = () => ({ points: [start, wire.route.horizontalFirst ? { x: end.x, y: start.y } : { x: start.x, y: end.y }, end], exhausted: true });
  const shapes = doc.components.map(component => {
    const b = getDefinition(doc, component).bounds, corners = [transform({ x: b.x, y: b.y }, component), transform({ x: b.x + b.width, y: b.y }, component), transform({ x: b.x, y: b.y + b.height }, component), transform({ x: b.x + b.width, y: b.y + b.height }, component)];
    return { id: component.id, left: Math.min(...corners.map(p => p.x)) - GRID, right: Math.max(...corners.map(p => p.x)) + GRID, top: Math.min(...corners.map(p => p.y)) - GRID, bottom: Math.max(...corners.map(p => p.y)) + GRID };
  });
  const shapeById = new Map(shapes.map(shape => [shape.id, shape]));
  const escape = (anchor: Anchor, point: Point) => {
    if (anchor.kind !== 'pin') return { point, direction: 4, own: undefined };
    const component = doc.components.find(c => c.id === anchor.componentId)!, pin = getDefinition(doc, component).pins.find(p => p.id === anchor.pinId)!;
    const local = pin.side === 'left' ? { x: -1, y: 0 } : pin.side === 'right' ? { x: 1, y: 0 } : pin.side === 'top' ? { x: 0, y: -1 } : { x: 0, y: 1 };
    const rotated = transform(local, component), dx = rotated.x - component.position.x, dy = rotated.y - component.position.y, body = shapeById.get(component.id)!;
    const direction = directions.findIndex(v => v.x === dx && v.y === dy);
    return { point: { x: dx > 0 ? Math.max(point.x + GRID, body.right) : dx < 0 ? Math.min(point.x - GRID, body.left) : point.x, y: dy > 0 ? Math.max(point.y + GRID, body.bottom) : dy < 0 ? Math.min(point.y - GRID, body.top) : point.y }, direction, own: component.id };
  };
  const source = escape(wire.a, start), target = escape(wire.b, end), s = source.point, e = target.point;
  const left = Math.min(s.x, e.x) - GRID * 12, right = Math.max(s.x, e.x) + GRID * 12, top = Math.min(s.y, e.y) - GRID * 12, bottom = Math.max(s.y, e.y) + GRID * 12;
  const obstacles = shapes.filter(r => r.right >= left && r.left <= right && r.bottom >= top && r.top <= bottom);
  const blocked = (p: Point) => shapes.some(r => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom);
  if (blocked(s) || blocked(e) || !clearSegment(start, s, shapes, source.own) || !clearSegment(end, e, shapes, target.own)) return fallback();
  // A compressed rectilinear graph skips empty spans while retaining obstacle boundaries and exact endpoints.
  const xs = [...new Set([s.x, e.x, ...obstacles.flatMap(r => [r.left, r.right])])].filter(x => Math.abs(x) <= 1_000_000).sort((a, b) => a - b);
  const ys = [...new Set([s.y, e.y, ...obstacles.flatMap(r => [r.top, r.bottom])])].filter(y => Math.abs(y) <= 1_000_000).sort((a, b) => a - b);
  const sx = xs.indexOf(s.x), sy = ys.indexOf(s.y), ex = xs.indexOf(e.x), ey = ys.indexOf(e.y);
  if ([sx, sy, ex, ey].some(i => i < 0)) return fallback();
  const collisionObstacles = shapes.filter(r => r.right >= xs[0] && r.left <= xs[xs.length - 1] && r.bottom >= ys[0] && r.top <= ys[ys.length - 1]);
  const key = (x: number, y: number, direction: number) => `${y * xs.length + x}:${direction}`;
  const estimate = (x: number, y: number, direction: number) => {
    const distance = Math.abs(xs[x] - e.x) + Math.abs(ys[y] - e.y); if (!distance) return 0;
    const turns = (first: number, last = first) => (direction !== 4 && direction !== first ? 1 : 0) + (first !== last ? 1 : 0) + (target.direction !== 4 && last !== (target.direction + 2) % 4 ? 1 : 0);
    const horizontal = xs[x] < e.x ? 0 : 2, vertical = ys[y] < e.y ? 1 : 3;
    const bends = x === ex ? turns(vertical) : y === ey ? turns(horizontal) : Math.min(turns(horizontal, vertical), turns(vertical, horizontal));
    return distance + bends * GRID * 2;
  };
  const frontier = new Frontier(), costs = new Map<string, number>(), edges = new Map<string, boolean>(); let order = 0;
  const initial: SearchNode = { x: sx, y: sy, direction: source.direction, cost: 0, score: estimate(sx, sy, source.direction), estimate: estimate(sx, sy, source.direction), turns: 0, order: order++, key: key(sx, sy, source.direction) };
  frontier.push(initial); costs.set(initial.key, 0);
  const directionOrder = wire.route.horizontalFirst ? [0, 2, 1, 3] : [1, 3, 0, 2];
  let found: SearchNode | undefined, expansions = 0;
  while (frontier.size && expansions < budget) {
    const current = frontier.pop(); if (costs.get(current.key) !== current.cost) continue; expansions++;
    if (current.x === ex && current.y === ey) { found = current; break; }
    for (const direction of directionOrder) {
      if (!current.previous && source.direction !== 4 && direction === (source.direction + 2) % 4) continue;
      const vector = directions[direction], x = current.x + vector.x, y = current.y + vector.y;
      if (x < 0 || x >= xs.length || y < 0 || y >= ys.length) continue;
      if (x === ex && y === ey && direction === target.direction) continue;
      const a = { x: xs[current.x], y: ys[current.y] }, b = { x: xs[x], y: ys[y] };
      const ca = current.y * xs.length + current.x, cb = y * xs.length + x, edge = ca < cb ? `${ca}:${cb}` : `${cb}:${ca}`;
      let clear = edges.get(edge); if (clear === undefined) { clear = clearSegment(a, b, collisionObstacles); edges.set(edge, clear); }
      if (!clear) continue;
      const turn = current.direction !== 4 && current.direction !== direction ? 1 : 0;
      const terminalTurn = x === ex && y === ey && target.direction !== 4 && direction !== (target.direction + 2) % 4 ? 1 : 0;
      const preference = !current.previous && source.direction === 4 && (direction % 2 === 0) !== wire.route.horizontalFirst ? .1 : 0;
      const cost = current.cost + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + (turn + terminalTurn) * GRID * 2 + preference, nextKey = key(x, y, direction);
      if (cost >= (costs.get(nextKey) ?? Infinity)) continue;
      costs.set(nextKey, cost); const distance = estimate(x, y, direction);
      frontier.push({ x, y, direction, cost, score: cost + distance, estimate: distance, turns: current.turns + turn + terminalTurn, order: order++, key: nextKey, previous: current });
    }
  }
  if (!found) return fallback();
  const points: Point[] = [];
  for (let current: SearchNode | undefined = found; current; current = current.previous) points.push({ x: xs[current.x], y: ys[current.y] });
  points.reverse();
  return { points: simplify([start, ...points, end]), exhausted: false };
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
    const routed = routeWire({ ...doc, nodes }, wire).points;
    result.push(...(result.length ? routed.slice(1) : routed));
  }
  return result;
}
