# Release execution record: 0.1.4

Recorded 2026-11-02. Publication and directory submission have been requested by the maintainer; neither has completed in this workspace.

## Verified locally

- Node v24.18.0 and npm 11.16.0.
- `npm run lint`: passed runtime-boundary and injection checks in 27 source files.
- `npm run check`: strict TypeScript, 60 unit/property tests in 11 files, production build, and artifact audit passed.
- `npm run check:install`: passed the three-asset installation smoke against a public-host stub; seven commands and one view registered. This does not run Obsidian.
- `npm run package`: generated `dist/logic-electric-circuit-builder/` and `dist/logic-electric-circuit-builder-0.1.4.zip`.
- `npm run preview:build`: passed.
- A separate connected Chromium browser review passed all 12 checks at 1440×900 against the freshly built preview: layout, symbol categories, selection commands, zoom, light/dark theme inheritance, annotation handles/transforms/export/undo, and horizontal overflow. Results are in `release-0.1.4-browser.json`. This is separate from the Playwright suite and does not establish real Obsidian/device qualification.
- A credential-pattern scan of public source/build/test files found no matches for GitHub tokens, AWS access key IDs, or private-key headers. Local account configuration and the private handover/test vault are excluded from the source archive.

## Browser suite did not reach application assertions

`npm run test:e2e` discovered 28 project/test combinations. All failed at browser launch: Chromium terminated because the sandbox denied its shutdown/socket operation (`Operation not permitted`), and WebKit's executable was absent (`webkit-2359/pw_run.sh`). These results do not establish an application regression or a passing browser suite. Run the prepared GitHub CI workflow in an environment that can launch both browsers. Real Obsidian and device qualification remains pending as documented in `docs/validation.md`.

## Publishing access

- This workspace exposes an empty, read-only `.git` directory; no branch, remote, or existing Git history could be inspected.
- `gh auth status` could not authenticate the configured `hamzamrtn` account and reported failure connecting to `api.github.com`.
- The connected browser was signed out of GitHub and the Obsidian Community directory. Sign-in pages were opened for the maintainer. No passwords, verification codes, or tokens were requested in chat.
- No GitHub repository, release, tag, or Obsidian listing has been created or changed by this attempt.
