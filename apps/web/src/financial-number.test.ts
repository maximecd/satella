import { describe, expect, it } from "vite-plus/test";

import { formatAmount, formatDecimal, formatSignedAmount } from "./financial-number";
import { appLanguage, setAppLanguage } from "./app-language";

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

  it("formats amounts with the separators and symbol position of an explicit locale", () => {
    expect(formatAmount("1234.56", "EUR", "fr")).toMatch(/^1[\s\u00A0\u202F]234,56 ?€$/);
    expect(formatAmount("1234.56", "EUR", "en")).toBe("€1,234.56");
    expect(formatAmount("1234.56", "USD", "fr")).toMatch(/^1[\s\u00A0\u202F]234,56 ?\$$/);
    expect(formatDecimal("-1234.5", { maximumFractionDigits: 2 }, "fr")).toMatch(
      /^-1[\s\u00A0\u202F]234,5$/,
    );
    expect(formatSignedAmount("-1234.5", "XYZ", "fr")).toMatch(/^-1[\s\u00A0\u202F]234,50 XYZ$/);
  });

  it("defaults to the active App language and follows language changes", () => {
    setAppLanguage("fr");
    try {
      expect(formatAmount("1234.56", "EUR")).toMatch(/^1[\s\u00A0\u202F]234,56 ?€$/);
      expect(appLanguage()).toBe("fr");
    } finally {
      setAppLanguage("en");
    }
    expect(formatAmount("1234.56", "EUR")).toBe("€1,234.56");
  });
});
