# Recovery folder settings

Recorded 2026-11-08. Release 0.1.8, prepared locally with owner-authorized publication; no document-format or retention-policy change.

## Behavior

- Obsidian plugin settings offer a vault-folder input and an explicit **Move backups** action. Typing does not migrate files.
- Applying the path creates missing parent folders, moves recognized plugin backups and redirects open sessions. Unrelated files remain in place. Destination collisions keep both snapshots.
- A manually moved folder is reused; live folder and ancestor renames update the preference. A move performed while the plugin is disabled can be adopted by selecting its existing destination.
- Backup writes and migrations share a queue. A failed move or settings write rolls back moves; failed rollback reports both locations and preserves the snapshots.
- `00_README.md` briefly identifies the plugin, puts settings instructions first and uses the requested two headings. Its location updates after folder changes. Unrelated READMEs are preserved; instructions failure cannot block automatic recovery snapshots.
- Optional **Exclude recovery backups** (default on where supported) adds a folder-prefix exclusion and persists ownership separately. Moves replace only owned entries. Existing matching user rules are reused without claiming ownership; duplicate rules are left untouched. User removal/edits are respected until explicit re-enabling or a folder change. Hidden paths receive no additional exclusion.

## Local verification

- `npm run check`: 183 core/adapter/property tests in 30 files, strict TypeScript, production build and artifact checks.
- `npm run lint`: source boundaries and the pinned official Obsidian ESLint checker.
- `npm run check:install`: built-plugin host stub verifies the setting, draft/apply behavior, persisted exclusions, toggle removal/re-enabling, persistence across reload, failed settings writes and compatibility with existing shortcut persistence.
- `git diff --check`: whitespace/diff validation.

The new recovery tests cover nested creation, three-slot reuse, existing backup migration, unrelated files, moves before/after settings changes, disabled-plugin moves, ancestor renames, repeated collisions, queued writes, failed migrations, failed settings persistence, partial rollback and README collisions. Existing persistence/session coverage also passes.

Exclusion tests cover user-owned rules, matching ancestors, duplicate ownership, manual removal/edits, dismissal reset, reload, hidden/nonexistent folders, disable/re-enable, unreadable lists, missing host methods, rejected config writes and failed ownership persistence. Integration failure cannot block backup creation. Read-only inspection of installed Obsidian 1.14.4 confirmed `userIgnoreFilters`, case-insensitive literal-prefix matching and `getConfig`/`setConfig` behavior; no application or user-vault files were modified. These methods are not in the public API declarations: the integration is guarded and optional, with manual Excluded files instructions when unavailable. Quick Switcher wording follows [Obsidian Help](https://obsidian.md/help/plugins/quick-switcher): deprioritized rather than hidden.

These are adapter and public-host-stub checks. Actual Obsidian folder-picker rendering, device filesystem behavior and cross-device Sync remain manual qualification. The canvas/browser UI was not changed or requalified by this task. Existing backup sets are retained; no old user recovery files were deleted.
