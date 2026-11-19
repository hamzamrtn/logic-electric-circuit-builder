# Update notes ("What's new"): validation record

Date: 2026-11-19. Scope: the one-time 1.0 update window, its opt-out setting and the “What’s new” command ([UI contract](../../ui-contract.md)).

| Check | Result |
| --- | --- |
| `npx vitest run tests/unit/whats-new.test.ts` | Pass: version comparison; shown once to updating users; quiet on fresh installs, when disabled and before 1.0.0. |
| `node scripts/check-whats-new-host.mjs` (actual Obsidian desktop, isolated profiles) | Pass ([host.json](host.json)): a 0.1.x settings file shows the window and records 1.0.0 while preserving settings; the next launch stays quiet; a fresh install stays quiet and records the version; with the setting off nothing appears and the command stays registered; the settings toggle is defined and persists. |
| Physical Pixel 7 Pro, Obsidian 1.15.1 (`LEC Simulation Test` vault) | Pass: shown after a simulated update, quiet after a plugin reload, reopened by the command, version recorded, no plugin errors. |
| `npm run check:install` | Pass with `Modal` and `onLayoutReady` added to the public-host stub (8 commands). |

Headless desktop profiles ignore modals opened by scripts after startup (the existing circuit picker behaves the same), so the command's window was verified on the device rather than in the desktop harness.

Captures: [desktop light](whats-new-desktop-light.png), [desktop dark](whats-new-desktop-dark.png), [phone dark](whats-new-phone-dark.png), [phone light](whats-new-phone-light.png).
