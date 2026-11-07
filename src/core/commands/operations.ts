import { type Anchor, type Annotation, type CircuitDocument, type Component, type Definition, type Point, anchorKey, clone, getDefinition, pinWidth, uid } from '../model/document';
import { anchorPosition, distanceToSegment, intersection, snap, wireContainsPoint, wirePoints } from '../geometry/geometry';
import { reroute, routeThroughPoints } from '../geometry/router';
import { annotationCenter } from '../geometry/annotations';

export type Target = Anchor | { kind: 'wire'; wireId: string; point: Point } | { kind: 'free'; point: Point };
export function place(doc: CircuitDocument, def: Definition, position: Point, rotation: Component['rotation'] = 0): Component {
  if (!doc.definitions.some(d => d.id === def.id)) doc.definitions.push(clone(def));
  let n = 1; while (doc.components.some(c => c.reference === `${def.prefix}${n}`)) n++;
  const c: Component = { id: uid('c'), definitionId: def.id, position: snap(position, false), rotation, mirrorX: false, mirrorY: false, reference: `${def.prefix}${n}`, properties: clone(def.defaults), locked: false };
  doc.components.push(c);
  if (def.name === 'Ground' || def.name === 'Power rail') annotate(doc, 'label', def.name === 'Ground' ? 'GND' : 'VCC', { x: position.x + 16, y: position.y - 32 }, { kind: 'pin', componentId: c.id, pinId: def.pins[0].id }, true);
  return c;
}
export function freeNode(doc: CircuitDocument, position: Point): Anchor {
  const n = { id: uid('n'), position: { x: Math.round(position.x), y: Math.round(position.y) }, explicit: false }; doc.nodes.push(n); return { kind: 'node', nodeId: n.id };
}
export function splitWire(doc: CircuitDocument, wireId: string, point: Point, existing?: Anchor): Anchor {
  const w = doc.wires.find(w => w.id === wireId); if (!w) throw new Error('Wire no longer exists'); assertUnlocked(doc, wireId);
  const points = wirePoints(doc, w);
  let best = { distance: Infinity, point, segment: 0 };
  for (let i = 1; i < points.length; i++) { const hit = distanceToSegment(point, points[i - 1], points[i]); if (hit.distance < best.distance) best = { ...hit, segment: i - 1 }; }
  const p = best.point;
  if (existing) { const q = anchorPosition(doc, existing); if (q.x !== p.x || q.y !== p.y) throw new Error('These wires do not meet at the same point'); }
  const isAt = (a: Anchor) => { const q = anchorPosition(doc, a); return q.x === p.x && q.y === p.y; };
  if (isAt(w.a) || isAt(w.b)) {
    const endpoint = isAt(w.a) ? w.a : w.b;
    if (!existing || anchorKey(endpoint) === anchorKey(existing)) return endpoint;
    return mergeAnchors(doc, endpoint, existing);
  }
  const node = existing ?? freeNode(doc, p);
  if (node.kind === 'node') doc.nodes.find(n => n.id === node.nodeId)!.explicit = true;
  const vertex = (v: Point) => ({ ...v, id: uid('bend'), locked: true });
  const oldB = clone(w.b), oldRoute = clone(w.route);
  w.b = clone(node); w.route.mode = 'manual'; w.route.vertices = points.slice(1, best.segment + 1).map(vertex);
  const newWire = { ...clone(w), id: uid('w'), a: clone(node), b: oldB, route: { ...oldRoute, mode: 'manual' as const, vertices: points.slice(best.segment + 1, -1).map(vertex) } };
  doc.wires.push(newWire);
  for (const group of doc.groups) if (group.members.includes(w.id)) group.members = [...new Set([...group.members, newWire.id, ...(node.kind === 'node' ? [node.nodeId] : [])])];
  return node;
}
function mergeAnchors(doc: CircuitDocument, first: Anchor, second: Anchor): Anchor {
  if (anchorKey(first) === anchorKey(second)) return first;
  const a = anchorPosition(doc, first), b = anchorPosition(doc, second);
  if (a.x !== b.x || a.y !== b.y) throw new Error('These endpoints do not meet at the same point');
  // Pins retain their intrinsic identities; merge a free node into the pin, never detach the pin.
  if (first.kind === 'pin' && second.kind === 'pin') throw new Error('Overlapping pins need a visible wire between them');
  const removed = first.kind === 'pin' ? second : first, retained = first.kind === 'pin' ? first : second;
  const affectedWires = doc.wires.filter(edge => [edge.a, edge.b].some(anchor => anchorKey(anchor) === anchorKey(removed)));
  const affectedAnnotations = doc.annotations.filter(a => a.anchor && anchorKey(a.anchor) === anchorKey(removed));
  assertUnlocked(doc, ...(removed.kind === 'node' ? [removed.nodeId] : []), ...affectedWires.map(edge => edge.id), ...affectedAnnotations.map(a => a.id));
  for (const edge of affectedWires) for (const end of ['a', 'b'] as const) if (anchorKey(edge[end]) === anchorKey(removed)) edge[end] = clone(retained);
  for (const a of affectedAnnotations) a.anchor = clone(retained);
  if (removed.kind === 'node') {
    for (const group of doc.groups) if (group.members.includes(removed.nodeId)) group.members = [...new Set(group.members.flatMap(id => id !== removed.nodeId ? [id] : retained.kind === 'node' ? [retained.nodeId] : []))];
    doc.nodes = doc.nodes.filter(node => node.id !== removed.nodeId);
  }
  return retained;
}
export function resolveTarget(doc: CircuitDocument, target: Target): Anchor {
  if (target.kind === 'free') return freeNode(doc, target.point);
  if (target.kind === 'wire') return splitWire(doc, target.wireId, target.point);
  return clone(target);
}
export function addWire(doc: CircuitDocument, from: Target, to: Target, bends: Point[] = [], options: { geometry?: 'orthogonal' | 'free'; horizontalFirst?: boolean; width?: number } = {}): string {
  const previousCount = doc.wires.length, a = resolveTarget(doc, from);
  if (from.kind === 'wire' && to.kind === 'wire' && from.wireId === to.wireId) {
    const endpoint = to;
    const piece = doc.wires.filter((wire, index) => wire.id === endpoint.wireId || index >= previousCount).find(wire => wireContainsPoint(doc, wire, endpoint.point, 1));
    if (!piece) throw new Error('The target wire changed. Choose its endpoint again');
    to = { ...endpoint, wireId: piece.id };
  }
  const b = resolveTarget(doc, to);
  if (anchorKey(a) === anchorKey(b)) throw new Error('Choose two different endpoints');
  const pa = anchorPosition(doc, a), pb = anchorPosition(doc, b);
  if (pa.x === pb.x && pa.y === pb.y && bends.every(p => p.x === pa.x && p.y === pa.y)) throw new Error('A wire needs a visible route');
  const width = options.width ?? pinWidth(doc, a) ?? pinWidth(doc, b) ?? doc.wires.find(w => anchorKey(w.a) === anchorKey(a) || anchorKey(w.b) === anchorKey(a))?.width ?? 1;
  const id = uid('w');
  doc.wires.push({ id, a, b, width, locked: false, route: { mode: bends.length ? 'manual' : 'auto', geometry: options.geometry ?? 'orthogonal', horizontalFirst: options.horizontalFirst ?? true, vertices: bends.filter((p, i) => !i || p.x !== bends[i - 1].x || p.y !== bends[i - 1].y).map(p => ({ ...snap(p, false), id: uid('bend'), locked: true })) } });
  if (!bends.length && options.geometry !== 'free') reroute(doc, doc.wires[doc.wires.length - 1]);
  else if (bends.length && options.geometry !== 'free') {
    const wire = doc.wires[doc.wires.length - 1], existing = wire.route.vertices;
    wire.route.vertices = routeThroughPoints(doc, [a, ...bends, b], wire.route.horizontalFirst).slice(1, -1).map(point => {
      const manual = existing.find(v => v.x === point.x && v.y === point.y);
      return manual ? { ...manual } : { ...point, id: uid('bend'), locked: false };
    });
  }
  return id;
}
export function finishDanglingWire(doc: CircuitDocument, from: Target, placedPoints: Point[], options: Parameters<typeof addWire>[4] = {}): string {
  const endpoint = placedPoints.at(-1);
  if (!endpoint) throw new Error('Place the wire endpoint on the canvas before choosing Finish');
  return addWire(doc, from, { kind: 'free', point: endpoint }, placedPoints.slice(0, -1), options);
}
export function joinWires(doc: CircuitDocument, ids: string[], point: Point) {
  ids = validateJoin(doc, ids, point);
  let node = splitWire(doc, ids[0], point);
  for (const id of ids.slice(1)) node = splitWire(doc, id, point, node);
  return node;
}
function validateJoin(doc: CircuitDocument, input: string[], point: Point): string[] {
  const ids = [...new Set(input)];
  if (ids.length < 2) throw new Error('Select at least two different wires');
  if (!Number.isInteger(point.x) || !Number.isInteger(point.y)) throw new Error('Use whole-number coordinates for a wire junction');
  const wires = ids.map(id => { const wire = doc.wires.find(w => w.id === id); if (!wire) throw new Error('A selected wire no longer exists'); return wire; });
  if (!wires.every(wire => wireContainsPoint(doc, wire, point))) throw new Error('Choose a point shared by every selected wire');
  if (new Set(wires.map(wire => wire.width)).size !== 1) throw new Error('Incompatible bus widths; use a splitter');
  assertUnlocked(doc, ...ids); return ids;
}
export function commonJoinPoint(doc: CircuitDocument, ids: string[], near?: Point, maxDistance = Infinity): Point | undefined {
  const wires = [...new Set(ids)].map(id => doc.wires.find(wire => wire.id === id));
  if (wires.length < 2 || wires.some(wire => !wire)) return undefined;
  const paths = wires.map(wire => wirePoints(doc, wire!)), seen = new Set<string>(); let best: Point | undefined, distance = Infinity;
  const consider = (point: Point) => {
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y)) return;
    const key = `${point.x},${point.y}`; if (seen.has(key)) return; seen.add(key);
    const next = near ? Math.hypot(point.x - near.x, point.y - near.y) : 0;
    if (next <= maxDistance && next < distance && wires.every(wire => wireContainsPoint(doc, wire!, point))) { best = point; distance = next; }
  };
  if (near) consider(near);
  for (const path of paths.slice(0, 2)) for (const point of path) consider(point);
  if (near) for (let i = 1; i < paths[0].length; i++) consider(distanceToSegment(near, paths[0][i - 1], paths[0][i]).point);
  if (distance === 0) return best;
  let budget = 10000;
  const relevant = (a: Point, b: Point) => !near || near.x >= Math.min(a.x, b.x) - maxDistance && near.x <= Math.max(a.x, b.x) + maxDistance && near.y >= Math.min(a.y, b.y) - maxDistance && near.y <= Math.max(a.y, b.y) + maxDistance;
  for (let i = 1; i < paths[0].length; i++) {
    const a = paths[0][i - 1], b = paths[0][i]; if (!relevant(a, b)) continue;
    for (let j = 1; j < paths[1].length; j++) {
      const c = paths[1][j - 1], d = paths[1][j]; if (!relevant(c, d)) continue;
      if (--budget < 0) return best;
      const point = intersection(a, b, c, d, true); if (point) consider(point);
    }
  }
  return best;
}
export function joinAndConnect(doc: CircuitDocument, input: string[], point: Point, options: NonNullable<Parameters<typeof addWire>[4]> & { start?: Target; bends?: Point[]; reconnect?: { wireId: string; end: 'a' | 'b' } } = {}): { target: Anchor; wireId?: string } {
  const ids = validateJoin(doc, input, point), previous = new Set(doc.wires.map(wire => wire.id));
  let from = options.start ? resolveTarget(doc, options.start) : undefined;
  const sourcePoint = from ? anchorPosition(doc, from) : undefined;
  if (options.start?.kind === 'wire' && ids.includes(options.start.wireId)) ids.push(...doc.wires.filter(wire => !previous.has(wire.id)).map(wire => wire.id));
  const pieces = ids.filter(id => { const wire = doc.wires.find(wire => wire.id === id); return wire && wireContainsPoint(doc, wire, point); });
  let target = joinWires(doc, pieces, point);
  if (options.reconnect) {
    const wire = doc.wires.find(wire => wire.id === options.reconnect!.wireId); if (!wire) throw new Error('Wire no longer exists');
    assertUnlocked(doc, wire.id); wire[options.reconnect.end] = clone(target);
    if (wire.route.mode === 'auto') reroute(doc, wire);
    return { target, wireId: wire.id };
  }
  if (!from) return { target };
  if (from.kind === 'node') { const id = from.nodeId; if (!doc.nodes.some(node => node.id === id)) from = target; }
  if (!options.bends?.length && sourcePoint?.x === point.x && sourcePoint.y === point.y) { target = mergeAnchors(doc, from, target); return { target }; }
  return { target, wireId: addWire(doc, from, target, options.bends ?? [], options) };
}
export function disconnectNode(doc: CircuitDocument, nodeId: string, pairings: string[][]) {
  const node = doc.nodes.find(n => n.id === nodeId); if (!node) throw new Error('Select a junction');
  const incident = doc.wires.filter(w => [w.a, w.b].some(a => a.kind === 'node' && a.nodeId === nodeId));
  assertUnlocked(doc, nodeId, ...incident.map(w => w.id));
  const expected = incident.map(w => w.id).sort().join(',');
  if (pairings.flat().sort().join(',') !== expected || pairings.some(g => !g.length)) throw new Error('Assign every junction arm exactly once');
  pairings.forEach((group, i) => {
    const anchor = i === 0 ? { kind: 'node' as const, nodeId } : freeNode(doc, node.position);
    for (const w of incident.filter(w => group.includes(w.id))) for (const key of ['a', 'b'] as const) if (w[key].kind === 'node' && w[key].nodeId === nodeId) w[key] = clone(anchor);
  });
}
export function lockedObjects(doc: CircuitDocument): Set<string> {
  const locked = new Set([...doc.components, ...doc.wires, ...doc.annotations, ...doc.groups].filter(object => object.locked).map(object => object.id));
  for (const group of doc.groups) if (group.locked) group.members.forEach(id => locked.add(id));
  return locked;
}
export function assertUnlocked(doc: CircuitDocument, ...ids: string[]): void {
  const locked = lockedObjects(doc);
  if (ids.some(id => locked.has(id))) throw new Error('Unlock this object or its group before editing it');
}
export function selectionMembers(doc: CircuitDocument, input: Set<string>): Set<string> {
  const ids = new Set(input);
  for (const g of doc.groups) if (ids.has(g.id) && !g.locked) g.members.forEach(id => ids.add(id));
  for (const id of lockedObjects(doc)) ids.delete(id);
  return ids;
}
function anchorSelected(a: Anchor, ids: Set<string>) { return ids.has(a.kind === 'pin' ? a.componentId : a.nodeId); }
export function movableSelection(doc: CircuitDocument, input: Set<string>): Set<string> {
  const ids = selectionMembers(doc, input);
  const adjacent = new Map<string, typeof doc.wires>();
  for (const w of doc.wires) for (const a of [w.a, w.b]) if (a.kind === 'node') { const edges = adjacent.get(a.nodeId) ?? []; edges.push(w); adjacent.set(a.nodeId, edges); }
  const protectedIds = lockedObjects(doc);
  for (const [id, incident] of adjacent) if (!protectedIds.has(id) && incident.every(w => ids.has(w.id))) ids.add(id);
  if (doc.components.filter(c => ids.has(c.id)).length < 2) return ids;
  const visited = new Set<string>();
  for (const n of doc.nodes) {
    if (visited.has(n.id)) continue;
    const queue = [n.id], cluster = new Set<string>(), boundary = new Set<string>();
    while (queue.length) { const id = queue.pop()!; if (visited.has(id)) continue; visited.add(id); cluster.add(id); for (const w of adjacent.get(id) ?? []) for (const a of [w.a, w.b]) { if (a.kind === 'pin') boundary.add(a.componentId); else if (!visited.has(a.nodeId)) queue.push(a.nodeId); } }
    if (boundary.size && [...boundary].every(id => ids.has(id)) && ![...cluster].some(id => protectedIds.has(id))) cluster.forEach(id => ids.add(id));
  }
  return ids;
}
export function moveSelection(doc: CircuitDocument, input: Set<string>, delta: Point) {
  if (delta.x === 0 && delta.y === 0) return;
  const ids = movableSelection(doc, input), locked = lockedObjects(doc);
  const move = (p: Point) => ({ x: p.x + delta.x, y: p.y + delta.y });
  for (const c of doc.components) if (ids.has(c.id)) c.position = move(c.position);
  for (const n of doc.nodes) if (ids.has(n.id)) n.position = move(n.position);
  for (const w of doc.wires) if (!locked.has(w.id) && ((anchorSelected(w.a, ids) && anchorSelected(w.b, ids)) || ids.has(w.id))) w.route.vertices = w.route.vertices.map(p => ({ ...p, ...move(p) }));
  for (const a of doc.annotations) if (!locked.has(a.id) && (ids.has(a.id) || (a.anchor && anchorSelected(a.anchor, ids)))) a.position = move(a.position);
  for (const w of doc.wires) if (w.route.mode === 'auto' && !locked.has(w.id) && anchorSelected(w.a, ids) !== anchorSelected(w.b, ids)) reroute(doc, w);
}
export function transformSelection(doc: CircuitDocument, input: Set<string>, kind: 'rotate' | 'mirrorX' | 'mirrorY') {
  const ids = movableSelection(doc, input), locked = lockedObjects(doc); const cs = doc.components.filter(c => ids.has(c.id)), annotations = doc.annotations.filter(a => ids.has(a.id));
  if (!cs.length && !annotations.length) throw new Error('Select a component or annotation to transform');
  const centers = cs.length ? cs.map(c => c.position) : annotations.map(annotationCenter);
  const pivot = centers.length === 1 ? centers[0] : snap({ x: centers.reduce((s, p) => s + p.x, 0) / centers.length, y: centers.reduce((s, p) => s + p.y, 0) / centers.length });
  function change(p: Point): Point { const x = p.x - pivot.x, y = p.y - pivot.y; return { x: pivot.x + (kind === 'rotate' ? -y : kind === 'mirrorX' ? -x : x), y: pivot.y + (kind === 'rotate' ? x : kind === 'mirrorY' ? -y : y) }; }
  for (const c of cs) {
    c.position = change(c.position);
    if (kind === 'rotate') c.rotation = ((c.rotation + 90) % 360) as Component['rotation'];
    else {
      c.rotation = ((360 - c.rotation) % 360) as Component['rotation'];
      if (kind === 'mirrorX') c.mirrorX = !c.mirrorX;
      else c.mirrorY = !c.mirrorY;
    }
  }
  for (const n of doc.nodes) if (ids.has(n.id)) n.position = change(n.position);
  for (const w of doc.wires) if (!locked.has(w.id) && anchorSelected(w.a, ids) && anchorSelected(w.b, ids)) {
    w.route.vertices = w.route.vertices.map(p => ({ ...p, ...change(p) }));
    if (kind === 'rotate' && w.route.geometry === 'orthogonal') w.route.horizontalFirst = !w.route.horizontalFirst;
  }
  for (const a of doc.annotations) if (!locked.has(a.id) && (ids.has(a.id) || a.anchor && anchorSelected(a.anchor, ids))) { const position = change(a.position); a.position = { x: Math.round(position.x), y: Math.round(position.y) }; if (ids.has(a.id) && kind === 'rotate') a.rotation = (a.rotation + 90) % 360; }
}
export function detachComponent(doc: CircuitDocument, componentId: string, pinId?: string) {
  assertUnlocked(doc, componentId);
  const replacements = new Map<string, Anchor>();
  function replace(a: Anchor): Anchor {
    if (a.kind !== 'pin' || a.componentId !== componentId || pinId && a.pinId !== pinId) return a;
    const key = anchorKey(a); if (!replacements.has(key)) replacements.set(key, freeNode(doc, anchorPosition(doc, a))); return clone(replacements.get(key)!);
  }
  for (const w of doc.wires) { w.a = replace(w.a); w.b = replace(w.b); }
  for (const a of doc.annotations) if (a.anchor) a.anchor = replace(a.anchor);
}
export function deleteSelection(doc: CircuitDocument, input: Set<string>, attached = false) {
  // Deleting only a group container leaves its contents; explicitly selected members still delete.
  const groups = new Set(doc.groups.map(g => g.id));
  const ids = selectionMembers(doc, new Set([...input].filter(id => !groups.has(id))));
  for (const g of doc.groups) if (input.has(g.id) && !g.locked) ids.add(g.id);
  if (!ids.size) return;
  const locked = lockedObjects(doc);
  const nodeReferences = () => new Set([...doc.wires.flatMap(w => [w.a, w.b]), ...doc.annotations.flatMap(a => a.anchor ? [a.anchor] : [])].filter((a): a is Extract<Anchor, { kind: 'node' }> => a.kind === 'node').map(a => a.nodeId));
  const referencedBefore = nodeReferences(), standalone = new Set(doc.nodes.filter(node => !referencedBefore.has(node.id)).map(node => node.id));
  for (const node of doc.nodes) if (ids.has(node.id)) {
    const wires = doc.wires.filter(w => [w.a, w.b].some(a => a.kind === 'node' && a.nodeId === node.id));
    const annotations = doc.annotations.filter(a => a.anchor?.kind === 'node' && a.anchor.nodeId === node.id);
    assertUnlocked(doc, ...wires.map(w => w.id), ...annotations.map(a => a.id));
  }
  for (const c of doc.components.filter(c => ids.has(c.id))) {
    if (attached) for (const w of doc.wires) if (!locked.has(w.id) && [w.a, w.b].some(a => a.kind === 'pin' && a.componentId === c.id)) ids.add(w.id);
    detachComponent(doc, c.id);
  }
  // Deleting a junction is an explicit branch deletion, including incident wires.
  for (const w of doc.wires) if ([w.a, w.b].some(a => a.kind === 'node' && ids.has(a.nodeId))) ids.add(w.id);
  doc.components = doc.components.filter(c => !ids.has(c.id)); doc.wires = doc.wires.filter(w => !ids.has(w.id));
  doc.annotations = doc.annotations.filter(a => !ids.has(a.id) && !(a.anchor?.kind === 'node' && ids.has(a.anchor.nodeId)));
  const referenced = nodeReferences();
  doc.nodes = doc.nodes.filter(n => referenced.has(n.id) || !ids.has(n.id) && (n.explicit || locked.has(n.id) || standalone.has(n.id)));
  const remaining = new Set([...doc.components, ...doc.nodes, ...doc.wires, ...doc.annotations].map(item => item.id));
  doc.groups = doc.groups.filter(g => !ids.has(g.id)).map(g => ({ ...g, members: g.members.filter(id => remaining.has(id)) }));
}
export function annotate(doc: CircuitDocument, kind: Annotation['kind'], text: string, position: Point, anchor?: Anchor, global = false) {
  const a: Annotation = { id: uid('a'), kind, text: kind === 'label' ? text.trim() : text, position: snap(position), anchor, global, size: { x: 160, y: 96 }, locked: false, zIndex: 0, rotation: 0, scaleX: 1, scaleY: 1, fontSize: 14 }; doc.annotations.push(a); return a.id;
}
export function reconfigure(doc: CircuitDocument, componentId: string, definition: Definition) {
  const c = doc.components.find(c => c.id === componentId); if (!c) throw new Error('Missing component');
  assertUnlocked(doc, componentId);
  const old = getDefinition(doc, c);
  for (const p of old.pins) if (!definition.pins.some(n => n.id === p.id && n.width === p.width)) detachComponent(doc, c.id, p.id);
  const def = clone(definition); def.id = uid('definition'); doc.definitions.push(def); c.definitionId = def.id;
}
export function insertComponent(doc: CircuitDocument, componentId: string, wireId: string) {
  const c = doc.components.find(c => c.id === componentId), w = doc.wires.find(w => w.id === wireId);
  if (!c || !w) throw new Error('Choose a component and wire');
  assertUnlocked(doc, componentId, wireId);
  const pins = getDefinition(doc, c).pins;
  if (pins.length !== 2 || w.width !== 1 || pins.some(p => p.width !== 1)) throw new Error('Insertion requires a scalar two-pin part');
  const p1: Anchor = { kind: 'pin', componentId, pinId: pins[0].id }, p2: Anchor = { kind: 'pin', componentId, pinId: pins[1].id };
  const pts = wirePoints(doc, w), a = anchorPosition(doc, p1), b = anchorPosition(doc, p2);
  const segment = pts.slice(1).findIndex((p, i) => distanceToSegment(a, pts[i], p).distance === 0 && distanceToSegment(b, pts[i], p).distance === 0);
  if (segment < 0) throw new Error('Both component pins must lie on the same wire segment');
  const former = clone(w); doc.wires = doc.wires.filter(edge => edge.id !== w.id);
  const aFirst = Math.hypot(a.x - pts[segment].x, a.y - pts[segment].y) <= Math.hypot(b.x - pts[segment].x, b.y - pts[segment].y);
  const options = { geometry: former.route.geometry, horizontalFirst: former.route.horizontalFirst, width: former.width };
  const first = addWire(doc, former.a, aFirst ? p1 : p2, pts.slice(1, segment + 1), options), second = addWire(doc, aFirst ? p2 : p1, former.b, pts.slice(segment + 1, -1), options);
  for (const group of doc.groups) if (group.members.includes(former.id)) group.members = [...new Set(group.members.flatMap(id => id === former.id ? [first, second, componentId] : [id]))];
}
export function fragment(doc: CircuitDocument, selection: Set<string>): CircuitDocument {
  const copy = clone(doc), ids = new Set(selection);
  for (const g of doc.groups) if (ids.has(g.id)) g.members.forEach(id => ids.add(id));
  copy.components = copy.components.filter(c => ids.has(c.id));
  copy.wires = copy.wires.filter(w => ids.has(w.id) || [w.a, w.b].some(a => a.kind === 'pin' && ids.has(a.componentId)));
  for (const n of copy.nodes) if (copy.wires.some(w => [w.a, w.b].some(a => a.kind === 'node' && a.nodeId === n.id))) ids.add(n.id);
  const externals = new Map<string, Anchor>();
  function detachExternal(a: Anchor): Anchor {
    if (a.kind === 'pin' && !ids.has(a.componentId)) {
      const key = anchorKey(a); if (!externals.has(key)) externals.set(key, freeNode(copy, anchorPosition(doc, a))); return clone(externals.get(key)!);
    }
    return a;
  }
  for (const w of copy.wires) for (const end of ['a', 'b'] as const) w[end] = detachExternal(w[end]);
  copy.annotations = copy.annotations.filter(a => ids.has(a.id) || a.anchor && (a.anchor.kind === 'pin' ? ids.has(a.anchor.componentId) : ids.has(a.anchor.nodeId)));
  for (const a of copy.annotations) if (a.anchor) a.anchor = detachExternal(a.anchor);
  const nodeIds = new Set(copy.wires.flatMap(w => [w.a, w.b]).concat(copy.annotations.flatMap(a => a.anchor ? [a.anchor] : [])).filter((a): a is Extract<Anchor, { kind: 'node' }> => a.kind === 'node').map(a => a.nodeId));
  copy.nodes = copy.nodes.filter(n => nodeIds.has(n.id) || ids.has(n.id));
  copy.groups = copy.groups.filter(g => ids.has(g.id)).map(g => ({ ...g, members: g.members.filter(id => ids.has(id)) }));
  copy.definitions = copy.definitions.filter(d => copy.components.some(c => c.definitionId === d.id)); copy.id = uid('fragment'); copy.title = 'Circuit snippet'; return copy;
}
export function paste(doc: CircuitDocument, source: CircuitDocument, delta: Point = { x: 32, y: 32 }, isolate = true): string[] {
  const f = clone(source), ids = new Map<string, string>();
  [...f.components, ...f.nodes, ...f.wires, ...f.annotations, ...f.groups].forEach(x => ids.set(x.id, uid('copy')));
  function remap(a: Anchor): Anchor { return a.kind === 'pin' ? { ...a, componentId: ids.get(a.componentId)! } : { ...a, nodeId: ids.get(a.nodeId)! }; }
  const occupied = new Set(doc.components.map(c => c.reference));
  for (const d of f.definitions) {
    const existing = doc.definitions.find(x => x.id === d.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(d)) { const old = d.id; d.id = uid('definition'); f.components.filter(c => c.definitionId === old).forEach(c => c.definitionId = d.id); }
    if (!doc.definitions.some(x => x.id === d.id)) doc.definitions.push(d);
  }
  for (const c of f.components) { const prefix = f.definitions.find(d => d.id === c.definitionId)!.prefix; let n = 1; while (occupied.has(`${prefix}${n}`)) n++; c.reference = `${prefix}${n}`; occupied.add(c.reference); c.id = ids.get(c.id)!; c.position = { x: c.position.x + delta.x, y: c.position.y + delta.y }; c.locked = false; }
  for (const n of f.nodes) { n.id = ids.get(n.id)!; n.position = { x: n.position.x + delta.x, y: n.position.y + delta.y }; }
  for (const w of f.wires) { w.id = ids.get(w.id)!; w.a = remap(w.a); w.b = remap(w.b); w.route.vertices = w.route.vertices.map(p => ({ ...p, id: uid('bend'), x: p.x + delta.x, y: p.y + delta.y })); w.locked = false; }
  const suffix = uid('net').slice(-7); const renamed = new Map<string, string>();
  for (const a of f.annotations) { a.id = ids.get(a.id)!; if (a.anchor) a.anchor = remap(a.anchor); a.position = { x: a.position.x + delta.x, y: a.position.y + delta.y }; if (isolate && a.kind === 'label' && !a.global) { if (!renamed.has(a.text)) renamed.set(a.text, `${a.text}_${suffix}`); a.text = renamed.get(a.text)!; } }
  for (const g of f.groups) { g.id = ids.get(g.id)!; g.members = g.members.map(id => ids.get(id)!); }
  doc.components.push(...f.components); doc.nodes.push(...f.nodes); doc.wires.push(...f.wires); doc.annotations.push(...f.annotations); doc.groups.push(...f.groups);
  return [...f.components, ...f.wires, ...f.annotations, ...f.groups].map(x => x.id);
}
export function align(doc: CircuitDocument, selection: Set<string>, axis: 'x' | 'y', distribute = false) {
  const cs = doc.components.filter(c => selectionMembers(doc, selection).has(c.id)).sort((a, b) => a.position[axis] - b.position[axis]);
  if (cs.length < (distribute ? 3 : 2)) throw new Error(distribute ? 'Select at least three parts' : 'Select at least two parts');
  const lo = cs[0].position[axis], hi = cs[cs.length - 1].position[axis];
  cs.forEach((c, i) => { const target = distribute ? Math.round(lo + (hi - lo) * i / (cs.length - 1)) : lo; const delta = { x: 0, y: 0 }; delta[axis] = target - c.position[axis]; moveSelection(doc, new Set([c.id]), delta); });
}
