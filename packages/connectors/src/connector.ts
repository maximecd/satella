import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const ConnectorAssetClass = Schema.Literal("fiat", "security", "crypto");
export type ConnectorAssetClass = typeof ConnectorAssetClass.Type;

export const ConnectorAssetIdentifier = Schema.Struct({
  type: Schema.NonEmptyTrimmedString,
  value: Schema.NonEmptyTrimmedString,
});
export type ConnectorAssetIdentifier = typeof ConnectorAssetIdentifier.Type;

export type ConnectorCredentialFieldKind = "text" | "password" | "select";

export interface ConnectorCredentialField {
  readonly key: string;
  readonly label: string;
  readonly kind: ConnectorCredentialFieldKind;
  readonly required: boolean;
  readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  readonly helpText?: string;
}

export const ConnectorAsset = Schema.Struct({
  externalId: Schema.NonEmptyTrimmedString,
  assetClass: ConnectorAssetClass,
  name: Schema.NonEmptyTrimmedString,
  symbol: Schema.optional(Schema.NonEmptyTrimmedString),
  identifiers: Schema.Array(ConnectorAssetIdentifier),
});
export type ConnectorAsset = typeof ConnectorAsset.Type;

export const ConnectorPosition = Schema.Struct({
  asset: ConnectorAsset,
  quantity: Schema.Number,
});
export type ConnectorPosition = typeof ConnectorPosition.Type;

export const ConnectorAccountKind = Schema.Literal(
  "current",
  "savings",
  "securities",
  "crypto",
);
export type ConnectorAccountKind = typeof ConnectorAccountKind.Type;

export const ConnectorAccount = Schema.Struct({
  externalId: Schema.NonEmptyTrimmedString,
  name: Schema.NonEmptyTrimmedString,
  baseCurrencyIso: Schema.NonEmptyTrimmedString,
  accountKind: ConnectorAccountKind,
  positions: Schema.Array(ConnectorPosition),
});
export type ConnectorAccount = typeof ConnectorAccount.Type;

export const ConnectorAuthenticationCategory = Schema.Literal(
  "invalid_credentials",
  "insufficient_permission",
  "unsupported_region",
  "network",
  "rate_limit",
  "invalid_response",
  "timeout",
);
export type ConnectorAuthenticationCategory = typeof ConnectorAuthenticationCategory.Type;

export const ConnectorFetchAccountsCategory = Schema.Literal(
  "authentication_expired",
  "network",
  "rate_limit",
  "invalid_response",
  "timeout",
);
export type ConnectorFetchAccountsCategory = typeof ConnectorFetchAccountsCategory.Type;

export class ConnectorAuthenticationError extends Schema.TaggedError<ConnectorAuthenticationError>()(
  "ConnectorAuthenticationError",
  {
    category: ConnectorAuthenticationCategory,
    message: Schema.String,
  },
) {}

export class ConnectorFetchAccountsError extends Schema.TaggedError<ConnectorFetchAccountsError>()(
  "ConnectorFetchAccountsError",
  {
    category: ConnectorFetchAccountsCategory,
    message: Schema.String,
  },
) {}

export interface AuthenticatedConnector<R = never> {
  readonly fetchAccounts: () => Effect.Effect<
    ReadonlyArray<ConnectorAccount>,
    ConnectorFetchAccountsError,
    R
  >;
}

export interface Connector<Credentials, R = never> {
  readonly id: string;
  readonly name: string;
  /** Optional data URI displayed in connector discovery surfaces. */
  readonly icon?: string;
  /** Optional Markdown instructions bundled with the connector. */
  readonly instructions?: string;
  /** Asset classes this connector can be discovered through. Does not filter imported output. */
  readonly assetClasses: ReadonlyArray<ConnectorAssetClass>;
  /** Public, non-secret metadata used to render connector setup forms. */
  readonly credentialFields: ReadonlyArray<ConnectorCredentialField>;
  readonly credentialsSchema: Schema.Schema<Credentials, any>;
  readonly authenticate: (
    credentials: Credentials,
  ) => Effect.Effect<AuthenticatedConnector<R>, ConnectorAuthenticationError, R>;
}

export type AnyConnector = Connector<any, any>;

export const validateConnectorOutput = (
  accounts: ReadonlyArray<ConnectorAccount>,
): Effect.Effect<ReadonlyArray<ConnectorAccount>, ConnectorFetchAccountsError> =>
  Effect.try({
    try: () => {
      const seenAccountIds = new Set<string>();
      const seenAssetDefinitions = new Map<string, ConnectorAsset>();
      const normalized: ConnectorAccount[] = [];
      for (const account of accounts) {
        if (seenAccountIds.has(account.externalId)) {
          throw new Error("Connector returned a duplicate account ID");
        }
        seenAccountIds.add(account.externalId);
        const positions: ConnectorPosition[] = [];
        const seenPositionAssets = new Set<string>();
        for (const position of account.positions) {
          if (!Number.isFinite(position.quantity)) {
            throw new Error("Connector returned a non-finite position quantity");
          }
          if (seenPositionAssets.has(position.asset.externalId)) {
            throw new Error("Connector returned duplicate positions for one account");
          }
          seenPositionAssets.add(position.asset.externalId);
          const previous = seenAssetDefinitions.get(position.asset.externalId);
          if (
            previous !== undefined &&
            JSON.stringify(previous) !== JSON.stringify(position.asset)
          ) {
            throw new Error("Connector returned conflicting definitions for one asset");
          }
          seenAssetDefinitions.set(position.asset.externalId, position.asset);
          positions.push(position);
        }
        normalized.push({ ...account, positions });
      }
      return normalized;
    },
    catch: (cause) =>
      new ConnectorFetchAccountsError({
        category: "invalid_response",
        message: cause instanceof Error ? cause.message : "Connector output was invalid",
      }),
  });
