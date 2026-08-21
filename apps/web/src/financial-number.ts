import { Decimal } from "decimal.js";

type DecimalInstance = Decimal;

const DecimalNumber = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });
const decimalLiteral = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export type DecimalValue = string | number;

const parse = (value: DecimalValue): DecimalInstance => {
  const text = String(value).trim();
  if (!decimalLiteral.test(text)) throw new Error("Expected a decimal value");
  const result = new DecimalNumber(text);
  if (!result.isFinite()) throw new Error("Expected a finite decimal value");
  return result;
};

export const canonicalDecimal = (value: DecimalValue) => parse(value).toFixed();

export const addDecimal = (left: DecimalValue, right: DecimalValue) =>
  parse(left).plus(parse(right)).toFixed();

export const subtractDecimal = (left: DecimalValue, right: DecimalValue) =>
  parse(left).minus(parse(right)).toFixed();

export const multiplyDecimal = (left: DecimalValue, right: DecimalValue) =>
  parse(left).times(parse(right)).toFixed();

export const divideDecimal = (left: DecimalValue, right: DecimalValue) => {
  const divisor = parse(right);
  if (divisor.isZero()) throw new Error("Cannot divide by zero");
  return parse(left).div(divisor).toFixed();
};

export const compareDecimal = (left: DecimalValue, right: DecimalValue) =>
  parse(left).cmp(parse(right));

const localeParts = new Intl.NumberFormat(undefined, { useGrouping: true }).formatToParts(
  1234567.89,
);
const groupingSeparator = localeParts.find((part) => part.type === "group")?.value ?? ",";
const decimalSeparator = localeParts.find((part) => part.type === "decimal")?.value ?? ".";
const minusSign =
  new Intl.NumberFormat(undefined).formatToParts(-1).find((part) => part.type === "minusSign")
    ?.value ?? "-";

const groupInteger = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, groupingSeparator);

export const formatDecimal = (
  value: DecimalValue,
  options: {
    readonly minimumFractionDigits?: number;
    readonly maximumFractionDigits?: number;
  } = {},
) => {
  const maximumFractionDigits = Math.max(options.maximumFractionDigits ?? 8, 0);
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const rounded = parse(value).toFixed(maximumFractionDigits);
  const negative = rounded.startsWith("-");
  const unsigned = negative ? rounded.slice(1) : rounded;
  const [rawInteger, rawFraction = ""] = unsigned.split(".");
  const integer = rawInteger ?? "0";
  const trimmedFraction = rawFraction.replace(/0+$/, "");
  const fraction = `${trimmedFraction}${"0".repeat(
    Math.max(0, minimumFractionDigits - trimmedFraction.length),
  )}`;
  return `${negative ? minusSign : ""}${groupInteger(integer)}${
    fraction.length === 0 ? "" : `${decimalSeparator}${fraction}`
  }`;
};

export const formatAmount = (value: DecimalValue, currencyIso: string) =>
  `${formatDecimal(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyIso}`;

export const formatSignedAmount = (value: DecimalValue, currencyIso: string) =>
  `${compareDecimal(value, "0") > 0 ? "+" : ""}${formatAmount(value, currencyIso)}`;

export const formatQuantity = (value: DecimalValue) => formatDecimal(value);

export const formatMarketPrice = (value: DecimalValue) =>
  formatDecimal(value, { maximumFractionDigits: 4 });

export const formatFxRate = (value: DecimalValue) =>
  formatDecimal(value, { maximumFractionDigits: 6 });
