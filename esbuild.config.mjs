import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
const result = await build({ entryPoints: ['src/main.ts'], outfile: 'main.js', bundle: true, format: 'cjs', platform: 'browser', target: 'es2020', external: ['obsidian'], minify: true, metafile: true, define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'eof' });
const notices = await Promise.all(['react', 'react-dom', 'scheduler', 'zod'].map(async name => `${name}\n${await readFile(`node_modules/${name}/LICENSE`, 'utf8')}`));
const source = await readFile('main.js', 'utf8');
const full = `${source}\n/* Third-party licenses\n${notices.join('\n\n').replaceAll('*/', '* /')}\n*/\n`;
await writeFile('main.js', full); result.metafile.outputs['main.js'].bytes = Buffer.byteLength(full);
await writeFile('build-meta.json', JSON.stringify(result.metafile, null, 2));
