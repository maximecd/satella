import { Decimal } from "decimal.js";

import { appLanguage } from "./app-language";

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

type LocaleSeparators = {
  readonly grouping: string;
  readonly decimal: string;
  readonly minus: string;
};

const separatorsByLocale = new Map<string, LocaleSeparators>();

const localeSeparators = (locale: string): LocaleSeparators => {
  const cached = separatorsByLocale.get(locale);
  if (cached !== undefined) return cached;
  const groupingParts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(
    1234567.89,
  );
  const separators: LocaleSeparators = {
    grouping: groupingParts.find((part) => part.type === "group")?.value ?? ",",
    decimal: groupingParts.find((part) => part.type === "decimal")?.value ?? ".",
    minus:
      new Intl.NumberFormat(locale).formatToParts(-1).find((part) => part.type === "minusSign")
        ?.value ?? "-",
  };
  separatorsByLocale.set(locale, separators);
  return separators;
};

const groupInteger = (value: string, groupingSeparator: string) =>
  value.replace(/\B(?=(\d{3})+(?!\d))/g, groupingSeparator);

export const formatDecimal = (
  value: DecimalValue,
  options: {
    readonly minimumFractionDigits?: number;
    readonly maximumFractionDigits?: number;
  } = {},
  locale: string = appLanguage(),
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
  const { grouping, decimal, minus } = localeSeparators(locale);
  return `${negative ? minus : ""}${groupInteger(integer, grouping)}${
    fraction.length === 0 ? "" : `${decimal}${fraction}`
  }`;
};

export const formatSignedAmount = (value: DecimalValue, currencyIso: string, locale?: string) =>
  `${compareDecimal(value, "0") > 0 ? "+" : ""}${formatAmount(value, currencyIso, locale)}`;

export const formatQuantity = (value: DecimalValue, locale?: string) =>
  formatDecimal(value, {}, locale);

type CurrencyToken =
  | { readonly kind: "currency"; readonly text: string }
  | { readonly kind: "sign" }
  | { readonly kind: "number" };

const currencyTokens = new Map<string, readonly CurrencyToken[] | null>();

// A fiat currency has a displayable symbol when the locale's narrow-symbol
// rendering differs from its ISO code; otherwise amounts keep the code suffix.
// Tokens are derived from a negative sample so the sign's true position in the
// pattern is preserved (for example "-$1.234,56" versus "$-1.234,56").
const currencyLayout = (currencyIso: string, locale: string): readonly CurrencyToken[] | null => {
  const cacheKey = `${locale}|${currencyIso}`;
  const cached = currencyTokens.get(cacheKey);
  if (cached !== undefined) return cached;
  let tokens: readonly CurrencyToken[] | null = null;
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyIso,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const symbol = formatter
      .formatToParts(1234.56)
      .find((part) => part.type === "currency")
      ?.value?.trim();
    if (symbol && symbol.length > 0 && !symbol.match(new RegExp(`^${currencyIso}$`, "i"))) {
      tokens = [];
      for (const part of formatter.formatToParts(-1234.56)) {
        if (part.type === "minusSign" || part.type === "plusSign") {
          if (tokens[tokens.length - 1]?.kind !== "sign") tokens = [...tokens, { kind: "sign" }];
        } else if (part.type === "currency") {
          tokens = [...tokens, { kind: "currency", text: symbol }];
        } else if (tokens[tokens.length - 1]?.kind !== "number") {
          tokens = [...tokens, { kind: "number" }];
        }
      }
    }
  } catch {
    tokens = null;
  }
  currencyTokens.set(cacheKey, tokens);
  return tokens;
};

const renderCurrencyAmount = (numberText: string, currencyIso: string, locale: string) => {
  const tokens = currencyLayout(currencyIso, locale);
  if (tokens === null) return `${numberText} ${currencyIso}`;
  const { minus: minusSign } = localeSeparators(locale);
  const negative = numberText.startsWith(minusSign);
  const unsigned = negative
    ? numberText.slice(minusSign.length)
    : numberText.startsWith("+")
      ? numberText.slice(1)
      : numberText;
  return tokens
    .map((token) =>
      token.kind === "currency"
        ? token.text
        : token.kind === "sign"
          ? negative
            ? minusSign
            : ""
          : unsigned,
    )
    .join("")
    .trim();
};

export const formatAmount = (value: DecimalValue, currencyIso: string, locale?: string) =>
  renderCurrencyAmount(
    formatDecimal(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, locale),
    currencyIso,
    locale ?? appLanguage(),
  );

export const formatWholeAmount = (value: DecimalValue, currencyIso: string, locale?: string) =>
  renderCurrencyAmount(
    formatDecimal(value, { maximumFractionDigits: 0 }, locale),
    currencyIso,
    locale ?? appLanguage(),
  );

export const formatMarketPrice = (value: DecimalValue, locale?: string) =>
  formatDecimal(value, { maximumFractionDigits: 4 }, locale);

export const currencySymbol = (currencyIso: string, locale?: string): string | null => {
  const tokens = currencyLayout(currencyIso, locale ?? appLanguage());
  if (tokens === null) return null;
  const token = tokens.find((entry) => entry.kind === "currency");
  return token !== undefined && token.kind === "currency" ? token.text : null;
};

export const formatMarketPriceAmount = (
  value: DecimalValue,
  currencyIso: string,
  locale?: string,
) => renderCurrencyAmount(formatMarketPrice(value, locale), currencyIso, locale ?? appLanguage());

export const formatFxRate = (value: DecimalValue, locale?: string) =>
  formatDecimal(value, { maximumFractionDigits: 6 }, locale);

export const formatFxAmount = (value: DecimalValue, currencyIso: string, locale?: string) =>
  renderCurrencyAmount(formatFxRate(value, locale), currencyIso, locale ?? appLanguage());
