import * as Data from "effect/Data";
import * as Schema from "effect/Schema";

import { encodeEnvelope, parseEnvelopeBytes, type KeyEnvelope } from "./envelope.js";

export const VAULT_FILE_EXTENSION = ".satella-vault";
export const CONTAINER_MAGIC = "SVLT";
export const CONTAINER_VERSION = 1;
const MAGIC_BYTES = 4;
const VERSION_BYTES = 1;
const HEADER_LENGTH_BYTES = 4;
const PREFIX_BYTES = MAGIC_BYTES + VERSION_BYTES + HEADER_LENGTH_BYTES;
const MAX_CONTAINER_BYTES = 1_073_741_824;

export class VaultContainerError extends Data.TaggedError("VaultContainerError")<{
  readonly reason: "malformed" | "unsupported-version";
  readonly message: string;
}> {}

const ContainerHeaderSchema = Schema.Struct({
  format: Schema.Literal("satella-vault"),
  version: Schema.Literal(CONTAINER_VERSION),
  envelope: Schema.Unknown,
});

const parseHeader = (json: string) => {
  const malformed = () =>
    new VaultContainerError({
      reason: "malformed",
      message: "This file is not a valid Satella Vault export.",
    });
  let decoded: unknown;
  try {
    decoded = JSON.parse(json);
  } catch {
    throw malformed();
  }
  return Schema.decodeUnknownSync(ContainerHeaderSchema)(decoded, { onExcessProperty: "ignore" });
};

export const buildContainer = (envelope: KeyEnvelope, databaseBytes: Uint8Array): Buffer => {
  const header = Buffer.from(
    JSON.stringify({
      format: "satella-vault",
      version: CONTAINER_VERSION,
      envelope: JSON.parse(encodeEnvelope(envelope).toString("utf8")),
    }),
    "utf8",
  );
  const prefix = Buffer.alloc(PREFIX_BYTES);
  prefix.write(CONTAINER_MAGIC, 0, "utf8");
  prefix.writeUInt8(CONTAINER_VERSION, MAGIC_BYTES);
  prefix.writeUInt32BE(header.byteLength, MAGIC_BYTES + VERSION_BYTES);
  return Buffer.concat([prefix, header, databaseBytes]);
};

export interface ParsedContainer {
  readonly envelope: KeyEnvelope;
  readonly databaseBytes: Uint8Array;
}

export const parseContainer = (bytes: Uint8Array): ParsedContainer => {
  const malformed = () =>
    new VaultContainerError({
      reason: "malformed",
      message: "This file is not a valid Satella Vault export.",
    });
  if (bytes.byteLength <= PREFIX_BYTES || bytes.byteLength > MAX_CONTAINER_BYTES) throw malformed();
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.subarray(0, MAGIC_BYTES).toString("utf8") !== CONTAINER_MAGIC) throw malformed();
  const version = view.readUInt8(MAGIC_BYTES);
  if (version > CONTAINER_VERSION) {
    throw new VaultContainerError({
      reason: "unsupported-version",
      message: "This export was created by a newer version of Satella and cannot be opened here.",
    });
  }
  if (version < CONTAINER_VERSION) throw malformed();
  const headerLength = view.readUInt32BE(MAGIC_BYTES + VERSION_BYTES);
  if (headerLength > bytes.byteLength - PREFIX_BYTES) throw malformed();
  const header = parseHeader(
    view.subarray(PREFIX_BYTES, PREFIX_BYTES + headerLength).toString("utf8"),
  );
  let envelope: KeyEnvelope;
  try {
    envelope = parseEnvelopeBytes(Buffer.from(JSON.stringify(header.envelope), "utf8"));
  } catch {
    throw malformed();
  }
  return {
    envelope,
    databaseBytes: new Uint8Array(view.subarray(PREFIX_BYTES + headerLength)),
  };
};
