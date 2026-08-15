# Onboarding and local vault security

Status: ready-for-agent

## Problem Statement

Optimus currently opens directly onto an empty dashboard and has no first-run setup, vault password, lock state, or recovery boundary. Its SQLite database and pre-migration backups are readable plaintext files. Connection credentials, including API keys and tokens, are serialized as plaintext inside that database. Possession of the data files therefore reveals a person's financial records and external-service credentials.

The application also lacks a precise distinction between closing encrypted data and temporarily hiding the interface. A person should be able to protect the interface quickly while allowing background Connection refreshes, but that convenience state must not be misrepresented as cryptographic protection. Conversely, quitting Optimus must close the database and require the vault password on the next launch.

Optimus is pre-production. There are no released installations, compatibility obligations, or user databases to migrate. The implementation should target the clean final design rather than preserve plaintext schemas, files, routes, or runtime behavior.

## Solution

Introduce a simple first-run experience that creates one local Vault for one person:

1. Welcome to Optimus.
2. Create and confirm a Vault password.
3. Create and confirm a four-digit Screen-lock PIN.
4. Optionally add the first Asset through the existing Add assets flow, or go directly to the dashboard.

Encrypt the complete local database and its internal pre-migration backups with a random 256-bit database encryption key. Protect that key with a password-derived key produced by Argon2id. The Vault password is required at every full application start and is never persisted. Forgetting it is irrecoverable: the only available action is a destructive Vault reset.

Provide two deliberately different security states:

- **Lock** activates the Screen lock. The interface requires the four-digit PIN, while the Vault remains open and background Refresh work may continue.
- **Quit Optimus** terminates the desktop application and engine, closes the encrypted database, and requires the Vault password at the next launch.

Add Settings → Security for changing the Vault password and Screen-lock PIN, configuring the Screen-lock timeout, locking immediately, and resetting Optimus.

Before selecting the encrypted storage engine, run a focused macOS arm64 proof-of-viability spike against the latest pinned `@tursodatabase/database` release. Adopt modern Turso Database only if it passes the complete confidentiality, compatibility, backup, restore, runtime, and performance gates in this specification. If it fails, use the free BSD-licensed SQLCipher Community Edition through pinned `@journeyapps/sqlcipher`, retaining the same key-envelope and Vault interfaces.

## User Stories

1. As a new user, I want a short welcome experience, so that I understand what Optimus is before entering financial data.
2. As a new user, I want onboarding to contain only essential security setup, so that I can reach my portfolio quickly.
3. As a new user, I want to create a Vault password, so that my local financial data is encrypted.
4. As a new user, I want to confirm my Vault password, so that a typing mistake cannot make my new Vault inaccessible.
5. As a new user, I want show and hide controls on password fields, so that I can verify what I entered.
6. As a password-manager user, I want to paste a long password, so that Optimus does not encourage weak memorable secrets.
7. As a new user, I want clear password-strength guidance, so that I understand the consequences of a weak password against offline guessing.
8. As a new user, I want to be warned that Optimus cannot recover my Vault password, so that irrecoverable data loss is not surprising.
9. As a new user, I want to create a four-digit Screen-lock PIN, so that I can quickly hide Optimus without stopping background work.
10. As a new user, I want to confirm my Screen-lock PIN, so that a typing mistake does not immediately block the interface.
11. As a new user, I want to add my first Asset after security setup, so that I can begin using Optimus immediately.
12. As a new user, I want the first-Asset step to use the normal Add assets flow, so that onboarding and later data entry behave consistently.
13. As a new user, I want to skip adding an Asset and go to the dashboard, so that security setup does not force portfolio entry.
14. As a returning user, I want to enter my Vault password whenever Optimus starts, so that a copied database remains unreadable.
15. As a returning user, I want an incorrect password to reveal no distinction between a wrong password and damaged encrypted data, so that unlock errors leak minimal information.
16. As a returning user, I want successful unlock to take approximately one second on supported hardware, so that strong password derivation remains usable.
17. As a user, I want my portfolio, Connections, credentials, schema, indexes, and database sidecars encrypted, so that the database is not meaningfully readable without my Vault password.
18. As a user, I want internal pre-migration backups encrypted from creation, so that backups cannot bypass Vault protection.
19. As a user, I want local encrypted backups to remain usable after changing my Vault password, so that password maintenance does not invalidate them.
20. As a user, I want Connection API keys and tokens stored inside the encrypted database, so that they are protected while the Vault is closed.
21. As a user, I want Optimus to recommend least-privilege, read-only Connection credentials, so that a leaked key has limited provider-side power.
22. As a user, I want **Lock** to hide every financial screen, so that someone looking at my unlocked computer cannot browse Optimus.
23. As a user, I want Lock to preserve background Connection refreshes, so that privacy-screen convenience does not make my portfolio stale.
24. As a user, I want the Lock screen to state that background Refresh may continue, so that I do not mistake it for an encrypted Vault closure.
25. As a user, I want the Lock screen after 15 minutes of interface inactivity by default, so that unattended financial information is hidden.
26. As a user, I want to choose a 5, 15, 30, or 60 minute Screen-lock timeout, so that I can balance convenience and privacy.
27. As a user, I want Optimus to Lock when my operating-system session locks, so that the interface is hidden when I return.
28. As a user, I want Optimus to Lock after system sleep, so that waking the computer does not reveal my portfolio.
29. As a user, I want a manual Lock action, so that I can hide the interface immediately.
30. As a user, I want my PIN checked without closing the Vault, so that unlocking the Screen lock remains quick.
31. As a user, I want “Use Vault password instead” always available on the Lock screen, so that a forgotten PIN does not block me.
32. As a user, I want three incorrect PIN attempts to require the Vault password, so that a four-digit code cannot be guessed indefinitely through the interface.
33. As a user, I want a successful Vault-password fallback to dismiss the Lock screen and reset failed PIN attempts, so that I can resume without reopening the already-open database.
34. As a user, I want failed PIN attempts never to erase my Vault, so that accidental input cannot cause data loss.
35. As a user, I want to quit Optimus normally without an extra confirmation, so that it behaves like a desktop application.
36. As a user, I want Quit Optimus to terminate the engine and close the database, so that no Vault key remains intentionally active after exit.
37. As a user, I want the next launch after quitting to require my Vault password, so that the Screen-lock PIN cannot decrypt the database.
38. As a user, I want an abnormal desktop exit to terminate or promptly close its managed engine, so that an orphaned process does not retain an unlocked Vault.
39. As a user, I want Settings → Security to contain all Vault and Screen-lock controls, so that security behavior is understandable in one place.
40. As a user, I want to change my Vault password, so that I can replace a weak or suspected password.
41. As a user, I want my current Vault password required before changing it, so that an unattended unlocked interface cannot replace it.
42. As a user, I want a password change to complete without re-encrypting all portfolio pages, so that it is fast and less exposed to interruption.
43. As a user, I want to change my Screen-lock PIN, so that I can replace a disclosed convenience code.
44. As a user, I want my Vault password required before changing my PIN, so that the PIN cannot be silently replaced from an unattended session.
45. As a user, I want to Lock immediately from Settings → Security, so that the setting can be tested without waiting.
46. As a user, I want Reset Optimus isolated in a danger section, so that it is not confused with ordinary security settings.
47. As a user who forgot the Vault password, I want a Reset Optimus path from the password screen, so that I can make the application usable again.
48. As a user, I want Reset Optimus available from Settings → Security, so that I can deliberately remove all local Optimus data.
49. As a user, I want a typed destructive confirmation before Vault reset, so that accidental activation does not erase my financial data.
50. As a user, I want Vault reset to delete portfolio data, Connection credentials, encrypted backups, caches, and all Vault metadata, so that the old Vault cannot later reappear.
51. As a user, I want Vault reset to return to first-run onboarding, so that I can create a new Vault.
52. As a user, I want Optimus to state that financial data stays local except for direct communication with configured Connectors and market-data sources, so that its privacy boundary is clear.
53. As a user, I want no product analytics or automatic crash-report uploads, so that sensitive context is not silently transmitted.
54. As a user, I want passwords, keys, PINs, credentials, and decrypted financial values excluded from logs, so that diagnostics do not undermine encryption.
55. As a user, I want Optimus to avoid claiming protection from malware or administrators while the Vault is open, so that its security promise remains honest.
56. As a user, I want Screen lock described as interface privacy rather than Vault encryption, so that I understand its limitation.
57. As a macOS user on Apple Silicon, I want the encrypted database runtime packaged and signed with Optimus, so that installation needs no external database tools.
58. As a future Linux or Windows user, I want encryption-specific implementation hidden behind one storage interface, so that future platform support does not rewrite portfolio logic.
59. As a future self-hoster, I want the same engine executable to remain independently runnable, so that desktop storage work does not collapse the engine into Electron.
60. As an open-source or commercial distributor, I want every encryption dependency to permit free commercial use, so that Optimus has no mandatory proprietary runtime license.

## Implementation Decisions

- Follow the project glossary exactly. Use Vault, Vault password, Locked Vault, Screen lock, Screen-lock PIN, and Vault reset with their documented meanings. The normal interface action is **Lock**; the process-ending action is **Quit Optimus**. Do not use Login, Logout, account password, password reset, or Vault lock as synonyms.
- Model application security as four explicit states:
  1. no Vault → onboarding;
  2. Locked Vault → Vault-password screen;
  3. open Vault with Screen lock active → PIN screen while eligible background work continues;
  4. open Vault without Screen lock → normal application.
- Keep the engine authoritative for Vault state, Screen-lock state, failed PIN attempts, database availability, and background work. The renderer presents state and sends commands; it does not infer security state from routes or cache alone.
- Build a deep Vault module whose interface covers status, initialization, unlock, close, password change, password verification, and reset. It owns the storage adapter, key envelope, database lifecycle, migration ordering, sensitive-memory handling, and typed failure modes.
- Keep all portfolio, Connection, Settings, and market-data modules on the generic Effect SQL interface. Place the encrypted database implementation behind one Optimus-owned adapter at the existing database-client seam. Storage-engine keying, pragmas, transactions, statement conversion, and close behavior must not leak into finance callers.
- Retain the engine as a process separate from Electron. For desktop use, the desktop application manages that engine process and closes it when Optimus quits. The same engine executable must remain suitable for a future standalone self-hosted mode.
- Start enough of the engine control surface before opening the database to report Vault status, initialize a new Vault, unlock a Locked Vault, and reset an irrecoverable Vault. Migrations, snapshots, portfolio reads, Connector work, and finance endpoints require an open Vault.
- A Screen lock blocks renderer access to financial screens and ordinary finance requests while allowing engine-internal scheduled Refresh work to continue. A Locked Vault closes the database and rejects both foreground finance work and background Refresh.
- Full application start always begins with a Locked Vault when Vault metadata exists. Do not add remembered unlock, OS keychain wrapping, biometric unlock, or automatic password entry.
- Full application exit closes statements and connections, stops new work, finishes or rolls back active transactions under a bounded policy, clears sensitive caches and owned key buffers where possible, and terminates the managed engine.
- Lock after 15 minutes of UI inactivity by default. Supported settings are 5, 15, 30, and 60 minutes; there is no “Never” option. Manual Lock, operating-system session lock, and wake from sleep always activate the Screen lock regardless of the timeout.
- Closing the desktop window quits Optimus for now. Background tray behavior is not implemented. When tray support is added later, minimizing or closing to tray may retain the open Vault behind the Screen lock.
- Require a four-digit Screen-lock PIN. Store only what is needed to verify it inside the encrypted Vault and keep verification within the engine. Reset the in-memory attempt counter after a correct PIN or Vault password.
- “Use Vault password instead” is always visible on the PIN screen. After three incorrect PIN attempts, disable PIN entry for that Lock cycle and require the Vault password. A correct Vault password verifies against the existing key envelope; it does not close and reopen the already-open database.
- The Vault password has a minimum length of 12 characters. Permit long passwords, Unicode, paste, password managers, and show/hide controls. Do not impose uppercase, number, symbol, or other composition rules. Show strength guidance and the irrecoverable-loss warning.
- Use Argon2id version 1.3 to derive a 256-bit key-encryption key from the Vault password and a unique random 16-byte salt. Begin validation at 64 MiB, three passes, and parallelism four, then benchmark the packaged application and tune upward or downward to approximately one second on the slowest supported Apple Silicon Mac without swapping.
- Generate an independent random 256-bit database encryption key. Wrap it with an authenticated-encryption key derived by Argon2id. The versioned non-secret envelope records algorithm versions, KDF parameters, salt, AEAD metadata, wrapped key, a Vault identifier, and authenticated context.
- Do not persist the Vault password or derived password key. Do not add a separate fast password verifier; authenticated database-key unwrap is the password check and ensures every offline guess pays the Argon2id cost.
- Password change verifies the current Vault password, derives a new wrapping key with a fresh salt and current parameters, and crash-safely replaces the envelope around the unchanged database key. It does not re-encrypt database pages.
- Use cryptographically secure random generation for database keys, salts, nonces, identifiers, and future engine-session secrets.
- Prefer standard maintained AEAD for the key envelope. Use AES-256-GCM through the supported Node runtime unless the selected OSS dependency already provides a better-maintained XChaCha20-Poly1305 interface. Never reuse a key/nonce pair.
- Keep the unwrapped database key inside the engine process. Never send it to the renderer, persist it, include it in errors, or write it to logs. Minimize password and PIN lifetime in renderer memory and clear owned buffers after handoff where runtime APIs permit.
- Store Connection credentials inside the fully encrypted database. Do not add separate field-level encryption or keychain storage in this release. Continue excluding credentials from outbound Connection contracts and redact secret-shaped log fields.
- Recommend provider-side least privilege in Connection setup copy: read-only keys with no trading or withdrawal capability whenever the Connector permits it.
- Preserve the current internal pre-migration-backup behavior and retention of up to five snapshots. Every backup must be encrypted from creation, use the Vault database key, remain unlockable through the current envelope after a password change, be published atomically, and pass an actual restore test. Never create an intermediate plaintext backup.
- Vault reset removes the encrypted database, WAL/journal/shared-memory files, key envelope, Screen-lock configuration, internal backups, caches, ownership metadata, and any future Vault-specific keychain entries. Reset then returns the application to onboarding.
- Because Optimus has no released installations, create a fresh encrypted database design and delete/reset plaintext development state. Do not build plaintext-to-encrypted user-data migration, compatibility aliases, or old-key recovery.
- Use Settings → Security, not Settings → Privacy, for changing the Vault password, changing the Screen-lock PIN, selecting the timeout, Lock now, and Reset Optimus. Isolate Reset Optimus visually in a danger section.
- The first-Asset onboarding step is an invitation rather than a second Asset-entry implementation. “Add your first asset” opens the existing Add assets flow; “Go to dashboard” completes onboarding without an Asset.
- State the privacy promise precisely: Vault data stays local except when Optimus directly contacts configured Connectors and market-data sources. Encryption protects copied files while the Vault is closed; it does not protect an open Vault from same-user malware, injected code, debuggers, administrators, swap, hibernation, or memory dumps.
- Add no analytics, telemetry, remote error reporting, or automatic crash upload. Disable or tightly control heap/core dump paths that could serialize secrets.
- Target macOS arm64 for the first packaged release. Keep storage and platform lifecycle behind adapters suitable for later Linux and Windows implementations, but do not build or test those packages in this feature.
- Use only free open-source dependencies that permit both open-source and closed-source commercial distribution. Include all required user-accessible license and copyright notices.
- Run a throwaway Turso proof-of-viability spike before choosing the production adapter. Pin the exact latest tested `@tursodatabase/database` version and require all of these gates:
  - Node and packaged Electron load its native macOS arm64 module successfully.
  - A raw random 256-bit key creates an authenticated encrypted database; correct-key access succeeds and wrong or missing keys fail closed without panic or plaintext fallback.
  - The main database, WAL, journals, temporary files, backups, and observed crash remnants contain no distinctive plaintext fixture markers.
  - `temp_store=MEMORY` is applied before application queries; representative `ORDER BY`, `DISTINCT`, `GROUP BY`, join, migration, index, and intentionally memory-intensive workloads create no plaintext temporary files.
  - Every current query and migration behavior is supported, including transactions, savepoints where used, foreign-key enforcement, an equivalent to current foreign-key validation, migration bookkeeping, and required result conversions.
  - A closed encrypted database can be copied into an encrypted pre-migration backup, restored, integrity-checked, and reopened with no plaintext intermediate.
  - Current backup retention can be implemented safely despite the SDK's absent online-backup interface.
  - Process termination, reopen, wrong keys, corruption, disk-full boundaries, and interrupted backup/envelope writes fail safely.
  - Representative finance operations meet current performance needs, and the adapter can satisfy Effect SQL semantics without exposing storage details to callers.
- If every Turso gate passes, adopt Turso Database with its AES-256-GCM mode and the Optimus key envelope. Force memory-only temporary storage before all other application SQL and fail startup if required security configuration cannot be verified.
- If any confidentiality, restore, correctness, crash-safety, or runtime gate fails, reject Turso for this release. Use pinned `@journeyapps/sqlcipher` Community Edition behind the same Optimus adapter and Vault module. Configure raw 256-bit keying before any database access, authenticated pages, encrypted WAL/journals, and memory temp storage; fail startup unless `cipher_version` proves SQLCipher is active.
- The Turso spike is a decision artifact, not production architecture. Record its commands, exact versions, observed files, pass/fail evidence, and final engine selection in the feature issue. Remove throwaway spike code from the main branch after the decision.
- After the spike resolves the genuine storage-engine trade-off, record the selected encrypted-storage engine and key hierarchy in an ADR. The decision is hard to reverse, surprising without context, and based on material security, maturity, packaging, and lifecycle trade-offs.
- Local engine authentication remains an explicit production blocker, alongside the unresolved production database location. Keep localhost binding and CORS as defense-in-depth, but do not describe them as authentication. Capture a random-port, per-launch authenticated desktop-to-engine channel as a separate ready-for-agent issue before release rather than expanding this feature.

## Testing Decisions

- Tests assert externally visible security behavior, persisted encrypted artifacts, and public contracts. They do not assert private helper calls, internal reducer shape, exact SQL text, cryptographic implementation internals, CSS classes, or component structure.
- The primary engine seam is a process-level integration suite that launches the real engine against an isolated data directory and exercises the public Vault and finance control surface. It covers initialization, startup lock, unlock, wrong-password behavior, finance availability by state, background Refresh behavior, password change, quit/reopen, and Vault reset.
- The same process-level suite inspects every generated file after representative operations. It writes unique sensitive marker values into portfolio data and Connection credentials, then proves those markers are absent from the database, WAL, journals, temporary locations, internal backups, and crash remnants while correct-key restore still reproduces the values.
- Treat the storage adapter as an internal seam tested through the Vault and engine lifecycle wherever possible. Add direct adapter conformance tests only for generic Effect SQL behavior that cannot be driven reliably through product operations: parameter binding, row conversion, transactions, rollback, savepoints if required, migration execution, close behavior, and typed failures.
- The Turso spike is a release-gate test rather than an implementation assumption. Run it using the exact Node, Electron, macOS arm64, and package versions used by Optimus. Mark unknown behavior as failure until proven.
- Cryptographic primitive tests use published Argon2id vectors and authenticated-encryption known-answer tests. They prove compatibility and parameter encoding rather than testing third-party cipher mathematics.
- Key-envelope tests cover new creation, correct and incorrect passwords, malformed and excessively large parameter fields, version rejection, authenticated-context tampering, password rewrap, old-password rejection after change, and crash-safe replacement at every write/flush/rename boundary.
- Backup tests create a populated Vault, trigger a pre-migration snapshot, restore it into an isolated location, and verify encrypted-at-rest markers, correct-key recovery, wrong-key rejection, integrity validation, retention pruning, and continued access after Vault-password change.
- Fault-injection tests cover interruption during Vault creation, envelope replacement, migration, backup publication, restore, password change, and reset. Every interruption leaves either the old complete state or the new complete state, never an ambiguous partially unlockable Vault.
- Screen-lock engine tests prove that eligible background Refresh continues while renderer finance access is blocked, three PIN failures force Vault-password fallback, password fallback does not reopen the database, successful authentication resets attempts, and full Vault closure stops Refresh.
- Desktop lifecycle tests launch the managed engine, Quit Optimus, and simulate abnormal desktop termination. They prove the database closes, the engine exits or closes promptly, and the next start requires the Vault password.
- Desktop system-event tests exercise session lock and wake-from-sleep signals through the desktop lifecycle seam and assert that the next visible state is the Screen lock.
- Use the existing route-level in-memory router and query-client harness as the primary web seam. Mock the engine control surface and assert onboarding, Vault-password, PIN, dashboard, and Settings → Security behavior through accessible roles, names, validation messages, and user interactions.
- Onboarding route tests cover fresh Vault detection, welcome progression, password confirmation, minimum length, paste, show/hide, irrecoverable warning, PIN confirmation, Add your first asset, existing Add assets integration, and Go to dashboard.
- Returning-start route tests cover Vault-password entry, generic unlock failure, successful navigation, disabled finance UI while closed, and Forgotten Vault password → Reset Optimus.
- Screen-lock route tests cover automatic/manual Lock presentation, background-Refresh disclosure, PIN entry, three-failure transition, always-available Vault-password fallback, successful unlock, and prevention of financial-content disclosure beneath the lock surface.
- Settings → Security route tests cover the agreed five controls, current-password reauthentication for password and PIN changes, timeout options and default, Lock now, password/PIN success and failure feedback, and isolated destructive reset.
- Reset tests prove the typed confirmation requirement and absence of all Vault files, backups, sidecars, caches, credentials, and metadata after success.
- Logging tests capture engine and desktop logs around initialization, unlock failures, Connection creation/refresh, password change, backup, lock, quit, and reset, then assert that passwords, PINs, keys, credentials, and distinctive decrypted markers never appear.
- Privacy tests deny network access except to explicit fake Connector and market-data endpoints. They prove normal local operations make no external requests and that there are no telemetry or crash-upload requests.
- Performance tests measure packaged Apple Silicon behavior rather than development-only Node execution. Argon2id unlock targets approximately one second; representative dashboard queries, Refresh reconciliation, migration, backup, and restore must remain suitable for interactive desktop use.
- Existing full-migration, temporary-database, database ownership, finance service, engine HTTP, route-level dashboard, Settings, and Add assets tests are prior art. Adapt them to start from explicit Vault state instead of bypassing encryption.
- Perform manual packaged-app verification on macOS arm64 for first-run flow, unlock latency, session lock, sleep/wake, Lock, Quit Optimus, relaunch, password/PIN changes, reset, native-module loading, code signing, and license-notice visibility.

## Out of Scope

- Recovery keys, remote escrow, online accounts, password recovery, or any way to recover a forgotten Vault password.
- Remembered unlock, biometric unlock, macOS Keychain storage, Electron `safeStorage`, or device-bound database keys.
- Tray or menu-bar background operation. Closing the window quits Optimus in this release.
- Linux, Windows, or Intel macOS packaging and support. The architecture must leave room for them, but the initial release target is macOS arm64.
- Self-hosted deployment, remote-engine administration, TLS, multi-user identity, and remote unlock. The engine remains independently runnable for future work.
- Implementing production local-engine authentication in this feature. It remains a documented release blocker and must be completed before production.
- Choosing or implementing the final production data-directory location. Existing production startup continues to fail clearly at that unresolved configuration point.
- Migrating released or external plaintext databases, preserving prior development data, downgrade compatibility, or maintaining multiple database formats. No released installations exist.
- User-facing backup scheduling, backup browsing, export, import, restore UI, cloud backup, or cross-device synchronization. Only encrypted internal pre-migration backups are retained.
- DEK rotation after compromise, encryption-algorithm migration, historical-backup revocation, or recovery from copied old envelopes. Password change only rewraps the current database key.
- Field-level encryption inside the encrypted database or separate keychain treatment for Connection credentials.
- Protection against malware, injected code, debuggers, administrators/root, memory inspection, swap, hibernation, screen capture, or a compromised engine while the Vault is open.
- Telemetry, analytics, or automatic crash reporting.
- Turso Cloud, embedded replication, or any networked Turso product. The spike concerns only the fully local embedded Turso Database SDK.
- Adding a second Asset-entry implementation for onboarding.
- Any change to Account, Asset, Asset category, Portfolio value, Reporting currency, Connection, Connector, Refresh, or market-data semantics.

## Further Notes

- Screen lock is intentionally a convenience privacy control. The Vault and database key remain open, and background Refresh may continue. Copy and tests must never present it as equivalent to closing the Vault.
- A four-digit PIN has only 10,000 possibilities. Its safety comes from engine-enforced attempt limits and Vault-password fallback, not from use as an encryption key.
- Connection credentials are reasonably protected inside a fully encrypted database while the Vault is closed. They remain available to the engine while open and must also rely on provider-side least privilege, revocation, and rotation.
- SQLCipher Community Edition and `@journeyapps/sqlcipher` are BSD-3-Clause and permit free open-source and closed-source commercial use with required notices. No paid SQLCipher edition is required.
- Turso Database's modern authenticated encryption is promising, but the spike must resolve its experimental encryption status, memory-only temp enforcement, absent online-backup interface, missing current foreign-key validation pragma, SQL compatibility, and exact Electron runtime behavior before adoption.
- The research basis and primary-source links are recorded in `docs/research/password-based-local-database-encryption.md`.
- This specification deliberately prioritizes a clean target design because Optimus is pre-production. Technical changes, schema resets, and discarded development data carry no user-migration cost.
