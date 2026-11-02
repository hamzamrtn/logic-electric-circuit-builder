export interface ElectricalValue { value: number; unit: string; display: string; }
const prefixes: Record<string, number> = { '': 1, f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };
export function parseElectricalValue(display: string): ElectricalValue | undefined {
  const match = display.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*([fpnuµμmkKMGT]?)(Ω|ohm|F|H|V|A|Hz|s)?$/);
  if (!match) return undefined;
  const value = Number(match[1]) * prefixes[match[2]];
  return Number.isFinite(value) ? { value, unit: match[3] ?? '', display } : undefined;
}
