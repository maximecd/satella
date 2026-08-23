import {
  addDecimal,
  canonicalDecimal,
  type ConnectorAccount,
  type ConnectorAsset,
  type ConnectorPosition,
  type ConnectorSnapshot,
} from "@satella-app/connector-core";
import {
  isTradeRepublicJsonObject,
  isTradeRepublicJsonNumber,
  isTradeRepublicJsonString,
  type TradeRepublicJsonObject,
  type TradeRepublicJsonValue,
} from "./wire.js";

export interface TradeRepublicProtocolSnapshot {
  readonly accounts: ReadonlyArray<TradeRepublicJsonValue>;
  readonly complete?: boolean;
  readonly failedAccounts?: ReadonlyArray<TradeRepublicJsonValue>;
}

type RecordValue = TradeRepublicJsonObject;

const isRecord = isTradeRepublicJsonObject;

const text = (value: TradeRepublicJsonValue | undefined): string | undefined => {
  if (isTradeRepublicJsonString(value)) return value.trim() || undefined;
  if (!isTradeRepublicJsonNumber(value)) return undefined;
  const result = String(value).trim();
  return result.length === 0 ? undefined : result;
};

const firstText = (record: RecordValue, ...keys: ReadonlyArray<string>): string | undefined => {
  for (const key of keys) {
    const value = text(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
};

const currency = (record: RecordValue, ...keys: ReadonlyArray<string>): string => {
  const value = firstText(record, ...keys)?.toUpperCase();
  if (value === undefined || !/^[A-Z]{3}$/.test(value)) {
    throw new Error("Trade Republic response returned an invalid currency");
  }
  return value;
};

const decimal = (value: TradeRepublicJsonValue | undefined, label: string): string => {
  const result = text(value);
  if (result === undefined) throw new Error(`Trade Republic response is missing ${label}`);
  try {
    return canonicalDecimal(result);
  } catch {
    throw new Error(`Trade Republic response returned an invalid ${label}`);
  }
};

const arrayValue = (
  record: RecordValue,
  ...keys: ReadonlyArray<string>
): ReadonlyArray<TradeRepublicJsonValue> => {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
};

const securityRows = (record: RecordValue): ReadonlyArray<RecordValue> => {
  const direct = arrayValue(record, "positions", "portfolio", "holdings").filter(isRecord);
  if (direct.length > 0) return direct;
  const categories = record.categories;
  if (!Array.isArray(categories)) return [];
  return categories.flatMap((category) => {
    if (!isRecord(category) || !Array.isArray(category.positions)) return [];
    const categoryType = firstText(category, "categoryType", "type");
    return category.positions.filter(isRecord).map((position) => {
      if (
        categoryType === undefined ||
        position.type !== undefined ||
        position.assetType !== undefined ||
        position.instrumentType !== undefined ||
        position.category !== undefined
      )
        return position;
      return { ...position, type: categoryType };
    });
  });
};

const normalized = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");

const accountNumber = (record: RecordValue, fallback: string) =>
  firstText(record, "accountNumber", "account_number", "number", "id", "accountId") ?? fallback;

const isCashAccount = (record: RecordValue) => {
  if (record.isCashAccount === true || record.cashAccount === true) return true;
  const kind = normalized(firstText(record, "type", "accountType", "kind", "product") ?? "");
  return kind.includes("cash") || kind.includes("checking") || kind.includes("current");
};

const isPea = (record: RecordValue) => {
  const wrapper = normalized(
    firstText(record, "wrapper", "wrapperType", "taxWrapper", "type") ?? "",
  );
  const label = normalized(firstText(record, "name", "label", "displayName") ?? "");
  return wrapper === "tax_wrapper_fr" || wrapper.includes("pea") || label.includes("pea");
};

const accountName = (record: RecordValue, pea: boolean, cash: boolean) => {
  if (pea) return "PEA";
  const label = firstText(record, "name", "label", "displayName", "wrapper");
  if (label !== undefined) return label;
  return cash ? "Cash" : "Trade Republic";
};

const accountType = (record: RecordValue, pea: boolean, cash: boolean) => {
  if (cash) return "checking" as const;
  if (pea) return "brokerage" as const;
  return "brokerage" as const;
};

const instrumentCategory = (record: RecordValue) => {
  if (record.isCrypto === true) return "crypto" as const;
  const kind = normalized(
    firstText(record, "type", "assetType", "instrumentType", "category") ?? "",
  );
  if (kind.includes("crypto") || kind.includes("coin") || kind.includes("token"))
    return "crypto" as const;
  if (kind.includes("private") || kind.includes("unlisted")) return "other" as const;
  if (
    kind.includes("stock") ||
    kind.includes("share") ||
    kind.includes("equity") ||
    kind.includes("etf") ||
    kind.includes("fund") ||
    kind.includes("certificate")
  ) {
    return "stocks_etfs" as const;
  }
  return "other" as const;
};

const isinOf = (record: RecordValue): string | undefined => {
  const value = firstText(record, "isin", "ISIN")?.toUpperCase();
  return value !== undefined && /^[A-Z]{2}[A-Z0-9]{10}$/.test(value) ? value : undefined;
};

const observationTime = (record: RecordValue): string | undefined => {
  for (const key of ["observedAt", "observed_at", "quoteTime", "timestamp", "time"]) {
    const raw = record[key];
    if (isTradeRepublicJsonNumber(raw) && Number.isFinite(raw)) {
      const parsed = new Date(raw < 1_000_000_000_000 ? raw * 1_000 : raw);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    if (isTradeRepublicJsonString(raw)) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }
  return undefined;
};

const quoteOf = (record: RecordValue, fallbackCurrency?: string) => {
  const quote = isRecord(record.quote) ? record.quote : record;
  const price = firstText(quote, "currentPrice", "lastPrice", "price", "last");
  const priceRecord = isRecord(quote.last) ? quote.last : quote;
  const actualPrice = price ?? firstText(priceRecord, "price", "value");
  const iso =
    firstText(quote, "priceCurrency", "quoteCurrency", "currency") ??
    firstText(priceRecord, "currency", "currencyIso") ??
    fallbackCurrency;
  const observedAt = observationTime(quote) ?? observationTime(priceRecord);
  if (actualPrice === undefined || iso === undefined || observedAt === undefined) return undefined;
  if (!/^[A-Z]{3}$/i.test(iso)) return undefined;
  try {
    return { price: canonicalDecimal(actualPrice), currencyIso: iso.toUpperCase(), observedAt };
  } catch {
    return undefined;
  }
};

const averagePriceOf = (record: RecordValue) => {
  const source = isRecord(record.averageBuyIn)
    ? record.averageBuyIn
    : isRecord(record.averageUnitPurchasePrice)
      ? record.averageUnitPurchasePrice
      : record;
  const value = firstText(source, "price", "value", "averageBuyIn", "averagePrice", "avgPrice");
  if (value === undefined) return undefined;
  const iso =
    firstText(source, "currency", "currencyIso", "averagePriceCurrency") ??
    firstText(record, "currency", "currencyIso");
  if (iso === undefined || !/^[A-Z]{3}$/i.test(iso)) return undefined;
  return { price: decimal(value, "average unit purchase price"), currencyIso: iso.toUpperCase() };
};

const instrumentId = (record: RecordValue, fallback: string) =>
  firstText(record, "instrumentId", "instrument_id", "id", "ticker", "symbol") ?? fallback;

const mapSecurity = (
  record: RecordValue,
  index: number,
  fallbackCurrency?: string,
): ConnectorPosition => {
  const isin = isinOf(record);
  const id = instrumentId(record, `unknown-${index}`);
  const externalId = isin === undefined ? `trade-republic:instrument:${id}` : `isin:${isin}`;
  const identifiers: Array<{ readonly type: string; readonly value: string }> = [];
  if (isin !== undefined) identifiers.push({ type: "isin", value: isin });
  identifiers.push({ type: "trade_republic_instrument", value: id });
  const asset: ConnectorAsset = {
    externalId,
    assetCategory: instrumentCategory(record),
    name: firstText(record, "name", "displayName", "description", "title") ?? id,
    identifiers,
  };
  const symbol = firstText(record, "symbol", "ticker");
  if (symbol !== undefined) Object.assign(asset, { symbol });
  const position: ConnectorPosition = {
    asset,
    quantity: decimal(record.quantity ?? record.netSize ?? record.size, "position quantity"),
  };
  const averageUnitPurchasePrice = averagePriceOf(record);
  if (averageUnitPurchasePrice !== undefined) Object.assign(position, { averageUnitPurchasePrice });
  const reportedPrice = quoteOf(record, fallbackCurrency);
  if (reportedPrice !== undefined) Object.assign(position, { reportedPrice });
  return position;
};

const cashRows = (record: RecordValue): ReadonlyArray<RecordValue> => {
  const values = arrayValue(record, "cash", "cashBalances", "balances");
  if (values.length > 0) return values.filter(isRecord);
  const cash = record.cash ?? record.balance ?? record.availableCash;
  if (isRecord(cash)) return [cash];
  if (cash !== undefined) {
    const result: RecordValue = { amount: cash };
    const cashCurrency = record.currency ?? record.baseCurrency;
    if (cashCurrency !== undefined) Object.assign(result, { currency: cashCurrency });
    return [result];
  }
  return [];
};

const mapCashPosition = (record: RecordValue, fallbackCurrency: string): ConnectorPosition => {
  const reportedCurrency = firstText(record, "currency", "currencyIso", "iso");
  const iso =
    reportedCurrency === undefined
      ? fallbackCurrency.toUpperCase()
      : reportedCurrency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso))
    throw new Error("Trade Republic response returned an invalid currency");
  return {
    asset: {
      externalId: `fiat:${iso}`,
      assetCategory: "cash",
      name: iso,
      symbol: iso,
      identifiers: [{ type: "iso_currency", value: iso }],
    },
    quantity: decimal(
      record.amount ?? record.balance ?? record.available ?? record.value,
      "cash balance",
    ),
  };
};

const mapAccount = (
  value: TradeRepublicJsonValue,
  index: number,
  allowFailedPositions = false,
): ConnectorAccount => {
  if (!isRecord(value)) throw new Error("Trade Republic returned an invalid account wrapper");
  if (value.error !== undefined && !allowFailedPositions)
    throw new Error("Trade Republic account wrapper failed");
  const cash = isCashAccount(value);
  const pea = !cash && isPea(value);
  const id = accountNumber(value, `trade-republic:account:${index}`);
  const iso = currency(value, "currency", "baseCurrency", "currencyIso");
  const positions: ConnectorPosition[] = [];
  for (const [positionIndex, raw] of securityRows(value).entries()) {
    try {
      positions.push(mapSecurity(raw, positionIndex, iso));
    } catch (error) {
      if (!allowFailedPositions) throw error;
    }
  }
  for (const rawCash of cashRows(value)) {
    try {
      positions.push(mapCashPosition(rawCash, iso));
    } catch (error) {
      if (!allowFailedPositions) throw error;
    }
  }
  return {
    externalId: id,
    name: accountName(value, pea, cash),
    accountType: accountType(value, pea, cash),
    baseCurrencyIso: iso,
    positions,
  };
};

const rawAccounts = (value: RecordValue): ReadonlyArray<TradeRepublicJsonValue> => {
  const accounts = value.accounts ?? value.accountWrappers ?? value.securitiesAccounts;
  if (!Array.isArray(accounts)) throw new Error("Trade Republic response is missing accounts");
  const cashAccounts = value.cashAccounts;
  return Array.isArray(cashAccounts) ? [...accounts, ...cashAccounts] : accounts;
};

/** Maps the deliberately untrusted protocol envelope into normalized Connector output. */
export const parseTradeRepublicSnapshot = (value: TradeRepublicJsonValue): ConnectorSnapshot => {
  if (!isRecord(value)) throw new Error("Trade Republic returned an unreadable response");
  const entries = rawAccounts(value);
  if (entries.length === 0) throw new Error("Trade Republic returned no accounts");
  let complete = value.complete !== false && value.partial !== true;
  if (Array.isArray(value.failedAccounts) && value.failedAccounts.length > 0) complete = false;
  const accounts: ConnectorAccount[] = [];
  for (const [index, entry] of entries.entries()) {
    try {
      accounts.push(mapAccount(entry, index));
    } catch {
      complete = false;
      try {
        accounts.push(mapAccount(entry, index, true));
      } catch {
        // An account without a valid stable ID or currency cannot be safely represented.
      }
    }
  }
  if (accounts.length === 0) throw new Error("Trade Republic returned no usable accounts");
  // The parser deliberately does not log or include failed raw topics.
  return { accounts, complete };
};

export const mergeCashPositions = (
  positions: ReadonlyArray<ConnectorPosition>,
): ReadonlyArray<ConnectorPosition> => {
  const byAsset = new Map<string, ConnectorPosition>();
  for (const position of positions) {
    const previous = byAsset.get(position.asset.externalId);
    if (previous === undefined) byAsset.set(position.asset.externalId, position);
    else
      byAsset.set(position.asset.externalId, {
        ...previous,
        quantity: addDecimal(previous.quantity, position.quantity),
      });
  }
  return [...byAsset.values()];
};
