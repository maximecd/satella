import { describe, expect, it } from "vite-plus/test";

import { redactDiagnostic } from "./ApiLogging.js";

describe("API diagnostic redaction", () => {
  it("redacts passwords, PINs, keys, and credential-shaped fields", () => {
    expect(
      redactDiagnostic(
        'unlock failed password=correct-horse-battery pin=2468 dek=aabbcc api_key=sk-live token=abc',
      ),
    ).not.toMatch(/correct-horse-battery|2468|aabbcc|sk-live|\btoken=abc/);
    expect(redactDiagnostic("password=secret pin=0000")).toContain("password=<redacted>");
    expect(redactDiagnostic("password=secret pin=0000")).toContain("pin=<redacted>");
  });
});
