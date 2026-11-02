import type { Annotation, Point } from '../model/document';
export function annotationLocalBounds(a: Annotation) {
  const width = Math.max(12, [...a.text].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 1 : .68), 0) * a.fontSize);
  if (a.kind === 'box') return { x: 0, y: 0, width: Math.max(16, a.size.x), height: Math.max(16, a.size.y) };
  if (a.kind === 'no-connect') return { x: -6, y: -6, width: 12, height: 12 };
  if (a.kind === 'arrow' || a.kind === 'current') return { x: 0, y: -a.fontSize - 10, width: Math.max(a.size.x, width), height: a.fontSize + 18 };
  return { x: 0, y: -a.fontSize, width, height: a.fontSize * 1.35 };
}
export function annotationPoint(a: Annotation, p: Point): Point {
  const r = a.rotation * Math.PI / 180, x = p.x * a.scaleX, y = p.y * a.scaleY;
  return { x: a.position.x + x * Math.cos(r) - y * Math.sin(r), y: a.position.y + x * Math.sin(r) + y * Math.cos(r) };
}
export function annotationCorners(a: Annotation): Point[] {
  const b = annotationLocalBounds(a);
  return [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y }, { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height }].map(p => annotationPoint(a, p));
}
export function annotationCenter(a: Annotation): Point { const b = annotationLocalBounds(a); return annotationPoint(a, { x: b.x + b.width / 2, y: b.y + b.height / 2 }); }
export function annotationTransform(a: Annotation) { return `translate(${a.position.x} ${a.position.y}) rotate(${a.rotation}) scale(${a.scaleX} ${a.scaleY})`; }
export type AnnotationHandle = 'nw' | 'ne' | 'se' | 'sw' | 'rotate';
export function transformAnnotationFromHandle(before: Annotation, handle: AnnotationHandle, start: Point, current: Point, constrain = false): Annotation {
  const result = { ...before, position: { ...before.position } }, center = annotationCenter(before);
  if (handle === 'rotate') {
    const initial = Math.atan2(start.y - center.y, start.x - center.x), final = Math.atan2(current.y - center.y, current.x - center.x);
    const step = constrain ? 15 : 1, rotation = Math.round((before.rotation + (final - initial) * 180 / Math.PI) / step) * step;
    result.rotation = (rotation % 360 + 360) % 360;
    const transformedCenter = annotationCenter(result); result.position.x += Math.round(center.x - transformedCenter.x); result.position.y += Math.round(center.y - transformedCenter.y);
    return result;
  }
  const b = annotationLocalBounds(before), left = handle.includes('w'), top = handle.includes('n');
  const fixedLocal = { x: left ? b.x + b.width : b.x, y: top ? b.y + b.height : b.y }, fixedWorld = annotationPoint(before, fixedLocal);
  const movingWorld = annotationPoint(before, { x: left ? b.x : b.x + b.width, y: top ? b.y : b.y + b.height });
  const angle = -before.rotation * Math.PI / 180, dx = movingWorld.x + current.x - start.x - fixedWorld.x, dy = movingWorld.y + current.y - start.y - fixedWorld.y;
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle), localY = dx * Math.sin(angle) + dy * Math.cos(angle);
  result.scaleX = Math.max(.1, Math.min(100, (left ? -localX : localX) / b.width));
  result.scaleY = Math.max(.1, Math.min(100, (top ? -localY : localY) / b.height));
  const proportional = ['text', 'label', 'polarity'].includes(before.kind) ? !constrain : constrain;
  if (proportional) { const ratio = Math.max(result.scaleX / before.scaleX, result.scaleY / before.scaleY); result.scaleX = Math.max(.1, Math.min(100, before.scaleX * ratio)); result.scaleY = Math.max(.1, Math.min(100, before.scaleY * ratio)); }
  const offset = annotationPoint({ ...result, position: { x: 0, y: 0 } }, fixedLocal);
  result.position = { x: Math.round(fixedWorld.x - offset.x), y: Math.round(fixedWorld.y - offset.y) }; return result;
}
