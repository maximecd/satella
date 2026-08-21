import { describe, expect, it } from "vite-plus/test";

import { formatAmount, formatDecimal, formatSignedAmount } from "./financial-number";

describe("web financial presentation boundary", () => {
  it("rounds and groups large decimal values without converting them to binary floats", () => {
    expect(
      formatDecimal("999999999999999999999.99", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ).toMatch(/999[,.]999[,.]999[,.]999[,.]999[,.]999[,.]999[,.]99/);
    const usd = formatAmount("0.1", "USD");
    expect(usd).toMatch(/0[,.]10/);
    expect(usd).not.toMatch(/USD/);
  });

  it("falls back to the ISO code suffix when a currency has no narrow symbol", () => {
    expect(formatAmount("1234.5", "XYZ")).toMatch(/1[,.]234[,.]50 XYZ/);
    expect(formatSignedAmount("-1234.5", "XYZ")).toMatch(/-1[,.]234[,.]50 XYZ/);
  });
});
