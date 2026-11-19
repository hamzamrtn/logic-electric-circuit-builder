import { describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', () => ({ Modal: class {} }));
import { compareVersions, shouldShowWhatsNew, WHATS_NEW_VERSION } from '../../src/obsidian/WhatsNew';

const base = { hadSavedData: true, lastVersion: null as string | null, current: WHATS_NEW_VERSION, enabled: true };
describe('update notes', () => {
  it('compares numeric versions', () => {
    expect(compareVersions('1.0.0', '0.1.11')).toBeGreaterThan(0); expect(compareVersions('0.1.11', '0.1.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0); expect(compareVersions('junk', '0.0.1')).toBeLessThan(0);
  });
  it('shows once to people updating from an earlier release', () => {
    expect(shouldShowWhatsNew(base)).toBe(true); // saved 0.1.x settings never recorded a version
    expect(shouldShowWhatsNew({ ...base, lastVersion: '0.1.11' })).toBe(true);
    expect(shouldShowWhatsNew({ ...base, lastVersion: WHATS_NEW_VERSION })).toBe(false);
    expect(shouldShowWhatsNew({ ...base, lastVersion: '1.0.0', current: '1.0.1' })).toBe(false);
  });
  it('stays quiet for fresh installs, when disabled and before the announced release', () => {
    expect(shouldShowWhatsNew({ ...base, hadSavedData: false })).toBe(false);
    expect(shouldShowWhatsNew({ ...base, enabled: false })).toBe(false);
    expect(shouldShowWhatsNew({ ...base, current: '0.1.11' })).toBe(false);
  });
});
