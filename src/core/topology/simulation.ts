import type { CircuitDocument } from '../model/document';
import type { Net } from './nets';
/** Historical placeholder. The experimental D0 contract is in digital.ts; production simulation is not available. */
export interface SimulationAdapter {
  analyze(input: { revision: number; document: CircuitDocument; nets: Net[] }, signal: { readonly aborted: boolean }): Promise<{
    revision: number;
    measurements: { terminal: string; value: number | 'X' | 'Z'; unit: string }[];
    diagnostics: { objectId: string; message: string }[];
  }>;
}
