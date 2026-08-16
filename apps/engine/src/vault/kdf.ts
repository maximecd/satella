import { argon2 } from "node:crypto";

export const ARGON2_VERSION = 19;
export const PRODUCTION_KDF = {
  algorithm: "argon2id" as const,
  version: ARGON2_VERSION,
  memoryKiB: 65_536,
  passes: 3,
  parallelism: 4,
};
export const FAST_KDF = {
  algorithm: "argon2id" as const,
  version: ARGON2_VERSION,
  memoryKiB: 32,
  passes: 1,
  parallelism: 1,
};

export interface Argon2idParameters {
  readonly algorithm: "argon2id";
  readonly version: number;
  readonly memoryKiB: number;
  readonly passes: number;
  readonly parallelism: number;
  readonly salt: Uint8Array;
}

const MIN_MEMORY_KIB = 8;
const MAX_MEMORY_KIB = 262_144;
const MIN_PASSES = 1;
const MAX_PASSES = 16;
const MIN_PARALLELISM = 1;
const MAX_PARALLELISM = 16;
const SALT_BYTES = 16;

export const assertKdfParameters = (parameters: Argon2idParameters) => {
  if (parameters.algorithm !== "argon2id" || parameters.version !== ARGON2_VERSION) {
    throw new Error("unsupported kdf");
  }
  if (parameters.salt.byteLength !== SALT_BYTES) {
    throw new Error("unsupported kdf");
  }
  if (
    parameters.memoryKiB < MIN_MEMORY_KIB ||
    parameters.memoryKiB > MAX_MEMORY_KIB ||
    parameters.passes < MIN_PASSES ||
    parameters.passes > MAX_PASSES ||
    parameters.parallelism < MIN_PARALLELISM ||
    parameters.parallelism > MAX_PARALLELISM
  ) {
    throw new Error("unsupported kdf");
  }
};

export const deriveKeyEncryptionKey = async (
  password: string | Uint8Array,
  parameters: Argon2idParameters,
  extras: { readonly secret?: Uint8Array; readonly associatedData?: Uint8Array } = {},
): Promise<Uint8Array> => {
  assertKdfParameters(parameters);
  const message = typeof password === "string" ? Buffer.from(password, "utf8") : Buffer.from(password);
  const derived = await new Promise<Buffer>((resolve, reject) => {
    argon2(
      "argon2id",
      {
        message,
        nonce: Buffer.from(parameters.salt),
        parallelism: parameters.parallelism,
        tagLength: 32,
        memory: parameters.memoryKiB,
        passes: parameters.passes,
        ...(extras.secret === undefined ? {} : { secret: Buffer.from(extras.secret) }),
        ...(extras.associatedData === undefined
          ? {}
          : { associatedData: Buffer.from(extras.associatedData) }),
      },
      (error, result) => {
        if (error !== undefined && error !== null) reject(error);
        else resolve(result as Buffer);
      },
    );
  });
  return new Uint8Array(derived);
};

/** RFC 9106 section 5.3 Argon2id version 19 vector. */
export const rfc9106Argon2idVector = {
  password: Buffer.alloc(32, 1),
  parameters: {
    algorithm: "argon2id" as const,
    version: ARGON2_VERSION,
    memoryKiB: 32,
    passes: 3,
    parallelism: 4,
    salt: Buffer.alloc(16, 2),
  },
  secret: Buffer.alloc(8, 3),
  associatedData: Buffer.alloc(12, 4),
  tagHex: "0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659",
};
