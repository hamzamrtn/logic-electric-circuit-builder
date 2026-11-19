/** Engineering-notation quantities used by electrical models and readouts. */
const prefixes: Record<string, number> = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, '': 1, k: 1e3, K: 1e3, M: 1e6, meg: 1e6, Meg: 1e6, MEG: 1e6, G: 1e9, T: 1e12 };
const units = ['Ω', 'ohm', 'ohms', 'R', 'V', 'A', 'F', 'H', 'W', 'Hz', 's'] as const;
export type Unit = 'Ω' | 'V' | 'A' | 'F' | 'H' | 'W' | 'Hz' | 's';
export interface Quantity { value: number; unit?: Unit; }
const canonical = (unit: string): Unit | undefined => unit === 'ohm' || unit === 'ohms' || unit === 'R' || unit === 'Ω' ? 'Ω' : (units as readonly string[]).includes(unit) ? unit as Unit : undefined;

/**
 * Parses one quantity such as `10k`, `4k7`, `4.7 kΩ`, `100nF`, `10µF`, `1meg`, `-5V` or `50 Hz`.
 * Returns undefined for text that is not a single quantity.
 */
export function parseQuantity(text: string): Quantity | undefined {
  const source = text.trim().replace(/\s+/g, '').replace(/^\+/, '');
  if (!source) return undefined;
  // R-notation: 4k7 = 4.7k, 2R2 = 2.2 Ω, 1M5 = 1.5M.
  const rNotation = /^(\d+)(k|K|M|R|m|u|µ|n|p)(\d+)(Ω|ohms?)?$/.exec(source);
  if (rNotation) {
    const [, whole, mark, fraction] = rNotation, scale = mark === 'R' ? 1 : prefixes[mark];
    return { value: Number(`${whole}.${fraction}`) * scale, unit: 'Ω' };
  }
  const match = /^(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(meg|Meg|MEG|[fpnuµμmkKMGT])?(Ω|ohms?|V|A|F|H|W|Hz|s|R)?$/.exec(source);
  if (!match) return undefined;
  const [, number, prefix = '', unit] = match;
  // A bare `m` or `M` after a number with no unit keeps its SI meaning (milli / mega).
  const value = Number(number) * prefixes[prefix];
  if (!Number.isFinite(value)) return undefined;
  return { value, unit: unit ? canonical(unit) : undefined };
}
/** Splits a value such as `12V 5W` or `5V 1kHz` into quantities; undefined when any token is not a quantity. */
export function parseQuantities(text: string): Quantity[] | undefined {
  const tokens = text.trim().split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length) return [];
  const out: Quantity[] = [];
  for (const token of tokens) { const q = parseQuantity(token); if (!q) return undefined; out.push(q); }
  return out;
}
const formatPrefixes: [number, string][] = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
/** Engineering notation with three significant digits: `4.70 V`, `−1.25 mA`, `0 A`. */
export function formatQuantity(value: number, unit: string, digits = 3): string {
  if (!Number.isFinite(value)) return `— ${unit}`;
  const magnitude = Math.abs(value);
  if (magnitude < 1e-15) return `0 ${unit}`;
  let [scale, prefix] = formatPrefixes.find(([s]) => magnitude >= s * 0.9995) ?? formatPrefixes[formatPrefixes.length - 1];
  let scaled = value / scale;
  // Rounding 999.6 m to 1.00 moves to the next prefix.
  if (Math.abs(Number(scaled.toPrecision(digits))) >= 1000 && scale < 1e12) { const next = formatPrefixes[formatPrefixes.findIndex(([s]) => s === scale) - 1]; [scale, prefix] = next; scaled = value / scale; }
  const text = Number(scaled.toPrecision(digits)).toFixed(Math.max(0, digits - 1 - Math.floor(Math.log10(Math.max(Math.abs(Number(scaled.toPrecision(digits))), 1)))));
  return `${text.replace('-', '−')} ${prefix}${unit}`;
}
