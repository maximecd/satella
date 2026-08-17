import { describe, expect, it } from "vite-plus/test";

import { formatAmount, formatDecimal } from "./financial-number";

describe("web financial presentation boundary", () => {
  it("rounds and groups large decimal values without converting them to binary floats", () => {
    expect(
      formatDecimal("999999999999999999999.99", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ).toMatch(/999[,.]999[,.]999[,.]999[,.]999[,.]999[,.]999[,.]99/);
    expect(formatAmount("0.1", "USD")).toMatch(/0[,.]10 USD/);
  });
});
