import { describe, expect, it } from "vite-plus/test";

import { waitForWafToken } from "./TradeRepublicBrowserRuntimeLive.js";

describe("Trade Republic WAF authentication", () => {
  it("waits for the WAF cookie instead of racing DOMContentLoaded", async () => {
    let cookieReads = 0;
    let waits = 0;
    const context = {
      cookies: async () => {
        cookieReads += 1;
        return cookieReads < 3 ? [] : [{ name: "aws-waf-token", value: "token" }];
      },
    };
    const page = {
      waitForTimeout: async () => {
        waits += 1;
      },
    };

    await expect(waitForWafToken(page, context, 3)).resolves.toBe("token");
    expect(cookieReads).toBe(3);
    expect(waits).toBe(2);
  });

  it("stops after the bounded number of attempts", async () => {
    let cookieReads = 0;
    const context = {
      cookies: async () => {
        cookieReads += 1;
        return [];
      },
    };
    const page = { waitForTimeout: async () => undefined };

    await expect(waitForWafToken(page, context, 2)).resolves.toBeUndefined();
    expect(cookieReads).toBe(2);
  });
});
