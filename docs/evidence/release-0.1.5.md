# Community-review corrections: 0.1.5

Recorded 2026-11-02. These are local results; the 0.1.5 GitHub CI and Obsidian directory review have not run yet.

## Source and bundle findings

- Official `eslint-plugin-obsidianmd` 0.4.2 recommended rules: zero errors and warnings for `src/` and `dev/`. The checker runs in an isolated development cache with ESLint 9.39.5 and its supported TypeScript 5.4.5 API; the plugin compiler remains TypeScript 7.0.2. The checker's upstream tooling advisories are not fixed by this isolation, but those packages are absent from the plugin's dependency tree and release bundle.
- Static style assignments were replaced with classes/CSS variables. Legacy preview-heading hiding restores its class on teardown. No `!important` remains in `styles.css`.
- Settings use `getSettingDefinitions()` and persist through the declarative control API. The installation smoke checks the three searchable control keys and saved toggle/folder values.
- Dialog submit and MarkdownRenderChild lifecycle callbacks return synchronously and handle asynchronous failures internally.
- Deprecated `.finite()` and `FormEvent` usage and flagged comma expressions were removed. The standalone harness uses its owning window for its download timer.
- React/React DOM 18.3.1 provide the editor's hooks and portals without React 19's external script-resource preloader. Dependency code is unmodified. A bundle audit now rejects literal script-element loader calls. The final `main.js` contains zero `createElement('script')`/`createElement("script")` calls.
- Runtime base64 helper calls remain in Zod's bundled validation helpers. This was an informational disclosure, not the script-injection error. No vault data is transmitted or encoded for network access.
- Circuit selection and legacy basename previews still enumerate vault file paths; this legitimate behavior is disclosed in the README. Explicit paths now use direct lookup, covered by two regression tests. It is not disguised to suppress the directory's behavior recommendation.

## Local verification

- `npm run check`: strict types, 62 unit/property tests across 11 files, production build and bundle audit passed.
- `npm run check:install`: three-asset load and declarative settings persistence checks passed against a public-host stub.
- `npm run package`: generated `dist/logic-electric-circuit-builder-0.1.5.zip` and the three individual assets.
- `npm run preview:build`: passed. A connected Chromium review passed 12 UI checks at 460×844, including theme switching, zoom, selection controls, annotation transforms/export/undo, and no horizontal overflow. A separate check parsed SVG and verified the PNG byte signature.
- The npm advisory bulk endpoint returned no advisories for the final plugin lockfile, including development dependencies, after removing the checker from that dependency tree. This is a time-specific result.
- `git diff --check`: passed.

The connected browser checks are not the full Chromium/WebKit Playwright suite or real Obsidian/device qualification. Those remain separate checks. The release workflow will run the full browser suite before attesting or uploading release assets.

## Remaining external verification

Push and run **Review branch** before publishing 0.1.5. The attestation workflow is configured, but no new attestations have been generated in this local session. Directory acceptance must be verified from its completed review, not inferred from these local results.
