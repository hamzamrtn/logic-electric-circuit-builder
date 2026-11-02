import { expect, it } from 'vitest';
import { parseElectricalValue } from '../../src/core/model/values';
import { emptyDocument, serializeDocument } from '../../src/core/model/document';
import { addWire, annotate, place, reconfigure, moveSelection } from '../../src/core/commands/operations';
import { DocumentSession } from '../../src/core/session/DocumentSession';
import { findPart, makeBusSplitter } from '../../src/components/definitions/library';
import { deriveNets, diagnostics } from '../../src/core/topology/nets';
it('parses engineering prefixes without changing display text or evaluating expressions', () => {
  expect(parseElectricalValue('10k')?.value).toBe(10000); expect(parseElectricalValue('100nF')?.value).toBeCloseTo(1e-7); expect(parseElectricalValue('10MΩ')?.value).toBe(1e7); expect(parseElectricalValue('10mA')?.value).toBe(.01); expect(parseElectricalValue('1 + alert(1)')).toBeUndefined(); expect(parseElectricalValue('10k')?.display).toBe('10k');
});
it('same named bus connects each lane and mismatched names cannot partially merge buses', () => {
  const d = emptyDocument(), a = place(d, makeBusSplitter(4), { x: 0, y: 0 }), b = place(d, makeBusSplitter(4), { x: 240, y: 0 });
  const aa = { kind: 'pin' as const, componentId: a.id, pinId: 'in-0' }, ba = { kind: 'pin' as const, componentId: b.id, pinId: 'in-0' };
  annotate(d, 'label', 'DATA', { x: 0, y: -80 }, aa); annotate(d, 'label', 'DATA', { x: 240, y: -80 }, ba);
  expect(deriveNets(d)).toHaveLength(4); reconfigure(d, b.id, makeBusSplitter(2)); expect(deriveNets(d)).toHaveLength(6); expect(diagnostics(d).some(x => x.message.includes('incompatible widths'))).toBe(true);
});
it('reconfiguring a connected bus pin leaves the original wire as a full-width dangling end', () => {
  const d = emptyDocument(), c = place(d, makeBusSplitter(8), { x: 0, y: 0 }); addWire(d, { kind: 'pin', componentId: c.id, pinId: 'in-0' }, { kind: 'free', point: { x: -200, y: 0 } }); reconfigure(d, c.id, makeBusSplitter(4)); expect(d.wires[0].width).toBe(8); expect(d.wires[0].a.kind).toBe('node');
});
it('coalesces repeated nudges but keeps later operations separate', () => {
  const d = emptyDocument(), c = place(d, findPart('Resistor'), { x: 0, y: 0 }), s = new DocumentSession(d), before = serializeDocument(d);
  for (let i = 0; i < 20; i++) s.edit('Nudge', d => moveSelection(d, new Set([c.id]), { x: 1, y: 0 }), 'same-selection');
  expect(s.getSnapshot().document.components[0].position.x).toBe(20); s.undo(); expect(serializeDocument(s.getSnapshot().document)).toBe(before); expect(s.getSnapshot().canUndo).toBe(false);
});
