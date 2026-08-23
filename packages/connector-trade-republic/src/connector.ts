import {
  ConnectorAuthenticationError,
  ConnectorFetchAccountsError,
  type AuthenticatedConnector,
  type Connector,
  type ConnectorChallenge,
  type ConnectorSession,
  type InteractiveConnectorAuthentication,
  validateConnectorOutput,
  type ConnectorSnapshot,
} from "@satella-app/connector-core";
import * as Context from "effect/Context";
import { HttpClient } from "effect/unstable/http";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import iconSvg from "./icon.svg";
import instructions from "./instructions.md";
import {
  makeEffectWebSocketTransport,
  TRADE_REPUBLIC_WEBSOCKET_ORIGIN,
  TradeRepublicTransportError,
  isTradeRepublicTransportResponse,
  type TradeRepublicTransport,
  type TradeRepublicTransportResponse,
  type TradeRepublicTransportValue,
} from "./client.js";
import { parseTradeRepublicSnapshot } from "./parser.js";
import {
  TradeRepublicCredentials,
  TradeRepublicSession,
  TradeRepublicStoredCredentials,
  type TradeRepublicCredentials as TradeRepublicCredentialsType,
  type TradeRepublicSession as TradeRepublicSessionType,
} from "./schemas.js";
import { type TradeRepublicJsonValue } from "./wire.js";

export interface TradeRepublicBrowserAttempt {
  readonly challenge: ConnectorChallenge;
  readonly submitCode: (
    code: string,
  ) => Effect.Effect<TradeRepublicSessionType, ConnectorAuthenticationError>;
  readonly close: () => Effect.Effect<void>;
}

export interface TradeRepublicBrowserStartInput extends TradeRepublicCredentialsType {
  readonly expiresAt: Date;
}

export class TradeRepublicBrowserRuntime extends Context.Service<
  TradeRepublicBrowserRuntime,
  {
    readonly start: (
      input: TradeRepublicBrowserStartInput,
    ) => Effect.Effect<TradeRepublicBrowserAttempt, ConnectorAuthenticationError>;
  }
>()("TradeRepublicBrowserRuntime") {}

export interface TradeRepublicConnectorOptions<R = HttpClient.HttpClient> {
  readonly transportFactory?: () => TradeRepublicTransport<R>;
  readonly browserRuntime?: {
    readonly start: (
      input: TradeRepublicBrowserStartInput,
    ) => Effect.Effect<TradeRepublicBrowserAttempt, ConnectorAuthenticationError>;
  };
  readonly authenticationTimeoutMs?: number;
  readonly now?: () => Date;
}

const icon = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`;
const AUTH_TIMEOUT_MS = 120_000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1_000;

const authenticationFailure = (
  message: string,
  category: ConnectorAuthenticationError["category"] = "invalid_credentials",
) => new ConnectorAuthenticationError({ category, message });

const fetchFailure = (
  cause: unknown,
  fallback = "Trade Republic account retrieval failed",
): ConnectorFetchAccountsError => {
  if (cause instanceof TradeRepublicTransportError) {
    if (
      cause.status === 401 ||
      cause.status === 403 ||
      cause.message.toLowerCase().includes("authentication expired")
    )
      return new ConnectorFetchAccountsError({
        category: "authentication_expired",
        message: "Trade Republic authentication expired",
      });
    if (cause.status === 429)
      return new ConnectorFetchAccountsError({
        category: "rate_limit",
        message: "Trade Republic rate limit reached",
      });
    if (cause.message.includes("timed out"))
      return new ConnectorFetchAccountsError({
        category: "timeout",
        message: "Trade Republic request timed out",
      });
    return new ConnectorFetchAccountsError({
      category: cause.transient ? "network" : "invalid_response",
      message: fallback,
    });
  }
  return new ConnectorFetchAccountsError({ category: "invalid_response", message: fallback });
};

interface SnapshotPayload {
  readonly snapshot: TradeRepublicJsonValue;
  readonly session?: TradeRepublicSessionType;
}

const snapshotPayload = (value: TradeRepublicTransportValue): SnapshotPayload => {
  if (isTradeRepublicTransportResponse(value)) {
    const envelope: TradeRepublicTransportResponse = value;
    const session = envelope.session;
    if (session !== undefined) {
      const checked = Schema.decodeUnknownOption(TradeRepublicSession)(session);
      if (checked._tag === "Some") return { snapshot: envelope.snapshot, session: checked.value };
    }
    return { snapshot: envelope.snapshot };
  }
  return { snapshot: value };
};

const createAuthenticated = <R>(
  sessionInput: TradeRepublicSessionType,
  transportFactory: () => TradeRepublicTransport<R>,
): AuthenticatedConnector<R> => {
  let session = sessionInput;
  const transport = transportFactory();
  return {
    get session(): ConnectorSession {
      return session;
    },
    fetchAccounts: () =>
      transport.fetchSnapshot(session).pipe(
        Effect.mapError((cause) => fetchFailure(cause)),
        Effect.flatMap((value) =>
          Effect.try({
            try: () => {
              const payload = snapshotPayload(value);
              if (payload.session !== undefined) session = payload.session;
              return parseTradeRepublicSnapshot(payload.snapshot);
            },
            catch: () => fetchFailure(undefined),
          }),
        ),
        Effect.flatMap((snapshot: ConnectorSnapshot) =>
          validateConnectorOutput(snapshot.accounts).pipe(
            Effect.map((accounts) => ({ accounts, complete: snapshot.complete })),
            Effect.mapError((cause) => fetchFailure(cause)),
          ),
        ),
      ),
  };
};

const createTradeRepublicConnector = <R>(
  options: TradeRepublicConnectorOptions<R>,
  transportFactory: () => TradeRepublicTransport<R>,
): Connector<
  TradeRepublicCredentialsType | TradeRepublicSessionType,
  R | TradeRepublicBrowserRuntime
> => ({
  id: "trade-republic",
  name: "Trade Republic",
  icon,
  instructions,
  assetCategories: ["stocks_etfs", "crypto", "cash", "other"],
  autoRefreshIntervalMs: SIX_HOURS_MS,
  authenticationMode: "interactive",
  credentialFields: [
    {
      key: "phone",
      label: "Phone number",
      kind: "text",
      required: true,
      helpText: "Use the phone number registered with Trade Republic.",
    },
    {
      key: "pin",
      label: "PIN",
      kind: "password",
      required: true,
      helpText: "The confirmation code is requested in the next step.",
    },
  ],
  credentialsSchema: TradeRepublicCredentials,
  authenticate: (input) =>
    Effect.gen(function* () {
      const session = yield* Schema.decodeUnknownEffect(TradeRepublicStoredCredentials)(input).pipe(
        Effect.mapError(() =>
          authenticationFailure("Trade Republic session is missing or invalid"),
        ),
      );
      return createAuthenticated(session, transportFactory);
    }),
  startAuthentication: (input) =>
    Effect.gen(function* () {
      const credentials = yield* Schema.decodeUnknownEffect(TradeRepublicCredentials)(input).pipe(
        Effect.mapError(() =>
          authenticationFailure("Trade Republic phone number or PIN is invalid"),
        ),
      );
      const now = options.now ?? (() => new Date());
      const configuredTimeout = options.authenticationTimeoutMs;
      const timeout =
        configuredTimeout !== undefined && Number.isFinite(configuredTimeout)
          ? Math.max(1_000, Math.floor(configuredTimeout))
          : AUTH_TIMEOUT_MS;
      const expiresAt = new Date(now().getTime() + timeout);
      const runtime =
        options.browserRuntime === undefined
          ? yield* TradeRepublicBrowserRuntime
          : options.browserRuntime;
      const attempt = yield* runtime.start({ ...credentials, expiresAt });
      let closed = false;
      const close = () => {
        if (closed) return Effect.void;
        closed = true;
        return attempt.close();
      };
      const flow: InteractiveConnectorAuthentication<R | TradeRepublicBrowserRuntime> = {
        challenge: attempt.challenge,
        submit: (code) => {
          if (!/^\d{4}$/.test(code))
            return Effect.fail(
              authenticationFailure(
                "The Trade Republic confirmation code must contain four digits",
              ),
            );
          if (now().getTime() >= expiresAt.getTime())
            return close().pipe(
              Effect.andThen(
                Effect.fail(
                  authenticationFailure("The Trade Republic authentication attempt expired"),
                ),
              ),
            );
          return attempt.submitCode(code).pipe(
            Effect.map((session) => createAuthenticated(session, transportFactory)),
            Effect.ensuring(close()),
          );
        },
        cancel: close,
      };
      return flow;
    }),
});

export function makeTradeRepublicConnector(): Connector<
  TradeRepublicCredentialsType | TradeRepublicSessionType,
  HttpClient.HttpClient | TradeRepublicBrowserRuntime
>;
export function makeTradeRepublicConnector<R>(
  options: TradeRepublicConnectorOptions<R> & {
    readonly browserRuntime: NonNullable<TradeRepublicConnectorOptions<R>["browserRuntime"]>;
  },
): Connector<TradeRepublicCredentialsType | TradeRepublicSessionType, R>;
export function makeTradeRepublicConnector<R>(
  options: TradeRepublicConnectorOptions<R>,
): Connector<
  TradeRepublicCredentialsType | TradeRepublicSessionType,
  R | TradeRepublicBrowserRuntime
>;
export function makeTradeRepublicConnector<R>(
  options: TradeRepublicConnectorOptions<R> = {},
): Connector<
  TradeRepublicCredentialsType | TradeRepublicSessionType,
  R | TradeRepublicBrowserRuntime
> {
  const transportFactory =
    options.transportFactory ??
    (() =>
      // SAFETY: the default WebSocket transport has no environment; it is safe to erase that narrower environment to the caller's generic transport environment.
      makeEffectWebSocketTransport(TRADE_REPUBLIC_WEBSOCKET_ORIGIN) as TradeRepublicTransport<R>);
  // SAFETY: createTradeRepublicConnector preserves the credentials and environment parameters represented by this overload.
  return createTradeRepublicConnector(options, transportFactory) as Connector<
    TradeRepublicCredentialsType | TradeRepublicSessionType,
    R | TradeRepublicBrowserRuntime
  >;
}

export const TradeRepublicConnector = makeTradeRepublicConnector();
