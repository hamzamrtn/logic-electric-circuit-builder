import { clone, emptyDocument, type CircuitDocument } from '../../src/core/model/document';
import { findPart } from '../../src/components/definitions/library';

/** Real editor graph, with IDs independent of display references and geometry. */
export function digitalFixture(kind: 'half-adder' | 'mux' | 'chain' = 'half-adder', count = 128) {
  const document = emptyDocument(`D0 ${kind}`); document.id = `d0-${kind}`;
  const add = (id: string, part: string, x: number, y: number) => {
    const definition = findPart(part);
    if (!document.definitions.some(d => d.id === definition.id)) document.definitions.push(clone(definition));
    document.components.push({ id, definitionId: definition.id, position: { x, y }, rotation: 0, mirrorX: false, mirrorY: false, reference: id.toUpperCase(), properties: {}, locked: false });
  };
  const connect = (source: string, pin: string, target: string, targetPin: string) => {
    document.wires.push({ id: `wire-${document.wires.length}`, a: { kind: 'pin', componentId: source, pinId: pin }, b: { kind: 'pin', componentId: target, pinId: targetPin }, width: 1, route: { mode: 'auto', geometry: 'orthogonal', horizontalFirst: true, vertices: [] }, locked: false });
  };
  add('a', 'Logic input', -240, -80); add('sum', 'Output probe', 240, -80);
  if (kind === 'chain') {
    for (let i = 0; i < count; i++) { add(`g${i}`, 'NOT', i * 128, 80); connect(i ? `g${i - 1}` : 'a', i ? 'out' : 'out-0', `g${i}`, 'in-0'); }
    connect(`g${count - 1}`, 'out', 'sum', 'in-0');
  } else {
    add('b', 'Logic input', -240, 80);
    if (kind === 'half-adder') {
      add('xor', 'XOR', 0, -80); add('and', 'AND', 0, 80); add('carry', 'Output probe', 240, 80);
      for (const gate of ['xor', 'and']) { connect('a', 'out-0', gate, 'in-0'); connect('b', 'out-0', gate, 'in-1'); }
      connect('xor', 'out', 'sum', 'in-0'); connect('and', 'out', 'carry', 'in-0');
    } else {
      add('select', 'Logic input', -400, 240); add('invert', 'NOT', -160, 240);
      add('left', 'AND', 0, -80); add('right', 'AND', 0, 80); add('merge', 'OR', 160, 0);
      connect('select', 'out-0', 'invert', 'in-0'); connect('a', 'out-0', 'left', 'in-0'); connect('invert', 'out', 'left', 'in-1');
      connect('b', 'out-0', 'right', 'in-0'); connect('select', 'out-0', 'right', 'in-1');
      connect('left', 'out', 'merge', 'in-0'); connect('right', 'out', 'merge', 'in-1'); connect('merge', 'out', 'sum', 'in-0');
    }
  }
  return document;
}
export function reverseLayout(document: CircuitDocument) {
  const changed = clone(document); changed.components.reverse(); changed.wires.reverse();
  for (const component of changed.components) { component.rotation = 90; component.position = { x: -component.position.y, y: component.position.x }; component.reference = 'Renamed'; }
  return changed;
}
export function digitalStressFixture(kind: 'dense' | 'lanes' | 'large-definition') {
  const doc = digitalFixture('chain', kind === 'dense' ? 250 : 1);
  if (kind === 'large-definition') {
    const definition = doc.definitions.find(d => d.name === 'NOT')!;
    definition.primitives = Array.from({ length: 256 }, () => ({ kind: 'path', d: 'M 0 0 '.repeat(1700) }));
  } else if (kind === 'lanes') {
    doc.components = []; doc.definitions = []; doc.wires = []; doc.nodes = [];
    for (let i = 0; i < 1024; i++) doc.nodes.push({ id: `node-${i}`, position: { x: i, y: 0 }, explicit: true });
    for (let i = 0; i < 512; i++) doc.wires.push({ id: `lanes-${i}`, a: { kind: 'node', nodeId: `node-${2 * i}` }, b: { kind: 'node', nodeId: `node-${2 * i + 1}` }, width: 7, route: { mode: 'auto', geometry: 'orthogonal', horizontalFirst: true, vertices: [] }, locked: false });
  } else {
    doc.wires = []; doc.nodes.push({ id: 'shared', position: { x: 0, y: 0 }, explicit: true });
    const definition = clone(findPart('AND')); doc.definitions.push(definition);
    for (const component of doc.components.filter(c => c.id.startsWith('g'))) {
      component.definitionId = definition.id;
      for (const pinId of ['in-0', 'in-1', 'out']) doc.wires.push({ id: `dense-${doc.wires.length}`, a: { kind: 'pin', componentId: component.id, pinId }, b: { kind: 'node', nodeId: 'shared' }, width: 1, route: { mode: 'auto', geometry: 'orthogonal', horizontalFirst: true, vertices: [] }, locked: false });
    }
  }
  return doc;
}
