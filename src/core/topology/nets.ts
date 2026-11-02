import { type Anchor, type CircuitDocument, anchorKey, getDefinition, pinWidth } from '../model/document';
function labelWidth(doc: CircuitDocument, a: Anchor) { return pinWidth(doc, a) ?? doc.wires.find(w => anchorKey(w.a) === anchorKey(a) || anchorKey(w.b) === anchorKey(a))?.width ?? 1; }
export interface Net { id: string; name: string; members: string[]; wireIds: string[]; }
export function deriveNets(doc: CircuitDocument): Net[] {
  const parent = new Map<string, string>();
  function find(x: string): string { if (!parent.has(x)) parent.set(x, x); let r = x; while (parent.get(r) !== r) r = parent.get(r)!; while (x !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; } return r; }
  function join(a: string, b: string) { const ra = find(a), rb = find(b); if (ra !== rb) { parent.set(rb, ra < rb ? ra : rb); parent.set(ra, ra < rb ? ra : rb); } }
  const lane = (a: Anchor, bit: number) => `${anchorKey(a)}[${bit}]`;
  for (const c of doc.components) {
    const def = getDefinition(doc, c);
    for (const p of def.pins) for (let i = 0; i < p.width; i++) find(lane({ kind: 'pin', componentId: c.id, pinId: p.id }, i));
    for (const l of def.laneLinks ?? []) join(lane({ kind: 'pin', componentId: c.id, pinId: l.a }, l.aLane), lane({ kind: 'pin', componentId: c.id, pinId: l.b }, l.bLane));
  }
  for (const w of doc.wires) for (let i = 0; i < w.width; i++) join(lane(w.a, i), lane(w.b, i));
  const named = new Map<string, string>(), labelGroups = new Map<string, { anchor: Anchor; width: number }[]>();
  for (const a of doc.annotations) if (a.kind === 'label' && a.anchor) { const name = a.text.trim(), group = labelGroups.get(name) ?? []; group.push({ anchor: a.anchor, width: labelWidth(doc, a.anchor) }); labelGroups.set(name, group); }
  for (const [name, group] of labelGroups) {
    const width = group[0].width;
    // An incompatible named bus is diagnosed and never partially connected.
    if (!group.every(x => x.width === width)) continue;
    for (let i = 0; i < width; i++) { const key = width > 1 ? `${name}[${i}]` : name, first = lane(group[0].anchor, i); named.set(key, first); for (const item of group.slice(1)) join(first, lane(item.anchor, i)); }
  }
  const nets = new Map<string, Net>();
  for (const p of parent.keys()) { const root = find(p); const net = nets.get(root) ?? { id: root, name: '', members: [], wireIds: [] }; net.members.push(p); nets.set(root, net); }
  for (const w of doc.wires) for (let i = 0; i < w.width; i++) { const net = nets.get(find(lane(w.a, i)))!; if (!net.wireIds.includes(w.id)) net.wireIds.push(w.id); }
  for (const [name, anchor] of [...named].sort(([a], [b]) => a.localeCompare(b, 'en'))) { const net = nets.get(find(anchor))!; if (!net.name) net.name = name; }
  return [...nets.values()].map((n, i) => ({ ...n, name: n.name || `Net ${i + 1}`, members: n.members.sort(), wireIds: n.wireIds.sort() }));
}
export interface Diagnostic { id: string; severity: 'warning' | 'info'; message: string; objectIds: string[]; }
export function diagnostics(doc: CircuitDocument): Diagnostic[] {
  const out: Diagnostic[] = [];
  const labels = new Map<string, typeof doc.annotations>();
  for (const a of doc.annotations) if (a.kind === 'label' && a.anchor) { const group = labels.get(a.text.trim()) ?? []; group.push(a); labels.set(a.text.trim(), group); }
  for (const [name, group] of labels) if (new Set(group.map(a => labelWidth(doc, a.anchor!))).size > 1) out.push({ id: `label-width-${name}`, severity: 'warning', message: `Named net ${name} has incompatible widths; its label connections are disabled`, objectIds: group.map(a => a.id) });
  for (const n of doc.nodes) {
    const incident = doc.wires.filter(w => [w.a, w.b].some(a => a.kind === 'node' && a.nodeId === n.id));
    if (incident.length === 1) out.push({ id: `dangling-${n.id}`, severity: 'warning', message: 'Dangling wire end', objectIds: [n.id, incident[0].id] });
  }
  for (const net of deriveNets(doc)) {
    const names = new Set(doc.annotations.filter(a => a.kind === 'label' && a.anchor && net.members.includes(`${anchorKey(a.anchor)}[0]`)).map(a => a.text.trim()));
    if (names.size > 1) out.push({ id: `names-${net.id}`, severity: 'warning', message: `Different labels share a net: ${[...names].sort().join(', ')}`, objectIds: net.wireIds });
    const outputs = net.members.filter(m => doc.components.some(c => getDefinition(doc, c).pins.some(p => p.role === 'output' && m === `p:${c.id}:${p.id}[0]`)));
    if (outputs.length > 1) out.push({ id: `drivers-${net.id}`, severity: 'warning', message: 'Multiple output drivers share a net', objectIds: net.wireIds });
  }
  for (const a of doc.annotations) if (a.kind === 'no-connect' && a.anchor && doc.wires.some(w => anchorKey(w.a) === anchorKey(a.anchor!) || anchorKey(w.b) === anchorKey(a.anchor!))) out.push({ id: `nc-${a.id}`, severity: 'warning', message: 'A no-connect pin has a wire', objectIds: [a.id] });
  return out;
}
