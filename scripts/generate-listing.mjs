import { build } from 'esbuild';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// Generates the listing showcase drawings and proves they simulate as described.
const folder = await mkdtemp(`${tmpdir()}/lec-listing-`);
await build({ stdin: { contents: `export { listing, phoneListing } from './scripts/showcase-circuits.ts';
export { runDigital, identifyDigitalModels } from './src/core/topology/digital.ts';
export { digitalCapabilities } from './src/components/definitions/digital.ts';
export { analogCapabilities } from './src/components/definitions/analog.ts';
export { analyzeOperatingPoint, analyzeTransient, suggestDuration } from './src/core/analog/engine.ts';`, resolveDir: process.cwd(), loader: 'ts' }, outfile: `${folder}/listing.mjs`, bundle: true, platform: 'node', format: 'esm' });
const m = await import(pathToFileURL(`${folder}/listing.mjs`).href);
await rm(folder, { recursive: true, force: true });
const [logic, electrical] = m.listing.map(entry => entry.document);
const quick = async () => {}, signal = new AbortController().signal;

// Every BCD digit lights exactly the expected segments.
const digits = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '1011111', '1110000', '1111111', '1111011'];
const byRef = ref => logic.components.find(c => c.reference === ref).id;
for (let digit = 0; digit < 10; digit++) {
  const inputs = ['A', 'B', 'C', 'D'].map((ref, i) => ({ componentId: byRef(ref), value: (digit >> (3 - i)) & 1 }));
  const result = await m.runDigital({ sessionId: 's', revision: 1, runId: digit, document: logic, inputs }, m.digitalCapabilities(), signal, quick);
  assert.equal(result.status, 'valid', JSON.stringify(result.diagnostics));
  assert.equal(result.displays[0].segments.slice(0, 7).join(''), digits[digit], `digit ${digit}`);
}
console.log(`listing-logic: ${logic.components.length} parts, ${logic.wires.length} wires; digits 0-9 verified`);

const registry = m.analogCapabilities(), digitalModels = m.identifyDigitalModels(electrical.definitions, m.digitalCapabilities());
const isDigital = id => !!digitalModels.get(id), request = { document: electrical };
const op = await m.analyzeOperatingPoint(request, registry, isDigital, signal, quick);
assert.equal(op.status, 'valid', JSON.stringify(op.diagnostics));
const duration = m.suggestDuration(request, registry);
const wave = await m.analyzeTransient({ ...request, duration }, registry, isDigital, signal, quick);
assert.equal(wave.status, 'valid', JSON.stringify(wave.diagnostics));
const part = ref => electrical.components.find(c => c.reference === ref).id;
const led = wave.partCurrent.get(part('AM1')), range = a => [Math.min(...a), Math.max(...a)].map(v => +v.toPrecision(3));
const net = name => { const label = electrical.annotations.find(a => a.kind === 'label' && a.text === name); const r = op.parts.get(label.anchor.componentId); return r; };
assert(range(led)[1] > 0.008 && range(led)[0] < 1e-4, `LED current ${range(led)}`);
console.log(`listing-electrical: ${electrical.components.length} parts, ${electrical.wires.length} wires; window ${duration * 1e3} ms; LED ${range(led)} A; diagnostics ${op.diagnostics.map(d => d.severity + ':' + d.message).join(' | ') || 'none'}`);
// Phone compositions: every multiplier input combination and the compact chain's transient.
const [mul, chain] = m.phoneListing.map(entry => entry.document);
for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
  const id = ref => mul.components.find(c => c.reference === ref).id;
  const inputs = [['A1', a >> 1], ['A0', a & 1], ['B1', b >> 1], ['B0', b & 1]].map(([ref, value]) => ({ componentId: id(ref), value }));
  const result = await m.runDigital({ sessionId: 'm', revision: 1, runId: a * 4 + b, document: mul, inputs }, m.digitalCapabilities(), signal, quick);
  assert.equal(result.status, 'valid', JSON.stringify(result.diagnostics));
  const product = [0, 1, 2, 3].reduce((sum, i) => sum + Number(result.probes.find(p => p.componentId === id(`P${i}`)).value) * 2 ** i, 0);
  assert.equal(product, a * b, `${a} × ${b}`);
}
console.log(`mobile-logic: ${mul.components.length} parts, ${mul.wires.length} wires; all 16 products verified`);
const chainModels = m.identifyDigitalModels(chain.definitions, m.digitalCapabilities()), chainRequest = { document: chain };
const chainOp = await m.analyzeOperatingPoint(chainRequest, registry, id => !!chainModels.get(id), signal, quick);
assert.equal(chainOp.status, 'valid', JSON.stringify(chainOp.diagnostics));
const chainWave = await m.analyzeTransient({ ...chainRequest, duration: m.suggestDuration(chainRequest, registry) }, registry, id => !!chainModels.get(id), signal, quick);
assert.equal(chainWave.status, 'valid', JSON.stringify(chainWave.diagnostics));
const ledCurrent = Array.from(chainWave.partCurrent.get(chain.components.find(c => c.reference === 'LED1').id));
assert(Math.max(...ledCurrent) > 0.008 && Math.min(...ledCurrent) < 1e-4, 'compact chain LED does not switch');
console.log(`mobile-electrical: ${chain.components.length} parts, ${chain.wires.length} wires; LED ${(Math.max(...ledCurrent) * 1e3).toFixed(2)} mA peak; diagnostics ${chainOp.diagnostics.map(d => d.message).join(' | ') || 'none'}`);
await mkdir('examples/showcase', { recursive: true });
for (const { document } of m.phoneListing) await writeFile(`examples/showcase/${document.title}.lecircuit`, `${JSON.stringify(document, null, 2)}\n`);
// The lab notes embed these drawings; the listing captures open the same files.
await mkdir('examples/notes', { recursive: true });
for (const { document } of m.listing) await writeFile(`examples/notes/${document.title}.lecircuit`, `${JSON.stringify(document, null, 2)}\n`);
// Values quoted in the example lab note come from this run (steady second half of the window).
// The last two whole 1 kHz periods (3–5 ms) avoid start-up and partial-period bias.
const half = series => Array.from(series).slice(Math.round(series.length * 0.6));
const peak = ref => +Math.max(...half(wave.partVoltage.get(part(ref)))).toPrecision(3), trough = ref => +Math.min(...half(wave.partVoltage.get(part(ref)))).toPrecision(3);
const cmp = half(wave.partVoltage.get(part('U3'))), duty = cmp.filter(v => v > 0).length / cmp.length;
console.log(JSON.stringify({ vin: [trough('V1'), peak('V1')], amp: [trough('U1'), peak('U1')], filt: [trough('U2'), peak('U2')], cmp: [trough('U3'), peak('U3')], duty: +duty.toFixed(3), ledMax: +Math.max(...half(led)).toPrecision(3), ref: +op.parts.get(part('R2')).voltage.toPrecision(3), q1: op.parts.get(part('Q1')).state }));
