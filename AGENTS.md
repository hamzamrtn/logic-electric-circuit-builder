# Read first in every session

Before planning, changing code, or proposing features, read **[docs/product-goals.md](docs/product-goals.md)**. It records the owner's standing goals and preferences. Do not ask the owner to repeat them. Apply them to maintenance, bug fixes, UI design, new features, documentation and release work.

Then read the files relevant to the task:

- [docs/ui-contract.md](docs/ui-contract.md): concrete interaction and presentation rules.
- [docs/architecture.md](docs/architecture.md) and [docs/format.md](docs/format.md): implementation boundaries and connectivity/data invariants.
- [docs/quality-review.md](docs/quality-review.md), [docs/validation.md](docs/validation.md) and [docs/evidence/final-quality-checks.json](docs/evidence/final-quality-checks.json): dated evidence and known qualification gaps. Verify current state before reusing results.
- [CHANGELOG.md](CHANGELOG.md), the current worktree and the user's latest instructions: what has changed and what is requested now.

The product is **Logic-Electric Circuit Builder**; read `manifest.json` for its current ID, version and minimum host version. Early research/handover documents contain provisional names and historical recommendations. Do not treat those as unresolved decisions or overwrite the current product contract with them.

Preserve existing user work. Changes may span interrupted sessions; a dirty tree is not permission to discard them. Keep standing goals in the product brief, concrete UI behavior in the interface contract, and dated results/limitations in verification records. Update those documents when the owner changes a preference or an important decision is settled.

## Efficient execution and continuous improvement

The owner expects professional judgment, brief self-review during work, and visible improvement from previous mistakes. Apply these lessons from the overlong responsive-toolbar pass:

- **Bound the task first.** Identify the requested outcome, acceptance checks and necessary deliverables. Keep optional enhancements separate; take them on when needed for correctness or explicitly requested.
- **Get evidence early.** For UI work, build a working visual draft in the first implementation pass and inspect representative wide/narrow views and transitions back to the default desktop layout before extensive polishing. Limit speculative alternatives to the few that materially affect the outcome. Include native host CSS and overlapping host chrome in relevant UI checks; an unobstructed standalone canvas does not qualify an Obsidian phone layout.
- **Settle decisions before broad verification.** Revisit a settled choice when new evidence warrants it. Avoid repeatedly reopening design questions based only on hypothetical edge cases.
- **Use brief execution checkpoints.** At the first working result, after a failed approach or scope change, and before handoff, check what is complete, what remains uncertain, and which next action resolves it. Notice repeated work, excessive deliberation and scope growth; adjust promptly. Keep these reviews brief and practical, without separate reports or approval loops.
- **Sequence verification.** Use focused checks during implementation. Once behavior and visuals settle, run the required full checks. Repeat or broaden them when a change, failure or unresolved concern justifies it. Fix genuine failures; preserve meaningful coverage and report qualification limits honestly.
- **Finish assets once.** Refresh relevant screenshots and documentation after the UI settles. Regenerate an entire gallery only when the requested deliverable or changed visuals require it.
- **Match checks to the change.** Documentation-only edits need content, link and diff checks; include staged additions because unstaged diff checks omit untracked files; do not manually rerun application suites or wait on unrelated automatic checks unless a repository policy requires it.
- **Report actual status.** Distinguish implementation, local verification, push and CI. Account for remaining test duration before saying “almost done.” Flag material overruns early and identify a concrete correction.
- **Stop at verified completion.** Deliver the complete requested result without extending the task into unrelated cleanup or speculative refinement.
- **Retain useful lessons.** When a mistake reveals a reusable rule, update these instructions or the relevant existing contract concisely. Apply the rule in subsequent work; avoid accumulating repetitive process notes.
