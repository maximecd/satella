# Releasing Satella

Satella ships as an npm tarball (`@satella/app`, bin `satella`). npm registry publish is not wired yet. **Ship Satella** attaches that tarball to an immutable GitHub prerelease. Automatic Electron nightlies are gone.

## Versioning

All `0.x` releases are alphas; the prerelease flag communicates alpha status, so versions carry no `-alpha` suffix. The first release is `v0.1.0`. **Ship Satella** accepts no inputs: it selects `v0.1.0` when no release tag exists and afterwards increments the patch of the highest existing non-nightly release (`v0.1.1`, `v0.1.2`, …). There is no minor- or major-bump workflow in this scope.

Released migrations are immutable. Every schema change must be appended as a new timestamped migration that preserves existing Vault data.

## Shipping a release

Dispatch the **Ship Satella** workflow from `main`. It takes no inputs. The workflow:

1. Selects the next patch version.
2. Reruns `check`, `test`, `build`, `npm pack`, tarball validation, and the packed-CLI smoke test against the exact selected commit.
3. Creates the immutable tag only after every gate passes, rechecking immediately before tagging so concurrent runs fail safely instead of double-publishing.
4. Publishes an immutable GitHub prerelease with the tarball and generated notes.

Run the packed CLI from the release asset:

```sh
npx --yes /path/to/satella-app-0.1.0.tgz
```

or, after a registry account exists, `npx @satella/app`.

## Building and validating locally

```sh
pnpm release:package --version 0.1.0 --output-dir ./release
pnpm release:smoke --artifact ./release/satella-app-0.1.0.tgz
```

The product listen address is `127.0.0.1:3001`. The smoke command injects an isolated data directory and does not open a browser.

## Updates and recovery

The production Vault lives in `~/.satella`. Replacing the CLI never replaces that directory. Before an update, use Settings → Security → Export Vault to download one encrypted `.satella-vault` recovery file. Restore Vault is available on the Welcome and Unlock screens.
