import { describe, expect, it } from "vite-plus/test";

import {
  addDecimal,
  canonicalDecimal,
  divideDecimal,
  multiplyDecimal,
  subtractDecimal,
} from "./financial-number.js";

describe("financial decimal boundary", () => {
  it("keeps exact decimal values and removes binary floating-point artifacts", () => {
    expect(addDecimal("0.1", "0.2")).toBe("0.3");
    expect(multiplyDecimal("0.1", "0.2")).toBe("0.02");
    expect(subtractDecimal("100000000000000000000.01", "0.01")).toBe("100000000000000000000");
  });

  it("normalizes equivalent decimal input into canonical non-exponential strings", () => {
    expect(canonicalDecimal("001.2300")).toBe("1.23");
    expect(canonicalDecimal("0.00000000000000000001")).toBe("0.00000000000000000001");
    expect(divideDecimal("1", "3")).toBe("0.33333333333333333333333333333333333333333333333333");
  });
});
