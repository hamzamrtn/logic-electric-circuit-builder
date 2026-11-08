import { expect, it, vi } from 'vitest';
import { RecoveryExclusions, type RecoveryExclusionPreferences } from '../../src/obsidian/RecoveryExclusions';

function fixture(initial: unknown = null) {
  let filters: unknown = initial;
  const prefs: RecoveryExclusionPreferences = { folder: 'Circuit recovery', enabled: true, exists: true, managed: null, dismissed: null };
  const host = { getConfig: vi.fn(() => filters), setConfig: vi.fn((_key: string, value: unknown) => { filters = value; }) };
  const persist = vi.fn(async (state: { managed: string | null; dismissed: string | null }) => { Object.assign(prefs, state); });
  const store = new RecoveryExclusions(host, () => prefs, persist);
  return { prefs, host, persist, store, filters: () => filters, external: (value: unknown) => { filters = value; } };
}

it('adds one folder prefix, records ownership and does not duplicate it on saves or reload', async () => {
  const f = fixture(['Templates/']); await f.store.sync(); await f.store.sync();
  expect(f.filters()).toEqual(['Templates/', 'Circuit recovery/']); expect(f.prefs.managed).toBe('Circuit recovery/');
  const reopened = new RecoveryExclusions(f.host, () => f.prefs, f.persist); await reopened.sync();
  expect(f.host.setConfig).toHaveBeenCalledTimes(1);
});

it.each(['Circuit recovery/', 'Circuit recovery', 'Circuit', 'circuit recovery/'])('never claims or removes an existing user exclusion: %s', async entry => {
  const f = fixture(['Templates/', entry]); await f.store.sync();
  expect(f.prefs.managed).toBeNull(); f.prefs.folder = 'Backups/Circuits'; await f.store.sync();
  expect(f.filters()).toEqual(['Templates/', entry, 'Backups/Circuits/']);
  f.prefs.enabled = false; await f.store.sync(); expect(f.filters()).toEqual(['Templates/', entry]);
});

it('replaces only the owned entry when the folder moves and preserves the order of manual entries', async () => {
  const f = fixture(['Templates/', '/secret$/']); await f.store.sync(); f.prefs.folder = 'Backups/Circuits';
  await f.store.sync(); expect(f.filters()).toEqual(['Templates/', '/secret$/', 'Backups/Circuits/']);
  expect(f.prefs.managed).toBe('Backups/Circuits/');
});

it('reuses an existing destination exclusion without claiming ownership', async () => {
  const f = fixture(['Backups/']); await f.store.sync(); f.prefs.folder = 'Backups/Circuits'; await f.store.sync();
  expect(f.filters()).toEqual(['Backups/']); expect(f.prefs.managed).toBeNull();
});

it('does not remove either entry when the user has added an identical duplicate', async () => {
  const f = fixture(); await f.store.sync(); f.external(['Circuit recovery/', 'Circuit recovery/']);
  f.prefs.enabled = false; await f.store.sync();
  expect(f.filters()).toEqual(['Circuit recovery/', 'Circuit recovery/']); expect(f.prefs.managed).toBeNull();
});

it('respects a manually removed rule through repeated saves and allows explicit re-enabling', async () => {
  const f = fixture(); await f.store.sync(); f.external(['Personal/']); await f.store.sync(); await f.store.sync();
  expect(f.filters()).toEqual(['Personal/']); expect(f.prefs.dismissed).toBe('Circuit recovery');
  await f.store.sync(true); expect(f.filters()).toEqual(['Personal/', 'Circuit recovery/']); expect(f.prefs.dismissed).toBeNull();
});

it('does not reinsert or remove a manually edited rule', async () => {
  const f = fixture(); await f.store.sync(); f.external(['Circuit recovery/custom/']); await f.store.sync();
  expect(f.filters()).toEqual(['Circuit recovery/custom/']); expect(f.prefs.managed).toBeNull();
});

it('clears a previous dismissal when a different backup folder is chosen', async () => {
  const f = fixture(); await f.store.sync(); f.external([]); await f.store.sync();
  expect(f.prefs.dismissed).toBe('Circuit recovery');
  f.prefs.folder = 'Backups'; await f.store.sync(); expect(f.prefs.dismissed).toBeNull();
  f.prefs.folder = 'Circuit recovery'; await f.store.sync(); expect(f.filters()).toEqual(['Circuit recovery/']);
});

it('removes its old rule when moving to a hidden path and adds no hidden-folder entry', async () => {
  const f = fixture(['Personal/']); await f.store.sync(); f.prefs.folder = 'Backups/.recovery'; await f.store.sync();
  expect(f.filters()).toEqual(['Personal/']); expect(f.prefs.managed).toBeNull();
  await f.store.sync(); expect(f.host.setConfig).toHaveBeenCalledTimes(2);
});

it('does not create an exclusion for a folder that does not exist yet', async () => {
  const f = fixture(); f.prefs.exists = false; await f.store.sync(); expect(f.host.setConfig).not.toHaveBeenCalled();
  f.prefs.exists = true; await f.store.sync(); expect(f.filters()).toEqual(['Circuit recovery/']);
});

it('disabling exclusion removes only its own rule and restores an empty list as null', async () => {
  const f = fixture(); await f.store.sync(); f.prefs.enabled = false; await f.store.sync();
  expect(f.filters()).toBeNull(); expect(f.prefs.managed).toBeNull();
});

it.each([{}, { getConfig: 'wrong', setConfig() {} }])('handles unavailable host methods without changing settings', async host => {
  const f = fixture(), store = new RecoveryExclusions(host, () => f.prefs, f.persist);
  await expect(store.sync()).rejects.toThrow('Automatic exclusions are unavailable'); expect(f.persist).not.toHaveBeenCalled();
});

it.each([{}, 'wrong', ['Personal/', 12]])('never overwrites an unreadable host list: %j', async value => {
  const f = fixture(value); await expect(f.store.sync()).rejects.toThrow('left unchanged');
  expect(f.host.setConfig).not.toHaveBeenCalled(); expect(f.persist).not.toHaveBeenCalled(); expect(f.filters()).toEqual(value);
});

it('does not claim ownership if the host rejects its change', async () => {
  const f = fixture(['Personal/']); f.host.setConfig.mockImplementationOnce(() => { throw new Error('Rejected'); });
  await expect(f.store.sync()).rejects.toThrow('Rejected'); expect(f.persist).not.toHaveBeenCalled();
  expect(f.filters()).toEqual(['Personal/']); await f.store.sync(); expect(f.prefs.managed).toBe('Circuit recovery/');
});

it('preserves a rule as unowned if recording its ownership fails', async () => {
  const f = fixture(); f.persist.mockRejectedValueOnce(new Error('Settings failed'));
  await expect(f.store.sync()).rejects.toThrow('Settings failed'); expect(f.prefs.managed).toBeNull();
  await f.store.sync(); expect(f.prefs.managed).toBeNull(); f.prefs.folder = 'Other backups'; await f.store.sync();
  expect(f.filters()).toEqual(['Circuit recovery/', 'Other backups/']);
});
