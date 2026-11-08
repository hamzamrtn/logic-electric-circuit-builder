import { expect, it } from 'vitest';
import { dockTarget, loadDockPosition, MemoryDockPreferences } from '../../src/editor/input/docking';

it('loads older and malformed layout preferences with the responsive default', () => {
  for (const value of [undefined, null, {}, '', 'floating', 0]) expect(loadDockPosition(value)).toBe('auto');
  for (const value of ['top', 'right', 'bottom', 'left', 'auto']) expect(loadDockPosition(value)).toBe(value);
});

it('accepts edge drops while rejecting the canvas center and distant or invalid positions', () => {
  const area = { left: 100, top: 50, right: 500, bottom: 850, width: 400, height: 800 };
  expect(dockTarget(300, 58, area)).toBe('top'); expect(dockTarget(493, 400, area)).toBe('right');
  expect(dockTarget(300, 843, area)).toBe('bottom'); expect(dockTarget(107, 400, area)).toBe('left');
  expect(dockTarget(300, 400, area)).toBeNull(); expect(dockTarget(-200, 400, area)).toBeNull();
  expect(dockTarget(NaN, 50, area)).toBeNull(); expect(dockTarget(100, 50, { ...area, width: 0 })).toBeNull();
});

it('shares layout changes between subscribers and leaves rejected changes untouched', async () => {
  const preferences = new MemoryDockPreferences(); let notifications = 0;
  const unsubscribe = preferences.subscribe(() => notifications++);
  await preferences.save('left'); expect(preferences.getSnapshot()).toBe('left'); expect(notifications).toBe(1);
  await expect(preferences.save('unknown' as 'left')).rejects.toThrow('Choose'); expect(preferences.getSnapshot()).toBe('left');
  unsubscribe(); await preferences.save('auto'); expect(preferences.getSnapshot()).toBe('auto'); expect(notifications).toBe(1);
});
