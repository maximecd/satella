import { randomUUID } from "node:crypto";

import { HttpBody, HttpClient, HttpClientRequest } from "effect/unstable/http";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import WebSocket, { type RawData } from "ws";

import { describeErrorBody } from "@satella-app/connector-core";

import type { TradeRepublicSession } from "./schemas.js";
import {
  isTradeRepublicJsonNumber,
  isTradeRepublicJsonObject,
  isTradeRepublicJsonString,
  type TradeRepublicJsonObject,
  type TradeRepublicJsonValue,
} from "./wire.js";

export const TRADE_REPUBLIC_WEB_ORIGIN = "https://app.traderepublic.com";
export const TRADE_REPUBLIC_API_ORIGIN = "https://api.traderepublic.com";
export const TRADE_REPUBLIC_WEBSOCKET_ORIGIN = "wss://api.traderepublic.com/";
export const TRADE_REPUBLIC_PROTOCOL_VERSION = "31";

export interface TradeRepublicTransportResponse {
  readonly snapshot: TradeRepublicJsonValue;
  readonly session?: TradeRepublicSession;
}

export type TradeRepublicTransportValue = TradeRepublicJsonValue | TradeRepublicTransportResponse;

const isObjectValue = (
  value: TradeRepublicTransportValue,
): value is TradeRepublicJsonObject | TradeRepublicTransportResponse =>
  value !== null &&
  Object.prototype.toString.call(value) === "[object Object]" &&
  !Array.isArray(value);

export const isTradeRepublicTransportResponse = (
  value: TradeRepublicTransportValue,
): value is TradeRepublicTransportResponse => isObjectValue(value) && "snapshot" in value;

export class TradeRepublicTransportError extends Error {
  readonly _tag = "TradeRepublicTransportError" as const;
  readonly transient: boolean;
  readonly status?: number;

  constructor(message: string, options: TransportErrorOptions = { transient: false }) {
    super(message);
    this.name = "TradeRepublicTransportError";
    this.transient = options.transient;
    if (options.status !== undefined) this.status = options.status;
  }
}

interface TransportErrorOptions {
  readonly transient: boolean;
  readonly status?: number;
}

export interface TradeRepublicTransport<R = never> {
  readonly fetchSnapshot: (
    session: TradeRepublicSession,
  ) => Effect.Effect<
    TradeRepublicJsonValue | TradeRepublicTransportResponse,
    TradeRepublicTransportError,
    R
  >;
}

export type TradeRepublicWebSocketFactory = (
  url: string,
  options: {
    readonly headers: Readonly<Record<string, string>>;
    readonly handshakeTimeout: number;
  },
) => TradeRepublicSocket;

interface TradeRepublicSocket {
  readonly readyState: number;
  on(
    event: "upgrade",
    listener: (response: {
      readonly headers: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>;
    }) => void,
  ): this;
  on(event: "open" | "error" | "close", listener: () => void): this;
  on(event: "message", listener: (raw: RawData) => void): this;
  send(message: string): void;
  close(): void;
}

const transientStatus = (status: number) =>
  status === 408 || status === 425 || status === 429 || status >= 500;

const isRecord = isTradeRepublicJsonObject;

const text = (value: TradeRepublicJsonValue | undefined): string | undefined => {
  if (isTradeRepublicJsonString(value)) return value.trim() || undefined;
  if (!isTradeRepublicJsonNumber(value)) return undefined;
  const result = String(value).trim();
  return result.length === 0 ? undefined : result;
};

const payloadOf = (value: TradeRepublicJsonObject): TradeRepublicJsonValue => {
  const payload = value.payload ?? value.data ?? value.result;
  return payload === undefined ? value : payload;
};

const dataOf = (value: TradeRepublicJsonValue): TradeRepublicJsonValue => {
  if (!isRecord(value)) return value;
  return value.data ?? value.payload ?? value.result ?? value;
};

const accountNumbersFromSession = (sessionToken: string): ReadonlyArray<string> => {
  try {
    const encoded = sessionToken.split(".")[1];
    if (encoded === undefined) return [];
    const payload: TradeRepublicJsonValue = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    if (!isRecord(payload) || !isRecord(payload.act) || !isRecord(payload.act.acc)) return [];
    const owner = payload.act.acc.owner;
    const values: string[] = [];
    const visit = (value: TradeRepublicJsonValue) => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (!isRecord(value)) return;
      for (const key of ["accountNumber", "account_number", "number"]) {
        const candidate = text(value[key]);
        if (candidate !== undefined) values.push(candidate);
      }
      for (const child of Object.values(value)) visit(child);
    };
    if (owner !== undefined) visit(owner);
    return [...new Set(values)];
  } catch {
    return [];
  }
};

interface Subscription {
  readonly id: string;
  readonly topic: "availableCash" | "compactPortfolioByType" | "ticker";
  readonly accountNumber?: string;
  readonly instrumentId?: string;
  readonly parameters: SubscriptionParameters;
}

interface SubscriptionParameters {
  readonly secAccNo?: string;
  readonly id?: string;
}

const subscriptionsFor = (session: TradeRepublicSession): ReadonlyArray<Subscription> => {
  const accountNumbers = accountNumbersFromSession(session.sessionToken);
  const targets = accountNumbers.length === 0 ? [undefined] : accountNumbers;
  const subscription = (
    topic: Subscription["topic"],
    accountNumber: string | undefined,
    parameters: SubscriptionParameters = {},
    instrumentId?: string,
  ): Subscription => {
    const result: Subscription = { id: randomUUID(), topic, parameters };
    if (accountNumber !== undefined) Object.assign(result, { accountNumber });
    if (instrumentId !== undefined) Object.assign(result, { instrumentId });
    return result;
  };
  return [
    subscription("availableCash", undefined),
    ...targets.map((accountNumber) =>
      subscription(
        "compactPortfolioByType",
        accountNumber,
        accountNumber === undefined ? {} : { secAccNo: accountNumber },
      ),
    ),
  ];
};

const positionRows = (value: TradeRepublicJsonValue): ReadonlyArray<TradeRepublicJsonObject> => {
  const rows: TradeRepublicJsonObject[] = [];
  const visit = (candidate: TradeRepublicJsonValue) => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (!isRecord(candidate)) return;
    for (const key of ["accounts", "accountWrappers", "securitiesAccounts"]) {
      const nested = candidate[key];
      if (Array.isArray(nested)) for (const item of nested) visit(item);
    }
    for (const key of ["positions", "portfolio", "holdings"]) {
      const nested = candidate[key];
      if (Array.isArray(nested)) {
        for (const item of nested) if (isRecord(item)) rows.push(item);
      }
    }
    const categories = candidate.categories;
    if (Array.isArray(categories)) {
      for (const category of categories) {
        if (!isRecord(category)) continue;
        const nested = category.positions;
        if (Array.isArray(nested)) {
          for (const item of nested) if (isRecord(item)) rows.push(item);
        }
      }
    }
    if (
      candidate.instrumentId !== undefined ||
      candidate.instrument_id !== undefined ||
      candidate.isin !== undefined
    )
      rows.push(candidate);
  };
  visit(value);
  return rows;
};

const instrumentText = (record: TradeRepublicJsonObject, ...keys: ReadonlyArray<string>) => {
  for (const key of keys) {
    const value = text(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
};

const tickerIdOf = (record: TradeRepublicJsonObject): string | undefined => {
  const direct = instrumentText(record, "tickerId", "ticker_id", "instrumentId", "instrument_id");
  if (direct?.includes(".")) return direct;
  const isin = instrumentText(record, "isin", "ISIN");
  if (isin !== undefined) {
    const exchange = instrumentText(record, "exchangeId", "exchange", "market") ?? "LSX";
    return `${isin}.${exchange}`;
  }
  return direct;
};

const isPrivatePosition = (record: TradeRepublicJsonObject) => {
  const kind = instrumentText(
    record,
    "type",
    "assetType",
    "instrumentType",
    "category",
  )?.toLowerCase();
  return kind?.includes("private") === true || kind?.includes("unlisted") === true;
};

const topicRows = (value: TradeRepublicJsonValue): ReadonlyArray<TradeRepublicJsonValue> => {
  const data = dataOf(value);
  if (Array.isArray(data)) return data;
  if (isRecord(data)) {
    for (const key of [
      "accounts",
      "accountWrappers",
      "securitiesAccounts",
      "cashAccounts",
      "positions",
      "holdings",
      "items",
    ]) {
      if (Array.isArray(data[key])) return data[key];
    }
    return [data];
  }
  return [];
};

const snapshotFromTopics = (
  topics: ReadonlyArray<{
    readonly topic: Subscription["topic"];
    readonly value: TradeRepublicJsonValue;
    readonly accountNumber?: string;
  }>,
  complete = true,
): TradeRepublicJsonValue | undefined => {
  const direct = topics.find(({ topic, value }) => {
    if (topic === "ticker") return false;
    const data = dataOf(value);
    return (
      isRecord(data) &&
      (Array.isArray(data.accounts) ||
        Array.isArray(data.accountWrappers) ||
        Array.isArray(data.securitiesAccounts))
    );
  });
  const directAccounts = direct === undefined ? undefined : dataOf(direct.value);

  const accounts = topics
    .filter(({ topic }) => topic === "compactPortfolioByType")
    .flatMap(({ value, accountNumber }) =>
      topicRows(value).map((row) => {
        if (!isRecord(row) || accountNumber === undefined || row.accountNumber !== undefined)
          return row;
        return { ...row, accountNumber };
      }),
    );
  const cashAccounts = topics
    .filter(({ topic }) => topic === "availableCash")
    .flatMap(({ value, accountNumber }) =>
      topicRows(value).map((row) => {
        if (!isRecord(row) || accountNumber === undefined || row.accountNumber !== undefined)
          return row;
        return { ...row, accountNumber };
      }),
    );
  if (directAccounts === undefined && accounts.length === 0 && cashAccounts.length === 0)
    return undefined;
  const tickerByInstrument = new Map<string, TradeRepublicJsonValue>();
  for (const topic of topics.filter(({ topic }) => topic === "ticker")) {
    if (!isRecord(topic.value)) continue;
    const tickerId = instrumentText(
      topic.value,
      "tickerId",
      "ticker_id",
      "instrumentId",
      "instrument_id",
    );
    if (tickerId === undefined) continue;
    tickerByInstrument.set(tickerId, topic.value);
    const [isin] = tickerId.split(".");
    if (isin !== undefined && isin !== tickerId) tickerByInstrument.set(isin, topic.value);
  }
  const directAccountRows =
    directAccounts !== undefined && isRecord(directAccounts)
      ? ["accounts", "accountWrappers", "securitiesAccounts"]
          .map((key) => directAccounts[key])
          .find((value): value is ReadonlyArray<TradeRepublicJsonValue> => Array.isArray(value))
      : undefined;
  const baseAccounts = directAccountRows ?? accounts;
  const baseCashAccounts =
    directAccounts !== undefined &&
    isRecord(directAccounts) &&
    Array.isArray(directAccounts.cashAccounts)
      ? directAccounts.cashAccounts
      : cashAccounts;
  if (tickerByInstrument.size === 0) {
    if (directAccounts !== undefined) {
      if (isRecord(directAccounts) && cashAccounts.length > 0) {
        const result: TradeRepublicJsonObject = {
          ...directAccounts,
          cashAccounts: baseCashAccounts,
        };
        if (!complete) Object.assign(result, { complete: false });
        return result;
      }
      if (!complete && isRecord(directAccounts)) return { ...directAccounts, complete: false };
      return directAccounts;
    }
    return { accounts, cashAccounts, complete };
  }
  const withTickers = baseAccounts.map((account) => {
    if (!isRecord(account)) return account;
    const positionKeys = (position: TradeRepublicJsonObject) => {
      const keys = [
        instrumentText(position, "tickerId", "ticker_id", "instrumentId", "instrument_id"),
        instrumentText(position, "isin", "ISIN"),
      ].filter((key): key is string => key !== undefined);
      return keys.flatMap((key) => {
        const [base] = key.split(".");
        return base === undefined || base === key ? [key] : [key, base];
      });
    };
    const addQuotes = (value: TradeRepublicJsonValue): TradeRepublicJsonValue => {
      if (!Array.isArray(value)) return value;
      return value.map((item) => {
        if (!isRecord(item)) return item;
        const ticker = positionKeys(item)
          .map((key) => tickerByInstrument.get(key))
          .find((candidate) => candidate !== undefined);
        if (ticker === undefined) return item;
        const quote = isRecord(item.quote) ? item.quote : ticker;
        return { ...item, quote };
      });
    };
    const copy: TradeRepublicJsonObject = { ...account };
    for (const key of ["positions", "portfolio", "holdings"]) {
      if (Array.isArray(account[key])) Object.assign(copy, { [key]: addQuotes(account[key]) });
    }
    if (Array.isArray(account.categories)) {
      Object.assign(copy, {
        categories: account.categories.map((category) => {
          if (!isRecord(category) || !Array.isArray(category.positions)) return category;
          return { ...category, positions: addQuotes(category.positions) };
        }),
      });
    }
    return copy;
  });
  if (directAccounts !== undefined && isRecord(directAccounts)) {
    const result: TradeRepublicJsonObject = {
      ...directAccounts,
      accounts: withTickers,
      cashAccounts: baseCashAccounts,
    };
    if (!complete) Object.assign(result, { complete: false });
    return result;
  }
  return { accounts: withTickers, cashAccounts: baseCashAccounts, complete };
};

const cookieSession = (
  setCookie: string | ReadonlyArray<string> | undefined,
): TradeRepublicSession | undefined => {
  if (setCookie === undefined) return undefined;
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  const cookies = new Map<string, string>();
  for (const header of values) {
    const [pair] = header.split(";");
    const separator = pair?.indexOf("=") ?? -1;
    if (separator <= 0) continue;
    cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
  }
  const sessionToken = cookies.get("tr_session");
  const refreshToken = cookies.get("tr_refresh");
  return sessionToken !== undefined && refreshToken !== undefined
    ? { sessionToken, refreshToken }
    : undefined;
};

const socketData = (value: RawData): TradeRepublicJsonValue | undefined => {
  try {
    const encoded = isTradeRepublicJsonString(value)
      ? value
      : Buffer.isBuffer(value)
        ? value.toString("utf8")
        : Array.isArray(value)
          ? Buffer.concat(value).toString("utf8")
          : // SAFETY: ws supplies an ArrayBuffer for the final RawData union member.
            Buffer.from(value as ArrayBuffer).toString("utf8");
    const parsed: TradeRepublicJsonValue = JSON.parse(encoded);
    return parsed;
  } catch {
    return undefined;
  }
};

const socketError = (
  message: string,
  category: "transient" | "invalid_response" = "transient",
  status?: number,
) => {
  const options: TransportErrorOptions = {
    transient: category === "transient",
  };
  if (status !== undefined) Object.assign(options, { status });
  return new TradeRepublicTransportError(message, options);
};

const topicName = (value: TradeRepublicJsonValue): Subscription["topic"] | undefined => {
  const candidate = text(value);
  if (
    candidate === "availableCash" ||
    candidate === "compactPortfolioByType" ||
    candidate === "ticker"
  )
    return candidate;
  return undefined;
};

/**
 * Reads the observed read-only Trade Republic WebSocket topics. The socket is
 * deliberately behind a small factory seam so protocol fixtures never need a
 * live account or a browser.
 */
export const makeEffectWebSocketTransport = (
  url = TRADE_REPUBLIC_WEBSOCKET_ORIGIN,
  timeout: Duration.Duration = Duration.seconds(30),
  socketFactory: TradeRepublicWebSocketFactory = (address, options) =>
    new WebSocket(address, options),
): TradeRepublicTransport => ({
  fetchSnapshot: (session) =>
    Effect.tryPromise({
      try: (signal) =>
        new Promise<TradeRepublicJsonValue | TradeRepublicTransportResponse>((resolve, reject) => {
          const timeoutMs = Math.max(1_000, Duration.toMillis(timeout));
          const subscriptions: Subscription[] = [...subscriptionsFor(session)];
          const responses = new Set<string>();
          const topics: Array<{
            readonly topic: Subscription["topic"];
            readonly value: TradeRepublicJsonValue;
            readonly accountNumber?: string;
          }> = [];
          let partial = false;
          let rotatedSession: TradeRepublicSession | undefined;
          let settled = false;
          let socket: TradeRepublicSocket | undefined;
          let timer: ReturnType<typeof setTimeout> | undefined;

          const close = () => {
            if (timer !== undefined) clearTimeout(timer);
            if (
              socket !== undefined &&
              (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
            )
              socket.close();
          };
          const finishFailure = (error: TradeRepublicTransportError) => {
            if (settled) return;
            settled = true;
            signal.removeEventListener("abort", onAbort);
            close();
            reject(error);
          };
          const finishSuccess = (
            value: TradeRepublicJsonValue | TradeRepublicTransportResponse,
          ) => {
            if (settled) return;
            settled = true;
            signal.removeEventListener("abort", onAbort);
            close();
            resolve(value);
          };
          const finishTopics = () => {
            const snapshot = snapshotFromTopics(topics, !partial);
            if (snapshot === undefined) {
              finishFailure(
                socketError("Trade Republic returned no usable account data", "invalid_response"),
              );
              return;
            }
            finishSuccess(
              rotatedSession === undefined ? snapshot : { snapshot, session: rotatedSession },
            );
          };
          const onAbort = () => finishFailure(socketError("Trade Republic request timed out"));
          signal.addEventListener("abort", onAbort, { once: true });
          timer = setTimeout(
            () => finishFailure(socketError("Trade Republic request timed out")),
            timeoutMs,
          );

          try {
            socket = socketFactory(url, {
              headers: {
                Accept: "application/json",
                Cookie: `tr_session=${session.sessionToken}; tr_refresh=${session.refreshToken}`,
                Origin: TRADE_REPUBLIC_WEB_ORIGIN,
                Referer: `${TRADE_REPUBLIC_WEB_ORIGIN}/`,
                "x-tr-app-version": "web",
                "x-tr-device-info": "web",
                "x-tr-platform": "web",
                "x-tr-protocol-version": TRADE_REPUBLIC_PROTOCOL_VERSION,
              },
              handshakeTimeout: timeoutMs,
            });
            const activeSocket = socket;
            const sendSubscription = (subscription: Subscription) => {
              const payload = { type: subscription.topic, ...subscription.parameters };
              activeSocket.send(
                JSON.stringify({
                  type: "sub",
                  id: subscription.id,
                  payload,
                }),
              );
            };
            const addTickerSubscriptions = (value: TradeRepublicJsonValue) => {
              for (const position of positionRows(value)) {
                if (isPrivatePosition(position)) continue;
                const tickerId = tickerIdOf(position);
                if (
                  tickerId === undefined ||
                  subscriptions.some(
                    (subscription) =>
                      subscription.topic === "ticker" && subscription.instrumentId === tickerId,
                  )
                )
                  continue;
                const ticker: Subscription = {
                  id: randomUUID(),
                  topic: "ticker",
                  instrumentId: tickerId,
                  parameters: { id: tickerId },
                };
                subscriptions.push(ticker);
                sendSubscription(ticker);
              }
            };
            activeSocket.on("upgrade", (response) => {
              rotatedSession = cookieSession(response.headers["set-cookie"]);
            });
            activeSocket.on("open", () => {
              try {
                const connectMessage = {
                  type: "connect",
                  id: randomUUID(),
                  payload: {
                    protocolVersion: TRADE_REPUBLIC_PROTOCOL_VERSION,
                    platform: "web",
                    client: "web",
                  },
                };
                activeSocket.send(JSON.stringify(connectMessage));
                for (const subscription of subscriptions.slice()) sendSubscription(subscription);
              } catch {
                finishFailure(socketError("Trade Republic request could not be sent"));
              }
            });
            activeSocket.on("message", (raw) => {
              const value = socketData(raw);
              if (!isRecord(value)) {
                finishFailure(
                  socketError(
                    "Trade Republic returned an invalid protocol message",
                    "invalid_response",
                  ),
                );
                return;
              }
              const type = text(value.type)?.toLowerCase();
              if (type === "error" || type === "auth_error") {
                const status = Number(value.status ?? value.code);
                const authenticationExpired =
                  type === "auth_error" || status === 401 || status === 403;
                const id = text(value.id);
                const subscription = subscriptions.find((candidate) => candidate.id === id);
                if (!authenticationExpired && subscription !== undefined) {
                  partial = true;
                  responses.add(subscription.id);
                  if (responses.size === subscriptions.length) finishTopics();
                  return;
                }
                finishFailure(
                  socketError(
                    authenticationExpired
                      ? `Trade Republic authentication expired${describeErrorBody(value)}`
                      : `Trade Republic returned a protocol error${describeErrorBody(value)}`,
                    authenticationExpired ? "invalid_response" : "transient",
                    authenticationExpired ? 401 : Number.isFinite(status) ? status : undefined,
                  ),
                );
                return;
              }
              const snapshot = value.snapshot;
              if (snapshot !== undefined) {
                topics.push({ topic: "compactPortfolioByType", value: snapshot });
                for (const subscription of subscriptions)
                  if (subscription.topic !== "ticker") responses.add(subscription.id);
                addTickerSubscriptions(snapshot);
                if (responses.size === subscriptions.length) finishTopics();
                return;
              }
              const id = text(value.id);
              const subscription = subscriptions.find((candidate) => candidate.id === id);
              const payload = payloadOf(value);
              const payloadRecord = isRecord(payload) ? payload : undefined;
              const topic =
                subscription?.topic ??
                (value.topic === undefined ? undefined : topicName(value.topic)) ??
                (payloadRecord?.type === undefined ? undefined : topicName(payloadRecord.type));
              if (subscription !== undefined) responses.add(subscription.id);
              const tickerPayload = dataOf(payload);
              const topicValue =
                subscription?.topic === "ticker" && subscription.instrumentId !== undefined
                  ? isRecord(tickerPayload)
                    ? { ...tickerPayload, tickerId: subscription.instrumentId }
                    : { tickerId: subscription.instrumentId, quote: tickerPayload }
                  : tickerPayload;
              if (
                topic === "availableCash" ||
                topic === "compactPortfolioByType" ||
                topic === "ticker"
              ) {
                const topicEntry = { topic, value: topicValue };
                if (subscription?.accountNumber !== undefined)
                  Object.assign(topicEntry, { accountNumber: subscription.accountNumber });
                topics.push(topicEntry);
              }
              if (subscription?.topic === "compactPortfolioByType")
                addTickerSubscriptions(topicValue);
              if (type === "complete" || type === "done") {
                if (responses.size === subscriptions.length) finishTopics();
                return;
              }
              if (responses.size === subscriptions.length) finishTopics();
            });
            activeSocket.on("error", () => {
              finishFailure(socketError("Trade Republic network request failed"));
            });
            activeSocket.on("close", () => {
              if (!settled)
                finishFailure(socketError("Trade Republic connection closed unexpectedly"));
            });
          } catch {
            finishFailure(socketError("Trade Republic network request failed"));
          }
        }),
      catch: (cause) =>
        cause instanceof TradeRepublicTransportError
          ? cause
          : socketError("Trade Republic network request failed"),
    }),
});

/** Explicit HTTP fixture/development seam retained for protocol tests. */
export const makeEffectHttpTransport = (
  origin = TRADE_REPUBLIC_API_ORIGIN,
  timeout: Duration.Duration = Duration.seconds(30),
): TradeRepublicTransport<HttpClient.HttpClient> & { readonly requiresHttpClient: true } => ({
  requiresHttpClient: true,
  fetchSnapshot: (session) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const response = yield* client
        .execute(
          HttpClientRequest.post(`${origin}/api/v1/portfolio/snapshot`, {
            headers: {
              Accept: "application/json",
              Origin: TRADE_REPUBLIC_WEB_ORIGIN,
              Referer: `${TRADE_REPUBLIC_WEB_ORIGIN}/`,
              "x-tr-app-version": "web",
              "x-tr-device-info": "web",
              "x-tr-platform": "web",
              "x-tr-protocol-version": TRADE_REPUBLIC_PROTOCOL_VERSION,
              Cookie: `tr_session=${session.sessionToken}; tr_refresh=${session.refreshToken}`,
            },
            acceptJson: true,
            body: HttpBody.uint8Array(
              new TextEncoder().encode(
                JSON.stringify({ topics: ["availableCash", "compactPortfolioByType", "ticker"] }),
              ),
              "application/json",
            ),
          }),
        )
        .pipe(
          Effect.timeoutOrElse({
            duration: timeout,
            orElse: () =>
              Effect.fail(
                new TradeRepublicTransportError("Trade Republic request timed out", {
                  transient: true,
                }),
              ),
          }),
          Effect.mapError((cause) =>
            cause instanceof TradeRepublicTransportError
              ? cause
              : new TradeRepublicTransportError("Trade Republic request could not be completed", {
                  transient: true,
                }),
          ),
        );
      const body = yield* response.json.pipe(
        Effect.map((value) => {
          // SAFETY: Effect's HTTP JSON decoder only returns parsed JSON values; the parser below validates the protocol shape.
          return value as TradeRepublicJsonValue;
        }),
        Effect.catch(() => Effect.succeed(undefined)),
      );
      if (response.status < 200 || response.status >= 300) {
        return yield* Effect.fail(
          new TradeRepublicTransportError(
            `Trade Republic returned HTTP ${response.status}${describeErrorBody(body)}`,
            { transient: transientStatus(response.status), status: response.status },
          ),
        );
      }
      if (body === undefined)
        return yield* Effect.fail(
          new TradeRepublicTransportError("Trade Republic returned invalid JSON", {
            transient: false,
          }),
        );
      return body;
    }),
});
