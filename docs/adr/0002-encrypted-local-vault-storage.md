# Encrypted local Vault storage

Status: superseded by ADR 0010

Satella encrypts the complete local SQLite database and its pre-migration backups with a random 256-bit database key. That key is wrapped by Argon2id (version 1.3) and AES-256-GCM in a versioned envelope beside the database. The engine owns Vault lifecycle; finance modules keep using Effect `SqlClient`.

A throwaway spike of `@tursodatabase/database@0.7.2` on Node 26.7.0 / macOS arm64 passed native load, AES-256-GCM keying, wrong-key fail-closed behavior, `temp_store=MEMORY`, representative SQL, and Electron 43 native load. It failed the restore/backup gates: `db.backup()` throws `not implemented`, `PRAGMA wal_checkpoint(FULL)` returned busy while open, and a naive closed-file copy missed committed pages until WAL was flushed. The specification requires rejecting Turso when any restore or crash-safety gate fails.

Production therefore uses pinned `@journeyapps/sqlcipher@6.0.0` Community Edition (BSD-3-Clause) behind an Satella adapter. Connections receive a raw 256-bit key before other SQL, `cipher_version` is verified, `temp_store=MEMORY` is required, and backups use `VACUUM INTO` so copies stay encrypted with the Vault database key.
