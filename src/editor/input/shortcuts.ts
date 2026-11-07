export const shortcutActions = { select: 'Select', box: 'Box select', multi: 'Multi-select', wire: 'Wire', rotate: 'Rotate', fit: 'Fit circuit', inspect: 'Inspect properties' } as const;
export type ShortcutAction = keyof typeof shortcutActions;
export type ToolShortcuts = Record<ShortcutAction, string>;
export const DEFAULT_SHORTCUTS: ToolShortcuts = { select: 'v', box: 'b', multi: 'm', wire: 'w', rotate: 'r', fit: 'f', inspect: 'i' };
export function validateShortcuts(input: Record<string, unknown>): ToolShortcuts {
  const result = {} as ToolShortcuts, used = new Set<string>();
  for (const action of Object.keys(shortcutActions) as ShortcutAction[]) {
    const raw = input[action], key = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (key && !/^[a-z0-9]$/.test(key)) throw new Error(`${shortcutActions[action]}: use one letter or number, or leave it blank to disable.`);
    if (key && used.has(key)) throw new Error(`The key ${key.toUpperCase()} is assigned more than once. Choose a different key.`);
    if (key) used.add(key); result[action] = key;
  }
  return result;
}
export function loadShortcuts(value: unknown): ToolShortcuts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_SHORTCUTS;
  try { return validateShortcuts({ ...DEFAULT_SHORTCUTS, ...value }); } catch { return DEFAULT_SHORTCUTS; }
}
export interface ShortcutPreferences {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ToolShortcuts;
  save: (bindings: ToolShortcuts) => Promise<void>;
}
export class MemoryShortcuts implements ShortcutPreferences {
  private bindings: ToolShortcuts = DEFAULT_SHORTCUTS;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.bindings;
  save = async (bindings: ToolShortcuts) => { this.bindings = validateShortcuts(bindings); this.listeners.forEach(listener => listener()); };
}
