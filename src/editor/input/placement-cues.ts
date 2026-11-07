import type { Component, Definition } from '../../core/model/document';
import { transform } from '../../core/geometry/geometry';

export interface BodyBox { id: string; x: number; y: number; width: number; height: number; }
export interface AlignmentGuide { axis: 'x' | 'y'; x1: number; y1: number; x2: number; y2: number; }
export function bodyBox(component: Component, definition: Definition): BodyBox {
  const b = definition.bounds;
  const corners = [transform({ x: b.x, y: b.y }, component), transform({ x: b.x + b.width, y: b.y }, component), transform({ x: b.x, y: b.y + b.height }, component), transform({ x: b.x + b.width, y: b.y + b.height }, component)];
  const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
  return { id: component.id, x, y, width: Math.max(...corners.map(p => p.x)) - x, height: Math.max(...corners.map(p => p.y)) - y };
}
export function placementCues(moving: BodyBox, bodies: BodyBox[], ignored: Set<string>, zoom: number) {
  const overlaps: BodyBox[] = [], guides: AlignmentGuide[] = [];
  const cx = moving.x + moving.width / 2, cy = moving.y + moving.height / 2;
  let vertical: BodyBox | undefined, horizontal: BodyBox | undefined, verticalDistance = Infinity, horizontalDistance = Infinity;
  for (const body of bodies) {
    if (ignored.has(body.id)) continue;
    const overlap = moving.x < body.x + body.width && moving.x + moving.width > body.x && moving.y < body.y + body.height && moving.y + moving.height > body.y;
    if (overlap && overlaps.length < 4) overlaps.push(body);
    const dx = body.x + body.width / 2 - cx, dy = body.y + body.height / 2 - cy, distance = Math.hypot(dx, dy);
    if (overlap || distance * zoom > 240) continue;
    // Guides report real alignment; they never reposition a component or imply a near miss is aligned.
    if (Math.abs(dx) < .01 && distance < verticalDistance) { vertical = body; verticalDistance = distance; }
    if (Math.abs(dy) < .01 && distance < horizontalDistance) { horizontal = body; horizontalDistance = distance; }
  }
  const margin = 12 / zoom;
  if (vertical) guides.push({ axis: 'x', x1: cx, x2: cx, y1: Math.min(moving.y, vertical.y) - margin, y2: Math.max(moving.y + moving.height, vertical.y + vertical.height) + margin });
  if (horizontal) guides.push({ axis: 'y', y1: cy, y2: cy, x1: Math.min(moving.x, horizontal.x) - margin, x2: Math.max(moving.x + moving.width, horizontal.x + horizontal.width) + margin });
  return { overlaps, guides };
}
