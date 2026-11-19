import { clone } from '../../core/model/document';
import type { AnalogCapability, AnalogModel } from '../../core/analog/models';
import { findPart } from './library';

/** Explicit electrical allowlist. Names/references never infer behavior on imported symbols. */
const parts: [string, AnalogModel][] = [
  ['Resistor', 'resistor'], ['Resistor (zigzag)', 'resistor'], ['Variable resistor', 'resistor'], ['Potentiometer', 'potentiometer'],
  ['Capacitor', 'capacitor'], ['Polarized capacitor', 'capacitor'], ['Inductor', 'inductor'], ['Fuse', 'fuse'],
  ['Battery', 'dc-voltage'], ['DC voltage source', 'dc-voltage'], ['AC voltage source', 'ac-voltage'], ['Current source', 'current-source'],
  ['VCVS', 'vcvs'], ['VCCS', 'vccs'], ['CCVS', 'ccvs'], ['CCCS', 'cccs'],
  ['Diode', 'diode'], ['Zener diode', 'zener'], ['LED', 'led'], ['NPN', 'npn'], ['PNP', 'pnp'], ['NMOS', 'nmos'], ['PMOS', 'pmos'],
  ['SPST switch', 'spst'], ['SPDT switch', 'spdt'], ['Normally open button', 'push-no'], ['Normally closed button', 'push-nc'],
  ['Op-amp', 'op-amp'], ['Comparator', 'comparator'],
  ['Lamp', 'lamp'], ['Motor', 'motor'], ['Voltmeter', 'voltmeter'], ['Ammeter', 'ammeter'], ['Scope probe', 'scope-probe'],
  ['Ground', 'ground'], ['Power rail', 'power-rail'], ['Test point', 'test-point'],
];
export function analogCapabilities(): AnalogCapability[] { return parts.map(([name, model]) => ({ definition: clone(findPart(name)), model })); }
