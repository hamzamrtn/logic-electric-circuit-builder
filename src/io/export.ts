import { type CircuitDocument, getDefinition } from '../core/model/document';
import { bounds, labelLayout, wirePoints } from '../core/geometry/geometry';
import { componentTransform, pathData } from '../editor/render/drawing';
import { annotationTransform } from '../core/geometry/annotations';
export const escapeXml = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
export function exportSVG(doc: CircuitDocument, theme: 'light' | 'dark' | 'transparent' = 'light'): string {
  const b = bounds(doc), x = b.x - 32, y = b.y - 32, width = b.width + 64, height = b.height + 64;
  const ink = theme === 'dark' ? '#e5e5e5' : '#202020', paper = theme === 'dark' ? '#1e1e1e' : '#ffffff';
  const output: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}" role="img"><title>${escapeXml(doc.title)}</title>`];
  if (theme !== 'transparent') output.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${paper}"/>`);
  output.push(`<g fill="none" stroke="${ink}" stroke-width="2" stroke-linejoin="round" font-family="Arial, sans-serif">`);
  for (const w of doc.wires) output.push(`<path d="${pathData(wirePoints(doc, w))}" stroke-width="${w.width > 1 ? 4 : 2}"/>`);
  for (const c of doc.components) {
    const d = getDefinition(doc, c), labels = labelLayout(c, d); output.push(`<g transform="${componentTransform(c)}">`);
    for (const p of d.primitives) {
      if (p.kind === 'path') output.push(`<path d="${escapeXml(p.d)}" fill="${p.fill ? ink : 'none'}"/>`);
      if (p.kind === 'circle') output.push(`<circle cx="${p.x}" cy="${p.y}" r="${p.radius}" fill="${paper}"/>`);
      if (p.kind === 'rect') output.push(`<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" fill="${paper}"/>`);
      if (p.kind === 'text') output.push(`<text x="${p.x}" y="${p.y}" font-size="${p.size}" fill="${ink}" stroke="none" text-anchor="middle">${escapeXml(p.text)}</text>`);
    }
    output.push('</g>');
    output.push(`<text x="${labels.x}" y="${labels.referenceY}" text-anchor="${labels.anchor}" font-size="13" fill="${ink}" stroke="none">${escapeXml(c.reference)}</text>`);
    if (c.properties.value) output.push(`<text x="${labels.x}" y="${labels.valueY}" text-anchor="${labels.anchor}" font-size="12" fill="${ink}" stroke="none">${escapeXml(String(c.properties.value))}</text>`);
    if (c.properties.label) output.push(`<text x="${labels.x}" y="${labels.labelY}" text-anchor="${labels.anchor}" font-size="12" fill="${ink}" stroke="none">${escapeXml(String(c.properties.label))}</text>`);
  }
  for (const n of doc.nodes) { const degree = doc.wires.filter(w => [w.a, w.b].some(a => a.kind === 'node' && a.nodeId === n.id)).length; if (degree) output.push(`<circle cx="${n.position.x}" cy="${n.position.y}" r="${degree > 2 || n.explicit ? 4 : 3}" fill="${degree === 1 ? paper : ink}"/>`); }
  for (const a of [...doc.annotations].sort((a, b) => a.zIndex - b.zIndex)) {
    output.push(`<g transform="${annotationTransform(a)}">`);
    if (a.kind === 'no-connect') output.push('<path d="M -5 -5 L 5 5 M -5 5 L 5 -5"/>');
    else if (a.kind === 'box') output.push(`<rect x="0" y="0" width="${a.size.x}" height="${a.size.y}" stroke-dasharray="6 4"/>`);
    else if (a.kind === 'arrow' || a.kind === 'current') output.push(`<path d="M 0 0 h ${a.size.x} l -12 -6 m 12 6 l -12 6"/>`);
    if (a.kind !== 'no-connect') output.push(`<text x="${a.kind === 'box' ? 8 : 0}" y="${a.kind === 'box' ? a.fontSize + 5 : a.kind === 'arrow' || a.kind === 'current' ? -8 : 0}" font-size="${a.fontSize}" fill="${ink}" stroke="none">${escapeXml(a.text)}</text>`);
    output.push('</g>');
  }
  output.push('</g></svg>'); return output.join('');
}
export async function exportPNG(doc: CircuitDocument, owner: Document, scale = 2): Promise<ArrayBuffer> {
  const b = bounds(doc), width = Math.ceil((b.width + 64) * scale), height = Math.ceil((b.height + 64) * scale);
  if (width > 8192 || height > 8192 || width * height > 16_000_000) throw new Error('PNG is too large. Use scale 1 or export SVG instead (16 megapixel limit).');
  const win = owner.defaultView; if (!win) throw new Error('View window is unavailable');
  const url = win.URL.createObjectURL(new Blob([exportSVG(doc)], { type: 'image/svg+xml' }));
  try {
    const img = owner.createElement('img'); img.src = url; await img.decode();
    const canvas = owner.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('PNG rendering is unavailable'); ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG export failed')), 'image/png')); return await blob.arrayBuffer();
  } finally { win.URL.revokeObjectURL(url); }
}
