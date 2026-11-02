import { z } from 'zod';

export const FORMAT = 'logic-electric-circuit';
export const SCHEMA_VERSION = 1;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
const id = z.string().min(1).max(160).regex(/^[\w.:-]+$/);
const text = z.string().max(4000);
const unit = z.number().int().min(-1_000_000).max(1_000_000);
export const pointSchema = z.object({ x: unit, y: unit }).strict();
export type Point = z.infer<typeof pointSchema>;
export const anchorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pin'), componentId: id, pinId: id }).strict(),
  z.object({ kind: z.literal('node'), nodeId: id }).strict(),
]);
export type Anchor = z.infer<typeof anchorSchema>;
const width = z.number().int().min(1).max(256);
const pinSchema = z.object({ id, name: text, x: unit, y: unit,
  side: z.enum(['left', 'right', 'top', 'bottom']),
  role: z.enum(['passive', 'input', 'output', 'power', 'bidirectional', 'tristate']), width,
}).strict();
const primitiveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('path'), d: z.string().max(12000).regex(/^[MmLlHhVvCcSsQqTtAaZz\d\s.,+\-eE]+$/), fill: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('rect'), x: unit, y: unit, width: unit.nonnegative(), height: unit.nonnegative() }).strict(),
  z.object({ kind: z.literal('circle'), x: unit, y: unit, radius: z.number().int().min(0).max(1000) }).strict(),
  z.object({ kind: z.literal('text'), x: unit, y: unit, text, size: z.number().int().min(6).max(64) }).strict(),
]);
export type Primitive = z.infer<typeof primitiveSchema>;
export const definitionSchema = z.object({
  id, version: z.number().int().min(1), name: text, category: text, aliases: z.array(text).max(32), prefix: text,
  pins: z.array(pinSchema).max(256), primitives: z.array(primitiveSchema).max(256),
  bounds: z.object({ x: unit, y: unit, width: unit.nonnegative(), height: unit.nonnegative() }).strict(),
  defaults: z.record(z.string(), z.union([text, z.number(), z.boolean()])),
  laneLinks: z.array(z.object({ a: id, aLane: z.number().int().min(0).max(255), b: id, bLane: z.number().int().min(0).max(255) }).strict()).max(512).optional(),
}).strict();
export type Definition = z.infer<typeof definitionSchema>;
const propertiesSchema = z.record(z.string().max(100), z.union([text, z.number(), z.boolean()]));
export const componentSchema = z.object({
  id, definitionId: id, position: pointSchema, rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  mirrorX: z.boolean(), mirrorY: z.boolean(), reference: text, properties: propertiesSchema, locked: z.boolean(),
}).strict();
export type Component = z.infer<typeof componentSchema>;
const vertexSchema = pointSchema.extend({ id, locked: z.boolean() }).strict();
export const wireSchema = z.object({
  id, a: anchorSchema, b: anchorSchema, width,
  route: z.object({ mode: z.enum(['auto', 'manual']), geometry: z.enum(['orthogonal', 'free']), horizontalFirst: z.boolean(), vertices: z.array(vertexSchema).max(2000) }).strict(),
  locked: z.boolean(),
}).strict();
export type Wire = z.infer<typeof wireSchema>;
const annotationSchema = z.object({
  id, kind: z.enum(['text', 'label', 'no-connect', 'box', 'arrow', 'polarity', 'current']),
  position: pointSchema, text, anchor: anchorSchema.optional(), global: z.boolean(),
  size: pointSchema, locked: z.boolean(), zIndex: z.number().int().min(-10000).max(10000),
  rotation: z.number().min(-360000).max(360000).default(0),
  scaleX: z.number().min(0.1).max(100).default(1),
  scaleY: z.number().min(0.1).max(100).default(1),
  fontSize: z.number().int().min(6).max(256).default(14),
}).strict();
export type Annotation = z.infer<typeof annotationSchema>;
export const documentSchema = z.object({
  format: z.literal(FORMAT), schemaVersion: z.literal(SCHEMA_VERSION), id, title: text,
  components: z.array(componentSchema).max(10000), nodes: z.array(z.object({ id, position: pointSchema, explicit: z.boolean() }).strict()).max(30000),
  wires: z.array(wireSchema).max(30000), annotations: z.array(annotationSchema).max(10000),
  groups: z.array(z.object({ id, name: text, members: z.array(id).max(10000), locked: z.boolean() }).strict()).max(3000),
  definitions: z.array(definitionSchema).max(2000), metadata: z.record(z.string().max(100), text),
}).strict();
export type CircuitDocument = z.infer<typeof documentSchema>;
let serial = 0;
export function uid(prefix = 'id'): string { return `${prefix}-${Date.now().toString(36)}-${(++serial).toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
export function emptyDocument(title = 'Untitled circuit'): CircuitDocument {
  return { format: FORMAT, schemaVersion: 1, id: uid('doc'), title, components: [], nodes: [], wires: [], annotations: [], groups: [], definitions: [], metadata: {} };
}
export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
export function anchorKey(a: Anchor): string { return a.kind === 'pin' ? `p:${a.componentId}:${a.pinId}` : `n:${a.nodeId}`; }
export function getDefinition(doc: CircuitDocument, component: Component): Definition {
  const d = doc.definitions.find(x => x.id === component.definitionId);
  if (!d) throw new Error(`Missing symbol definition for ${component.reference}`);
  return d;
}
export function pinWidth(doc: CircuitDocument, a: Anchor): number | undefined {
  if (a.kind === 'node') return undefined;
  const c = doc.components.find(c => c.id === a.componentId);
  return c && getDefinition(doc, c).pins.find(p => p.id === a.pinId)?.width;
}
export function assertGraph(doc: CircuitDocument): void {
  const all = [...doc.components, ...doc.nodes, ...doc.wires, ...doc.annotations, ...doc.groups];
  if (new Set(all.map(x => x.id)).size !== all.length) throw new Error('Duplicate object IDs');
  const defs = new Map(doc.definitions.map(d => [d.id, d]));
  if (defs.size !== doc.definitions.length) throw new Error('Duplicate definition IDs');
  for (const d of doc.definitions) {
    if (new Set(d.pins.map(p => p.id)).size !== d.pins.length) throw new Error(`Duplicate pins in ${d.name}`);
    for (const l of d.laneLinks ?? []) {
      if (d.category !== 'Buses') throw new Error('Only explicit bus adapters can contain lane links');
      if (!d.pins.some(p => p.id === l.a && l.aLane < p.width) || !d.pins.some(p => p.id === l.b && l.bLane < p.width)) throw new Error('Invalid bus lane mapping');
    }
  }
  for (const c of doc.components) if (!defs.has(c.definitionId)) throw new Error(`Missing definition for ${c.reference}`);
  const components = new Map(doc.components.map(c => [c.id, c]));
  const nodes = new Set(doc.nodes.map(n => n.id));
  const widths = new Map<string, number>();
  function check(a: Anchor, w?: number) {
    if (a.kind === 'node') { if (!nodes.has(a.nodeId)) throw new Error(`Missing node ${a.nodeId}`); }
    else {
      const c = components.get(a.componentId); const pin = c && defs.get(c.definitionId)?.pins.find(p => p.id === a.pinId);
      if (!pin) throw new Error(`Missing pin ${a.componentId}/${a.pinId}`);
      if (w !== undefined && pin.width !== w) throw new Error('Incompatible bus widths; use a splitter');
    }
    if (w !== undefined) {
      const key = anchorKey(a); const previous = widths.get(key);
      if (previous !== undefined && previous !== w) throw new Error('Incompatible widths at a junction');
      widths.set(key, w);
    }
  }
  for (const w of doc.wires) {
    if (anchorKey(w.a) === anchorKey(w.b)) throw new Error('A wire must connect distinct anchors');
    check(w.a, w.width); check(w.b, w.width);
    if (new Set(w.route.vertices.map(p => p.id)).size !== w.route.vertices.length) throw new Error('Duplicate bend IDs');
  }
  for (const a of doc.annotations) {
    if (a.anchor) check(a.anchor);
    if (a.kind === 'label' && (!a.anchor || !a.text.trim())) throw new Error('Net labels need a name and anchor');
  }
  const members = new Set([...doc.components, ...doc.nodes, ...doc.wires, ...doc.annotations].map(x => x.id));
  for (const g of doc.groups) if (g.members.some(m => !members.has(m))) throw new Error('Group contains a missing object');
}
export function parseDocument(raw: string): CircuitDocument {
  if (raw.length > MAX_FILE_BYTES || new TextEncoder().encode(raw).length > MAX_FILE_BYTES) throw new Error('Circuit exceeds the 8 MiB import limit');
  // Limit nesting before JSON.parse, independently of the schema validator.
  let depth = 0, inString = false, escaped = false;
  for (const ch of raw) {
    if (inString) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false; }
    else if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') { if (++depth > 32) throw new Error('Circuit nesting exceeds safety limit'); }
    else if (ch === '}' || ch === ']') depth--;
  }
  const input: unknown = JSON.parse(raw);
  if (input && typeof input === 'object' && 'schemaVersion' in input && input.schemaVersion !== 1) throw new Error(`Unsupported schema version ${String(input.schemaVersion)}. Keep the original file and use a compatible plugin.`);
  const doc = documentSchema.parse(input); assertGraph(doc); return doc;
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => [k, stable(v)]));
  return value;
}
export function serializeDocument(doc: CircuitDocument): string {
  const portable = { ...doc, annotations: doc.annotations.map(a => {
    const { rotation, scaleX, scaleY, fontSize, ...base } = a;
    return { ...base, ...(rotation !== 0 ? { rotation } : {}), ...(scaleX !== 1 ? { scaleX } : {}), ...(scaleY !== 1 ? { scaleY } : {}), ...(fontSize !== 14 ? { fontSize } : {}) };
  }) };
  return JSON.stringify(stable(portable), null, 2) + '\n';
}
