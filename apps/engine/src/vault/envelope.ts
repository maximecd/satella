import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { chmod, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

import * as Data from "effect/Data";
import * as Schema from "effect/Schema";

import {
  type Argon2idParameters,
  deriveKeyEncryptionKey,
  FAST_KDF,
  PRODUCTION_KDF,
} from "./kdf.js";

export { FAST_KDF, PRODUCTION_KDF };
export type { Argon2idParameters };

export const ENVELOPE_AAD_PREFIX = "satella-vault";
export const ENVELOPE_VERSION = 1;
export const ENVELOPE_MAX_BYTES = 8_192;
const NONCE_BYTES = 12;
const KEY_BYTES = 32;
const AUTH_TAG_BYTES = 16;

type JsonValue = string | number | boolean | null | JsonObject | ReadonlyArray<JsonValue>;
interface JsonObject {
  readonly [key: string]: JsonValue;
}
const isJsonString = Schema.is(Schema.String);
const isJsonObject = (cause: JsonValue): cause is JsonObject =>
  cause !== null && Object.prototype.toString.call(cause) === "[object Object]";
const requiredJsonValue = (record: JsonObject, key: string): JsonValue => {
  const value = record[key];
  if (value === undefined) throw new Error("malformed");
  return value;
};

export class VaultUnlockError extends Data.TaggedError("VaultUnlockError")<{
  readonly message: string;
}> {}

export interface KeyEnvelope {
  readonly version: number;
  readonly vaultId: string;
  readonly kdf: Argon2idParameters;
  readonly wrap: {
    readonly algorithm: "aes-256-gcm";
    readonly nonce: Uint8Array;
    readonly ciphertext: Uint8Array;
    readonly tag: Uint8Array;
  };
}

const genericUnlockFailure = () =>
  new VaultUnlockError({ message: "The Vault could not be unlocked." });

const aadFor = (vaultId: string) =>
  Buffer.from(`${ENVELOPE_AAD_PREFIX}|${ENVELOPE_VERSION}|${vaultId}`, "utf8");

export const encodeEnvelope = (envelope: KeyEnvelope): Buffer =>
  Buffer.from(
    JSON.stringify({
      version: envelope.version,
      vaultId: envelope.vaultId,
      kdf: {
        algorithm: envelope.kdf.algorithm,
        version: envelope.kdf.version,
        memoryKiB: envelope.kdf.memoryKiB,
        passes: envelope.kdf.passes,
        parallelism: envelope.kdf.parallelism,
        salt: Buffer.from(envelope.kdf.salt).toString("base64"),
      },
      wrap: {
        algorithm: envelope.wrap.algorithm,
        nonce: Buffer.from(envelope.wrap.nonce).toString("base64"),
        ciphertext: Buffer.from(envelope.wrap.ciphertext).toString("base64"),
        tag: Buffer.from(envelope.wrap.tag).toString("base64"),
      },
    }),
    "utf8",
  );

const decodeBase64 = (value: JsonValue, expectedLength?: number) => {
  if (!isJsonString(value) || value.length === 0 || value.length > 1_024) {
    throw new Error("malformed");
  }
  const bytes = Buffer.from(value, "base64");
  if (expectedLength !== undefined && bytes.byteLength !== expectedLength) {
    throw new Error("malformed");
  }
  return new Uint8Array(bytes);
};

export const parseEnvelopeBytes = (bytes: Uint8Array): KeyEnvelope => {
  if (bytes.byteLength === 0 || bytes.byteLength > ENVELOPE_MAX_BYTES) {
    throw genericUnlockFailure();
  }
  try {
    const parsed: JsonValue = JSON.parse(Buffer.from(bytes).toString("utf8"));
    if (!isJsonObject(parsed)) throw new Error("malformed");
    const record = parsed;
    const vaultId = requiredJsonValue(record, "vaultId");
    if (requiredJsonValue(record, "version") !== ENVELOPE_VERSION || !isJsonString(vaultId)) {
      throw new Error("malformed");
    }
    const kdf = requiredJsonValue(record, "kdf");
    const wrap = requiredJsonValue(record, "wrap");
    if (!isJsonObject(kdf) || !isJsonObject(wrap)) {
      throw new Error("malformed");
    }
    const kdfRecord = kdf;
    const wrapRecord = wrap;
    if (requiredJsonValue(wrapRecord, "algorithm") !== "aes-256-gcm") {
      throw new Error("malformed");
    }
    return {
      version: ENVELOPE_VERSION,
      vaultId,
      kdf: {
        algorithm: "argon2id",
        version: Number(requiredJsonValue(kdfRecord, "version")),
        memoryKiB: Number(requiredJsonValue(kdfRecord, "memoryKiB")),
        passes: Number(requiredJsonValue(kdfRecord, "passes")),
        parallelism: Number(requiredJsonValue(kdfRecord, "parallelism")),
        salt: decodeBase64(requiredJsonValue(kdfRecord, "salt"), 16),
      },
      wrap: {
        algorithm: "aes-256-gcm",
        nonce: decodeBase64(requiredJsonValue(wrapRecord, "nonce"), NONCE_BYTES),
        ciphertext: decodeBase64(requiredJsonValue(wrapRecord, "ciphertext"), KEY_BYTES),
        tag: decodeBase64(requiredJsonValue(wrapRecord, "tag"), AUTH_TAG_BYTES),
      },
    };
  } catch (error) {
    if (error instanceof VaultUnlockError) throw error;
    throw genericUnlockFailure();
  }
};

export const wrapDatabaseKey = async (
  password: string,
  dek: Uint8Array,
  kdf: Argon2idParameters,
  vaultId: string = randomUUID(),
): Promise<KeyEnvelope> => {
  if (dek.byteLength !== KEY_BYTES) {
    throw genericUnlockFailure();
  }
  const kek = await deriveKeyEncryptionKey(password, kdf);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", kek, nonce);
  cipher.setAAD(aadFor(vaultId));
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  kek.fill(0);
  return {
    version: ENVELOPE_VERSION,
    vaultId,
    kdf,
    wrap: {
      algorithm: "aes-256-gcm",
      nonce,
      ciphertext: new Uint8Array(ciphertext),
      tag: new Uint8Array(tag),
    },
  };
};

export const unwrapDatabaseKey = async (
  password: string,
  envelope: KeyEnvelope,
): Promise<Uint8Array> => {
  try {
    if (envelope.version !== ENVELOPE_VERSION) {
      throw new Error("unsupported");
    }
    const kek = await deriveKeyEncryptionKey(password, envelope.kdf);
    const decipher = createDecipheriv("aes-256-gcm", kek, envelope.wrap.nonce);
    decipher.setAAD(aadFor(envelope.vaultId));
    decipher.setAuthTag(Buffer.from(envelope.wrap.tag));
    const dek = Buffer.concat([
      decipher.update(Buffer.from(envelope.wrap.ciphertext)),
      decipher.final(),
    ]);
    kek.fill(0);
    if (dek.byteLength !== KEY_BYTES) {
      throw new Error("malformed");
    }
    return new Uint8Array(dek);
  } catch (error) {
    if (error instanceof VaultUnlockError) throw error;
    throw genericUnlockFailure();
  }
};

export const createEnvelope = async (
  password: string,
  kdfWithoutSalt: Omit<Argon2idParameters, "salt">,
) => {
  const dek = randomBytes(KEY_BYTES);
  const kdf: Argon2idParameters = {
    ...kdfWithoutSalt,
    salt: randomBytes(16),
  };
  const envelope = await wrapDatabaseKey(password, dek, kdf);
  return { dek: new Uint8Array(dek), envelope };
};

export const loadEnvelope = async (path: string): Promise<KeyEnvelope> => {
  try {
    const handle = await open(path, "r");
    try {
      const stat = await handle.stat();
      if (stat.size > ENVELOPE_MAX_BYTES) {
        throw genericUnlockFailure();
      }
      const bytes = Buffer.alloc(stat.size);
      await handle.read(bytes, 0, stat.size, 0);
      return parseEnvelopeBytes(bytes);
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof VaultUnlockError) throw error;
    throw genericUnlockFailure();
  }
};

export const replaceEnvelope = async (path: string, envelope: KeyEnvelope) => {
  const encoded = encodeEnvelope(envelope);
  const temporary = `${path}.tmp`;
  const handle = await open(temporary, "w");
  try {
    await handle.writeFile(encoded);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
  await chmod(path, 0o600);
  try {
    const directory = await open(dirname(path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch {
    // Directory fsync is best-effort on platforms that reject it.
  }
  try {
    await unlink(temporary);
  } catch {
    // Rename already replaced the temp path.
  }
};
