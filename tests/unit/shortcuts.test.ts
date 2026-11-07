import { expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS, loadShortcuts, MemoryShortcuts, validateShortcuts } from '../../src/editor/input/shortcuts';

it('normalizes custom keys and preserves explicit disabled actions', () => {
  const keys = validateShortcuts({ ...DEFAULT_SHORTCUTS, wire: ' L ', select: '' });
  expect(keys.wire).toBe('l'); expect(keys.select).toBe(''); expect(DEFAULT_SHORTCUTS.wire).toBe('w');
});
it('rejects duplicate, reserved and multi-character tool keys', () => {
  expect(() => validateShortcuts({ ...DEFAULT_SHORTCUTS, select: 'W' })).toThrow(/more than once/);
  for (const key of ['Escape', 'Ctrl+W', '+', ' ', 'é']) {
    if (key.trim()) expect(() => validateShortcuts({ ...DEFAULT_SHORTCUTS, wire: key })).toThrow(/letter or number/);
  }
});
it('loads older settings and recovers from malformed shortcut maps', () => {
  expect(loadShortcuts(undefined)).toEqual(DEFAULT_SHORTCUTS);
  expect(loadShortcuts({ wire: 'l' })).toEqual({ ...DEFAULT_SHORTCUTS, wire: 'l' });
  expect(loadShortcuts({ wire: 'v' })).toEqual(DEFAULT_SHORTCUTS);
  expect(loadShortcuts({ wire: 'Ctrl+W' })).toEqual(DEFAULT_SHORTCUTS);
  expect(loadShortcuts({ wire: '' }).wire).toBe('');
});
it('publishes a stable shared snapshot and releases listeners', async () => {
  const preferences = new MemoryShortcuts(); let notifications = 0;
  const original = preferences.getSnapshot(), unsubscribe = preferences.subscribe(() => notifications++);
  expect(preferences.getSnapshot()).toBe(original);
  await preferences.save({ ...DEFAULT_SHORTCUTS, wire: 'l' }); expect(notifications).toBe(1);
  const changed = preferences.getSnapshot(); expect(changed.wire).toBe('l');
  await expect(preferences.save({ ...changed, select: 'l' })).rejects.toThrow();
  expect(preferences.getSnapshot()).toBe(changed); expect(notifications).toBe(1);
  unsubscribe(); await preferences.save(DEFAULT_SHORTCUTS); expect(notifications).toBe(1);
});
