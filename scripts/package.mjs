import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import './check-artifacts.mjs';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const folder = `dist/${manifest.id}`; await mkdir(folder, { recursive: true });
const chunks = [], directory = []; let offset = 0;
function crc32(data) { let crc = 0xffffffff; for (const b of data) { crc ^= b; for (let i = 0; i < 8; i++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
for (const name of ['main.js', 'manifest.json', 'styles.css']) {
  await copyFile(name, `${folder}/${name}`); const data = await readFile(name), packed = deflateRawSync(data), filename = Buffer.from(`${manifest.id}/${name}`), crc = crc32(data);
  const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8); header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
  chunks.push(header, filename, packed);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42); directory.push(central, filename); offset += header.length + filename.length + packed.length;
}
const centralData = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(3, 8); end.writeUInt16LE(3, 10); end.writeUInt32LE(centralData.length, 12); end.writeUInt32LE(offset, 16);
await writeFile(`dist/${manifest.id}-${manifest.version}.zip`, Buffer.concat([...chunks, centralData, end]));
console.log(`Packaged ${folder}/ and dist/${manifest.id}-${manifest.version}.zip`);
