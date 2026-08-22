# Turso proof-of-viability spike

Status: resolved

## Decision

Reject `@tursodatabase/database` for this release. Adopt `@journeyapps/sqlcipher@6.0.0` Community Edition behind the Satella Vault / `SqlClient` adapter.

## Evidence

- Node: v26.7.0, platform: darwin arm64
- Package: `@tursodatabase/database@0.7.2`
- Electron: 43.3.0 (Node 24.18.1) loaded the native module successfully (`ELECTRON_RUN_AS_NODE=1`)

| Gate                                                   | Result                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Native module loads in Node                            | pass                                                                         |
| Raw 256-bit AES-256-GCM key creates encrypted database | pass                                                                         |
| Wrong or missing keys fail closed                      | pass                                                                         |
| Database files contain no plaintext marker             | pass                                                                         |
| `temp_store=MEMORY`                                    | pass                                                                         |
| Transactions, FK, ORDER BY, DISTINCT, GROUP BY, join   | pass                                                                         |
| Online backup interface                                | fail (`backup()` throws `not implemented`)                                   |
| Closed encrypted copy restore                          | fail until WAL flushed; `wal_checkpoint(FULL)` returned `busy: 1` while open |
| Electron native load                                   | pass                                                                         |
| No plaintext temps under representative load           | pass                                                                         |

Commands: install and run `/tmp/satella-turso-spike/spike.mjs` and `backup-and-electron.mjs` against 0.7.2. Throwaway spike code is not in this branch.
