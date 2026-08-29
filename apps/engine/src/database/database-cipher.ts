import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const AAD = Buffer.from("satella-sqlite-v1");
export const SQLITE_HEADER = Buffer.from("SQLite format 3\0");

export const encryptSqliteBytes = (dek: Uint8Array, plaintext: Uint8Array): Buffer => {
  if (dek.byteLength !== KEY_BYTES) {
    throw new Error("The Vault database key is not 256 bits.");
  }
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", dek, nonce);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, tag, ciphertext]);
};

export const decryptSqliteBytes = (dek: Uint8Array, packed: Uint8Array): Uint8Array => {
  if (dek.byteLength !== KEY_BYTES) {
    throw new Error("The Vault database key is not 256 bits.");
  }
  if (packed.byteLength < NONCE_BYTES + TAG_BYTES) {
    throw new Error("The Vault database file is not a valid ciphertext.");
  }
  const nonce = packed.subarray(0, NONCE_BYTES);
  const tag = packed.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
  const ciphertext = packed.subarray(NONCE_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", dek, nonce);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  if (
    plaintext.byteLength < SQLITE_HEADER.byteLength ||
    !plaintext.subarray(0, SQLITE_HEADER.byteLength).equals(SQLITE_HEADER)
  ) {
    throw new Error("The Vault database file is not a SQLite database.");
  }
  return new Uint8Array(plaintext);
};
