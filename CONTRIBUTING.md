# Contributing

Use Node 24, `npm ci`, and a separate Obsidian development vault. `npm run dev` exercises the real editor with an in-memory browser host. `npm run preview:build` builds a file-openable alternative. Runtime code may not depend on Node/Electron, a backend or external assets.

Keep host/UI imports outside `src/core`. Graph commands must preserve explicit endpoint IDs unless the operation explicitly changes connectivity. Add regression or property tests for topology, data-loss and gesture failures. Use original declarative artwork and retain third-party licenses.

Before sending a change, run lint, typecheck, Vitest, build and artifact checks via `npm run lint && npm run check`. Run Playwright after interaction changes. Host/device results must name the actual configuration; emulation cannot pass a real-device test. Update the requirements ledger when behavior changes and add an ADR for durable format/architecture decisions.
