import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const folder = await mkdtemp(`${tmpdir()}/lec-note-showcase-`);
await build({ entryPoints: ['scripts/showcase-circuits.ts'], outfile: `${folder}/showcase.mjs`, bundle: true, platform: 'node', format: 'esm' });
const { noteShowcase } = await import(pathToFileURL(`${folder}/showcase.mjs`).href);
await mkdir('examples/notes', { recursive: true });
for (const { key, document } of noteShowcase) {
  await writeFile(`examples/notes/${key}.lecircuit`, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`${key}: ${document.components.length} parts, ${document.wires.length} wires`);
}
