import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const newMcpToken = () => `stl_${randomBytes(32).toString("base64url")}`;

export const newMcpTokenSalt = () => randomBytes(16);

export const mcpTokenHash = (token: string, salt: Uint8Array) =>
  createHmac("sha256", Buffer.from(salt)).update(token, "utf8").digest("hex");

export const mcpTokenMatches = (token: string, salt: Uint8Array, expectedHex: string) => {
  const actual = Buffer.from(mcpTokenHash(token, salt), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
