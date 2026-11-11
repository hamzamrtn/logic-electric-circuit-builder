# Release preparation

The prepared release is **0.1.11**. The owner authorized publication on 2026-11-11. `npm run package` generates `dist/logic-electric-circuit-builder-0.1.11.zip` and the three individual install assets under `dist/logic-electric-circuit-builder/`. Release notes are in [releases/0.1.11.md](releases/0.1.11.md); local verification is recorded in [feedback and scorecard review](evidence/feedback-scorecard/validation.md). Publish only after the source commit passes GitHub verification.

Review the remaining real-host/device qualification in [validation.md](validation.md), fix failures and keep evidence current. The product name, identity and MIT license are already established. Historical research and initial registry checks do not replace current test results or directory review.

Build from a clean checkout with Node 24 and `npm ci`. Run lint, strict typecheck, core/property tests, Chromium/WebKit browser tests, production bundle audit and clean-package smoke. Validate examples and inspect the ZIP. Use a tag exactly matching the manifest's numeric x.y.z version, without a `v` prefix. Keep manifest.json, package.json, package-lock.json and versions.json aligned.

The Verify workflow remains read-only and runs source lint, type checking, tests and bundle checks. `npm run lint` caches the official Obsidian checker separately under the system temporary directory, using its supported TypeScript API. The checker's dependencies are not added to the plugin's package/lockfile or bundled into the plugin. The upstream checker currently has legacy tooling advisories; isolating it does not fix those upstream packages. It operates only on the checked-out source during development/CI.

The release workflow runs on an owner-published GitHub release or a manual Actions dispatch. It checks out the release tag, verifies that it exactly matches the manifest version, runs all checks including Chromium/WebKit, builds, attests `main.js`, `manifest.json` and `styles.css`, and uploads only those three exact install files to the published release. The optional ZIP remains downloadable from the workflow’s `release-assets` artifact and can be generated locally; do not attach ZIPs or other unsupported files to the release. Only this trusted job has contents/attestation/OIDC write permissions. A manual dispatch produces attested downloadable artifacts without changing a release.

For the authorized 0.1.11 release:

1. Commit and push the source changes; wait for Verify to pass. Ensure both feedback templates are on the default branch and that the idea/bug links open their matching forms before publishing.
2. In the directory's Reviews section, use **Review branch** on `main` to check the source before releasing. Local lint/build success does not establish directory acceptance.
3. Create a new GitHub release with tag **`0.1.11`** targeting the reviewed commit on `main`. Use [the prepared release notes](releases/0.1.11.md). Preserve existing published tags. The release workflow will attach the built, attested assets; wait for it to succeed.
4. In the directory, use **Check for new releases** and **Request review** if the new scan has not started. Check the complete results before declaring publication finished.

Attestations identify asset digests. Replacing the attested files with a different local build can reintroduce the missing-attestation finding; use the exact files from the release workflow.

The official submission instructions checked on 2026-11-01 direct maintainers to community.obsidian.md. Create an appropriate public source repository, commit the manifest on its default branch, and create a matching GitHub release with `main.js`, `manifest.json`, `styles.css` attached individually. Keep optional ZIPs in Actions artifacts rather than release attachments. Sign in to the community directory with the maintainer’s Obsidian account, connect GitHub and submit the repository. Address automated review feedback; a release does not guarantee acceptance.

Recheck the primary instructions immediately before submission:

- [Submit a plugin](https://docs.obsidian.md/plugins/releasing/submit-plugin)
- [Plugin submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)
- [Public API definitions](https://github.com/obsidianmd/obsidian-api)
- [Mobile development](https://docs.obsidian.md/Plugins/Getting%20started/Mobile%20development)

No telemetry, self-updater, backend or runtime network dependency is included. Feedback links open GitHub only on user activation; submitting there requires a GitHub account. Distribute the license/third-party notices with source; runtime license texts are included inside main.js. Document format changes separately from plugin rollback instructions.
