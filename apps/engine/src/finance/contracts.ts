import * as HttpApiSchema from "@effect/platform/HttpApiSchema";
import * as Schema from "effect/Schema";

export const AssetClass = Schema.Literal("fiat", "security", "crypto", "custom");
export type AssetClass = typeof AssetClass.Type;

export const ManagementMode = Schema.Literal("manual", "synced");
export type ManagementMode = typeof ManagementMode.Type;

export const IdentifierInput = Schema.Struct({
  type: Schema.NonEmptyTrimmedString,
  value: Schema.NonEmptyTrimmedString,
});
export type IdentifierInput = typeof IdentifierInput.Type;

export const Price = Schema.Struct({
  price: Schema.Number,
  currencyAssetId: Schema.String,
  source: Schema.String,
  observedAt: Schema.String,
  updatedAt: Schema.String,
});
export type Price = typeof Price.Type;

export const Asset = Schema.Struct({
  id: Schema.String,
  assetClass: AssetClass,
  name: Schema.String,
  symbol: Schema.NullOr(Schema.String),
  identifiers: Schema.Array(IdentifierInput),
  price: Schema.NullOr(Price),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type Asset = typeof Asset.Type;

export const Position = Schema.Struct({
  id: Schema.String,
  accountId: Schema.String,
  assetId: Schema.String,
  assetName: Schema.String,
  assetSymbol: Schema.NullOr(Schema.String),
  assetClass: AssetClass,
  quantity: Schema.Number,
  price: Schema.NullOr(Price),
  reportingValue: Schema.NullOr(Schema.Number),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type Position = typeof Position.Type;

export const Account = Schema.Struct({
  id: Schema.String,
  custodianId: Schema.String,
  custodianName: Schema.String,
  managementMode: ManagementMode,
  name: Schema.String,
  baseCurrencyAssetId: Schema.String,
  baseCurrencyIso: Schema.String,
  connectorAccountId: Schema.NullOr(Schema.String),
  positions: Schema.Array(Position),
  total: Schema.Number,
  totalIncomplete: Schema.Boolean,
  hasStalePrices: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type Account = typeof Account.Type;

export const AccountSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  baseCurrencyIso: Schema.String,
  connectorAccountId: Schema.NullOr(Schema.String),
  positionCount: Schema.Number,
});
export type AccountSummary = typeof AccountSummary.Type;

export const Custodian = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  managementMode: ManagementMode,
  connectorId: Schema.NullOr(Schema.String),
  accounts: Schema.Array(AccountSummary),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type Custodian = typeof Custodian.Type;

export const ConnectorCapability = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
});

export const ConnectorCapabilities = Schema.Struct({
  connectors: Schema.Array(ConnectorCapability),
});

export const EntityIdPath = Schema.Struct({ id: Schema.String });

export const CreateCustodianInput = Schema.Struct({
  name: Schema.NonEmptyTrimmedString,
  managementMode: Schema.optionalWith(ManagementMode, { default: () => "manual" as const }),
  connectorId: Schema.optional(Schema.NonEmptyTrimmedString),
  connectorConfig: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});
export type CreateCustodianInput = typeof CreateCustodianInput.Type;

export const UpdateCustodianInput = Schema.Struct({ name: Schema.NonEmptyTrimmedString });
export type UpdateCustodianInput = typeof UpdateCustodianInput.Type;

export const CreateAccountInput = Schema.Struct({
  custodianId: Schema.String,
  name: Schema.NonEmptyTrimmedString,
  baseCurrencyAssetId: Schema.optional(Schema.String),
});
export type CreateAccountInput = typeof CreateAccountInput.Type;

export const UpdateAccountInput = Schema.Struct({
  name: Schema.NonEmptyTrimmedString,
  baseCurrencyAssetId: Schema.String,
});
export type UpdateAccountInput = typeof UpdateAccountInput.Type;

export const CreateAssetInput = Schema.Struct({
  assetClass: AssetClass,
  name: Schema.NonEmptyTrimmedString,
  symbol: Schema.optional(Schema.NonEmptyTrimmedString),
  identifiers: Schema.optionalWith(Schema.Array(IdentifierInput), { default: () => [] }),
});
export type CreateAssetInput = typeof CreateAssetInput.Type;

export const UpdateCustomAssetInput = Schema.Struct({
  name: Schema.NonEmptyTrimmedString,
  symbol: Schema.optional(Schema.NonEmptyTrimmedString),
});
export type UpdateCustomAssetInput = typeof UpdateCustomAssetInput.Type;

export const SetManualPriceInput = Schema.Struct({
  price: Schema.Number,
  currencyAssetId: Schema.String,
  observedAt: Schema.optional(Schema.String),
});
export type SetManualPriceInput = typeof SetManualPriceInput.Type;

export const CreatePositionInput = Schema.Struct({
  accountId: Schema.String,
  assetId: Schema.String,
  quantity: Schema.Number,
});
export type CreatePositionInput = typeof CreatePositionInput.Type;

export const UpdatePositionInput = Schema.Struct({ quantity: Schema.Number });
export type UpdatePositionInput = typeof UpdatePositionInput.Type;

// HTML forms intentionally use encoded strings and decode explicitly before mutation.
export const PositionQuantityFormInput = Schema.Struct({ quantity: Schema.NumberFromString });
export type PositionQuantityFormValues = typeof PositionQuantityFormInput.Encoded;

export class FinanceApiError extends Schema.TaggedError<FinanceApiError>()(
  "FinanceApiError",
  {
    code: Schema.Literal(
      "not_found",
      "validation",
      "read_only",
      "conflict",
      "connector_unavailable",
      "database",
    ),
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 400 }),
) {}

export const SnapshotResult = Schema.Struct({
  id: Schema.String,
  capturedAt: Schema.String,
  positionCount: Schema.Number,
  priceCount: Schema.Number,
});
export type SnapshotResult = typeof SnapshotResult.Type;

export const PriceRefreshResult = Schema.Struct({
  refreshedAssetIds: Schema.Array(Schema.String),
  failures: Schema.Array(
    Schema.Struct({
      assetId: Schema.String,
      provider: Schema.Literal("yahoo-finance", "coingecko"),
      category: Schema.String,
      message: Schema.String,
    }),
  ),
});
export type PriceRefreshResult = typeof PriceRefreshResult.Type;

export const PortfolioHistoryPoint = Schema.Struct({
  snapshotId: Schema.String,
  capturedAt: Schema.String,
  total: Schema.Number,
  totalIncomplete: Schema.Boolean,
});
export type PortfolioHistoryPoint = typeof PortfolioHistoryPoint.Type;

export const SearchAssetsParams = Schema.Struct({
  query: Schema.String,
  assetClass: Schema.Literal("security", "crypto"),
});

export const AssetSearchResult = Schema.Struct({
  provider: Schema.Literal("yahoo-finance", "coingecko"),
  assetClass: Schema.Literal("security", "crypto"),
  name: Schema.String,
  symbol: Schema.String,
  identifiers: Schema.Array(IdentifierInput),
});
export type AssetSearchResult = typeof AssetSearchResult.Type;
