import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const folder = await mkdtemp(`${tmpdir()}/lec-showcase-`);
await build({ entryPoints: ['scripts/showcase-circuits.ts'], outfile: `${folder}/showcase.mjs`, bundle: true, platform: 'node', format: 'esm' });
const { showcase } = await import(pathToFileURL(`${folder}/showcase.mjs`).href);
await mkdir('examples/showcase', { recursive: true });
for (const { key, document } of showcase) {
  await writeFile(`examples/showcase/${key}.lecircuit`, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`${key}: ${document.components.length} parts, ${document.wires.length} wires`);
}
