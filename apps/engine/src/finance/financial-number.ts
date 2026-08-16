import * as DecimalModule from "decimal.js";
import * as Schema from "effect/Schema";

/**
 * Financial values cross the engine boundary as canonical decimal strings.
 * Decimal.js is intentionally confined to this module so the rest of the
 * finance domain does not depend on its mutable numeric representation.
 */
export type DecimalString = string;
/** Inputs are decimal text so the API never has to transport binary floats. */
export type DecimalInput = string;

/** Canonical decimal strings use base-10 notation without a signless exponent. */
export const DecimalString = Schema.String.check(
  Schema.isPattern(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, {
    message: "Expected a canonical decimal string",
  }),
);
export const DecimalInput = Schema.String.check(
  Schema.isPattern(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/, {
    message: "Expected a decimal value",
  }),
);

type DecimalInstance = {
  isFinite(): boolean;
  isZero(): boolean;
  toFixed(): string;
  plus(value: string | number | DecimalInstance): DecimalInstance;
  minus(value: string | number | DecimalInstance): DecimalInstance;
  times(value: string | number | DecimalInstance): DecimalInstance;
  div(value: string | number | DecimalInstance): DecimalInstance;
  cmp(value: string | number | DecimalInstance): number;
};

type DecimalConstructor = {
  new (value: string | number): DecimalInstance;
  clone(config: { precision: number; rounding: number }): DecimalConstructor;
  ROUND_HALF_UP: number;
};

const Decimal = (DecimalModule.default ?? DecimalModule) as unknown as DecimalConstructor;
const DecimalNumber = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
});

const decimalLiteral = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

const parseDecimal = (value: DecimalInput): DecimalInstance => {
  const text = value.trim();
  if (!decimalLiteral.test(text)) throw new Error("Financial values must be decimal numbers");
  const result = new DecimalNumber(text);
  if (!result.isFinite()) throw new Error("Financial values must be finite");
  return result;
};

/** Converts a decimal input to a non-exponential, normalized decimal string. */
export const canonicalDecimal = (value: DecimalInput): DecimalString =>
  parseDecimal(value).toFixed();

export const addDecimal = (left: DecimalInput, right: DecimalInput): DecimalString =>
  parseDecimal(left).plus(parseDecimal(right)).toFixed();

export const subtractDecimal = (left: DecimalInput, right: DecimalInput): DecimalString =>
  parseDecimal(left).minus(parseDecimal(right)).toFixed();

export const multiplyDecimal = (left: DecimalInput, right: DecimalInput): DecimalString =>
  parseDecimal(left).times(parseDecimal(right)).toFixed();

export const divideDecimal = (left: DecimalInput, right: DecimalInput): DecimalString => {
  const divisor = parseDecimal(right);
  if (divisor.isZero()) throw new Error("Financial values cannot be divided by zero");
  return parseDecimal(left).div(divisor).toFixed();
};

export const compareDecimal = (left: DecimalInput, right: DecimalInput) =>
  parseDecimal(left).cmp(parseDecimal(right));

export const isPositiveDecimal = (value: DecimalInput) => compareDecimal(value, "0") > 0;

export const isZeroDecimal = (value: DecimalInput) => compareDecimal(value, "0") === 0;

export const isNegativeDecimal = (value: DecimalInput) => compareDecimal(value, "0") < 0;

export const sumDecimals = (values: Iterable<DecimalInput>): DecimalString => {
  let total = new DecimalNumber(0);
  for (const value of values) total = total.plus(parseDecimal(value));
  return total.toFixed();
};
