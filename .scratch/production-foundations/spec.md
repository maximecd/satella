# Production foundations

Status: ready-for-agent

## Problem Statement

Satella has working local quality commands, a web application, an engine, and a thin Electron shell, but it has no automated pull-request gate and cannot produce a distributable desktop artifact. A change can therefore merge without proving that formatting, linting, type checking, tests, and production builds still pass.

The desktop shell currently assumes the repository layout when locating the web build and engine, relies on a fixed engine port, has no stable packaged identity, and has no packaging strategy for the native SQLCipher dependency. There is also no deliberate production ownership boundary for the Vault and other Electron state. These gaps prevent a maintainer from manually turning a known commit on `main` into a reproducible macOS Apple Silicon release.

## Solution

Add three production foundations:

1. A pull-request and `main` CI workflow that runs the existing check, test, and build commands in parallel and exposes one stable required result.
2. A manual-only release workflow that packages the current `main` commit as an ad-hoc-signed macOS arm64 ZIP, validates the packaged runtime, and publishes an immutable versioned GitHub prerelease.
3. A production desktop runtime boundary in which Electron owns one embedded engine and one Vault at the platform-native Satella application-data location.

The first release target is intentionally narrow: one maintainer, macOS arm64, a private repository, no Apple Developer signing identity, and no automatic release trigger.

## User Stories

1. As a maintainer opening a pull request, I want formatting and linting checked automatically, so that style defects cannot merge unnoticed.
2. As a maintainer opening a pull request, I want every TypeScript workspace type-checked automatically, so that cross-package type errors are caught before merge.
3. As a maintainer opening a pull request, I want the test suites run automatically, so that regressions are visible before review is complete.
4. As a maintainer opening a pull request, I want the production build run automatically, so that bundler, entry-point, and module-resolution failures are caught before merge.
5. As a maintainer, I want independent CI work to run in parallel, so that feedback is not delayed unnecessarily.
6. As a maintainer, I want superseded pull-request runs cancelled, so that obsolete commits do not consume runner time or obscure the current result.
7. As a maintainer, I want CI to run on the merged `main` commit, so that the repository verifies the exact integration result.
8. As a maintainer, I want one stable required CI status, so that branch protection does not depend on internal job organization.
9. As a maintainer, I want failed checks, tests, and builds distinguishable in GitHub, so that I can identify the failing boundary quickly.
10. As a maintainer, I want dependency installation to honor the lockfile and pinned Node and pnpm versions, so that CI does not silently use a different toolchain.
11. As a maintainer, I want CI to use the repository's existing commands, so that local and hosted validation follow the same rules.
12. As a maintainer, I want releases initiated only by an explicit manual action, so that pushes, merges, schedules, and tags cannot publish unexpectedly.
13. As a maintainer, I want release dispatch restricted to `main`, so that an unmerged branch cannot become an official Satella release.
14. As a maintainer, I want to provide a SemVer release version when dispatching, so that the application, tag, artifact, and GitHub Release share one identity.
15. As a maintainer, I want malformed or previously used versions rejected before publication, so that releases and tags remain immutable.
16. As a maintainer, I want release quality gates rerun against the selected `main` commit, so that publication does not rely on stale CI state.
17. As a maintainer, I want the tag created only after packaging and validation succeed, so that a failed build does not claim a released version.
18. As a maintainer, I want a GitHub prerelease created for the successful build, so that the artifact has a durable versioned home without claiming production support.
19. As a maintainer, I want generated notes derived from merged pull requests, so that each release records its changes with little manual work.
20. As a maintainer, I want a clearly named macOS arm64 ZIP attached to the release, so that I can identify and download the correct artifact.
21. As a maintainer, I want concurrent release attempts serialized, so that two dispatches cannot race while creating tags or releases.
22. As a maintainer, I want release permissions limited to the publication job, so that ordinary CI cannot modify repository contents.
23. As a macOS Apple Silicon user, I want the ZIP to contain a complete `Satella.app`, so that no repository checkout, package manager, Node installation, or external database tool is required.
24. As a macOS Apple Silicon user, I want Satella to have a stable name and application identity, so that macOS stores and presents it consistently between versions.
25. As a macOS Apple Silicon user, I want the web interface and engine embedded in the application, so that the application does not depend on monorepo-relative paths.
26. As a macOS Apple Silicon user, I want SQLCipher rebuilt and packaged for the Electron arm64 runtime, so that the encrypted Vault can open in the packaged application.
27. As a maintainer, I want native modules unpacked where required, so that packaging them in an application archive does not make them unloadable.
28. As a maintainer, I want the packaged application checked for required web, engine, and native resources, so that an incomplete ZIP is rejected.
29. As a maintainer, I want the packaged application launched in an isolated smoke test, so that resource paths and the embedded engine are verified as a working system.
30. As a maintainer, I want the smoke test to wait for the embedded engine's public health endpoint, so that success proves more than process creation.
31. As a maintainer, I want smoke-test state isolated from my real Vault, so that release validation cannot read or change personal financial data.
32. As a maintainer, I want smoke-test processes terminated reliably, so that a release runner cannot retain an engine or locked data directory.
33. As the sole initial user, I want the unsigned-build limitation and temporary Gatekeeper workaround documented, so that installation failure is not surprising.
34. As a user launching Satella twice, I want the second launch to focus the existing window and exit, so that two desktop processes cannot contend for one Vault.
35. As a user, I want Satella to choose an available loopback port for its engine, so that unrelated software using port 3001 does not prevent startup.
36. As a user, I want the renderer to receive the selected engine location at runtime, so that the packaged web build does not contain a fixed production port.
37. As a user quitting Satella, I want the desktop to stop its embedded engine, so that the encrypted database closes and the Vault password is required next time.
38. As a user whose desktop exits abnormally, I want the embedded engine terminated or unable to retain ownership indefinitely, so that an orphaned process does not leave the Vault open.
39. As a user, I want production Vault files stored in the platform-native Satella application-data directory, so that application data follows macOS conventions.
40. As a user, I want the Vault database, key envelope, backups, and ownership metadata contained in one private subtree, so that its security and deletion boundary is explicit.
41. As a user, I want Vault directories and files to retain private filesystem permissions, so that packaging does not weaken local protection.
42. As a user performing a Vault reset, I want the database, key envelope, encrypted backups, and Vault-derived caches deleted, so that old financial data cannot reappear.
43. As a user performing a Vault reset, I want non-Vault preferences and sanitized logs preserved, so that resetting financial data does not unnecessarily erase application behavior or diagnostics.
44. As a user, I want credentials and financial values excluded from logs, so that diagnostics do not undermine Vault encryption.
45. As a developer, I want repository-local `.satella` data to remain the development default, so that worktrees stay isolated from the packaged Vault.
46. As a developer, I want tests to retain an explicit internal data-directory mechanism, so that temporary Vaults can be exercised without changing production storage policy.
47. As a user of packaged Satella, I want inherited environment variables unable to redirect my Vault, so that production data ownership remains deterministic.
48. As a future release maintainer, I want signing and notarization attachable to the existing packaging boundary, so that broader distribution does not require replacing the build system.

## Implementation Decisions

- The root CI workflow runs for pull requests and pushes to `main`.
- CI installs the exact Node and pnpm versions declared by the repository and performs a frozen-lockfile install.
- CI has parallel `check`, `test`, and `build` jobs. `check` invokes the existing aggregate command, which already covers formatting, linting, and recursive type checking; these checks are not duplicated as separate commands.
- A final aggregate `CI` job depends on all three jobs, runs even when a dependency fails, and succeeds only when every required job succeeds. Branch protection requires this stable aggregate status.
- Pull-request concurrency is grouped by pull request and superseded runs are cancelled. `main` runs are not cancelled.
- Coverage is not an initial required gate. Its cost and signal can be evaluated after ordinary CI timings are known.
- Repository path filters are not used initially; all pull requests exercise the complete monorepo gate.
- The release workflow has `workflow_dispatch` as its only trigger and rejects dispatches not targeting `main`.
- Dispatch accepts a SemVer version without the `v` prefix. That input supplies the staged desktop application version, artifact version, release title, and `v<version>` tag.
- The release workflow fails if either the requested tag or GitHub Release already exists. It never overwrites, moves, or force-updates a release tag.
- Release jobs are serialized. A second release waits or fails safely rather than publishing concurrently.
- Release validation reruns the same check, test, and build gates before packaging.
- Packaging runs on a GitHub-hosted Apple Silicon macOS runner and produces only a macOS arm64 ZIP.
- The packaging implementation uses electron-builder behind a repository-owned staging command. The command assembles a minimal production application tree before invoking the packager rather than relying on the monorepo layout at runtime.
- The packaged product name is `Satella` and the permanent bundle identifier is `app.satella`.
- The packaged application version comes from the validated workflow input. Private workspace package versions do not become the release source of truth.
- Desktop application code is packaged in an application archive. Native modules and any resources that must be directly executable or loadable are placed in unpacked or extra-resource locations as appropriate.
- The staging command includes the built desktop main process, built web application, built engine, required production dependencies, Connector runtime code, and the SQLCipher native binding.
- SQLCipher is rebuilt for the pinned Electron version and macOS arm64 architecture before packaging. The result is validated as loadable by the runtime used in the packaged application.
- The engine remains a private packaged sidecar owned by the desktop. Production does not ship or support a separate standalone engine distribution.
- The desktop launches the engine through the packaged Electron executable in Node mode. It explicitly sets the Electron Node-mode environment, resolves the engine from the packaged resources location, captures output for diagnostics, waits for readiness, and owns graceful and forced termination.
- Source-level standalone engine execution remains development and test tooling only.
- The desktop acquires Electron's single-instance lock before starting the engine or opening the Vault. A second launch notifies and focuses the first instance, then exits.
- The packaged desktop selects an available loopback engine port for each launch and communicates the resulting runtime engine URL to the renderer. Port 3001 remains only a development default.
- Renderer runtime configuration replaces a compile-time production engine URL while preserving the existing development-server configuration.
- The engine continues binding only to loopback. Existing Vault and Screen-lock HTTP behavior remains unchanged.
- The packaged application is ad-hoc signed. This provides code-signature structure but is not represented as Apple Developer signing or notarization.
- The release is published only after structural validation and a packaged runtime smoke test pass. Publication creates the immutable tag at the exact tested commit and creates a GitHub prerelease with generated notes.
- Release instructions explain that the artifact is private, pre-production, and not notarized, and provide the temporary quarantine-removal command needed to launch it.
- Production storage is rooted at Electron's platform-native `userData` path for the `Satella` identity. On macOS this resolves under the user's Application Support directory.
- The Vault-owned subtree is `data/` beneath `userData`. It contains the encrypted database, key envelope, encrypted backups, SQLite sidecars, and live ownership metadata.
- The packaged desktop always passes that canonical Vault location to its engine. An inherited data-directory environment variable cannot override it.
- The data-directory environment contract remains internal for desktop-to-engine startup, tests, and development tooling; it is not a supported packaged-user configuration surface.
- Development commands retain worktree-local `.satella` storage and do not read or mutate the production Vault.
- Electron owns Chromium state, caches, logs, and future non-Vault preferences in platform-native locations. Vault-derived browser or HTTP caches are cleared during Vault reset; preferences and sanitized logs are preserved.
- Logs must not contain Vault passwords, Screen-lock PINs, Connection credentials, key material, or decrypted financial values.
- Vault reset deletes the complete Vault subtree and encrypted backups, clears any Vault-derived cache, releases stale ownership state, and returns to onboarding. It does not delete the entire Electron profile.
- Existing private directory and file permissions remain required in production.
- A short ADR records the durable boundary that the packaged desktop owns the private engine process and production Vault location. This is worth preserving because it rejects a separately distributed production engine and a home-directory dotfolder, and changing it later would affect runtime, native dependencies, and application identity.
- No domain-glossary update is required. Vault and Vault reset retain their existing meanings; platform paths, sidecars, artifacts, tags, and releases are implementation or delivery terms.

## Testing Decisions

- Tests assert behavior at the highest practical boundary and avoid coupling to workflow YAML layout, staging-directory internals, or individual path helper functions.
- There are three top-level seams because CI gating, release publication, and packaged runtime behavior are independently observable systems.
- The CI seam is the repository command boundary: a pull request and a `main` push must produce separate check, test, and build results plus one aggregate required result. A deliberately failing command must make the aggregate result fail.
- The release-command seam is the staging and packaging CLI invoked by the manual workflow. It accepts an explicit version and output directory, exits non-zero on invalid inputs or incomplete resources, and produces one deterministically named macOS arm64 ZIP.
- Pure version, platform, resource-layout, and artifact-name decisions may be tested below the CLI only when failure cases cannot be exercised economically through the process boundary.
- The packaged-runtime seam is a process-level smoke test against the assembled `.app`, not against source entry points. It launches with a temporary internal Vault location, uses a controlled test port when determinism is needed, waits for the public engine health endpoint, and then terminates the application.
- The smoke test verifies that the engine starts through Electron's Node mode, SQLCipher loads under the Electron ABI, the production database location is accepted, and required web resources are present.
- Structural artifact assertions verify the application identity, version, web build, engine build, native binding, archive/unpacked boundaries, and absence of repository-relative runtime dependencies.
- Process cleanup assertions verify that normal test shutdown closes the engine and releases Vault ownership. A forced desktop termination case verifies that an engine is not intentionally left running.
- Single-instance behavior is tested at the Electron application boundary: a second launch exits and causes the existing window to be surfaced without starting another engine.
- Dynamic-port behavior is tested by occupying port 3001 before launch and proving that packaged Satella still reaches its own engine.
- Storage behavior is tested through packaged desktop startup and Vault reset using temporary platform roots. Tests prove that the Vault is created under the Satella `userData/data` boundary, inherited overrides are ignored, and development `.satella` data remains untouched.
- Vault reset tests prove deletion of the database, key envelope, backups, sidecars, ownership metadata, and Vault-derived caches while preserving non-Vault preferences and sanitized logs.
- Release workflow logic has a non-publishing validation path exercised by automated tests. Tests verify SemVer normalization, `main` enforcement, duplicate-version rejection, prerelease metadata, and exact commit/tag association without creating a real GitHub Release.
- The existing desktop main-process helper suite is prior art for engine command, environment, screen-lock request, and window-target behavior.
- The existing spawned-engine Vault process suite is prior art for testing a real engine through its HTTP boundary with temporary encrypted storage.
- Existing database configuration and development-database tests are prior art for absolute internal data locations, private filesystem permissions, worktree isolation, ownership, and reset behavior.
- A release is successful only if ordinary quality gates, structural packaging assertions, and the packaged runtime smoke test all pass before publication.

## Out of Scope

- Windows or Linux packaging.
- macOS x64 or universal binaries.
- DMG, PKG, Homebrew, Mac App Store, or other installer formats.
- Apple Developer ID certificates, hardened-runtime entitlements, notarization, or staple validation.
- Automatic updates, update manifests, release channels, nightly builds, scheduled builds, or tag-triggered workflows.
- Automatic releases on merge or push.
- Public distribution support or a polished first-launch bypass for Gatekeeper.
- Crash reporting, analytics, telemetry, or automatic log uploads.
- Coverage as an initial required pull-request gate.
- A separately distributed or user-supported production engine executable.
- A packaged-user setting or environment override for the production Vault location.
- Migrating any prior production Vault or Electron profile; Satella has no released installations or compatibility obligation.
- Changing Vault encryption, key derivation, backup cryptography, database schema, or finance-domain behavior.
- Changing Vault password, Screen lock, or Connection behavior except where packaged lifecycle and reset storage boundaries require it.
- General production-readiness work beyond the three agreed foundations, including licensing review, support policy, observability, disaster recovery, accessibility audit, and security audit.

## Further Notes

- The repository is private, so the prerelease and ZIP remain accessible only to authorized repository users. “Only for the maintainer” is an intended audience, not a cryptographic access control added by the application.
- A Git tag names the exact released commit; a GitHub Release supplies notes and downloadable artifacts attached to that tag. In this design the manual workflow creates both only after the artifact passes validation.
- Ad-hoc signing does not satisfy Gatekeeper notarization. The quarantine-removal instruction is a temporary maintainer-only workaround and must not be described as appropriate public distribution.
- Building in pull-request CI is deliberate even though check and tests pass independently: it detects production bundling, entry-point, generated-output, and module-resolution failures that TypeScript does not guarantee.
- The selected storage policy follows macOS conventions rather than copying t3code's project-specific home-directory dotfolder. Its useful precedent is explicit path ownership and development/production separation, not the literal directory name.
- The embedded-engine decision supersedes the earlier speculative requirement that a future self-hoster receive the same independently runnable production engine. Source-level standalone development remains, but a supported self-hosted distribution requires a future design.
- Vault reset clears caches capable of retaining Vault-derived responses while preserving ordinary preferences and sanitized logs. This keeps the established security requirement without treating the entire Electron profile as the Vault.
