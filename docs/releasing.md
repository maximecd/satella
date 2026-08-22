# Releasing Satella

Satella is distributed as ad-hoc signed macOS Apple Silicon ZIPs. Every push to `main` produces a downloadable nightly build, and the manual **Ship Satella** workflow publishes immutable versioned prereleases.

## Versioning

All `0.x` releases are alphas; the prerelease flag communicates alpha status, so versions carry no `-alpha` suffix. The first release is `v0.1.0`. **Ship Satella** accepts no inputs: it selects `v0.1.0` when no release tag exists and afterwards increments the patch of the highest existing non-nightly release (`v0.1.1`, `v0.1.2`, …). There is no minor- or major-bump workflow in this scope.

`v0.1.0` establishes the permanent migration ledger. From that release onward, released migrations are immutable and every schema change must be appended as a new timestamped migration that preserves existing Vault data.

## Nightlies

Every successful push to `main` reruns all CI gates (`check`, `test`, `build`) and then packages one macOS Apple Silicon ZIP and publishes it as an immutable **nightly prerelease**: a `v<next-patch>-nightly.<UTC yyyymmdd>.<run number>` tag on the exact commit (for example `v0.1.1-nightly.20260822.42`) with generated release notes. The separate **Nightly** workflow listens for the successful `CI` workflow completion on `main`, so pull requests do not carry a skipped nightly check. Nightlies are permanent prereleases, so the latest integrated build is always downloadable from the Releases page; they never affect the stable version sequence, which only counts non-nightly tags.

## Shipping a release

Dispatch the **Ship Satella** workflow from `main`. It takes no inputs. The workflow:

1. Selects the next patch version.
2. Reruns `check`, `test`, `build`, packaging, structural validation, and the packaged-runtime smoke test against the exact selected commit.
3. Creates the immutable tag only after every gate passes, rechecking immediately before tagging so concurrent runs fail safely instead of double-publishing.
4. Publishes an immutable GitHub prerelease with generated notes.

## Building and validating locally

```sh
pnpm release:package --version 1.2.3 --output-dir ./release
pnpm release:smoke --artifact ./release/Satella-1.2.3-macOS-arm64.zip
```

The packaging command restores the workspace installation after creating its isolated production dependency tree, so running the smoke command does not require a manual `pnpm install`.

## Gatekeeper

The artifact is ad-hoc signed, not signed with an Apple Developer identity, and not notarized. For this maintainer-only pre-production artifact, macOS may quarantine the application after extraction. If Gatekeeper blocks launch, remove the temporary quarantine attribute from the extracted application:

```sh
xattr -dr com.apple.quarantine /path/to/Satella.app
```

This workaround is not a public-distribution or notarization substitute.

## Updates and recovery

Application updates remain manual: quit Satella, replace `Satella.app`, and open the existing Vault — replacing the application never replaces the Vault under `~/Library/Application Support/Satella/data`. Before an update, use Settings → Security → Export Vault to save one encrypted `.satella-vault` recovery file; Restore Vault is available on the Welcome and Unlock screens if a release or migration ever fails.
