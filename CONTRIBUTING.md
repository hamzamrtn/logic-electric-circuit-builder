# Contributing

Use Node 24, `npm ci`, and a separate Obsidian development vault. `npm run dev` exercises the real editor with an in-memory browser host. `npm run preview:build` builds a file-openable alternative. Runtime code may not depend on Node/Electron, a backend or external assets.

Keep host/UI imports outside `src/core`. Graph commands must preserve explicit endpoint IDs unless the operation explicitly changes connectivity. Add regression or property tests for topology, data-loss and gesture failures. Use original declarative artwork and retain third-party licenses.

Before sending a change, run lint, typecheck, Vitest, build and artifact checks via `npm run lint && npm run check`. Run Playwright after interaction changes. Host/device results must name the actual configuration; emulation cannot pass a real-device test. Update the requirements ledger when behavior changes and add an ADR for durable format/architecture decisions.

## Build and verify

Dependencies are pinned in `package-lock.json`. The Obsidian SDK's CodeMirror peers are host-provided; the repository's `.npmrc` avoids installing unused peers.

```sh
npm ci
npm run lint
npm run check
npm run check:install
npm run examples:build
npm run preview:build
npx playwright install chromium webkit
npm run test:e2e
npm run package
```

`npm run dev` opens the Vite harness when local servers are available. `dev/preview.html` is a server-free harness after `preview:build`; it exports files on explicit request and keeps the drawing in memory. Core/property tests run in Vitest. CI includes Chromium and WebKit browser tests. Public release/submission is a separate, owner-controlled step.

## Install a local development build

Build with `npm run package`, then unzip `dist/logic-electric-circuit-builder-0.1.11.zip` into your development vault's `<configDir>/plugins/` directory. Alternatively create `<configDir>/plugins/logic-electric-circuit-builder/` and copy these three files from `dist/logic-electric-circuit-builder/`:

- `main.js`
- `manifest.json`
- `styles.css`

Reload Obsidian and enable the plugin in Community plugins. `.obsidian` is the usual configuration directory; custom configuration directories work too. Use a separate test vault for development and qualification. Normal users can add the plugin directly from Obsidian.

## Technical references

See [format](docs/format.md), [architecture](docs/architecture.md), [validation and qualification](docs/validation.md), and [release instructions](docs/release.md). Read [AGENTS.md](AGENTS.md) and the [standing product goals](docs/product-goals.md) before proposing or implementing changes. Screenshot capture provenance and reproduction instructions are in the [gallery index](docs/screenshots/README.md).
