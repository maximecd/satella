# Satella personal alpha release

Status: ready-for-agent

## Problem Statement

The application is close to being useful for its maintainer's real financial data, but it still carries a temporary identity and a release process designed for occasional manually versioned builds. Replacing the application bundle would preserve its separate Vault today, but there is no portable recovery artifact or supported restore flow if an update or migration fails. The local engine also trusts any caller that can reach its loopback port, and the desktop window does not yet enforce the navigation boundary needed to keep engine access inside Satella.

The first real release must establish a clear promise. Satella may remain an alpha throughout `0.x`, but every release starting with `v0.1.0` must preserve the maintainer's Vault. Shipping should stay cheap enough to happen often. Routine releases must not require inventing a version or deciding whether a change is a patch, minor, or major release.

## Solution

Rename the product and every repository-owned technical identity to Satella while leaving the current GitHub repository name and location unchanged. Satella starts with a fresh application identity and fresh Vault. It does not discover or migrate data created under the temporary identity.

Add a complete recovery flow. Settings can export the live encrypted Vault as one `.satella-vault` file after the user confirms the Vault password. Welcome and Vault unlock can restore that file. Satella validates the export, password, database integrity, and migration compatibility in staging before it replaces any current Vault.

Turn every successful push to `main` into a downloadable nightly build retained for 14 days. Add a zero-input **Ship Satella** GitHub Actions workflow that calculates the next patch version, reruns every release gate, and publishes an immutable GitHub prerelease. The first release is `v0.1.0`; later clicks produce `v0.1.1`, `v0.1.2`, and so on. All `0.x` releases are alpha.

Protect the desktop-to-engine boundary with a random token created for each application launch. Vault and finance requests require that token. The Electron window keeps Satella content in the window, prevents external pages and popups from inheriting renderer access, and sends permitted external links to the operating system browser.

## User Stories

1. As the maintainer, I want the product named Satella everywhere, so that the first real release does not expose its temporary name.
2. As the maintainer, I want the current GitHub repository left where it is, so that the rename does not force the open-source repository move to happen now.
3. As a macOS user, I want the application displayed as Satella in Finder, the Dock, menus, dialogs, and process metadata, so that its identity is consistent.
4. As a macOS user, I want Satella to use the stable bundle identifier `app.satella`, so that every Satella update resolves to the same application identity.
5. As a developer, I want workspace packages to use the `@satella-app` scope, so that imports and package metadata no longer retain the temporary identity and match the reserved npm scope.
6. As a developer, I want environment variables, IPC channels, runtime globals, storage keys, database names, development directories, logs, and test fixtures renamed, so that internal diagnostics and interfaces speak one language.
7. As a user, I want onboarding, Lock, Reset, errors, connector instructions, and security guidance to say Satella, so that no temporary product copy remains visible.
8. As a maintainer, I want source documentation, domain documentation, ADRs, research notes, release documentation, and local issue files renamed, so that future work does not copy the temporary name back into the product.
9. As a maintainer, I want a repository guard against the temporary identity, so that later changes cannot silently reintroduce it.
10. As the repository owner, I want the GitHub repository name and remote left unchanged, so that only the product and code identities change in this release.
11. As a user, I want Satella to create its own fresh Vault location, so that it never opens data owned by the temporary application identity.
12. As a developer, I want development data stored under `.satella`, so that local tooling matches the new product identity.
13. As a user, I want production data stored under Satella's native macOS application-data directory, so that replacing `Satella.app` does not replace my Vault.
14. As a user, I want the Vault database and envelope to use Satella names, so that backup inspection and diagnostics are understandable.
15. As a user, I want the destructive reset phrase to say `Reset Satella`, so that confirmation matches the product being erased.
16. As a user, I want old temporary application data ignored, so that an abandoned development Vault cannot appear in Satella unexpectedly.
17. As the first alpha user, I want `v0.1.0` to establish the permanent migration history, so that every later Satella build can open my existing Vault.
18. As the first alpha user, I want released migrations to remain immutable, so that an update cannot reject my Vault because history was rewritten.
19. As the first alpha user, I want later schema changes appended as migrations, so that the product can keep evolving without resets.
20. As the first alpha user, I want a newer binary to migrate my Vault automatically when needed, so that replacing the application remains the normal update flow.
21. As the first alpha user, I want a failed migration to stop with a clear error and leave my Vault files untouched, so that a broken update never destroys data.
22. As the first alpha user, I want future release validation to exercise a populated Vault from the previous alpha, so that compatibility is proved with data rather than inferred from migration files.
23. As a user in Settings, I want an Export Vault action, so that I can create a recovery file before an update.
24. As a user exporting a Vault, I want Satella to require my current Vault password, so that an unattended unlocked screen cannot copy my credentials and financial data.
25. As a user exporting a Vault, I want a native save dialog, so that I can choose where the recovery file is stored.
26. As a user exporting a Vault, I want one `.satella-vault` file, so that the database and key envelope cannot be separated accidentally.
27. As a user exporting a Vault, I want the file protected by my current Vault password, so that copying it to external storage does not expose its contents.
28. As a user exporting a Vault, I want the complete live Vault included, so that portfolio data, custodians, connector credentials, settings, and security configuration return together.
29. As a user exporting a Vault, I want the Screen-lock PIN hash and timeout preserved, so that recovery reproduces my Vault instead of silently changing security settings.
30. As a user exporting a Vault, I want Satella to exclude caches, logs, Electron preferences, database sidecars, ownership files, and old internal migration backups, so that the portable file contains live Vault state rather than process debris.
31. As a user exporting a Vault, I want Satella to create a consistent encrypted database while the Vault is open, so that the export does not depend on copying live SQLite files.
32. As a user exporting a Vault, I want a failed export to leave no apparently successful partial file, so that I do not trust a broken recovery artifact.
33. As a user exporting over an existing file, I want replacement to occur only after the new export is complete, so that a failed retry does not destroy my previous export.
34. As a user exporting a Vault, I want a clear success message naming the saved file, so that I know the operation finished.
35. As a user entering the wrong export password, I want a concise failure without a file, so that I can retry safely.
36. As a returning user, I want Restore Vault available on the Vault-unlock screen, so that I can recover when the current Vault no longer opens.
37. As a new user, I want Restore Vault available from Welcome, so that I can recover onto a fresh Satella installation without creating a throwaway Vault first.
38. As a user restoring a Vault, I want a native file picker restricted to `.satella-vault` files, so that selecting the intended artifact is straightforward.
39. As a user restoring a Vault, I want Satella to ask for the exported Vault's password, so that it can validate the artifact before changing local data.
40. As a user restoring a Vault, I want malformed files, wrong passwords, damaged databases, and incompatible schemas rejected, so that invalid input cannot replace my current Vault.
41. As a user restoring an older Vault export, I want pending migrations applied to a staged copy, so that a valid export can be restored by a newer Satella release.
42. As a user restoring a Vault created by a newer schema, I want Satella to refuse it without changing local data, so that an older binary cannot corrupt it.
43. As a user restoring over an existing Vault, I want an explicit replacement confirmation, so that choosing a file does not erase my current data immediately.
44. As a user restoring a Vault, I want validation and migration to finish before replacement begins, so that failure leaves the current Vault untouched.
45. As a user restoring a Vault, I want the final replacement to be crash-safe, so that interruption cannot leave a mixture of old and restored files.
46. As a user restoring a Vault, I want Satella to clear Vault-derived caches after success, so that the interface cannot display data from the replaced Vault.
47. As a user restoring a Vault, I want Satella to return to Vault unlock after success, so that restoration does not silently leave financial data open.
48. As a user restoring a Vault, I want the original Screen-lock PIN and timeout to work after unlock, so that the restored security state matches the export.
49. As a user restoring a Vault, I want connector credentials to remain usable, so that recovery does not require reconnecting every custodian.
50. As a maintainer, I want every successful push to `main` to package a nightly Satella build, so that the latest integrated code is available for testing.
51. As a maintainer, I want a failed CI gate to prevent the nightly package, so that a known-broken commit is not offered as a build.
52. As a maintainer, I want each nightly version and artifact to identify its commit and workflow run, so that I can trace a downloaded build back to source.
53. As a maintainer, I want nightly versions based on the next patch after the latest release, so that they sort after the current release and before the next one.
54. As a maintainer, I want nightly artifacts retained for 14 days, so that recent builds remain available without creating permanent release clutter.
55. As a maintainer, I want nightlies stored only as GitHub Actions artifacts, so that they create no tags or GitHub Releases.
56. As a maintainer, I want a GitHub Actions workflow named Ship Satella, so that publishing is an obvious deliberate action.
57. As a maintainer, I want Ship Satella to accept no inputs, so that release numbering never delays shipping.
58. As a maintainer, I want the first Ship Satella run to choose `v0.1.0`, so that the product starts with a clean release history.
59. As a maintainer, I want each later Ship Satella run to increment the latest non-nightly patch version, so that releases progress as `v0.1.1`, `v0.1.2`, and onward.
60. As a maintainer, I want no minor or major release decision in the workflow, so that I can ship repeatedly without classifying each change.
61. As a maintainer, I want every `0.x` GitHub Release marked as a prerelease, so that Satella's alpha status remains explicit without an `-alpha` version suffix.
62. As a maintainer, I want Ship Satella restricted to `main`, so that an unmerged branch cannot become a release.
63. As a maintainer, I want concurrent Ship Satella runs serialized, so that two clicks cannot calculate or publish the same version.
64. As a maintainer, I want release gates rerun for the exact selected commit, so that publication does not rely on a stale nightly result.
65. As a maintainer, I want the tag created only after the packaged application passes validation, so that a failed release does not consume a version.
66. As a maintainer, I want immutable release tags and artifacts, so that a downloaded version always names one tested commit.
67. As a maintainer, I want generated release notes, so that frequent releases do not require handwritten summaries.
68. As a maintainer, I want the old unused `v0.1.0` tag and GitHub Release removed before Satella ships, so that Satella can begin at the intended version.
69. As a macOS Apple Silicon user, I want the release ZIP to contain `Satella.app`, so that installation means dragging one application into Applications.
70. As a macOS Apple Silicon user, I want replacing `Satella.app` to preserve my Vault, so that ordinary updates require no export or import step.
71. As a user, I want Satella to create a new engine token every time the desktop starts, so that engine access cannot be reused across application sessions.
72. As a user, I want Vault and finance endpoints to reject requests without the current engine token, so that an unrelated local webpage cannot use the unlocked engine.
73. As a user, I want invalid engine tokens rejected without revealing Vault state, so that unauthorized callers learn nothing useful.
74. As a user, I want the engine token kept out of logs, files, error messages, and release artifacts, so that it remains an in-memory session secret.
75. As a user, I want the renderer's engine client to attach the token automatically, so that normal Satella behavior does not change.
76. As a developer, I want development startup and process tests to receive an explicit session token, so that production authentication is not bypassed in ordinary local workflows.
77. As a packaged-app user, I want the health endpoint to remain usable for managed startup checks without granting Vault access, so that readiness checks do not need a privileged finance request.
78. As a user, I want Satella to prevent its main window from navigating to an external page, so that remote content cannot inherit the renderer bridge.
79. As a user, I want Satella to deny popup windows inside the application, so that untrusted content cannot create another privileged renderer.
80. As a user following an approved external link, I want it opened by my operating system browser, so that web content remains outside Satella's trusted window.
81. As a user, I want Screen lock, Vault unlock, background Refresh, and normal finance behavior to keep working with engine authentication, so that hardening does not alter product semantics.
82. As the sole alpha user, I want release smoke tests isolated from my real Vault, so that packaging validation cannot inspect or modify personal data.
83. As the sole alpha user, I want the first release to remain macOS Apple Silicon only, so that alpha work stays focused on the machine I use.

## Implementation Decisions

- The product identity is `Satella`; the technical slug is `satella`; workspace packages use `@satella-app/*`, matching the reserved npm scope; the permanent macOS bundle identifier is `app.satella` (reverse-DNS of the owned `satella.app` domain); the product's web domain for downloads is `satella.app`.
- Rename all repository-owned product and technical identifiers, including application metadata, artifacts, package names, imports, environment variables, IPC names, runtime globals, local-storage keys, development directories, database filenames, reset confirmation, cryptographic context labels, user agents, source symbols that contain the product name, visible copy, tests, and documentation.
- The current GitHub repository name, repository location, working-copy directory, and Git history remain unchanged. No compatibility aliases retain the temporary identity inside the current source tree.
- Satella uses a new platform-native application identity and therefore a new production `userData` location. Development storage is `.satella`; production Vault data remains in the `data/` subtree owned by the desktop.
- Satella never probes the former application-data or development-data locations. Existing temporary Vaults are disposable and have no import path other than a future explicitly produced `.satella-vault`, which does not exist before this work.
- The current squashed initial migration remains editable until `v0.1.0` ships. Publication of `v0.1.0` freezes that migration and establishes the permanent migration ledger. Every later schema change appends a timestamped migration and preserves released Vault data.
- Export Vault is an authenticated Vault operation initiated from Settings. It requires the current Vault password even though the Vault is already open.
- The desktop owns native save and open dialogs. The engine owns database consistency, encryption validation, migration validation, and Vault lifecycle. Neither side receives broader filesystem authority than its part of the operation needs.
- A `.satella-vault` is a versioned single-file container. It includes a fresh consistent SQLCipher backup of the live database, the active key envelope, and only the minimal format metadata required for validation. The database remains encrypted with the Vault data-encryption key, and the envelope remains protected by the current Vault password.
- Vault export includes portfolio data, custodians, connector credentials, Reporting currency, history, Vault security rows, the Screen-lock PIN hash, and Screen-lock timeout. It excludes WAL and shared-memory files, journals, engine ownership state, caches, logs, Electron preferences, and retained pre-migration backups.
- Export writes to a temporary sibling and publishes the final `.satella-vault` only after the consistent encrypted database, envelope, container structure, and file permissions pass validation. Existing destination files remain intact until replacement succeeds.
- Restore Vault is available from Welcome when no Vault exists and from Vault unlock when one does. It is unreachable while a Vault session is unlocked, and it is not offered as an ordinary Settings mutation.
- Restore requires the exported Vault password. When a local Vault exists, the user confirms that a successful restore will replace it.
- Restore expands into an isolated staging location, validates the container version and paths, unwraps the staged envelope, opens the staged SQLCipher database, verifies cipher activation and database integrity, checks migration history, and applies pending migrations to the staged database. It rejects a database created by a newer schema.
- Wrong passwords and damaged encrypted data retain the existing generic unlock boundary. Format and compatibility errors may tell the user that the file is unsupported without disclosing encrypted contents.
- Restore commits only after every validation and migration step succeeds. The filesystem transition preserves either the complete old Vault or the complete restored Vault across failure and process interruption. A failed restore leaves the current Vault byte-for-byte usable.
- A successful restore clears Vault-derived renderer and HTTP caches, releases stale ownership state, and returns to the closed Vault-unlock state. It never auto-unlocks financial screens.
- Normal application updates remain manual. The user quits Satella, replaces `Satella.app`, and opens the existing Vault. Export and restore are recovery tools, not required update steps.
- Every push to `main` runs the established CI gates. A macOS Apple Silicon packaging job runs only after all required gates pass and uploads one nightly ZIP as a GitHub Actions artifact with 14-day retention.
- Nightlies use a unique SemVer-compatible version of the form `<next-patch>-nightly.<UTC yyyymmdd>.<run number>`, for example `0.1.1-nightly.20260822.42`; before the first release the base is `0.1.0`, producing versions such as `0.1.0-nightly.20260815.7`. Nightlies create neither Git tags nor GitHub Releases.
- The manual release workflow is named `Ship Satella`, accepts no user inputs, and runs only for `main`. If no Satella release tag exists, it selects `0.1.0`; otherwise it increments the patch component of the latest non-nightly release and leaves major and minor unchanged.
- Ship Satella reruns check, test, build, packaging, structural validation, and the packaged-runtime smoke test against the exact selected commit. It creates the immutable tag and GitHub prerelease only after all gates pass.
- All `0.x` GitHub Releases are prereleases and communicate alpha status through the major version rather than an `-alpha` suffix. There is no minor or major bump workflow in this scope.
- Release calculation and publication are serialized. The workflow rechecks the selected version immediately before tagging and fails safely if another run already published it.
- The one unused temporary `v0.1.0` tag and associated GitHub Release are removed before the first Satella release. Their artifacts contain no supported user data and receive no compatibility treatment.
- Packaging remains ad-hoc signed macOS Apple Silicon ZIP distribution. Artifact, application, executable, metadata, resources, and validation messages use the Satella identity.
- The desktop generates a cryptographically random high-entropy engine token for each managed-engine launch. The token is never persisted and a restart invalidates the prior value.
- The desktop supplies the token to its managed engine and trusted renderer runtime. The renderer's typed engine adapter adds it to every privileged request. Logs and errors redact the token.
- The engine requires the current token for every Vault and finance endpoint before it inspects Vault state or request payloads. Missing and invalid tokens receive the same unauthorized response. The public health endpoint exposes readiness only.
- Token comparison avoids ordinary string equality timing behavior. Authentication middleware remains outside finance and Vault services so domain operations do not acquire transport concerns.
- Development startup generates and distributes a session token through the same contract. Tests may inject an explicit deterministic token but cannot disable authentication globally.
- The packaged BrowserWindow allows only the packaged Satella document. Development allows only the configured Satella development origin. All other top-level navigation is denied.
- New-window and popup creation is denied. Explicit permitted `http` and `https` links may open through the operating system browser after URL validation, never inside a privileged Satella renderer.
- The existing isolated context bridge, renderer sandbox, disabled Node integration, single-instance behavior, dynamic loopback port, engine ownership, Screen lock, and shutdown behavior remain in place.
- Update the domain glossary and the packaged-runtime ADR as part of the rename and recovery vocabulary. Update release and developer instructions so the first-release migration promise and new workflows are unambiguous.

## Testing Decisions

- Tests assert behavior at the highest practical boundary. They inspect exported data only to prove encryption and completeness, not to couple tests to archive implementation, SQL statements, middleware composition, query keys, or workflow step names.
- Four seams cover the work because release calculation, real encrypted Vault behavior, accessible renderer behavior, and packaged Electron behavior have different observable boundaries. No additional service-level seam is introduced merely to make implementation easier to test.
- The release-command seam resolves nightly and release versions from representative tag sets, rejects malformed or racing publication state, creates deterministic Satella artifact names, and exercises non-publishing validation through the same commands used by GitHub Actions. The existing release packaging command is prior art.
- Workflow acceptance proves that a successful `main` push produces one 14-day nightly artifact after all CI gates, while a failed gate produces none. It also proves that Ship Satella has no inputs, operates on `main`, increments patch versions, marks `0.x` releases as prereleases, serializes publication, and never creates a tag before package validation succeeds.
- The spawned-engine HTTP seam uses a real temporary SQLCipher Vault. It proves that unauthorized Vault and finance requests fail before revealing state, the correct launch token enables them, a stale token fails after restart, and the token never appears in captured diagnostics. The existing Vault process suite is prior art.
- The same real-engine seam writes distinctive portfolio and connector-credential markers, exports a `.satella-vault`, and proves that no plaintext marker appears in the exported bytes. It restores with the correct password and verifies portfolio data, credentials, settings, history, PIN behavior, and timeout through public APIs.
- Restore process tests cover a wrong password, malformed container, path traversal entries, truncated database, incorrect envelope, failed integrity check, older valid schema requiring migration, and newer unsupported schema. Every failed case verifies that an existing populated Vault still opens with its original password and data.
- Crash and filesystem-failure tests interrupt export before publication and restore before commit. They prove that no partial export is mistaken for success and that restart yields either the complete original Vault or the complete restored Vault.
- Route-level screen tests cover the accessible Export Vault action in Settings, current-password validation, cancellation, success and failure feedback, Restore Vault on Welcome and Unlock, replacement confirmation, failed validation, and the return to Vault unlock after success. Existing onboarding and Settings Security screen suites are prior art.
- Desktop helper tests cover engine-token generation and propagation contracts, allowed development and packaged navigation targets, denied navigation, denied popups, and validated external-link handling. Existing desktop main-process helper tests are prior art.
- The packaged-runtime seam extracts and launches the assembled `Satella.app` with isolated user data. It proves the Satella bundle identity and resources, SQLCipher loading, authenticated engine startup, rejection of a direct unauthenticated privileged request, native Vault creation, export and restore round-trip, single-instance behavior, canonical storage, and clean engine shutdown. The existing release smoke test is prior art.
- Packaged upgrade coverage begins with the second Satella release. The test creates a populated Vault using the previous released application, replaces only the application with the candidate, unlocks the same Vault, and verifies representative finance data, connector configuration, settings, and migration history. The test never substitutes a newly seeded current-schema database for the previous release.
- A rename guard scans repository-owned files and packaged resources for temporary product identifiers while explicitly excluding Git history, the current repository name, and external URLs that cannot change. Structural packaging validation separately proves `Satella.app`, `app.satella`, Satella artifact names, `@satella-app` connector resources, and absence of repository-relative runtime paths.
- The full existing test suite must pass after workspace package renaming. Type checking and production builds prove that no stale package import or deployment dependency remains unresolved.
- A release is complete only when `pnpm check`, the full test suite, the production build, structural package validation, the real packaged-app smoke test, and the applicable upgrade test all pass.

## Out of Scope

- Renaming, moving, deleting, or recreating the current GitHub repository.
- The later public and open-source repository, including resetting that repository's release history to `v0.1.0`.
- Importing or migrating data, preferences, caches, or development state from the temporary application identity.
- A general portfolio export in CSV, JSON, spreadsheet, or human-readable form. Vault export exists only for encrypted Satella recovery.
- Selective Vault export, excluding connector credentials, changing the export password, or choosing individual accounts and assets.
- Cloud backup, scheduled backup, backup rotation, remote storage integrations, or automatic upload of `.satella-vault` files.
- Restore from internal pre-migration backups through the user interface.
- Automatic price refresh, scheduled Refresh, and daily Portfolio snapshot capture. The planned pricing upgrade owns that work.
- Automatic application updates, update manifests, release channels inside the application, or background downloading of nightlies.
- Permanent nightly tags or GitHub Releases.
- A minor-version, major-version, beta, release-candidate, or stable-release workflow. Ship Satella increments patch only.
- Windows, Linux, macOS x64, universal binaries, DMGs, installers, package managers, or app stores.
- Apple Developer signing, hardened-runtime configuration, notarization, or a public-distribution Gatekeeper experience.
- New finance features, additional Connectors, a Transaction ledger, or changes to current hard-deletion and historical-snapshot behavior.
- A broad security audit, protection from privileged local malware, operating-system credential storage, telemetry, crash reporting, or remote diagnostics.
- Changing Vault encryption algorithms, password derivation, Screen-lock semantics, or the distinction between Lock and closing the Vault.

## Further Notes

- The npm scope `@satella-app` is reserved, but this release publishes no npm packages. Workspace packages adopt the scope now so a future publish needs no rename.
- Distribution stays entirely on GitHub for this release; `satella.app` is recorded as the product's permanent domain and becomes the public download home only in a later phase.
- The current source tree may still change or squash its initial schema until the first Satella release is published. The compatibility promise begins at that exact release, not at an earlier temporary tag.
- Replacing `/Applications/Satella.app` does not replace `~/Library/Application Support/Satella/data`. That separation is the normal update mechanism; Vault export exists for recovery from a bad release, damaged local state, machine replacement, or user error.
- A `.satella-vault` is encrypted recovery data, not a sanitized report. Anyone who learns its Vault password can recover its financial data and connector credentials.
- Preserving Screen-lock settings avoids a second data transformation during export. The Vault password, not the four-digit PIN, protects the exported database.
- GitHub Actions artifacts are the nightly distribution mechanism because automatic updates are absent. If automatic update channels are added later, nightly publication may move to versioned GitHub prereleases with update manifests.
- The existing repository tag named `v0.1.0` is explicitly disposable. Removing it is a one-time cleanup authorized by this plan, not a pattern for changing Satella release history after the first release.
- The first public repository may start its own version history at `v0.1.0`; that later choice does not weaken private-alpha Vault compatibility or authorize rewriting released migrations.
