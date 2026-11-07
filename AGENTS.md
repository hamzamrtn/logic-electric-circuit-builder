# Read first in every session

Before planning, changing code, or proposing features, read **[docs/product-goals.md](docs/product-goals.md)**. It records the owner's standing goals and preferences. Do not ask the owner to repeat them. Apply them to maintenance, bug fixes, UI design, new features, documentation and release work.

Then read the files relevant to the task:

- [docs/ui-contract.md](docs/ui-contract.md): concrete interaction and presentation rules.
- [docs/architecture.md](docs/architecture.md) and [docs/format.md](docs/format.md): implementation boundaries and connectivity/data invariants.
- [docs/quality-review.md](docs/quality-review.md), [docs/validation.md](docs/validation.md) and [docs/evidence/final-quality-checks.json](docs/evidence/final-quality-checks.json): dated evidence and known qualification gaps. Verify current state before reusing results.
- [CHANGELOG.md](CHANGELOG.md), the current worktree and the user's latest instructions: what has changed and what is requested now.

The product is **Logic-Electric Circuit Builder**; read `manifest.json` for its current ID, version and minimum host version. Early research/handover documents contain provisional names and historical recommendations. Do not treat those as unresolved decisions or overwrite the current product contract with them.

Preserve existing user work. Changes may span interrupted sessions; a dirty tree is not permission to discard them. Keep standing goals in the product brief, concrete UI behavior in the interface contract, and dated results/limitations in verification records. Update those documents when the owner changes a preference or an important decision is settled.
