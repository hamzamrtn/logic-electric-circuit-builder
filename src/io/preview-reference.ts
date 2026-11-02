export interface PreviewOptions { path: string; width: string; }
export function parsePreviewOptions(source: string): PreviewOptions {
  const lines = source.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length || !lines[0].endsWith('.lecircuit')) throw new Error('Put a .lecircuit file path on the first line');
  let width = '400px';
  for (const line of lines.slice(1)) {
    const match = line.match(/^width:\s*(\d+(?:\.\d+)?)(px|%)?$/i);
    if (!match) throw new Error('Use width: 400px or width: 50% below the file path');
    const number = Number(match[1]), unit = match[2] || 'px';
    if (number <= 0 || number > (unit === '%' ? 100 : 4096)) throw new Error('Width must be 1–4096px or up to 100%');
    width = `${number}${unit}`;
  }
  return { path: lines[0], width };
}
function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) throw new Error('Circuit path leaves the vault'); parts.pop(); }
    else parts.push(part);
  }
  return parts.join('/');
}
export interface PreviewFileLookup<T> {
  byPath: (path: string) => T | undefined;
  byName: (name: string) => T[];
}
export function resolvePreviewFile<T extends { path: string; name: string }>(files: T[] | PreviewFileLookup<T>, reference: string, notePath: string): { file?: T; ambiguous: boolean } {
  let directPath: string | undefined;
  if (reference.startsWith('./') || reference.startsWith('../')) {
    const folder = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : '';
    directPath = normalize(`${folder}/${reference}`);
  }
  const path = directPath ?? normalize(reference);
  if (directPath === undefined && (reference.startsWith('/') || path.includes('/'))) directPath = path;
  if (directPath !== undefined) {
    const file = Array.isArray(files) ? files.find(f => f.path === directPath) : files.byPath(directPath);
    return { file: file?.path.endsWith('.lecircuit') ? file : undefined, ambiguous: false };
  }
  const matches = (Array.isArray(files) ? files : files.byName(path)).filter(f => f.path.endsWith('.lecircuit') && f.name === path);
  return { file: matches.length === 1 ? matches[0] : undefined, ambiguous: matches.length > 1 };
}
export function previewBlock(path: string, width = '400px'): string { return `\`\`\`lecircuit\n/${normalize(path)}\nwidth: ${width}\n\`\`\`\n`; }
interface Block { start: number; end: number; pathLine: number; path: string; }
function blocks(lines: string[]): Block[] {
  const found: Block[] = []; let open: { char: string; length: number; start: number; own: boolean } | undefined;
  for (let i = 0; i < lines.length; i++) {
    if (open) {
      const close = lines[i].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === open.char && close[1].length >= open.length) {
        if (open.own) { const offset = lines.slice(open.start + 1, i).findIndex(s => !!s.trim()); if (offset >= 0) { const pathLine = open.start + 1 + offset; found.push({ start: open.start, end: i, pathLine, path: lines[pathLine].trim() }); } }
        open = undefined;
      }
    } else {
      const match = lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (match) open = { char: match[1][0], length: match[1].length, start: i, own: match[2].trim() === 'lecircuit' };
    }
  }
  return found;
}
export function repairPreviewReference(markdown: string, from: string, to: string, lineHint?: number): string {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n', lines = markdown.split(/\r?\n/), matching = blocks(lines).filter(b => b.path === from);
  const located = lineHint === undefined ? [] : matching.filter(b => lineHint >= b.start && lineHint <= b.end);
  const block = located.length === 1 ? located[0] : matching.length === 1 ? matching[0] : undefined;
  if (!block) throw new Error(matching.length ? 'More than one preview matches. Reopen this note and repair the intended block.' : 'This preview changed. Reopen the note and try again.');
  lines[block.pathLine] = `/${normalize(to)}`;
  // Earlier releases inserted a dedicated wiki-link immediately above the block.
  // Remove only that exact generated line when this explicit repair is performed.
  let previous = block.start - 1; while (previous >= 0 && !lines[previous].trim()) previous--;
  const link = previous >= 0 ? lines[previous].trim().match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/) : undefined;
  if (link && [from, to, `/${to}`].some(path => link[1] === path)) lines.splice(previous, block.start - previous);
  return lines.join(newline);
}
