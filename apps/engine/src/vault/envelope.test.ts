import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";

import { describe, expect, it } from "vite-plus/test";

import {
  ENVELOPE_AAD_PREFIX,
  createEnvelope,
  loadEnvelope,
  replaceEnvelope,
  unwrapDatabaseKey,
  wrapDatabaseKey,
} from "./envelope.js";
import { deriveKeyEncryptionKey, rfc9106Argon2idVector } from "./kdf.js";

describe("Argon2id key derivation", () => {
  it("matches the RFC 9106 Argon2id version 19 test vector", async () => {
    const derived = await deriveKeyEncryptionKey(
      rfc9106Argon2idVector.password,
      rfc9106Argon2idVector.parameters,
      {
        secret: rfc9106Argon2idVector.secret,
        associatedData: rfc9106Argon2idVector.associatedData,
      },
    );
    expect(Buffer.from(derived).toString("hex")).toBe(rfc9106Argon2idVector.tagHex);
  });
});

describe("Vault key envelope", () => {
  const password = "correct-horse-battery";
  const otherPassword = "other-horse-battery";
  const kdf = {
    algorithm: "argon2id" as const,
    version: 19,
    memoryKiB: 32,
    passes: 1,
    parallelism: 1,
    salt: Buffer.alloc(16, 7),
  };

  it("unwraps a newly wrapped database key with the correct Vault password", async () => {
    const dek = Buffer.alloc(32, 9);
    const envelope = await wrapDatabaseKey(password, dek, kdf);
    const unwrapped = await unwrapDatabaseKey(password, envelope);
    expect(Buffer.from(unwrapped)).toEqual(dek);
    expect(envelope.version).toBe(1);
    expect(envelope.kdf.algorithm).toBe("argon2id");
    expect(envelope.wrap.algorithm).toBe("aes-256-gcm");
  });

  it("returns one generic failure for a wrong password", async () => {
    const envelope = await wrapDatabaseKey(password, Buffer.alloc(32, 1), kdf);
    await expect(unwrapDatabaseKey(otherPassword, envelope)).rejects.toMatchObject({
      _tag: "VaultUnlockError",
    });
  });

  it("returns one generic failure when authenticated context is tampered", async () => {
    const envelope = await wrapDatabaseKey(password, Buffer.alloc(32, 1), kdf);
    const tampered = {
      ...envelope,
      vaultId: "00000000-0000-4000-8000-000000000000",
    };
    expect(ENVELOPE_AAD_PREFIX).toBe("optimus-vault");
    await expect(unwrapDatabaseKey(password, tampered)).rejects.toMatchObject({
      _tag: "VaultUnlockError",
    });
  });

  it("rejects malformed and excessively large parameter fields before deriving", async () => {
    const envelope = await wrapDatabaseKey(password, Buffer.alloc(32, 1), kdf);
    await expect(
      unwrapDatabaseKey(password, {
        ...envelope,
        kdf: { ...envelope.kdf, memoryKiB: 8_388_608 },
      }),
    ).rejects.toMatchObject({ _tag: "VaultUnlockError" });
    await expect(
      unwrapDatabaseKey(password, {
        ...envelope,
        kdf: { ...envelope.kdf, salt: Buffer.alloc(8) },
      }),
    ).rejects.toMatchObject({ _tag: "VaultUnlockError" });
  });

  it("rewraps the same database key and rejects the old Vault password", async () => {
    const dek = Buffer.alloc(32, 11);
    const original = await wrapDatabaseKey(password, dek, kdf);
    const rewrapped = await wrapDatabaseKey(
      otherPassword,
      dek,
      {
        ...kdf,
        salt: Buffer.alloc(16, 8),
      },
      original.vaultId,
    );
    expect(Buffer.from(await unwrapDatabaseKey(otherPassword, rewrapped))).toEqual(dek);
    await expect(unwrapDatabaseKey(password, rewrapped)).rejects.toMatchObject({
      _tag: "VaultUnlockError",
    });
    expect(rewrapped.vaultId).toBe(original.vaultId);
  });

  it("replaces the envelope file crash-safely so a leftover temp file keeps the old envelope", async () => {
    const directory = await mkdtemp(join(tmpdir(), "optimus-envelope-"));
    const path = join(directory, "vault.envelope.json");
    const first = await createEnvelope(password, kdf);
    await replaceEnvelope(path, first.envelope);
    const second = await wrapDatabaseKey(otherPassword, first.dek, {
      ...kdf,
      salt: Buffer.alloc(16, 3),
    });
    await writeFile(`${path}.tmp`, "partial-envelope");
    const loaded = await loadEnvelope(path);
    expect(Buffer.from(loaded.wrap.nonce)).toEqual(Buffer.from(first.envelope.wrap.nonce));
    await replaceEnvelope(path, second);
    const replaced = await loadEnvelope(path);
    expect(
      Buffer.from(await unwrapDatabaseKey(otherPassword, replaced)).equals(Buffer.from(first.dek)),
    ).toBe(true);
    await expect(readFile(`${path}.tmp`)).rejects.toMatchObject({ code: "ENOENT" });
    await mkdir(directory, { recursive: true });
  });
});
