export const dockSides = ['top', 'right', 'bottom', 'left'] as const;
export type DockSide = typeof dockSides[number];
export type DockPosition = DockSide | 'auto';
export function loadDockPosition(value: unknown): DockPosition { return value === 'auto' || dockSides.some(side => side === value) ? value as DockPosition : 'auto'; }
export interface DockPreferences {
  getSnapshot: () => DockPosition;
  subscribe: (listener: () => void) => () => void;
  save: (position: DockPosition) => Promise<void>;
}
export class MemoryDockPreferences implements DockPreferences {
  private position: DockPosition = 'auto';
  private listeners = new Set<() => void>();
  getSnapshot = () => this.position;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  save = async (position: DockPosition) => { if (loadDockPosition(position) !== position) throw new Error('Choose top, right, bottom, left or reset.'); this.position = position; this.listeners.forEach(listener => listener()); };
}
export function dockTarget(x: number, y: number, area: { left: number; top: number; right: number; bottom: number; width: number; height: number }): DockSide | null {
  if (![x, y, area.width, area.height].every(Number.isFinite) || area.width <= 0 || area.height <= 0 || x < area.left - 32 || x > area.right + 32 || y < area.top - 32 || y > area.bottom + 32) return null;
  const distances: Record<DockSide, number> = { top: Math.abs(y - area.top), right: Math.abs(x - area.right), bottom: Math.abs(y - area.bottom), left: Math.abs(x - area.left) };
  const closest = [...dockSides].sort((a, b) => distances[a] - distances[b])[0];
  return distances[closest] <= Math.min(96, area.width / 4, area.height / 4) ? closest : null;
}
