import { expect, it } from 'vitest';
import fc from 'fast-check';
import { clone, type Anchor } from '../../src/core/model/document';
import { digitalCapabilities } from '../../src/components/definitions/digital';
import { runDigital, type DigitalModel, type DigitalRequest, type LogicValue } from '../../src/core/topology/digital';
import { digitalFixture } from '../fixtures/digital';

type Gate = Exclude<DigitalModel, 'input-v1' | 'probe-v1' | 'display7-v1'>;
const single = (model: Gate) => model === 'not-v1' || model === 'buffer-v1';
const values: readonly LogicValue[] = [0, 1, 'X', 'Z'];
const resolution = ['0XX0', 'X1X1', 'XXXX', '01XZ'];
const tables: Record<Gate, readonly string[]> = {
  'and-v1': ['0000', '01XX', '0XXX', '0XXX'],
  'or-v1': ['01XX', '1111', 'X1XX', 'X1XX'],
  'xor-v1': ['01XX', '10XX', 'XXXX', 'XXXX'],
  'not-v1': ['10XX'],
  'nand-v1': ['1111', '10XX', '1XXX', '1XXX'],
  'nor-v1': ['10XX', '0000', 'X0XX', 'X0XX'],
  'xnor-v1': ['10XX', '01XX', 'XXXX', 'XXXX'],
  'buffer-v1': ['01XX'],
};
const fromCharacter = (value: string): LogicValue => value === '0' ? 0 : value === '1' ? 1 : value === 'Z' ? 'Z' : 'X';
const resolved = (drivers: readonly LogicValue[]) => drivers.reduce<LogicValue>((value, driver) => fromCharacter(resolution[values.indexOf(value)][values.indexOf(driver)]), 'Z');
const gateValue = (model: Gate, inputs: LogicValue[]): LogicValue => single(model)
  ? fromCharacter(tables[model][0][values.indexOf(inputs[0])])
  : fromCharacter(tables[model][values.indexOf(inputs[0])][values.indexOf(inputs[1])]);

it('500 four-state multi-driver DAGs match independent literal tables on every output net', async () => {
  const value = fc.constantFrom<LogicValue>(0, 1, 'X', 'Z');
  const driver = fc.record({ model: fc.constantFrom<Gate>('and-v1', 'or-v1', 'xor-v1', 'not-v1', 'nand-v1', 'nor-v1', 'xnor-v1', 'buffer-v1'), left: fc.nat(1024), right: fc.nat(1024) });
  const level = fc.array(fc.array(driver, { minLength: 1, maxLength: 3 }), { minLength: 3, maxLength: 3 });
  const registry = digitalCapabilities();
  await fc.assert(fc.asyncProperty(fc.tuple(value, value, value, value), fc.array(level, { minLength: 4, maxLength: 4 }), async (sourceValues, levels) => {
    const document = digitalFixture(), component = clone(document.components[0]), wire = clone(document.wires[0]);
    document.components = []; document.wires = []; document.definitions = registry.map(capability => clone(capability.definition));
    const inputs: DigitalRequest['inputs'][number][] = [], terminals = new Map<string, Anchor[]>();
    const expected = new Map<string, LogicValue[]>(), producers = new Map<string, string[]>(), netNames: string[] = [];
    function add(id: string, model: DigitalModel, output: string | undefined, inputNets: string[] = []) {
      document.components.push({ ...clone(component), id, reference: id, definitionId: registry.find(capability => capability.model === model)!.definition.id });
      const connect = (pinId: string, net: string) => { const members = terminals.get(net) ?? []; members.push({ kind: 'pin', componentId: id, pinId }); terminals.set(net, members); };
      if (output) { connect(model === 'input-v1' ? 'out-0' : 'out', output); const ids = producers.get(output) ?? []; ids.push(id); producers.set(output, ids); }
      inputNets.forEach((net, index) => connect(`in-${index}`, net));
    }
    sourceValues.forEach((value, index) => {
      const net = `source-net-${index}`, componentId = `source-${index}`; netNames.push(net); expected.set(net, [value]); inputs.push({ componentId, value }); add(componentId, 'input-v1', net);
    });
    levels.forEach((nets, levelIndex) => {
      const upstream = [...netNames];
      nets.forEach((drivers, netIndex) => {
        const net = `level-${levelIndex}-net-${netIndex}`; netNames.push(net); expected.set(net, []);
        drivers.forEach((driver, driverIndex) => {
          const inputNets = [upstream[driver.left % upstream.length], ...(single(driver.model) ? [] : [upstream[driver.right % upstream.length]])];
          add(`gate-${levelIndex}-${netIndex}-${driverIndex}`, driver.model, net, inputNets);
          expected.get(net)!.push(gateValue(driver.model, inputNets.map(name => resolved(expected.get(name)!))));
        });
      });
    });
    for (const net of netNames) add(`probe-${net}`, 'probe-v1', undefined, [net]);
    for (const members of terminals.values()) for (const member of members.slice(1)) document.wires.push({ ...clone(wire), id: `wire-${document.wires.length}`, a: members[0], b: member });
    const result = await runDigital({ sessionId: 'generated', runId: 1, revision: 0, document, inputs }, registry, new AbortController().signal, async () => {});
    expect(result.status).toBe('valid');
    expect(new Map(result.probes.map(probe => [probe.componentId, probe.value]))).toEqual(new Map(netNames.map(net => [`probe-${net}`, resolved(expected.get(net)!)])));
    const conflicts = netNames.filter(net => expected.get(net)!.includes(0) && expected.get(net)!.includes(1)).map(net => producers.get(net)!.slice().sort().join(','));
    expect(new Set(result.diagnostics.filter(diagnostic => diagnostic.code === 'driver-conflict').map(diagnostic => diagnostic.objectIds.join(',')))).toEqual(new Set(conflicts));
  }), { numRuns: 500, seed: 839773 });
});
