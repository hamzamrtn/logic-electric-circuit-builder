# Canvas update evidence — 0.1.1

The update addresses the owner's observed interface and interaction issues: forced green, a permanent parts column, a nonfunctional empty-state button, opaque box selection, awkward zoom stops, Finish click-through, selection commands in the inspector and missing annotation transforms.

45 core/property tests pass. New regression cases cover Finish's explicit endpoint and atomic undo, empty Finish rejection, stepped zoom anchoring/stops, annotation resize/rotation/undo, existing-file defaults, proportional text, off-center handle grabs, topology preservation and transformed export bounds. Ten browser scenarios are authored for Chromium and WebKit (20 project/test combinations); discovery succeeds. The previously documented local browser-process sandbox restriction still prevents treating the Playwright suite as passed.

Connected Chromium reviews pass 12 checks at both 1440x900 and 390x844. `desktop-review.json` and `mobile-review.json` verify full-width canvas, category previews, toolbar selection actions, linear zoom, host CSS theme inheritance, annotation handles/transforms/export, atomic undo and absence of page overflow. Theme switching updates CSS colors without changing document revision; development theme emulation is excluded from the production bundle.

Separate native browser interactions verified:

- Palette selection and canvas placement produce one part.
- Finish produces one wire and one dangling endpoint at the chosen canvas coordinate; an extra pointer-up neither creates another endpoint nor restarts the draft (`finish-native.json`).
- A real box-selection drag sampled fill opacity 0.08 throughout the observed frames (`box-selection-native.json`).
- Native annotation-handle drags changed scale and angle, with one document revision per completed gesture and undo restoring the previous transform. Numeric controls and SVG output independently preserved rotation 30°, scale 2×1.5 (`annotation-numeric.json`).

Screenshots show the new neutral light/dark canvas and categorized part previews. These are browser observations. Updated real Obsidian host behavior is awaiting the owner's reload and testing. The test-vault plugin assets are refreshed separately; existing test circuits and notes are retained.
