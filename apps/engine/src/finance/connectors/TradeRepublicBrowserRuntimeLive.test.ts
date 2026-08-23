import { describe, expect, it } from "vite-plus/test";

import {
  sessionFromAuthenticationResponse,
  waitForWafToken,
} from "./TradeRepublicBrowserRuntimeLive.js";

describe("Trade Republic WAF authentication", () => {
  it("reads durable session cookies directly from the confirmation response", () => {
    expect(
      sessionFromAuthenticationResponse(
        undefined,
        [],
        [
          { name: "Set-Cookie", value: "tr_session=session-token; Path=/; Secure" },
          { name: "Set-Cookie", value: "tr_refresh=refresh-token; Path=/; Secure" },
        ],
      ),
    ).toEqual({ sessionToken: "session-token", refreshToken: "refresh-token" });
  });

  it("identifies the missing cookie without exposing session values", () => {
    expect(() =>
      sessionFromAuthenticationResponse(
        undefined,
        [],
        [{ name: "Set-Cookie", value: "tr_session=session-token; Path=/; Secure" }],
      ),
    ).toThrow(
      "Trade Republic accepted the confirmation code but did not return the tr_refresh cookie",
    );
    expect(() =>
      sessionFromAuthenticationResponse(
        undefined,
        [],
        [{ name: "Set-Cookie", value: "tr_refresh=refresh-token; Path=/; Secure" }],
      ),
    ).toThrow(
      "Trade Republic accepted the confirmation code but did not return the tr_session cookie",
    );
  });

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
