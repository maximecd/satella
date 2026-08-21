import { HttpClient } from "effect/unstable/http";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import iconSvg from "./icon.svg";
import instructions from "./instructions.md";

import {
  Connector,
  ConnectorAccount,
  ConnectorAuthenticationError,
  ConnectorFetchAccountsError,
  addDecimal,
  canonicalDecimal,
  validateConnectorOutput,
} from "@optimus/connector-core";
import {
  IBKR_FLEX_ORIGIN,
  IbkrTransportError,
  makeIbkrEffectHttpTransport,
  makeIbkrClient,
  type IbkrClient,
  type IbkrHttpTransport,
} from "./client.js";
import { parseFlexXml, type ParsedFlexDocument } from "./parser.js";
import {
  IbkrFlexCredentials,
  type IbkrFlexCashReportCurrency,
  type IbkrFlexOpenPosition,
  type IbkrFlexStatement,
  type IbkrFlexCredentials as IbkrCredentials,
} from "./schemas.js";

const ibkrInstructions = instructions;
const ibkrIcon = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`;

export interface IbkrConnectorOptions<R = HttpClient.HttpClient> {
  readonly transportFactory?: (origin: string) => IbkrHttpTransport<R>;
  readonly maxPollAttempts?: number;
  readonly pollDelayMs?: number;
  readonly maxPollDelayMs?: number;
  readonly maxPollDurationMs?: number;
  readonly sleep?: (milliseconds: number) => Effect.Effect<void>;
}

type IbkrRuntimeOptions<R> = Omit<IbkrConnectorOptions<R>, "transportFactory">;

const transientFlexCodes = new Set([
  "1003",
  "1004",
  "1005",
  "1006",
  "1007",
  "1008",
  "1009",
  "1019",
  "1021",
]);

const securityCategories = new Set([
  "BILL",
  "BOND",
  "CFD",
  "CMDTY",
  "EVENT_FORECASTX",
  "FOP",
  "FSFOP",
  "FSOPT",
  "FUND",
  "FUT",
  "FXCFD",
  "FXFWD",
  "IBGNOTE",
  "IOPT",
  "OPT",
  "STK",
  "WAR",
]);

const symbolCategories = new Set(["STK", "FUND", "CRYPTO"]);

const stocksAndEtfs = new Set(["STK", "FUND"]);
const bonds = new Set(["BILL", "BOND", "IBGNOTE"]);
const derivatives = new Set([
  "CFD",
  "FOP",
  "FSFOP",
  "FSOPT",
  "FUT",
  "FXCFD",
  "FXFWD",
  "IOPT",
  "OPT",
  "WAR",
]);

const ibkrAssetCategory = (category: string) => {
  if (stocksAndEtfs.has(category)) return "stocks_etfs" as const;
  if (bonds.has(category)) return "other" as const;
  if (category === "CRYPTO") return "crypto" as const;
  if (derivatives.has(category)) return "other" as const;
  if (category === "CMDTY") return "other" as const;
  return "other" as const;
};

const trimOptional = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const required = (value: string | undefined, label: string): string => {
  const result = trimOptional(value);
  if (result === undefined) throw new Error(`IBKR Flex report is missing ${label}`);
  return result;
};

const finiteNumber = (value: string | undefined, label: string): string => {
  const text = required(value, label);
  try {
    return canonicalDecimal(text);
  } catch {
    throw new Error(`IBKR Flex report returned an invalid ${label}`);
  }
};

const accountIdMatches = (nested: string | undefined, accountId: string, field: string) => {
  const value = trimOptional(nested);
  if (value !== undefined && value !== accountId) {
    throw new Error(`IBKR Flex report has a conflicting ${field} account ID`);
  }
};

const currency = (value: string | undefined, label: string): string => {
  const result = required(value, label).toUpperCase();
  if (!/^[A-Z]{3}$/.test(result)) throw new Error(`IBKR Flex report returned an invalid ${label}`);
  return result;
};

const identifierKey = (type: string, value: string) => `${type}\u0000${value}`;

const assetIdentifiers = (row: IbkrFlexOpenPosition, conid: string) => {
  const identifiers: Array<{ readonly type: string; readonly value: string }> = [
    { type: "ibkr_conid", value: conid },
  ];
  const seen = new Set([identifierKey("ibkr_conid", conid)]);
  const add = (type: string, value: string | undefined) => {
    const normalized = trimOptional(value);
    if (normalized === undefined) return;
    const key = identifierKey(type, normalized);
    if (seen.has(key)) return;
    seen.add(key);
    identifiers.push({ type, value: normalized });
  };
  add("isin", row.isin);
  add("cusip", row.cusip);
  add("figi", row.figi);
  const securityId = trimOptional(row.securityID);
  const securityIdType = trimOptional(row.securityIDType)
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (
    securityId !== undefined &&
    securityIdType !== undefined &&
    !new Set(["isin", "cusip", "figi"]).has(securityIdType)
  ) {
    add(`ibkr_security_${securityIdType}`, securityId);
  }
  return identifiers;
};

interface PositionGroup {
  readonly category: string;
  readonly name: string;
  readonly symbol?: string;
  readonly identifiers: ReadonlyArray<{ readonly type: string; readonly value: string }>;
  readonly modes: Set<string>;
  quantity: string;
  averageUnitPurchasePrice?: {
    readonly price: string;
    readonly currencyIso: string;
  };
}

const mapStatement = (statement: IbkrFlexStatement): ConnectorAccount => {
  const accountId = required(statement.accountId, "statement account ID");
  if (!statement.hasOpenPositions) throw new Error("IBKR Flex report is missing OpenPositions");
  if (!statement.hasCashReport) throw new Error("IBKR Flex report is missing CashReport");
  const info = statement.accountInformation;
  if (info === undefined) throw new Error("IBKR Flex report is missing AccountInformation");
  accountIdMatches(info.accountId, accountId, "AccountInformation");
  const baseCurrency = currency(info.currency, "base currency");
  const accountAlias = trimOptional(info.acctAlias);
  const name =
    accountAlias === undefined || accountAlias === accountId
      ? accountId
      : `${accountAlias} (${accountId})`;

  const cashByCurrency = new Map<string, string>();
  let baseSummaryRow: IbkrFlexCashReportCurrency | undefined;
  for (const row of statement.cashReportCurrencies) {
    accountIdMatches(row.accountId, accountId, "CashReportCurrency");
    const rowCurrency = trimOptional(row.currency)?.toUpperCase();
    if (rowCurrency === undefined) continue;
    if (rowCurrency === "BASE_SUMMARY") {
      // Base Currency Summary is the only cash row emitted when Currency
      // Breakout is not selected. Keep it as a fallback and validate it only
      // if there are no per-currency rows to prefer.
      baseSummaryRow ??= row;
      continue;
    }
    if (!/^[A-Z]{3}$/.test(rowCurrency)) {
      throw new Error("IBKR Flex report returned an invalid cash currency");
    }
    const amount = finiteNumber(row.endingCash, `ending cash for ${rowCurrency}`);
    cashByCurrency.set(rowCurrency, addDecimal(cashByCurrency.get(rowCurrency) ?? "0", amount));
  }
  if (cashByCurrency.size === 0) {
    if (baseSummaryRow === undefined) {
      throw new Error(
        "IBKR Flex report has no usable cash rows; select Base Currency Summary or Currency Breakout",
      );
    }
    cashByCurrency.set(
      baseCurrency,
      finiteNumber(baseSummaryRow.endingCash, "base-currency ending cash"),
    );
  }
  if (!cashByCurrency.has(baseCurrency)) {
    throw new Error(`IBKR Flex report is missing the base-currency cash row for ${baseCurrency}`);
  }

  const groups = new Map<string, PositionGroup>();
  for (const row of statement.openPositions) {
    accountIdMatches(row.accountId, accountId, "OpenPosition");
    const category = required(row.assetCategory, "open-position asset category").toUpperCase();
    if (category === "CASH") continue;
    if (category !== "CRYPTO" && !securityCategories.has(category)) {
      throw new Error(`IBKR Flex report returned unsupported asset category ${category}`);
    }
    const conid = required(row.conid, "open-position conid");
    if (!/^\d+$/.test(conid)) throw new Error("IBKR Flex report returned an invalid conid");
    const quantity = finiteNumber(row.position, `position for conid ${conid}`);
    const name = trimOptional(row.description) ?? trimOptional(row.symbol) ?? `IBKR ${conid}`;
    const symbol = symbolCategories.has(category) ? trimOptional(row.symbol) : undefined;
    const identifiers = assetIdentifiers(row, conid);
    const mode = required(row.levelOfDetail, `level of detail for conid ${conid}`).toUpperCase();
    if (mode !== "SUMMARY" && mode !== "LOT") {
      throw new Error(`IBKR Flex report returned unsupported level of detail for conid ${conid}`);
    }
    // Cost Basis Price is an average unit price only on the Summary row. Lot
    // rows contain lot-specific prices and must not be treated as the
    // authoritative average for the whole Position.
    const costBasisPrice =
      mode === "SUMMARY" && trimOptional(row.costBasisPrice) !== undefined
        ? {
            price: finiteNumber(row.costBasisPrice, `cost basis price for conid ${conid}`),
            currencyIso: currency(row.currency, `position currency for conid ${conid}`),
          }
        : undefined;
    const modeKey = mode;
    const externalId = `ibkr:conid:${conid}`;
    const previous = groups.get(externalId);
    if (previous === undefined) {
      const group: PositionGroup = {
        category,
        name,
        identifiers,
        modes: new Set([modeKey]),
        quantity,
      };
      if (symbol !== undefined) Object.assign(group, { symbol });
      if (costBasisPrice !== undefined) {
        Object.assign(group, { averageUnitPurchasePrice: costBasisPrice });
      }
      groups.set(externalId, group);
      continue;
    }
    if (previous.category !== category || previous.name !== name || previous.symbol !== symbol) {
      throw new Error(`IBKR Flex report returned conflicting definitions for conid ${conid}`);
    }
    if (
      (previous.modes.has("SUMMARY") && modeKey === "LOT") ||
      (previous.modes.has("LOT") && modeKey === "SUMMARY")
    ) {
      throw new Error(`IBKR Flex report mixes Summary and Lot rows for conid ${conid}`);
    }
    previous.modes.add(modeKey);
    previous.quantity = addDecimal(previous.quantity, quantity);
    if (costBasisPrice !== undefined) {
      if (
        previous.averageUnitPurchasePrice !== undefined &&
        (previous.averageUnitPurchasePrice.price !== costBasisPrice.price ||
          previous.averageUnitPurchasePrice.currencyIso !== costBasisPrice.currencyIso)
      ) {
        throw new Error(`IBKR Flex report returned conflicting cost basis for conid ${conid}`);
      }
      previous.averageUnitPurchasePrice = costBasisPrice;
    }
    if (JSON.stringify(previous.identifiers) !== JSON.stringify(identifiers)) {
      throw new Error(`IBKR Flex report returned conflicting identifiers for conid ${conid}`);
    }
  }

  const positions: ConnectorAccount["positions"][number][] = [];
  for (const [iso, quantity] of cashByCurrency) {
    if (quantity === "0") continue;
    positions.push({
      asset: {
        externalId: `ibkr:currency:${iso}`,
        assetCategory: "cash",
        name: iso,
        symbol: iso,
        identifiers: [{ type: "iso_currency", value: iso }],
      },
      quantity,
    });
  }
  for (const [externalId, group] of groups) {
    if (group.quantity === "0") continue;
    const asset = {
      externalId,
      assetCategory: ibkrAssetCategory(group.category),
      name: group.name,
      identifiers: group.identifiers,
    };
    if (group.symbol !== undefined) Object.assign(asset, { symbol: group.symbol });
    const position = {
      asset,
      quantity: group.quantity,
    };
    if (group.averageUnitPurchasePrice !== undefined) {
      Object.assign(position, {
        averageUnitPurchasePrice: group.averageUnitPurchasePrice,
      });
    }
    positions.push(position);
  }
  return {
    externalId: accountId,
    name,
    baseCurrencyIso: baseCurrency,
    positions,
  };
};

const mapReport = (document: ParsedFlexDocument): ReadonlyArray<ConnectorAccount> => {
  if (document.kind !== "report") throw new Error("IBKR Flex response was not an account report");
  if (document.reportType !== undefined && document.reportType.trim().toUpperCase() !== "AF") {
    throw new Error("IBKR Flex response was not an Activity Flex report");
  }
  const accountIds = new Set<string>();
  return document.statements.map((statement) => {
    const account = mapStatement(statement);
    if (accountIds.has(account.externalId)) {
      throw new Error("IBKR Flex report contains duplicate statement account IDs");
    }
    accountIds.add(account.externalId);
    return account;
  });
};

const authCategoryForCode = (code: string): ConnectorAuthenticationError["category"] => {
  if (code === "1018") return "rate_limit";
  if (code === "1011" || code === "1013" || code === "1016") return "insufficient_permission";
  if (code === "1012" || code === "1014" || code === "1015") return "invalid_credentials";
  return "invalid_response";
};

const fetchCategoryForCode = (code: string): ConnectorFetchAccountsError["category"] => {
  if (code === "1018") return "rate_limit";
  if (code === "1012" || code === "1015") return "authentication_expired";
  return "invalid_response";
};

function transportCategory(
  cause: IbkrTransportError,
  phase: "authentication",
): ConnectorAuthenticationError["category"];
function transportCategory(
  cause: IbkrTransportError,
  phase: "fetch",
): ConnectorFetchAccountsError["category"];
function transportCategory(
  cause: IbkrTransportError,
  phase: "authentication" | "fetch",
): ConnectorAuthenticationError["category"] | ConnectorFetchAccountsError["category"] {
  if (cause.status === 429) return "rate_limit";
  if (cause.status === 401 || cause.status === 403) {
    return phase === "authentication" ? "invalid_credentials" : "authentication_expired";
  }
  if (cause.message.includes("timed out")) return "timeout";
  return cause.transient ? "network" : "invalid_response";
}

const authenticationError = (
  cause: unknown,
  message = "IBKR Flex authentication failed",
): ConnectorAuthenticationError =>
  new ConnectorAuthenticationError({
    category:
      cause instanceof IbkrTransportError
        ? transportCategory(cause, "authentication")
        : "invalid_response",
    message:
      message === "IBKR Flex authentication failed" && cause instanceof IbkrTransportError
        ? cause.message
        : message,
  });

const fetchError = (
  cause: unknown,
  message = "IBKR Flex account fetch failed",
): ConnectorFetchAccountsError =>
  new ConnectorFetchAccountsError({
    category:
      cause instanceof IbkrTransportError ? transportCategory(cause, "fetch") : "invalid_response",
    message:
      message === "IBKR Flex account fetch failed" && cause instanceof IbkrTransportError
        ? cause.message
        : message,
  });

const decodeDocument = (body: string): ParsedFlexDocument => {
  try {
    return parseFlexXml(body);
  } catch (cause) {
    // Parser errors are already provider-neutral and contain no response
    // payload. Retaining the reason is essential when diagnosing a query that
    // returns a valid XML envelope with an unexpected shape.
    throw new Error(
      cause instanceof Error ? cause.message : "IBKR Flex returned malformed or unsupported XML",
    );
  }
};

const ensureSendSuccess = (document: ParsedFlexDocument): string => {
  if (document.kind !== "response") throw new Error("IBKR Flex SendRequest returned a report");
  const status = document.envelope.status?.trim().toLowerCase();
  if (status !== "success") {
    const code = trimOptional(document.envelope.errorCode);
    const category = code === undefined ? "invalid_response" : authCategoryForCode(code);
    throw Object.assign(
      new Error(
        code === undefined
          ? "IBKR Flex rejected the report request"
          : `IBKR Flex rejected the report request (Flex error ${code})`,
      ),
      {
        flexCode: code,
        flexCategory: category,
      },
    );
  }
  const referenceCode = required(document.envelope.referenceCode, "Flex reference code");
  if (!/^\d+$/.test(referenceCode)) throw new Error("IBKR Flex returned an invalid reference code");
  return referenceCode;
};

interface FlexErrorFields {
  readonly flexCode?: unknown;
  readonly flexCategory?: unknown;
}

const isFlexErrorFields = (cause: unknown): cause is FlexErrorFields =>
  cause !== null && Object.prototype.toString.call(cause) === "[object Object]";

const flexCodeOf = (cause: unknown): string | undefined =>
  isFlexErrorFields(cause) && "flexCode" in cause
    ? trimOptional(String(cause.flexCode))
    : undefined;

const flexCategoryOf = (cause: unknown): ConnectorAuthenticationError["category"] | undefined =>
  isFlexErrorFields(cause) && "flexCategory" in cause
    ? authCategoryForCode(String(cause.flexCategory))
    : undefined;

const authenticateWith = <R>(
  credentials: IbkrCredentials,
  client: IbkrClient<R>,
  options: IbkrRuntimeOptions<R>,
): Effect.Effect<
  {
    readonly fetchAccounts: () => Effect.Effect<
      ReadonlyArray<ConnectorAccount>,
      ConnectorFetchAccountsError,
      R
    >;
  },
  ConnectorAuthenticationError,
  R
> =>
  Effect.gen(function* () {
    const referenceCode = yield* client.sendRequest(credentials).pipe(
      Effect.mapError((cause) => authenticationError(cause)),
      Effect.flatMap((body) =>
        Effect.try({
          try: () => ensureSendSuccess(decodeDocument(body)),
          catch: (cause) => {
            const code = flexCodeOf(cause);
            const category = flexCategoryOf(cause);
            return new ConnectorAuthenticationError({
              category:
                category ?? (code === undefined ? "invalid_response" : authCategoryForCode(code)),
              message:
                code === "1014"
                  ? `IBKR rejected the Activity Query ID; check the Flex Query configuration${code === undefined ? "" : ` (Flex error ${code})`}`
                  : `IBKR rejected the Flex report request${code === undefined ? "" : ` (Flex error ${code})`}`,
            });
          },
        }),
      ),
    );

    return {
      fetchAccounts: () =>
        Effect.gen(function* () {
          const maxAttempts = Math.max(1, Math.floor(options.maxPollAttempts ?? 8));
          const initialDelay = Math.max(0, options.pollDelayMs ?? 1_000);
          const maxDelay = Math.max(initialDelay, options.maxPollDelayMs ?? 10_000);
          const maxDuration = Math.max(0, options.maxPollDurationMs ?? 60_000);
          const sleep =
            options.sleep ??
            ((milliseconds: number) => Effect.sleep(Duration.millis(milliseconds)));
          const startedAt = Date.now();
          let delay = initialDelay;

          for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const body = yield* client
              .getStatement({ token: credentials.token, referenceCode })
              .pipe(Effect.mapError((cause) => fetchError(cause)));
            let document: ParsedFlexDocument;
            try {
              document = decodeDocument(body);
            } catch (cause) {
              return yield* Effect.fail(
                fetchError(
                  undefined,
                  cause instanceof Error
                    ? cause.message
                    : "IBKR returned malformed or unsupported XML",
                ),
              );
            }
            if (document.kind === "report") {
              return yield* Effect.try({
                try: () => mapReport(document),
                catch: (cause) =>
                  fetchError(cause, cause instanceof Error ? cause.message : undefined),
              }).pipe(Effect.flatMap(validateConnectorOutput));
            }
            const code = trimOptional(document.envelope.errorCode);
            if (code === undefined || !transientFlexCodes.has(code)) {
              const category = code === undefined ? "invalid_response" : fetchCategoryForCode(code);
              return yield* Effect.fail(
                new ConnectorFetchAccountsError({
                  category,
                  message:
                    code === "1017"
                      ? `IBKR generated a report but it could not be retrieved${code === undefined ? "" : ` (Flex error ${code})`}`
                      : `IBKR rejected the generated Flex report${code === undefined ? "" : ` (Flex error ${code})`}`,
                }),
              );
            }
            const elapsed = Date.now() - startedAt;
            if (attempt + 1 >= maxAttempts || elapsed + delay > maxDuration) {
              return yield* Effect.fail(
                new ConnectorFetchAccountsError({
                  category: "timeout",
                  message: "IBKR Flex report was not ready before the retrieval deadline",
                }),
              );
            }
            yield* sleep(delay);
            delay = Math.min(maxDelay, delay === 0 ? 1_000 : delay * 2);
          }
          return yield* Effect.fail(
            new ConnectorFetchAccountsError({
              category: "timeout",
              message: "IBKR Flex report was not ready before the retrieval deadline",
            }),
          );
        }),
    };
  });

const createIbkrConnector = <R>(
  options: IbkrRuntimeOptions<R>,
  transport: IbkrHttpTransport<R>,
): Connector<IbkrCredentials, R> => ({
  id: "ibkr",
  name: "Interactive Brokers",
  icon: ibkrIcon,
  instructions: ibkrInstructions,
  assetCategories: ["stocks_etfs", "crypto", "cash", "other"],
  credentialFields: [
    {
      key: "token",
      label: "Flex token",
      kind: "password",
      required: true,
      helpText: "Create a read-only Flex Web Service token in IBKR Client Portal.",
    },
    {
      key: "queryId",
      label: "Activity Query ID",
      kind: "text",
      required: true,
      helpText:
        "Use the ID of an Activity Flex Query configured for XML and Base Currency Summary (or Currency Breakout for multi-currency cash).",
    },
  ],
  credentialsSchema: IbkrFlexCredentials,
  authenticate: (input) =>
    Effect.gen(function* () {
      const credentials = yield* Schema.decodeUnknownEffect(IbkrFlexCredentials)(input).pipe(
        Effect.mapError(() => authenticationError(undefined, "IBKR Flex credentials are invalid")),
      );
      return yield* authenticateWith(credentials, makeIbkrClient({ transport }), options);
    }),
});

export function makeIbkrConnector(): Connector<IbkrCredentials, HttpClient.HttpClient>;
export function makeIbkrConnector<R>(
  options: IbkrConnectorOptions<R>,
): Connector<IbkrCredentials, R>;
export function makeIbkrConnector<R>(
  options: IbkrConnectorOptions<R> = {},
): Connector<IbkrCredentials, R> | Connector<IbkrCredentials, HttpClient.HttpClient> {
  const { transportFactory, ...runtimeOptions } = options;
  if (transportFactory !== undefined) {
    return createIbkrConnector(runtimeOptions, transportFactory(IBKR_FLEX_ORIGIN));
  }
  return createIbkrConnector(runtimeOptions, makeIbkrEffectHttpTransport(IBKR_FLEX_ORIGIN));
}

export const IbkrConnector = makeIbkrConnector();
