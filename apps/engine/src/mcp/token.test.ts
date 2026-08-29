import { describe, expect, it } from "vite-plus/test";

import { mcpTokenHash, mcpTokenMatches, newMcpToken, newMcpTokenSalt } from "./token.js";

describe("MCP token hashing", () => {
  it("accepts the original token and rejects a different one", () => {
    const token = newMcpToken();
    const salt = newMcpTokenSalt();
    const hash = mcpTokenHash(token, salt);
    expect(token.startsWith("stl_")).toBe(true);
    expect(mcpTokenMatches(token, salt, hash)).toBe(true);
    expect(mcpTokenMatches(`${token}x`, salt, hash)).toBe(false);
  });
});
