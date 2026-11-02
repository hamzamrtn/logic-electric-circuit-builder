import type { Anchor, Annotation, Definition, Point } from '../../core/model/document';
import type { AnnotationHandle } from '../../core/geometry/annotations';
import type { Target } from '../../core/commands/operations';
export type Tool = 'select' | 'wire' | 'place' | 'box' | 'move' | 'reconnect' | 'bend' | 'pan';
export interface Camera { x: number; y: number; zoom: number; }
export type Gesture =
  | { kind: 'idle' }
  | { kind: 'pan'; origin: Point; camera: Camera }
  | { kind: 'move'; origin: Point; delta: Point; ids: Set<string> }
  | { kind: 'box'; origin: Point; end: Point }
  | { kind: 'bend'; wireId: string; index: number; origin: Point; point: Point }
  | { kind: 'segment'; wireId: string; index: number; origin: Point; point: Point }
  | { kind: 'annotation'; id: string; handle: AnnotationHandle; origin: Point; before: Annotation; preview: Annotation }
  | { kind: 'pinch'; startDistance: number; world: Point; camera: Camera };
export interface WireDraft { start: Target; bends: Point[]; }
export interface Candidate { label: string; target: Target; point: Point; objectId: string; }
export interface Placement { definition: Definition; rotation: 0 | 90 | 180 | 270; }
export interface Reconnect { wireId: string; end: 'a' | 'b'; }
export const screenToWorld = (screen: Point, camera: Camera): Point => ({ x: (screen.x - camera.x) / camera.zoom, y: (screen.y - camera.y) / camera.zoom });
export function zoomAt(camera: Camera, screen: Point, factor: number): Camera {
  const world = screenToWorld(screen, camera), zoom = Math.max(0.125, Math.min(4, camera.zoom * factor));
  return { zoom, x: screen.x - world.x * zoom, y: screen.y - world.y * zoom };
}
export function stepZoomAt(camera: Camera, screen: Point, direction: 1 | -1): Camera {
  const percent = camera.zoom * 100;
  const step = direction > 0 ? Math.floor((percent + 1e-8) / 25) + 1 : Math.ceil((percent - 1e-8) / 25) - 1;
  const target = Math.max(12.5, Math.min(400, step * 25));
  return zoomAt(camera, screen, target / percent);
}
export function anchorName(a: Anchor): string { return a.kind === 'pin' ? a.pinId : 'Junction'; }
