import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';

const editorCaptures = JSON.parse(await readFile('docs/screenshots/captures.json', 'utf8'));
const noteCaptures = JSON.parse(await readFile('docs/screenshots/note-captures.json', 'utf8'));
const captures = [...noteCaptures, ...editorCaptures];
const listing = await readFile('docs/listing-description.md', 'utf8');
const paragraphs = listing.split('\n\n');
const short = paragraphs[2], long = paragraphs[4];
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
if (short !== manifest.description || short.length > 200 || long.length > 1000) throw new Error('Listing copy mismatch or length exceeded');
if (editorCaptures.length !== 10 || editorCaptures.filter(c => c.file.startsWith('desktop-')).length !== 5 || editorCaptures.filter(c => c.file.startsWith('mobile-')).length !== 5) throw new Error('Expected five desktop and five mobile captures');
if (noteCaptures.length !== 2 || noteCaptures[0].file !== 'note-logic-light.png' || noteCaptures[1].file !== 'note-electrical-dark.png' || noteCaptures.some(c => !c.sourceNote || !c.host?.startsWith('Obsidian '))) throw new Error('Expected two native Obsidian note captures');
if (new Set(captures.map(c => c.file)).size !== captures.length) throw new Error('Duplicate screenshot filename');

const files = new Map(), evidence = [];
for (const capture of captures) {
  const data = await readFile(`docs/screenshots/${capture.file}`);
  if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Invalid PNG: ${capture.file}`);
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
  if (`${width} × ${height}` !== capture.pixels) throw new Error(`Image dimensions differ: ${capture.file}`);
  files.set(`screenshots/${capture.file}`, data);
  files.set(capture.fixture, await readFile(capture.fixture));
  if (capture.sourceNote) files.set(capture.sourceNote, await readFile(capture.sourceNote));
  if (capture.style) files.set(capture.style, await readFile(capture.style));
  evidence.push({ file: capture.file, width, height, sha256: createHash('sha256').update(data).digest('hex') });
}
files.set('listing-description.md', Buffer.from(listing));
files.set('captures.json', Buffer.from(`${JSON.stringify(captures, null, 2)}\n`));
files.set('note-captures.json', Buffer.from(`${JSON.stringify(noteCaptures, null, 2)}\n`));
files.set('image-hashes.json', Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`));
files.set('examples/notes/README.md', await readFile('examples/notes/README.md'));
files.set('README.txt', Buffer.from('Twelve original captures: two student-style example notes in native desktop Obsidian (light logic and dark electrical), followed by five desktop and five phone editor layouts. Phone editor captures use Chromium touch emulation. Drawings are included under examples/showcase and examples/notes; the two Markdown notes are in examples/notes. Copy examples/notes into your vault at that path to use the embedded previews. Illustrative schematics; not simulated or electrically qualified reference designs. Lead listing images with the note captures. Copy listing paragraphs from listing-description.md. Source: https://github.com/hamzamrtn/logic-electric-circuit-builder\n'));

// Small dependency-free ZIP writer; all entry names are fixed ASCII paths.
const chunks = [], directory = []; let offset = 0;
function crc32(data) { let crc = 0xffffffff; for (const b of data) { crc ^= b; for (let i = 0; i < 8; i++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
for (const [name, data] of files) {
  const packed = deflateRawSync(data), filename = Buffer.from(name), crc = crc32(data);
  const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8); header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
  chunks.push(header, filename, packed);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
  directory.push(central, filename); offset += header.length + filename.length + packed.length;
}
const central = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
await mkdir('dist', { recursive: true });
await writeFile('dist/plugin-listing-screenshots.zip', Buffer.concat([...chunks, central, end]));
await writeFile('docs/screenshots/image-hashes.json', `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Packaged twelve PNGs, twelve editable circuits, two source notes and listing copy (${short.length}/200; ${long.length}/1000 characters).`);
