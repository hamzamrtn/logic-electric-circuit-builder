export interface RecoveryExclusionState { managed: string | null; dismissed: string | null; }
export interface RecoveryExclusionPreferences extends RecoveryExclusionState { folder: string; enabled: boolean; exists: boolean; }
interface ConfigBridge { getConfig(key: string): unknown; setConfig(key: string, value: string[] | null): unknown; }

/** Optional, guarded bridge: Obsidian does not document a public exclusion-list API. */
function configBridge(host: unknown): ConfigBridge {
  if (!host || typeof host !== 'object' || !('getConfig' in host) || typeof host.getConfig !== 'function' || !('setConfig' in host) || typeof host.setConfig !== 'function') {
    throw new Error('Automatic exclusions are unavailable. Add the recovery folder in Settings → Files and links → Excluded files.');
  }
  return host as ConfigBridge;
}
function readFilters(host: ConfigBridge): string[] {
  const value = host.getConfig('userIgnoreFilters');
  if (value == null) return [];
  if (!Array.isArray(value) || !value.every((entry): entry is string => typeof entry === 'string')) throw new Error('Obsidian’s excluded-files list could not be read safely. It was left unchanged.');
  return [...value];
}
function hidden(folder: string) { return folder.split('/').some(part => part.startsWith('.')); }

export class RecoveryExclusions {
  private queue: Promise<void> = Promise.resolve();
  constructor(private host: unknown, private preferences: () => RecoveryExclusionPreferences, private persist: (state: RecoveryExclusionState) => Promise<void>) {}
  sync(force = false) {
    const result = this.queue.catch(() => {}).then(async () => {
      const prefs = this.preferences();
      if (!prefs.managed && (!prefs.enabled || !prefs.exists || hidden(prefs.folder))) return;
      const host = configBridge(this.host), before = readFilters(host), desired = `${prefs.folder}/`;
      let managed = prefs.managed, dismissed = force || prefs.dismissed !== prefs.folder ? null : prefs.dismissed;
      // Removing the entry in Obsidian is a user choice. Do not add it again on every save/reload.
      if (!force && managed === desired && !before.includes(managed)) dismissed = prefs.folder;
      const count = managed ? before.filter(entry => entry === managed).length : 0;
      const keep = managed === desired && prefs.enabled && prefs.exists && !hidden(prefs.folder) && dismissed !== prefs.folder && count === 1;
      const after = count === 1 && !keep ? before.filter(entry => entry !== managed) : [...before];
      if (!keep) managed = null;
      if (prefs.enabled && prefs.exists && !hidden(prefs.folder) && dismissed !== prefs.folder && !managed) {
        // Literal exclusions are path prefixes. Reuse a user's matching entry without claiming it.
        const covered = after.some(entry => {
          const prefix = entry.trim(); return prefix.length > 0 && !prefix.startsWith('/') && desired.toLowerCase().startsWith(prefix.toLowerCase());
        });
        if (!covered) { after.push(desired); managed = desired; }
      }
      if (after.length !== before.length || after.some((entry, index) => entry !== before[index])) {
        await host.setConfig('userIgnoreFilters', after.length ? after : null);
      }
      // Record ownership only after the host accepted the change. Never infer ownership from a matching path.
      if (managed !== prefs.managed || dismissed !== prefs.dismissed) await this.persist({ managed, dismissed });
    });
    this.queue = result; return result;
  }
}
