import { clone } from '../../core/model/document';
import type { DigitalCapability, DigitalModel, GateModel } from '../../core/topology/digital';
import { findPart, makeGate } from './library';

const gates: [string, GateModel][] = [['AND', 'and-v1'], ['NAND', 'nand-v1'], ['OR', 'or-v1'], ['NOR', 'nor-v1'], ['XOR', 'xor-v1'], ['XNOR', 'xnor-v1']];
/** Explicit allowlist. Names/references never infer behavior on imported symbols. */
export function digitalCapabilities(): DigitalCapability[] {
  const io: [string, DigitalModel][] = [['Logic input', 'input-v1'], ['Output probe', 'probe-v1'], ['Seven-segment display', 'display7-v1'], ['Buffer', 'buffer-v1'], ['NOT', 'not-v1']];
  return [
    ...io.map(([name, model]) => ({ definition: clone(findPart(name)), model })),
    // The inspector's Gate inputs option produces these exact canonical definitions.
    ...gates.flatMap(([name, model]) => [2, 3, 4, 5, 6, 7, 8].map(count => ({ definition: clone(makeGate(name, count)), model }))),
  ];
}
