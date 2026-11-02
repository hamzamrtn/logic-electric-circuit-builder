import type { CircuitDocument } from '../model/document';
import type { Net } from './nets';
/** Optional future engine boundary. The editor does not implement simulation. */
export interface SimulationAdapter {
  analyze(input: { revision: number; document: CircuitDocument; nets: Net[] }, signal: { readonly aborted: boolean }): Promise<{
    revision: number;
    measurements: { terminal: string; value: number | 'X' | 'Z'; unit: string }[];
    diagnostics: { objectId: string; message: string }[];
  }>;
}
