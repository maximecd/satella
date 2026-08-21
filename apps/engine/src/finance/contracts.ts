import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { DecimalInput, DecimalString } from "./financial-number.js";

export const AssetCategory = Schema.Literals(["stocks_etfs", "bonds", "crypto", "cash", "other"]);
export type AssetCategory = typeof AssetCategory.Type;

export const ASSET_CATEGORY_LABELS = {
  stocks_etfs: "Stocks & ETFs",
  bonds: "Bonds",
  crypto: "Crypto",
  cash: "Cash",
  other: "Other assets",
} satisfies Record<AssetCategory, string>;

export const SearchableAssetCategory = Schema.Literals(["stocks_etfs", "crypto"]);
export type SearchableAssetCategory = typeof SearchableAssetCategory.Type;

export const GenericAssetCategory = Schema.Literals(["bonds", "other"]);
export type GenericAssetCategory = typeof GenericAssetCategory.Type;

export const IdentifierInput = Schema.Struct({
  type: Schema.Trim.check(Schema.isNonEmpty()),
  value: Schema.Trim.check(Schema.isNonEmpty()),
});
export type IdentifierInput = typeof IdentifierInput.Type;

export const Price = Schema.Struct({
  price: DecimalString,
  currencyAssetId: Schema.String,
  currencyIso: Schema.String,
  source: Schema.String,
  observedAt: Schema.String,
  updatedAt: Schema.String,
  isStale: Schema.Boolean,
});
export type Price = typeof Price.Type;

export const AverageUnitPurchasePrice = Schema.Struct({
  price: DecimalString,
  currencyAssetId: Schema.String,
  currencyIso: Schema.String,
  source: Schema.Literals(["manual", "connection"]),
});
export type AverageUnitPurchasePrice = typeof AverageUnitPurchasePrice.Type;

export const AverageUnitPurchasePriceInput = Schema.Struct({
  price: DecimalInput,
  currencyAssetId: Schema.String,
});
export type AverageUnitPurchasePriceInput = typeof AverageUnitPurchasePriceInput.Type;

export const Asset = Schema.Struct({
  id: Schema.String,
  assetCategory: AssetCategory,
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
  assetCategory: AssetCategory,
  quantity: DecimalString,
  price: Schema.NullOr(Price),
  reportingValue: Schema.NullOr(DecimalString),
  averageUnitPurchasePrice: Schema.NullOr(AverageUnitPurchasePrice),
  acquisitionCost: Schema.NullOr(DecimalString),
  unrealizedPnl: Schema.NullOr(DecimalString),
  unrealizedPnlPercent: Schema.NullOr(DecimalString),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type Position = typeof Position.Type;

export const Account = Schema.Struct({
  id: Schema.String,
  connectionId: Schema.NullOr(Schema.String),
  connectionName: Schema.NullOr(Schema.String),
  name: Schema.String,
  baseCurrencyAssetId: Schema.String,
  baseCurrencyIso: Schema.String,
  connectorAccountId: Schema.NullOr(Schema.String),
  positions: Schema.Array(Position),
  total: DecimalString,
  unrealizedPnl: DecimalString,
  unrealizedPnlPercent: Schema.NullOr(DecimalString),
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

export const Connection = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  connectorId: Schema.String,
  accounts: Schema.Array(AccountSummary),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type Connection = typeof Connection.Type;

export const ConnectorCapability = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.optional(Schema.String),
  instructions: Schema.optional(Schema.String),
  assetCategories: Schema.Array(AssetCategory),
  credentialFields: Schema.Array(
    Schema.Struct({
      key: Schema.Trim.check(Schema.isNonEmpty()),
      label: Schema.Trim.check(Schema.isNonEmpty()),
      kind: Schema.Literals(["text", "password", "select"]),
      required: Schema.Boolean,
      options: Schema.optional(
        Schema.Array(
          Schema.Struct({
            value: Schema.Trim.check(Schema.isNonEmpty()),
            label: Schema.Trim.check(Schema.isNonEmpty()),
          }),
        ),
      ),
      helpText: Schema.optional(Schema.Trim.check(Schema.isNonEmpty())),
    }),
  ),
});
export type ConnectorCapability = typeof ConnectorCapability.Type;

export const ConnectorCapabilities = Schema.Struct({
  connectors: Schema.Array(ConnectorCapability),
});

export const EntityIdPath = Schema.Struct({ id: Schema.String });

/** Credentials are stored in the connector configuration for later refreshes. */
export const ConnectorCredentials = Schema.Record(Schema.String, Schema.String);
export type ConnectorCredentials = typeof ConnectorCredentials.Type;

export const ConnectConnectionInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  connectorId: Schema.Trim.check(Schema.isNonEmpty()),
  credentials: ConnectorCredentials,
});
export type ConnectConnectionInput = typeof ConnectConnectionInput.Type;

export const UpdateConnectionInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  credentials: Schema.optional(ConnectorCredentials),
});
export type UpdateConnectionInput = typeof UpdateConnectionInput.Type;

export const CreateAccountInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  baseCurrencyAssetId: Schema.optional(Schema.String),
});
export type CreateAccountInput = typeof CreateAccountInput.Type;

export const UpdateAccountInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  baseCurrencyAssetId: Schema.String,
});
export type UpdateAccountInput = typeof UpdateAccountInput.Type;

export const CreateAssetInput = Schema.Struct({
  assetCategory: AssetCategory,
  name: Schema.Trim.check(Schema.isNonEmpty()),
  symbol: Schema.optional(Schema.Trim.check(Schema.isNonEmpty())),
  identifiers: Schema.Array(IdentifierInput).pipe(
    Schema.optional,
    Schema.withDecodingDefaultType(Effect.succeed([])),
  ),
});
export type CreateAssetInput = typeof CreateAssetInput.Type;

export const UpdateCustomAssetInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  symbol: Schema.optional(Schema.Trim.check(Schema.isNonEmpty())),
});
export type UpdateCustomAssetInput = typeof UpdateCustomAssetInput.Type;

export const SetManualPriceInput = Schema.Struct({
  price: DecimalInput,
  currencyAssetId: Schema.String,
  observedAt: Schema.optional(Schema.String),
});
export type SetManualPriceInput = typeof SetManualPriceInput.Type;

export const MaintainAssetInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  symbol: Schema.optional(Schema.String),
  manualPrice: Schema.optional(SetManualPriceInput),
});
export type MaintainAssetInput = typeof MaintainAssetInput.Type;

export const PositionEditAccount = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  connectionId: Schema.NullOr(Schema.String),
  connectionName: Schema.NullOr(Schema.String),
  baseCurrencyAssetId: Schema.String,
  baseCurrencyIso: Schema.String,
});
export type PositionEditAccount = typeof PositionEditAccount.Type;

export const PositionEdit = Schema.Struct({
  position: Position,
  account: PositionEditAccount,
});
export type PositionEdit = typeof PositionEdit.Type;

export const CreatePositionInput = Schema.Struct({
  accountId: Schema.String,
  assetId: Schema.String,
  quantity: DecimalInput,
  averageUnitPurchasePrice: Schema.optional(AverageUnitPurchasePriceInput),
});
export type CreatePositionInput = typeof CreatePositionInput.Type;

export const UpdatePositionInput = Schema.Struct({
  quantity: Schema.optional(DecimalInput),
  averageUnitPurchasePrice: Schema.optional(Schema.NullOr(AverageUnitPurchasePriceInput)),
});
export type UpdatePositionInput = typeof UpdatePositionInput.Type;

// HTML forms intentionally use encoded strings and decode explicitly before mutation.
export const DecimalFromNonEmptyString = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isPattern(/^[+-]?(?:\d+\.?\d*|\.\d+)$/),
);
export const PositionQuantityFormInput = Schema.Struct({ quantity: DecimalFromNonEmptyString });
export type PositionQuantityFormValues = typeof PositionQuantityFormInput.Encoded;

export class FinanceApiError extends Schema.TaggedError<FinanceApiError>()(
  "FinanceApiError",
  {
    code: Schema.Literals([
      "not_found",
      "validation",
      "read_only",
      "conflict",
      "connector_unavailable",
      "database",
      "vault_closed",
      "screen_locked",
    ]),
    message: Schema.String,
  },
  { httpApiStatus: 400 },
) {}

export const SnapshotResult = Schema.Struct({
  id: Schema.String,
  capturedAt: Schema.String,
  positionCount: Schema.Number,
  priceCount: Schema.Number,
});
export type SnapshotResult = typeof SnapshotResult.Type;

export const PriceRefreshFailure = Schema.Struct({
  assetId: Schema.String,
  provider: Schema.Literals(["yahoo-finance", "coingecko"]),
  category: Schema.String,
  message: Schema.String,
});
export type PriceRefreshFailure = typeof PriceRefreshFailure.Type;

export const PriceRefreshResult = Schema.Struct({
  refreshedAssetIds: Schema.Array(Schema.String),
  failures: Schema.Array(PriceRefreshFailure),
});
export type PriceRefreshResult = typeof PriceRefreshResult.Type;

export const ConnectionRefreshResult = Schema.Struct({
  connection: Connection,
  failures: Schema.Array(PriceRefreshFailure),
});
export type ConnectionRefreshResult = typeof ConnectionRefreshResult.Type;

export const PortfolioHistoryPoint = Schema.Struct({
  snapshotId: Schema.String,
  capturedAt: Schema.String,
  total: DecimalString,
  totalIncomplete: Schema.Boolean,
});
export type PortfolioHistoryPoint = typeof PortfolioHistoryPoint.Type;

export const ExistingOrNewAccount = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("existing"),
    id: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("new"),
    name: Schema.Trim.check(Schema.isNonEmpty()),
    baseCurrencyAssetId: Schema.optional(Schema.String),
  }),
]);
export type ExistingOrNewAccount = typeof ExistingOrNewAccount.Type;

export const ProviderAssetInput = Schema.Struct({
  assetCategory: SearchableAssetCategory,
  name: Schema.Trim.check(Schema.isNonEmpty()),
  symbol: Schema.Trim.check(Schema.isNonEmpty()),
  identifiers: Schema.Array(IdentifierInput),
});
export type ProviderAssetInput = typeof ProviderAssetInput.Type;

export const AddManualHoldingInput = Schema.Struct({
  asset: ProviderAssetInput,
  account: ExistingOrNewAccount,
  quantity: DecimalInput,
  averageUnitPurchasePrice: Schema.optional(AverageUnitPurchasePriceInput),
});
export type AddManualHoldingInput = typeof AddManualHoldingInput.Type;

export const AddCashAccountInput = Schema.Struct({
  account: ExistingOrNewAccount,
  currencyAssetId: Schema.String,
  balance: DecimalInput,
});
export type AddCashAccountInput = typeof AddCashAccountInput.Type;

export const AddOtherAssetInput = Schema.Struct({
  category: GenericAssetCategory.pipe(
    Schema.optional,
    Schema.withDecodingDefaultType(Effect.succeed("other" as const)),
  ),
  account: ExistingOrNewAccount,
  name: Schema.Trim.check(Schema.isNonEmpty()),
  value: DecimalInput,
  currencyAssetId: Schema.String,
  averageUnitPurchasePrice: Schema.optional(AverageUnitPurchasePriceInput),
});
export type AddOtherAssetInput = typeof AddOtherAssetInput.Type;

export const AddAssetsResult = Schema.Struct({
  accountId: Schema.String,
  accountName: Schema.String,
  positionOutcome: Schema.Literals(["created", "updated"]),
});
export type AddAssetsResult = typeof AddAssetsResult.Type;

export const LookupManualHoldingParams = Schema.Struct({
  accountId: Schema.String,
  identifierType: Schema.String,
  identifierValue: Schema.String,
});

export const ManualHoldingLookup = Schema.Struct({
  assetId: Schema.NullOr(Schema.String),
  quantity: Schema.NullOr(DecimalString),
});
export type ManualHoldingLookup = typeof ManualHoldingLookup.Type;

export const DashboardAccountRow = Schema.Struct({
  accountId: Schema.String,
  accountName: Schema.String,
  connectionId: Schema.NullOr(Schema.String),
  connectionName: Schema.NullOr(Schema.String),
  positionCount: Schema.Number,
  total: DecimalString,
  unrealizedPnl: DecimalString,
  unrealizedPnlPercent: Schema.NullOr(DecimalString),
  totalIncomplete: Schema.Boolean,
});
export type DashboardAccountRow = typeof DashboardAccountRow.Type;

export const ReportingCurrency = Schema.Struct({
  assetId: Schema.String,
  iso: Schema.String,
});
export type ReportingCurrency = typeof ReportingCurrency.Type;

export const AllocationCell = Schema.Struct({
  key: Schema.String,
  name: Schema.String,
  symbol: Schema.NullOr(Schema.String),
  assetCategory: AssetCategory,
  value: DecimalString,
  percent: DecimalString,
});
export type AllocationCell = typeof AllocationCell.Type;

export const Dashboard = Schema.Struct({
  reportingCurrency: ReportingCurrency,
  portfolioValue: DecimalString,
  unrealizedPnl: DecimalString,
  unrealizedPnlPercent: Schema.NullOr(DecimalString),
  totalIncomplete: Schema.Boolean,
  unpricedAssetCount: Schema.Number,
  negativeHoldingCount: Schema.Number,
  hasMeaningfulAssets: Schema.Boolean,
  accounts: Schema.Array(DashboardAccountRow),
  assetAllocation: Schema.Array(AllocationCell),
  categoryAllocation: Schema.Array(AllocationCell),
  history: Schema.Array(PortfolioHistoryPoint),
});
export type Dashboard = typeof Dashboard.Type;

export const SettingsCurrency = Schema.Struct({
  assetId: Schema.String,
  iso: Schema.String,
  name: Schema.String,
});
export type SettingsCurrency = typeof SettingsCurrency.Type;

export const Settings = Schema.Struct({
  reportingCurrency: ReportingCurrency,
  currencies: Schema.Array(SettingsCurrency),
});
export type Settings = typeof Settings.Type;

export const UpdateSettingsInput = Schema.Struct({
  reportingCurrencyAssetId: Schema.String,
});
export type UpdateSettingsInput = typeof UpdateSettingsInput.Type;

export const SearchAssetsParams = Schema.Struct({
  query: Schema.String,
  assetCategory: SearchableAssetCategory,
});

export const AssetSearchResult = Schema.Struct({
  provider: Schema.Literals(["yahoo-finance", "coingecko"]),
  assetCategory: SearchableAssetCategory,
  name: Schema.String,
  symbol: Schema.String,
  identifiers: Schema.Array(IdentifierInput),
});
export type AssetSearchResult = typeof AssetSearchResult.Type;
