# Release 0.1.11

Recorded 2026-11-12. Source commit: `8e7afa183724be5d8417361d1293bfb116c6d746`.

## GitHub Actions recovery

The original [Verify run](https://github.com/hamzamrtn/logic-electric-circuit-builder/actions/runs/43095944760) remained queued with zero jobs and unchanged creation/update timestamps of 2026-11-11T20:25:15Z. Normal and force cancellation both returned HTTP 409, saying the run had not been queued yet. A rerun was rejected; deletion returned HTTP 403. Deletion is also subject to GitHub's completion/two-week eligibility rule, so the 403 alone is not evidence of corruption.

The observed state matches [GitHub's documented abnormal run/check-suite symptoms](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows#canceling-workflows). Its creation coincided with the [November 11 Webhooks incident](https://www.githubstatus.com/incidents/1h2wbly1y72t), followed by an [Actions incident](https://www.githubstatus.com/incidents/dvy0t3mvh1lg); this is a timing correlation, not a confirmed cause. No workflow-code defect was established. Both workflows already used ubuntu-latest and had no concurrency group.

A fresh manual [build-and-attest dispatch](https://github.com/hamzamrtn/logic-electric-circuit-builder/actions/runs/43185837114) ran the unchanged source successfully, completing at 08:54:36 UTC. This bypassed the stale record without changing source, permissions or runner labels. The run passed:

- Lint, strict TypeScript, 190 unit/adapter/property tests, production build and artifact audit.
- Clean-package smoke against the public Obsidian stub and preview build.
- 376 browser tests, with 32 skips, across Chromium desktop, Android tablet/phone and WebKit touch projects. These are browser tests, not physical Obsidian device qualification.
- Packaging, [asset attestation](https://github.com/hamzamrtn/logic-electric-circuit-builder/attestations/66612500) and release-assets upload.

The downloaded artifact's manifest identified 0.1.11. ZIP CRC integrity passed, and its three files matched the individual artifact files byte-for-byte. The installed local GitHub CLI lacks the attestation subcommand; no independent local signature-verification result is claimed.

## Publication

The owner explicitly requested publication on 2026-11-12. [Release 0.1.11](https://github.com/hamzamrtn/logic-electric-circuit-builder/releases/tag/0.1.11) was published at 08:57:20 UTC, targeting the verified source commit. Only main.js, manifest.json and styles.css were attached, using the exact files from the successful manual build. Existing release tags were preserved; the optional ZIP remains in Actions artifacts.

Publication triggered [Verify](https://github.com/hamzamrtn/logic-electric-circuit-builder/actions/runs/43187206866), which passed at 09:03:03 UTC, and the [release build](https://github.com/hamzamrtn/logic-electric-circuit-builder/actions/runs/43187207643), which passed at 09:03:15 UTC. The release job completed all checks, attestation and final upload. GitHub's latest stable release points to 0.1.11.

The final three public downloads match the tested manual-build assets byte-for-byte. Their SHA-256 digests also match GitHub's release-asset metadata:

| Asset | SHA-256 |
| --- | --- |
| main.js | `64873adfe304bb29bde48474709b1062484703e1024a33f1322909f7d6603cde` |
| manifest.json | `7c83fcf86124c10aaf158b724f53a75ecab91bb67c25396ea6c7564d1d63f7ab` |
| styles.css | `8e6ea461fe20b5c289e8871b37611d6dd2587470dbb08e44e9dc9bd749bd0d39` |

The public Obsidian directory still listed 0.1.10 at publication. The connected browser was signed out, so Review branch, Check for new releases and Request review were unavailable. No new directory scorecard acceptance is claimed. Real-host/device qualification remains as recorded in [validation.md](../validation.md).
