import { serializeDocument, type Definition } from '../model/document';

/** Electrical behaviors. Each is selected only by an exact canonical definition, never by name. */
export type AnalogModel =
  | 'resistor' | 'potentiometer' | 'capacitor' | 'inductor' | 'fuse'
  | 'dc-voltage' | 'ac-voltage' | 'current-source' | 'vcvs' | 'vccs' | 'ccvs' | 'cccs'
  | 'diode' | 'zener' | 'led' | 'npn' | 'pnp' | 'nmos' | 'pmos'
  | 'spst' | 'spdt' | 'push-no' | 'push-nc'
  | 'op-amp' | 'comparator'
  | 'lamp' | 'motor' | 'voltmeter' | 'ammeter' | 'scope-probe'
  | 'ground' | 'power-rail' | 'test-point';
export interface AnalogCapability { definition: Definition; model: AnalogModel; }
/** Parts whose state the user toggles while simulating. */
export const SWITCH_MODELS: readonly AnalogModel[] = ['spst', 'spdt', 'push-no', 'push-nc'];
export const switchDefault = (model: AnalogModel) => model === 'push-nc' || model === 'spdt';

const signatures = new WeakMap<Definition, string>();
const serialize = (definition: Definition) => serializeDocument({ format: 'logic-electric-circuit', schemaVersion: 1, id: 'signature', title: '', components: [], nodes: [], wires: [], annotations: [], groups: [], metadata: {}, definitions: [definition] });
const cached = (definition: Definition) => { let value = signatures.get(definition); if (value === undefined) { value = serialize(definition); signatures.set(definition, value); } return value; };
/** Complete-definition matching, as for digital models. Modified or custom symbols stay drawing-only. */
export function identifyAnalogModels(definitions: readonly Definition[], registry: readonly AnalogCapability[]): Map<string, AnalogModel | undefined> {
  const byId = new Map(registry.map(c => [c.definition.id, c]));
  return new Map(definitions.map(definition => {
    const candidate = byId.get(definition.id);
    if (!candidate || definition.pins.length !== candidate.definition.pins.length || definition.primitives.length !== candidate.definition.primitives.length) return [definition.id, undefined];
    return [definition.id, serialize(definition) === cached(candidate.definition) ? candidate.model : undefined];
  }));
}
