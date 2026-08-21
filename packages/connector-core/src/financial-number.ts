import { Decimal } from "decimal.js";

const DecimalNumber = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });
const decimalLiteral = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export const canonicalDecimal = (value: string | number): string => {
  const text = String(value).trim();
  if (!decimalLiteral.test(text)) throw new Error("Connector returned an invalid decimal value");
  const result = new DecimalNumber(text);
  if (!result.isFinite()) throw new Error("Connector returned a non-finite decimal value");
  return result.toFixed();
};

export const addDecimal = (left: string, right: string): string =>
  new DecimalNumber(left).plus(new DecimalNumber(right)).toFixed();
