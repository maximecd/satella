# Whole-Vault file encryption

Status: accepted

The Vault SQLite database is an in-memory `node:sqlite` instance while unlocked. At rest it is a whole-file AES-256-GCM blob keyed by the existing Argon2id-wrapped DEK. There is no SQLCipher (or other native addon) and no install script, so `npx` does not compile.

This supersedes ADR 0002's SQLCipher choice. The envelope, Vault password, and "complete Vault is ciphertext on disk" requirement stay. Field-level credential encryption (Picsou) was rejected because a missed column would leak Connector credentials; a plaintext working file while unlocked was rejected because a crash would leave those credentials on disk.
