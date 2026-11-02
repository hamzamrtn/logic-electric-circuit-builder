import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const folder = await mkdtemp(`${tmpdir()}/lec-examples-`);
await build({ entryPoints: ['src/components/definitions/examples.ts'], outfile: `${folder}/examples.mjs`, bundle: true, platform: 'node', format: 'esm' });
const { examples } = await import(pathToFileURL(`${folder}/examples.mjs`).href);
await build({ entryPoints: ['src/core/model/document.ts'], outfile: `${folder}/document.mjs`, bundle: true, platform: 'node', format: 'esm' });
const { serializeDocument, parseDocument } = await import(pathToFileURL(`${folder}/document.mjs`).href);
for (const example of examples) { const raw = serializeDocument(example.document); parseDocument(raw); await writeFile(`examples/${example.document.id.replace('example-', '')}.lecircuit`, raw); }
console.log(`Generated ${examples.length} validated circuit examples.`);
