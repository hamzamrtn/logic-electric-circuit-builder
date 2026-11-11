# Feedback and scorecard cleanup

Recorded 2026-11-11 for local, unpublished 0.1.11. This implements the owner's session request; no source push, release publication or directory rescan was performed.

## Implemented behavior

**More → Send feedback** has a lightning icon and opens “Help shape the next update”. It welcomes detailed feedback and explains personal review, with possible day-or-two turnaround for useful, straightforward improvements and longer timelines for bigger ideas. Separate links open the repository's idea and bug-report forms. The matching forms are included under `.github/ISSUE_TEMPLATE/`; they must reach the default branch before release. No public email address was available or supplied, so the optional email route is omitted.

Opening the dialog performs no network request and attaches no drawing or vault data. Following a route opens a separate page; the user submits the feedback on GitHub. Links participate in initial focus and forward/backward focus wrapping. Escape and Close restore canvas focus. Feedback preserves selection, document/history and unfinished wire bends. The modal blocks canvas shortcuts while open and stays clear of floating phone navigation in narrow/short layouts.

## Review findings

| Reported finding | Local result |
| --- | --- |
| Three `:has()` selectors | Removed; the editor exposes dock state directly for inspector layout. |
| Two duplicate `background` declarations | Removed; solid-color fallbacks and `color-mix()` rules are separated with `@supports`. |
| `clip-path` compatibility | Removed from the screen-reader-only label; compatible clipped positioning retains its accessible name. |
| Unsupported release attachment | The release workflow now attaches only `main.js`, `manifest.json` and `styles.css`. The optional ZIP stays in Actions artifacts/local builds. Existing published assets are untouched. |
| Base64 disclosure | The production bundle has zero `atob`/`btoa` calls after moving the schemas to Zod Mini. Strict object validation, limits, defaults, English errors and the circuit file version are preserved. |
| Vault enumeration | Retained accurately for circuit discovery, filename resolution and recovery migration. |
| Malware/obfuscation scans unavailable | External scanner availability is outside this implementation. |

Artifact checks now reject the specific CSS/base64 regressions above. This is local evidence, not a claim that the public scorecard already changed. The seven addressable findings plus the base64 disclosure require confirmation in the published release's next scan. Existing asset-attestation/reproducibility checks remain part of the release process.

## Verification

- `npm run check`: passed strict TypeScript, **190 core/adapter/property tests in 31 files**, production build and artifact audit.
- `npm run lint`: passed source-boundary checks and the pinned official Obsidian ESLint checker. The isolated checker was installed with network access after the sandboxed installation stalled; the plugin dependency lockfile was not changed beyond its version.
- `npm run check:install`: passed the three-file package smoke and seven commands/one view against a public-host stub.
- `npm run package`: passed. ZIP CRC integrity and all three files were checked byte-for-byte against the root outputs and extracted install directory.
- Feedback browser coverage verifies both route destinations without submitting feedback, modal focus and shortcut isolation, document/history preservation, draft finish/undo, 320px/390px/short panes, floating navigation clearance and a return to the wide desktop toolbar.
- The first full browser run exposed a stale End-key assertion that expected Keyboard shortcuts as More's last item. The assertion now expects Send feedback, then checks Arrow Up still reaches Keyboard shortcuts. Final browser results are recorded in the companion JSON.
- Issue-form and release-workflow YAML parsed successfully. Release versions, documentation links and whitespace were checked.

## Visual evidence and reproduction

The final [desktop](feedback-desktop.png) and [phone](feedback-phone.png) images were visually inspected. They include native CSS extracted from the installed Obsidian **1.14.4** `app.css`; the phone also includes simulated floating host chrome. Captures exercise the actual editor through its development harness. They are browser evidence, not an actual Obsidian/device qualification. The regular editor gallery was not regenerated because the main editing surface is unchanged.

Run `npm run preview:build`, then `LEC_HOST_CSS=/path/to/app.css node scripts/capture-feedback.mjs` to reproduce the native-CSS captures. Omitting `LEC_HOST_CSS` uses the development host-theme emulation only. The installed host CSS is not committed or bundled.

## Qualification limits

Playwright WebKit 2359 could not be installed: every configured download mirror timed out. Current local WebKit/iPhone results are therefore unavailable; no past WebKit result is reused as evidence for this build. The GitHub Verify/release jobs retain their WebKit project. Actual Obsidian devices, screen readers, two-device sync and force-kill durability remain separate host/device checks. Public issue-form availability and scorecard acceptance require the source push and release review respectively.

The official checker reports advisories in its isolated development-only toolchain, as described in [release preparation](../../release.md); those packages are not added to the plugin or bundled runtime.
