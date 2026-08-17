# Password-based local database encryption

Research date: 2026-08-15

## Recommendation

Use **SQLCipher full-database encryption with a random 256-bit database encryption key (DEK)**. Do not pass the user's password directly to SQLCipher. Derive a 256-bit key-encryption key (KEK) from the password with **Argon2id**, then wrap the random DEK with authenticated encryption. Store only a versioned envelope—KDF parameters, random salt, AEAD algorithm and nonce/header, and wrapped DEK—beside the encrypted database.

This envelope design follows OWASP's documented pattern of using a password-derived KEK to protect an independently random DEK. It allows a password change by rewrapping a small key rather than re-encrypting every database page ([OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html#encrypting-stored-keys)).

For Optimus, SQLCipher is not a configuration-only change. The installed `@effect/sql-sqlite-node` adapter opens `DatabaseSync` from Node's built-in `node:sqlite`. Node can load ordinary SQLite extensions, but SQLCipher explicitly cannot operate as a loadable plugin: it modifies SQLite itself, needs compile-time definitions, and calls SQLite internals ([Node.js SQLite API](https://nodejs.org/api/sqlite.html#databaseloadextensionpath-entrypoint), [SQLCipher design](https://www.zetetic.net/sqlcipher/design/)). Optimus therefore needs a SQLCipher-capable native binding or isolated SQLCipher-owning process behind an Optimus Effect adapter.

Use application-layer AEAD only as an interim fallback for connector credential JSON if the native packaging spike fails. It protects those values, but not the database schema, financial records, indexes, row counts, access patterns, free pages, or arbitrary future columns, and it limits SQL operations over encrypted fields.

## Repository findings

The current stack and behavior are:

- Node.js `26.7.0`, Electron `43.3.0`, Effect `4.0.0-rc.108`;
- `@effect/sql-sqlite-node`, backed by `node:sqlite` in the installed package;
- one serialized SQLite connection with WAL enabled;
- `PRAGMA synchronous = FULL`, foreign keys, and a five-second busy timeout;
- `optimus.sqlite` in a mode-`0700` directory, with database and migration backups set to mode `0600`;
- live pre-migration snapshots created through Node's SQLite Online Backup API;
- connector credentials serialized in `connections.config_json`, which code comments identify as a temporary unencrypted boundary.

No research-note convention existed. `docs/research/` is used because `.plans/` contains implementation plans and `docs/adr/` contains accepted decisions.

## Threat model

### Protects

When Optimus is locked and every database connection is closed, the design should protect:

- a copied, stolen, or casually inspected database;
- database page data in WAL and rollback journals;
- Optimus-created migration backups and exports;
- connector API keys stored in the encrypted database;
- offline media obtained without a valid password, recovery key, or enabled keychain wrapper.

OWASP recommends selecting the encryption layer from an explicit threat model and notes that full-disk, database, and application-layer encryption protect different boundaries ([OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html#architectural-design)).

### Does not protect

Do not claim protection against:

- malware, injected code, a debugger, or an administrator/root attacker while Optimus is unlocked;
- password or key capture from process memory, IPC, logs, telemetry, crash reports, heap snapshots, swap, or hibernation;
- weak passwords subjected to unlimited offline guesses;
- deletion, truncation, or replacement of the database;
- rollback to an older, cryptographically valid database/envelope pair without separate trusted monotonic state;
- plaintext already present in old databases, backups, filesystem snapshots, SSD remapped blocks, or exports.

Page authentication detects modification, not freshness. Full-disk encryption remains complementary for swap, hibernation, and files outside Optimus. Libsodium similarly describes memory locking as defense in depth and recommends encrypted swap or volume protection for serious at-rest threats ([libsodium secure memory](https://doc.libsodium.org/memory_management)).

## Key hierarchy and envelope

Use three separate values:

1. **Password**: user input, never persisted.
2. **KEK**: 256 bits derived from the password by Argon2id; retained only for unwrap/rewrap.
3. **DEK**: independently generated random 256-bit key, passed to SQLCipher's raw-key interface.

The non-secret envelope should contain:

- format and algorithm versions;
- Argon2 version, memory, passes, and parallelism;
- a random 16-byte KDF salt;
- AEAD algorithm and nonce or stream header;
- the authenticated ciphertext containing the 32-byte DEK;
- authenticated context binding the envelope to Optimus, a database identifier, and the format version.

Do not add a separate fast password verifier. Authenticated DEK unwrap is the password check and forces every guess through Argon2id. Return one generic unlock failure for a wrong password, damaged envelope, replaced database, or failed page authentication.

The envelope is required recovery metadata even though it is not secret. Every backup must include the envelope needed to unlock that database.

## Password KDF and parameters

Use **Argon2id version 1.3**. RFC 9106 recommends a unique 16-byte salt and gives:

- a first profile of 2 GiB, one pass, four lanes;
- a memory-constrained profile of 64 MiB, three passes, four lanes;
- a 256-bit output for both.

See [RFC 9106 sections 4 and 7.4](https://www.rfc-editor.org/rfc/rfc9106.html#section-4).

Start Optimus validation at `m=65536 KiB`, `t=3`, `p=4`, 16-byte salt, and 32-byte output. This is a starting profile, not an unmeasured constant. Benchmark packaged builds on the slowest supported target while Electron is under representative load. Choose the highest memory and pass count that avoids swapping and unacceptable UI or memory pressure. Limit derivations to one per database to prevent local memory exhaustion.

Persist all parameters in the envelope so old data remains unlockable and parameters can upgrade after a successful unlock. Do not silently lower them on slow hardware. OWASP's current `19 MiB, t=2, p=1` recommendation is a minimum floor, not the target for this desktop design ([OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id)).

Node 26 supports Argon2id and exposes its memory, passes, parallelism, version, and salt/nonce parameters ([Node.js Web Crypto `Argon2Params`](https://nodejs.org/api/webcrypto.html#class-argon2params)). Confirm support in the exact packaged Electron/engine runtime and verify RFC test vectors; do not infer production support only from the development Node installation.

Password policy should favor length and password-manager use. SQLCipher notes that security remains bounded by password entropy and warns that short PINs, patterns, and simple passwords offer less protection from brute force ([SQLCipher key material](https://www.zetetic.net/sqlcipher/database-key-material/)).

## Salts, nonces, and authenticated encryption

- Generate the KDF salt, DEK, and nonces with a cryptographically secure random generator.
- Use a fresh 16-byte salt for each newly created password envelope. Salt is public ([RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html#section-3.1)).
- Wrap the DEK with standard AEAD: preferably XChaCha20-Poly1305 through a maintained libsodium binding, or AES-256-GCM if that is the better maintained platform dependency.
- Never reuse a `(key, nonce)` pair. Libsodium's high-level `secretstream` generates nonce/header state, authenticates messages, and supports rekeying ([libsodium encrypted streams](https://doc.libsodium.org/secret-key_cryptography/secretstream), [libsodium quickstart](https://doc.libsodium.org/quickstart)).
- Authenticate every unencrypted envelope field that affects interpretation. OWASP recommends authenticated modes such as GCM or CCM ([OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html#algorithms)).

SQLCipher encrypts database pages with AES-256-CBC and authenticates each page's ciphertext and IV with HMAC-SHA512 using a distinct HMAC key. It encrypts page data in rollback journals and WAL files ([SQLCipher design](https://www.zetetic.net/sqlcipher/design/)). Do not disable page HMACs or expose a plaintext SQLite header.

## Unlock, verification, and locking

Unlock should:

1. strictly parse bounded envelope fields before allocating KDF memory;
2. derive the KEK once under a concurrency limit;
3. authenticate and unwrap the DEK;
4. zero the KEK;
5. open SQLCipher and set the raw DEK before any database operation;
6. read `sqlite_schema` or application metadata to force page authentication;
7. run migrations only after successful verification.

SQLCipher performs just-in-time key setup, so key material and options must be provided before the first read or write ([SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/#pragma-key)). For suspicious damage or restore, run both `PRAGMA cipher_integrity_check` and SQLite `PRAGMA integrity_check`; `cipher_integrity_check` independently verifies page HMACs ([SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/#pragma-cipher_integrity_check)).

Keys must stay in the engine/main-process trust boundary and never enter an Electron renderer. The current sandbox, context isolation, and disabled Node integration align with Electron guidance but do not make the renderer a key holder ([Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security#checklist-security-recommendations)).

Locking must:

- stop connector refreshes and reject new database operations;
- finish or roll back transactions under a bounded policy;
- close the database connection and prepared statements;
- clear decrypted credential and financial-data caches;
- overwrite owned password, KEK, and DEK buffers;
- transition the UI only after the lock barrier completes;
- run on explicit lock and configurable idle, sleep, and session-lock events.

JavaScript cannot guarantee erasure of immutable strings or runtime copies. Minimize copies and use owned byte buffers where APIs permit. Node documents that `Buffer.alloc()` is zero-filled and warns that unsafe buffers may contain prior sensitive data ([Node.js Buffer API](https://nodejs.org/api/buffer.html#static-method-bufferallocsize-fill-encoding)). Libsodium's `sodium_mlock()` can reduce swapping but may fail because of OS limits, while `sodium_munlock()` wipes before unlocking ([libsodium secure memory](https://doc.libsodium.org/memory_management)).

Avoid or tightly control heap/core/crash dumps while unlocked. Node's heap-snapshot API serializes V8 heap state to disk ([Node.js V8 API](https://nodejs.org/api/v8.html#v8writeheapsnapshotfilename-options)).

## Password change, rekey, and recovery

For a normal password change:

1. verify the old password and unwrap the DEK;
2. derive a new KEK with a fresh salt and current parameters;
3. wrap the unchanged DEK with a fresh nonce/header;
4. durably replace the complete envelope using a crash-safe temporary-file protocol;
5. verify the new password before discarding old in-memory state.

Fault-inject every write, flush, and rename boundary. A crash must leave either the old complete envelope or the new complete envelope.

Use SQLCipher `PRAGMA rekey` only when rotating the DEK after suspected compromise or an explicit cryptoperiod. SQLCipher re-encrypts the database under the new key ([SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/#pragma-rekey)); treat it as a separate, power-loss- and disk-full-tested maintenance operation.

Changing the live password does not revoke old copies: an attacker with an old database and old envelope can still try the old password. Rotating the live DEK also cannot revoke independently copied historical backups.

With password-only encryption, forgetting the password means permanent data loss. There is no safe local reset without another way to unwrap the DEK. If recovery is required, make it explicit and opt-in:

- generate a high-entropy recovery key and create a second authenticated DEK envelope; or
- use separately reviewed remote escrow/account recovery.

Any recovery wrapper changes the claim that the password is the only route to the data. It needs its own threat model, revocation, and backup tests.

## WAL, crash behavior, backups, and migration

Keep WAL and `synchronous=FULL` unless integration tests justify a change. SQLite documents that FULL syncs the WAL at each commit ([SQLite WAL](https://www.sqlite.org/wal.html#performance_considerations)); SQLCipher states that WAL page data is encrypted ([SQLCipher design](https://www.zetetic.net/sqlcipher/design/)).

Never copy, rename, restore, or delete the live database independently of a hot `-wal` or `-journal`. SQLite warns that these files are part of database state after a crash and separating them can prevent recovery or corrupt the database ([SQLite corruption guidance](https://www.sqlite.org/howtocorrupt.html#_deleting_a_hot_journal)).

SQLCipher builds require `SQLITE_TEMP_STORE=2` or `3` plus codec initialization and a cryptographic provider ([SQLCipher Community Edition build](https://www.zetetic.net/sqlcipher/sqlcipher-linux-community/)). Verify packaged binaries report a non-empty `PRAGMA cipher_version` and expected settings. Ordinary SQLite may accept unknown pragmas without encrypting, so silent fallback must fail closed.

The current backup path uses Node's `sqlite.backup()`. Do not assume it remains correct after replacing the SQLite runtime. Use and test:

- a newly keyed attached destination plus `sqlcipher_export()`; or
- SQLCipher's Online Backup API only when both source and destination are proven keyed encrypted databases.

SQLCipher documents `sqlcipher_export()` for copying schema and data between differently configured databases ([SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/#sqlcipher_export)). Its maintainers document Online Backup support for same-type encrypted-to-encrypted or plaintext-to-plaintext copies ([SQLCipher Online Backup guidance](https://discuss.zetetic.net/t/using-the-sqlite-online-backup-api/2631/4)).

Every backup must be encrypted from creation, include its matching envelope, preserve restrictive permissions, pass cipher and SQLite integrity checks, publish atomically, and pass an actual restore test. Never create an intermediate plaintext backup.

Migrate the existing plaintext database by:

1. ensuring no unexpected process has it open;
2. creating a fresh envelope and encrypted destination;
3. opening the plaintext source and using SQLCipher's attached keyed destination plus `sqlcipher_export()`;
4. verifying cipher status, schema, application invariants, page authentication, and SQLite integrity;
5. closing all handles before an atomic path switch;
6. handling old plaintext database, WAL, migration backups, snapshots, and external backups under an explicit policy.

SQLCipher documents this plaintext-to-encrypted export flow ([SQLCipher migration guide](https://www.zetetic.net/sqlcipher/encrypting-plaintext-databases/)). Test crashes before, during, and after export, verification, and final replacement. Secure deletion cannot be guaranteed on SSDs, copy-on-write filesystems, snapshots, or synchronized storage.

## API keys in the encrypted database

Connector API keys and tokens can reasonably live in the SQLCipher database and its encrypted backups **while the database is locked**. This is a substantial improvement over plaintext `config_json`.

They remain exposed to the engine while unlocked. Same-user malware, a compromised engine, logs, crash dumps, and overly broad IPC can still obtain them. Minimize retained credentials and use provider-side least privilege: read-only scopes, no withdrawal/trading permission unless required, revocation, and rotation.

Add field-level AEAD inside SQLCipher only if a separate credential lock/key boundary is required. Bind ciphertext to immutable connection and field identifiers as associated data. This extra compartment should not precede full-database encryption.

## OS keychain tradeoffs

Use an OS keychain only for an optional, explicit **“remember on this device”** wrapper:

- keep the password/recovery envelope as the portable authority;
- after password unlock, optionally store or wrap the DEK with the OS facility;
- fail closed when that facility is unavailable or insecure;
- delete the keychain item when remembered unlock is disabled.

Benefits are convenient unlock and OS account/device binding. Costs are platform-specific prompts and recovery, possible access by same-user malware, and loss of portability. Storing the only DEK in a device keychain makes portable backups unrecoverable.

Apple describes Keychain Services as encrypted storage for small secrets and cryptographic keys ([Apple Keychain Services](https://developer.apple.com/documentation/security/keychain-services)). Windows DPAPI normally binds decryption to the same user credentials and machine and adds a MAC; `CRYPTPROTECT_LOCAL_MACHINE` allows any user on that machine and should not be used here ([Microsoft `CryptProtectData`](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)).

Electron's `safeStorage` is a cross-platform facade, but Linux can fall back to `basic_text`, which Electron says uses a hardcoded plaintext password and leaves data unprotected. Detect that backend and refuse remembered unlock rather than downgrading ([Electron `safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)). Prefer its asynchronous API and handle rotation and temporary unavailability.

Linux Secret Service implementations may lock items at any time and may require asynchronous prompts, so clients must handle races and denial gracefully ([freedesktop Secret Service locking](https://specifications.freedesktop.org/secret-service/latest/unlocking.html), [prompts](https://specifications.freedesktop.org/secret-service/latest/prompts.html)).

## Integration and validation gates

Before accepting an ADR:

1. Select a maintained SQLCipher-capable native binding or minimal isolated process.
2. Package and sign it for every supported OS and architecture.
3. Assert `cipher_version` and fail if ordinary SQLite is loaded.
4. Prove raw keying occurs before every pragma, migration, schema read, or instrumentation query.
5. Exercise all current queries, transactions, migrations, and encrypted backups.
6. Inspect the database, WAL, journals, temporary files, backups, and crash remnants for recognizable fixture values.
7. Verify Argon2id against RFC vectors and benchmark packaged targets.
8. Fault-inject unlock, password change, migration, backup, restore, disk-full, corruption, and process-kill boundaries.
9. Restore every supported backup version with its bundled envelope.
10. Test explicit/idle/sleep locking and keychain unavailable/rotation states.

If the native packaging gate cannot pass reproducibly on every supported target, ship application-layer AEAD only as a clearly labeled narrower credential-storage control, not as full-database encryption.

## SQLCipher package evaluation — 2026-08-15

### Decision

Use **`@journeyapps/sqlcipher` 6.0.0**, pinned exactly, behind a small Optimus-owned Effect SQL adapter. It is the best acceptable free/open-source integration available for Optimus today:

- it bundles the actual upstream SQLCipher 4.14.0 amalgamation rather than an independent encryption format;
- SQLCipher 4.14.0 includes SQLite 3.51.3's fix for the critical WAL-reset corruption bug, for which SQLCipher explicitly tells WAL users to upgrade;
- the binding and SQLCipher are permissively BSD-licensed;
- its April 2026 release restored a complete source-build path, macOS arm64 CI, and macOS CommonCrypto linkage without a Homebrew runtime dependency;
- its asynchronous serialized API can be adapted to Effect without exposing SQLCipher concerns to application queries.

This is a **spike-gated recommendation**, not a claim that the exact Optimus runtime matrix is already supported upstream. JourneyApps tests Node 24, builds (but does not run tests on) macOS arm64, and tests Electron 41 only on Linux. It does not test Node 26.7 or Electron 43.3. SQLCipher itself is also now at 4.17.0, while JourneyApps bundles 4.14.0. Pinning, exact-target build tests, and an explicit SQLCipher upgrade watch are therefore required ([JourneyApps package](https://www.npmjs.com/package/@journeyapps/sqlcipher), [JourneyApps 6.0.0 release](https://github.com/journeyapps/node-sqlcipher/releases/tag/v6.0.0), [JourneyApps CI](https://github.com/journeyapps/node-sqlcipher/blob/master/.github/workflows/test.yml), [SQLCipher 4.14.0 release](https://github.com/sqlcipher/sqlcipher/releases/tag/v4.14.0), [SQLCipher 4.17.0 release](https://github.com/sqlcipher/sqlcipher/releases/tag/v4.17.0)).

Do not retain `@effect/sql-sqlite-node` for the encrypted production connection. Its constructor performs `PRAGMA busy_timeout` and enables WAL before Optimus could supply a key, while SQLCipher requires keying before the first operation. Its backup helper also targets ordinary `node:sqlite`, not a keyed SQLCipher destination. Keep the generic `SqlClient` interface used by repositories and migrations, but replace the native connection implementation ([installed Effect adapter source](https://github.com/Effect-TS/effect/blob/main/packages/sql/sqlite-node/src/SqliteClient.ts), [SQLCipher keying order](https://www.zetetic.net/sqlcipher/sqlcipher-api/#pragma-key)).

### Candidate comparison

| Candidate                                                                                                 | Actual SQLCipher and maintenance                                                                                                                                                                                                                                                                                                                                                                 | Runtime/API fit                                                                                                                                                                                                                    | Decision                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@journeyapps/sqlcipher` 6.0.0](https://www.npmjs.com/package/@journeyapps/sqlcipher)                    | Bundles upstream SQLCipher 4.14.0 / SQLite 3.51.3; released 2026-04-29; BSD-3-Clause. The repository's 2026 reboot followed a long 5.x maintenance gap, so release cadence remains a risk.                                                                                                                                                                                                       | Node-API C++ binding, but intentionally source-build-only on macOS/Linux. macOS uses CommonCrypto and has an arm64 build job. Callback-based asynchronous API; Electron rebuild documented.                                        | **Choose, subject to the spike below.**                                                                                                                                                                                   |
| [`@signalapp/sqlcipher` 4.0.3](https://www.npmjs.com/package/@signalapp/sqlcipher)                        | Bundles real SQLCipher, but still at 4.10.0; released 2026-07-22; AGPL-3.0-only. SQLCipher 4.14.0 says its newer SQLite baseline fixes a critical WAL-reset corruption bug and strongly advises WAL users to upgrade.                                                                                                                                                                            | Excellent synchronous API fit and Node-API prebuilds, including `darwin-arm64`; no source fallback is shipped in the npm package. No Electron CI and no online-backup method, though `sqlcipher_export()` is usable.               | Reject for the affected pre-4.14 WAL baseline and AGPL-only compliance burden. Reconsider only after both are resolved.                                                                                                   |
| [`better-sqlite3-multiple-ciphers` 13.0.3](https://www.npmjs.com/package/better-sqlite3-multiple-ciphers) | Very current (2026-08-07), MIT, Node-API, and prebuilt for macOS arm64 / Node 22+ / Electron 35+. It embeds SQLite3 Multiple Ciphers, **not Zetetic SQLCipher**. Its own documentation defaults to sqleet and calls original SQLCipher compatibility `legacy=4`; SQLite3 Multiple Ciphers warns that its normal files are not compatible with original SQLCipher unless legacy mode is selected. | Best synchronous API and binary-distribution fit of the candidates; supports binary key helpers, WAL, and backup.                                                                                                                  | Reject because the requirement is upstream SQLCipher, not a separately implemented compatible cipher format ([SQLite3MC legacy modes](https://utelle.github.io/SQLite3MultipleCiphers/docs/ciphers/cipher_legacy_mode/)). |
| [`sqlite3` 6.0.1](https://www.npmjs.com/package/sqlite3) compiled against SQLCipher                       | Can link to actual system SQLCipher and is BSD-3-Clause, but its own README marks the repository deprecated and unmaintained. The normal prebuilds contain ordinary SQLite, not SQLCipher.                                                                                                                                                                                                       | Async API. Requires a custom source build and external SQLCipher headers/library; upstream warns that Electron rebuild does not preserve the SQLCipher flags. This shifts versioning, linkage, and packaging ownership to Optimus. | Reject as an unmaintained, non-reproducible integration path.                                                                                                                                                             |
| [`better-sqlite3-sqlcipher` 5.4.3-3](https://www.npmjs.com/package/better-sqlite3-sqlcipher)              | Uses actual SQLCipher, but the package is a 2020-era fork of better-sqlite3 5.4.3 with SQLCipher 4.1.0 and OpenSSL 1.0.2s.                                                                                                                                                                                                                                                                       | Synchronous, but predates modern Node, Electron, macOS arm64, and Node-API support.                                                                                                                                                | Reject as obsolete and unsafe to carry forward.                                                                                                                                                                           |

Signal's binding is technically attractive enough to keep on the watch list. It is actively maintained, has a compact synchronous API, includes a `darwin-arm64` Node-API binary, and exposes WAL hooks ([Signal repository](https://github.com/signalapp/node-sqlcipher), [4.0.3 release assets](https://github.com/signalapp/node-sqlcipher/releases/tag/v4.0.3), [WAL hook change](https://github.com/signalapp/node-sqlcipher/pull/16)). Node-API is ABI-stable across later Node versions, so its Node 24-built binary is plausible on Node 26 and Electron 43; this still needs a packaged-runtime test because Node-API does not make external-library or platform assumptions stable ([Node 26 Node-API documentation](https://nodejs.org/api/n-api.html)). The package's README and source history nevertheless confirm SQLCipher 4.10.0, which predates the WAL-reset fix, and its AGPL-3.0-only license is an unnecessary product constraint while Optimus has no declared compatible distribution license ([Signal SQLCipher update history](https://github.com/signalapp/node-sqlcipher/commits/main/deps/sqlcipher), [Signal license](https://github.com/signalapp/node-sqlcipher/blob/main/LICENSE)).

### Raw-key and connection behavior

JourneyApps does not expose SQLCipher's `sqlite3_key()` C function, but it can supply the 32-byte DEK through SQLCipher's raw blob-literal form:

```sql
PRAGMA key = "x'<exactly 64 validated hex characters>'";
```

SQLCipher documents that this bypasses its passphrase KDF and maps the 64 hex characters directly to 32 key bytes. The adapter must accept only an owned 32-byte buffer, encode it itself, and enqueue that `PRAGMA key` as the first statement from the database-open callback. Only after keying may it read `PRAGMA cipher_version`, query `sqlite_schema` to verify the key, enable WAL, or apply Optimus's foreign-key, busy-timeout, and synchronous settings ([SQLCipher raw keys and key verification](https://www.zetetic.net/sqlcipher/sqlcipher-api/#pragma-key)).

This interface necessarily creates a short-lived JavaScript hex string because the binding lacks a binary key method. Zero the caller-owned password, KEK, and DEK buffers when their lifetimes end, but do not claim that the immutable SQL string was reliably erased. A future minimal native addition exposing `sqlite3_key()` would improve key-copy control, but it is not required for the first integration.

The adapter should fail closed unless:

1. `PRAGMA cipher_version` returns a non-empty expected 4.x value;
2. `PRAGMA compile_options` confirms the intended SQLCipher build settings, including memory temporary storage;
3. a schema read succeeds with the supplied key;
4. reopening with a wrong key fails;
5. ordinary `node:sqlite` cannot read the created database.

These checks prevent an unknown `PRAGMA key` from being silently accepted by an ordinary SQLite binary.

### WAL and encrypted backup

JourneyApps builds SQLCipher with `SQLITE_TEMP_STORE=2`, `SQLITE_HAS_CODEC`, and the SQLCipher init/shutdown hooks. SQLCipher states that database, rollback-journal, statement-journal, and WAL page data are encrypted, and 4.14.0 is the first JourneyApps-bundled release containing the critical WAL-reset fix ([JourneyApps build metadata](https://github.com/journeyapps/node-sqlcipher/blob/master/deps/sqlite3.gyp), [SQLCipher design](https://www.zetetic.net/sqlcipher/design/), [SQLCipher 4.14.0 release](https://github.com/sqlcipher/sqlcipher/releases/tag/v4.14.0)).

Do **not** wrap JourneyApps's `Database#backup(filename)` as the replacement for the current Effect backup. Its source opens the destination with plain `sqlite3_open()` and provides no destination key before `sqlite3_backup_init()` ([JourneyApps backup source](https://github.com/journeyapps/node-sqlcipher/blob/master/src/backup.cc)). SQLCipher permits the Online Backup API only for encrypted-to-encrypted or plaintext-to-plaintext copies; an unkeyed destination does not satisfy that rule ([SQLCipher Online Backup guidance](https://discuss.zetetic.net/t/using-the-sqlite-online-backup-api/2631/4)).

Implement encrypted snapshots in the adapter with a newly created attached destination, a raw key supplied in the `ATTACH ... KEY "x'...'"` clause, and `SELECT sqlcipher_export('backup')`. SQLCipher documents that `sqlcipher_export()` copies schema, triggers, virtual tables, and data between differently configured databases. Copy `user_version` explicitly because the function does not do so. Detach and close before atomic publication, bundle the matching key envelope, and prove restore plus both integrity checks before accepting a backup ([SQLCipher `ATTACH` and `sqlcipher_export()`](https://www.zetetic.net/sqlcipher/sqlcipher-api/#sqlcipher_export), [plaintext migration guide](https://www.zetetic.net/sqlcipher/encrypting-plaintext-databases/)).

### Effect adapter shape

A project-local adapter is required, but it can remain narrow:

- reuse Effect's SQLite compiler and generic `SqlClient.make` machinery;
- adapt JourneyApps callbacks with `Effect.async`, preserving one serialized connection and a one-permit semaphore;
- implement prepared execution, raw results, values, transactions, scoped close, and error classification needed by Optimus;
- expose the generic `SqlClient.SqlClient` service so repositories and migrations retain their current query API;
- expose a separate Optimus SQLCipher service for encrypted export/restore and cipher diagnostics instead of pretending it is `@effect/sql-sqlite-node`'s `SqliteClient`;
- key and verify inside connection acquisition before publishing either service.

The adapter is preferable to forking all of `@effect/sql-sqlite-node`: the current package is about 260 lines of connection implementation around reusable Effect SQL machinery, while the security-sensitive differences are opening, key order, asynchronous statement calls, and encrypted backup. Keep those differences explicit and covered by integration tests.

### ABI, packaging, signing, and notarization

Optimus currently runs the engine as a separate Node process. If that architecture remains, build the addon for the packaged **Node 26.7 arm64 sidecar**; Electron's ABI is not involved in loading it. The sidecar executable and `.node` addon must still be included in the macOS application bundle and signed as nested code.

If the engine moves into Electron's main process, rebuild the source package against **Electron 43.3 arm64** with `@electron/rebuild`. Electron documents that ordinary native modules need Electron headers and should normally be rebuilt after Electron upgrades. JourneyApps also identifies source rebuild as its supported Electron path ([Electron native modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules), [JourneyApps Electron instructions](https://github.com/journeyapps/node-sqlcipher#usage-with-electron-forge--electronrebuild)).

For either topology:

- add `@journeyapps/sqlcipher: true` to pnpm's existing `allowBuilds` map or pnpm 11 will not run the required install build ([pnpm `approve-builds`](https://pnpm.io/cli/approve-builds));
- build on macOS arm64 with a pinned Xcode/toolchain; JourneyApps statically links its SQLCipher code and uses system CommonCrypto frameworks, so end users do not need Homebrew OpenSSL;
- leave `.node` files outside ASAR (or explicitly `asarUnpack` them) to avoid runtime extraction and antivirus/notarization surprises ([Electron ASAR limitations](https://www.electronjs.org/docs/latest/tutorial/asar-archives#adding-unpacked-files-to-asar-archives));
- sign the final nested native binary and application in the packaging pipeline, then notarize the exact artifact delivered to users ([Electron macOS signing and notarization](https://www.electronjs.org/docs/latest/tutorial/code-signing#signing--notarizing-macos-builds));
- inspect the packaged addon with `file` and `otool -L` to prove arm64 architecture and the absence of unexpected Homebrew or developer-machine dylib paths;
- launch and exercise the database from the signed, notarized artifact, not only from the development tree.

### Minimal proof-of-viability spike

Perform the spike in a disposable package or branch; do not start the application migration until every gate passes.

1. **Build exact targets.** Install pinned `@journeyapps/sqlcipher@6.0.0` under Node 26.7 on macOS arm64. If the engine may run in Electron, separately rebuild and load it under Electron 43.3 arm64. Record compiler, Xcode, Node-API, and resulting linkage.
2. **Prove real SQLCipher.** Open a new database, issue the raw 32-byte key as the first operation, assert `cipher_version`, expected compile options, and successful schema access. Close and reopen with the correct key; assert a wrong key and `node:sqlite` both fail.
3. **Exercise Optimus semantics.** Run representative positional/named parameters, BLOBs, 64-bit integers, prepared statements, `BEGIN IMMEDIATE` transactions, rollback, busy timeout, foreign keys, WAL, and every current migration through a prototype Effect adapter.
4. **Inspect all files.** Keep a transaction and WAL live, then scan the database, `-wal`, journals, temporary files, and logs for unique plaintext fixtures and key hex. No fixture or key may appear.
5. **Prove encrypted backup and restore.** Create a same-key encrypted destination using `ATTACH ... KEY` plus `sqlcipher_export()`, set `user_version`, close it, run cipher and SQLite integrity checks, restore it with its envelope, and compare application invariants. Assert that no intermediate or final backup opens with ordinary SQLite.
6. **Package the real topology.** Put the addon in the intended Node-sidecar or Electron-main location, unpack it from ASAR, sign and notarize the arm64 app, install it on a clean macOS account, and repeat open/write/WAL/backup/restore. Reject the package if it requires Homebrew, loads the wrong architecture, loses SQLCipher during rebuild, or fails after signing.

If JourneyApps fails this exact-target spike, do not fall back to SQLite3 Multiple Ciphers under the SQLCipher name. The next defensible options are to maintain a small audited fork of the JourneyApps binding updated to current upstream SQLCipher, or to defer full-database encryption and retain the narrower application-layer AEAD fallback.

## Primary sources

- [RFC 9106 — Argon2](https://www.rfc-editor.org/rfc/rfc9106.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP Key Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)
- [SQLCipher design](https://www.zetetic.net/sqlcipher/design/)
- [SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/)
- [SQLCipher key material](https://www.zetetic.net/sqlcipher/database-key-material/)
- [SQLCipher plaintext migration](https://www.zetetic.net/sqlcipher/encrypting-plaintext-databases/)
- [SQLCipher build requirements](https://www.zetetic.net/sqlcipher/sqlcipher-linux-community/)
- [SQLite WAL](https://www.sqlite.org/wal.html)
- [SQLite Online Backup API](https://www.sqlite.org/backup.html)
- [SQLite corruption guidance](https://www.sqlite.org/howtocorrupt.html)
- [Node.js SQLite API](https://nodejs.org/api/sqlite.html)
- [Node.js Web Crypto API](https://nodejs.org/api/webcrypto.html)
- [Node.js Buffer API](https://nodejs.org/api/buffer.html)
- [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron `safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)
- [libsodium password hashing](https://doc.libsodium.org/password_hashing/default_phf)
- [libsodium encrypted streams](https://doc.libsodium.org/secret-key_cryptography/secretstream)
- [libsodium secure memory](https://doc.libsodium.org/memory_management)
- [Apple Keychain Services](https://developer.apple.com/documentation/security/keychain-services)
- [Microsoft DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
- [freedesktop Secret Service API](https://specifications.freedesktop.org/secret-service/latest/)

## Turso/libSQL alternative evaluation — 2026-08-15

### Decision

**Do not replace the pinned `@journeyapps/sqlcipher` 6.0.0 plan with Turso or libSQL for Optimus now.** Keep SQLCipher plus the random-DEK/Argon2id envelope as the target design.

There are two materially different local Turso technologies:

- Legacy local libSQL through `@libsql/client` is mature and has an official Effect 4 adapter, but its shipped local cipher is unauthenticated wxSQLite3 AES-256-CBC. This is weaker than SQLCipher and does not meet the authenticated whole-vault requirement.
- The newer `@tursodatabase/database` embedded SDK has a much better native AEAD design and accepts a raw 128- or 256-bit key. It is the only Turso option worth watching. As shipped in 0.7.2, however, encryption is still experimental, file-backed temporary databases are opened without encryption, the JavaScript backup API is unimplemented, `VACUUM INTO` from an encrypted database deliberately creates a plaintext destination, and no official Effect adapter targets this SDK.

The new engine's cryptography is promising, but selecting a storage engine means selecting its complete persistence, backup, migration, runtime, and recovery behavior—not only its page cipher.

### Do not conflate the four Turso products

1. **Turso Cloud** is a hosted service. Ordinary cloud databases have provider-managed volume encryption; Pro and Enterprise BYOK adds page-level AEAD for the server database and its WAL/S3 objects. This says nothing about protection of Optimus's local file and does not satisfy the local-only requirement ([Turso Cloud BYOK](https://docs.turso.tech/cloud/encryption)).
2. **libSQL Embedded Replicas** use `@libsql/client` with a local replica plus `syncUrl`. Reads are local, but writes go to the cloud primary by default; `offline: true` permits local writes. They are a cloud-replication feature, not the fully local database Optimus needs ([Embedded Replicas](https://docs.turso.tech/features/embedded-replicas/introduction)).
3. **Local `@libsql/client` file mode** uses `url: "file:..."` without `syncUrl` or credentials and can run fully offline. It uses the older libSQL/SQLite-fork engine and its older encryption implementation ([TypeScript SDK reference](https://docs.turso.tech/sdk/ts/reference), [`@libsql/client` local implementation](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-client/src/sqlite3.ts)).
4. **`@tursodatabase/database`** is a different, newer, in-process Rust rewrite. It is local-only when opened with a path, requires no Turso Cloud connection, and its local API/package dependency graph includes no telemetry service. It has its own non-SQLCipher encrypted file format and should not be described as libSQL encryption ([Turso Database comparison](https://docs.turso.tech/libsql), [`@tursodatabase/database` 0.7.2 metadata](https://registry.npmjs.org/@tursodatabase%2Fdatabase/0.7.2)).

`@tursodatabase/sync` is also based on the new engine, but it requires a Turso Cloud URL and token for synchronization. Local reads and writes can continue offline when bootstrap is disabled; that still adds a cloud protocol Optimus does not need ([Turso Sync usage](https://docs.turso.tech/sync/usage)).

### Legacy local libSQL: reject

`@libsql/client` 0.17.4 is MIT-licensed, production-used, asynchronous, works with a local `file:` URL, and depends on the native `libsql` package. Prebuilt `darwin-arm64` binaries exist, as do Linux and Windows binaries ([package metadata](https://registry.npmjs.org/@libsql%2Fclient/0.17.4), [`libsql` package metadata](https://registry.npmjs.org/libsql/0.5.29), [`darwin-arm64` package](https://registry.npmjs.org/@libsql%2Fdarwin-arm64/0.5.29)).

Its encryption is nevertheless unsuitable:

- libSQL compiles only the `aes256cbc` cipher from its vendored SQLite3 Multiple Ciphers code; SQLCipher, ChaCha20, and the other ciphers are disabled ([libSQL cipher build configuration](https://github.com/tursodatabase/libsql/blob/main/libsql-ffi/bundled/SQLite3MultipleCiphers/CMakeLists.txt), [libSQL cipher enum](https://github.com/tursodatabase/libsql/blob/main/libsql-sys/src/connection.rs)).
- That cipher is AES-256-CBC **without HMAC**. The IV and page key are deterministically derived from the page number, so this is not authenticated encryption and cannot provide SQLCipher's per-page modification detection ([vendored AES-256 implementation](https://github.com/tursodatabase/libsql/blob/main/libsql-ffi/bundled/SQLite3MultipleCiphers/src/cipher_wxaes256.c), [vendored page cipher implementation](https://github.com/tursodatabase/libsql/blob/main/libsql-ffi/bundled/SQLite3MultipleCiphers/src/codec_algos.c)).
- `encryptionKey` is a passphrase string, not a raw-key interface. The vendored implementation pads it and applies an unsalted fixed SHA-256 hash chain (`CODEC_SHA_ITER` is 4,001), not a memory-hard password KDF. A user password must therefore still go through Optimus's Argon2id/envelope design; passing the DEK as a high-entropy string avoids password weakness but does not repair the lack of authentication ([vendored cipher constants](https://github.com/tursodatabase/libsql/blob/main/libsql-ffi/bundled/SQLite3MultipleCiphers/src/cipher_common.h)).
- Main database and WAL page data are encrypted, but the vendored VFS explicitly leaves encryption of temporary databases and temporary journals as disabled TODO paths. Optimus could force `PRAGMA temp_store=MEMORY`, but this is a mitigation around an incomplete at-rest boundary, not a whole-engine guarantee ([vendored VFS](https://github.com/tursodatabase/libsql/blob/main/libsql-ffi/bundled/SQLite3MultipleCiphers/src/sqlite3mc_vfs.c)).
- The JavaScript binding's `backup()` is unsupported. `@libsql/client.migrate()` is a SQL migration transaction, not a plaintext-to-encrypted conversion or encrypted snapshot API ([libSQL JavaScript API](https://github.com/tursodatabase/libsql-js/blob/main/docs/api.md), [`@libsql/client` API](https://github.com/tursodatabase/libsql-client-ts/blob/main/packages/libsql-core/src/api.ts)).

The official `@effect/sql-libsql` adapter is real and compatible with Optimus's pinned Effect line: version `4.0.0-rc.108` peers on `effect ^4.0.0-rc.108` and depends on `@libsql/client ^0.17.4` ([package metadata](https://registry.npmjs.org/@effect%2Fsql-libsql/4.0.0-rc.108)). It passes a redacted `encryptionKey`, exposes the generic Effect `SqlClient`, serializes access, and supports transactions and savepoints; streaming is explicitly unimplemented ([Effect adapter source](https://github.com/Effect-TS/effect/blob/main/packages/sql/libsql/src/LibsqlClient.ts)). This integration advantage does not compensate for the cipher and persistence weaknesses.

### New Turso Database embedded SDK: promising, but reject for now

`@tursodatabase/database` 0.7.2 is MIT-licensed, local/in-process, and exposes both the default Promise API and a synchronous `./compat` API. Its N-API package ships an `aarch64-apple-darwin` binary as well as Linux x64/arm64 glibc and Windows x64 binaries ([0.7.2 package source](https://github.com/tursodatabase/turso/blob/v0.7.2/bindings/javascript/packages/native/package.json), [Promise API](https://github.com/tursodatabase/turso/blob/v0.7.2/bindings/javascript/packages/native/promise.ts), [synchronous compatibility API](https://github.com/tursodatabase/turso/blob/v0.7.2/bindings/javascript/packages/native/compat.ts)).

Its encryption design is substantially stronger than legacy libSQL:

- The SDK accepts `encryption: { cipher, hexkey }`; `hexkey` is exactly 16 or 32 key bytes encoded as hex. It has no password KDF. Optimus would remain responsible for Argon2id and should pass the unwrapped 32-byte DEK as a 64-character hex key ([TypeScript SDK reference](https://docs.turso.tech/sdk/ts/reference), [encryption option types](https://github.com/tursodatabase/turso/blob/v0.7.2/bindings/javascript/packages/common/types.ts)).
- It provides AES-128/256-GCM and AEGIS variants, with a fresh OS-random nonce and a 16-byte authentication tag on every page write. The encrypted format is not readable by ordinary SQLite ([encryption documentation](https://docs.turso.tech/tursodb/encryption), [0.7.2 encryption source](https://github.com/tursodatabase/turso/blob/v0.7.2/core/storage/encryption.rs)).
- Page 1 is not wholly secret: bytes 16–100 remain plaintext metadata but are authenticated as associated data; the rest of the page is encrypted. For ordinary pages, 0.7.2 calls AEAD with empty associated data rather than binding the page number, so the authentication guarantee is not identical to SQLCipher's page-number HMAC binding ([0.7.2 encryption source](https://github.com/tursodatabase/turso/blob/v0.7.2/core/storage/encryption.rs)).
- Turso documents encryption of the main database and WAL. The 0.7.2 tests also check encrypted MVCC logical-log payloads ([encryption documentation](https://docs.turso.tech/tursodb/encryption), [0.7.2 encryption tests](https://github.com/tursodatabase/turso/blob/v0.7.2/tests/integration/query_processing/encryption.rs)).

The complete at-rest boundary does not yet pass:

- The default `temp_store` is file-backed. In 0.7.2, a temporary database is created with encryption options `None` and initialized without an encryption key, even when the main database is encrypted. `PRAGMA temp_store=MEMORY` would avoid those disk files, but the secure default and fail-closed guarantee Optimus needs are absent ([temporary database source](https://github.com/tursodatabase/turso/blob/v0.7.2/core/connection.rs), [temporary-file source](https://github.com/tursodatabase/turso/blob/v0.7.2/core/io/mod.rs)).
- `Database.backup()` and the SQLite backup C API are not implemented ([JavaScript API](https://github.com/tursodatabase/turso/blob/v0.7.2/docs/javascript-api-reference.md), [compatibility matrix](https://github.com/tursodatabase/turso/blob/v0.7.2/COMPAT.md)).
- The shipped encryption test specifies that `VACUUM INTO` from an authorized encrypted source produces a destination readable **without any key**. It is therefore a plaintext export, not an encrypted backup primitive ([0.7.2 encryption test](https://github.com/tursodatabase/turso/blob/v0.7.2/tests/integration/query_processing/encryption.rs)).
- Official docs list passphrase derivation, encrypting an existing database, and key rotation as future work. Optimus's envelope still makes an ordinary password change cheap, but rotating a compromised DEK or safely converting/restoring databases lacks the supported primitives SQLCipher provides ([encryption roadmap](https://docs.turso.tech/tursodb/encryption)).

Maturity and exact-runtime support are also below the current SQLCipher plan. Turso says the engine runs in production but has not reached 1.0 and recommends independent backups; its repository still marks encryption experimental ([Turso repository and FAQ](https://github.com/tursodatabase/turso/tree/v0.7.2)). The 0.7.2 CI builds macOS arm64 but runs the database test suite only on Node 20 Linux x64 and Windows x64. It does not test Node 26.7, Electron 43.3, or execute tests on macOS arm64 ([0.7.2 N-API CI](https://github.com/tursodatabase/turso/blob/v0.7.2/.github/workflows/napi.yml)). The N-API prebuild is plausible in Optimus's Node sidecar and perhaps Electron main, but both exact packaged topologies still require a signed/notarized spike.

There is **no official Effect adapter for `@tursodatabase/database`**. `@effect/sql-libsql` directly constructs or accepts an `@libsql/client` client; the newer SDK exposes a different prepared-statement API and is not a drop-in live client. Adopting it would require another Optimus-owned adapter, just as the SQLCipher plan does ([Effect adapter source](https://github.com/Effect-TS/effect/blob/main/packages/sql/libsql/src/LibsqlClient.ts), [Turso JavaScript API](https://github.com/tursodatabase/turso/blob/v0.7.2/docs/javascript-api-reference.md)).

### Direct comparison and revisit gates

Against `@journeyapps/sqlcipher` 6.0.0 plus the established envelope:

- **Cryptography:** SQLCipher's AES-256-CBC plus per-page HMAC-SHA512 is authenticated and mature. New Turso's AES-GCM/AEGIS AEAD is attractive, but legacy libSQL's AES-256-CBC without HMAC is a regression.
- **Password design:** SQLCipher and new Turso can both consume Optimus's random DEK without making the vault password the database key. Legacy libSQL exposes only its passphrase transformation. All options still need Optimus's Argon2id KEK and authenticated DEK envelope for password changes and KDF upgrades.
- **Files and backups:** the selected SQLCipher build encrypts database, WAL, rollback/statement journals and uses memory temp storage; `sqlcipher_export()` can create a keyed destination. New Turso leaves file-backed temp databases plaintext and its supported export path plaintext. Legacy libSQL also lacks a complete temp/backup guarantee.
- **Integration:** legacy libSQL wins only on the ready-made Effect adapter and prebuilds. New Turso and JourneyApps both need an Optimus adapter; JourneyApps additionally needs a source-build/package spike, while new Turso needs an exact-runtime prebuild spike.
- **Maturity:** SQLCipher is established and JourneyApps's integration risk is bounded to the binding/runtime matrix. New Turso combines an under-1.0 engine, experimental encryption, incomplete backup APIs, and untested Optimus runtimes.

Reconsider `@tursodatabase/database` only after encryption is no longer experimental and a pinned release proves all of the following: encrypted or memory-only temp storage by construction; encrypted online backup and restore with no plaintext intermediate; supported plaintext import and DEK rotation; page-position/authentication semantics reviewed; complete Optimus query/migration compatibility; and packaged Node 26.7/Electron 43.3 macOS arm64 tests, followed by Linux and Windows. An official Effect adapter would reduce work but is not itself a security gate.
