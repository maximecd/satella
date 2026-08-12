import * as HttpApiSchema from "@effect/platform/HttpApiSchema";
import * as Schema from "effect/Schema";

export const AssetClass = Schema.Literal("fiat", "security", "crypto", "custom");
export type AssetClass = typeof AssetClass.Type;

export const AccountKind = Schema.Literal("current", "savings", "securities", "crypto", "other");
export type AccountKind = typeof AccountKind.Type;

export const PresentationRole = Schema.Literal("direct_ownership");
export type PresentationRole = typeof PresentationRole.Type;

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
  currencyIso: Schema.String,
  source: Schema.String,
  observedAt: Schema.String,
  updatedAt: Schema.String,
  isStale: Schema.Boolean,
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
  presentationRole: Schema.NullOr(PresentationRole),
  name: Schema.String,
  accountKind: AccountKind,
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
  accountKind: AccountKind,
  baseCurrencyIso: Schema.String,
  connectorAccountId: Schema.NullOr(Schema.String),
  positionCount: Schema.Number,
});
export type AccountSummary = typeof AccountSummary.Type;

export const Custodian = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  managementMode: ManagementMode,
  presentationRole: Schema.NullOr(PresentationRole),
  connectorId: Schema.NullOr(Schema.String),
  accounts: Schema.Array(AccountSummary),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type Custodian = typeof Custodian.Type;

export const ConnectorCapability = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.optional(Schema.String),
  instructions: Schema.optional(Schema.String),
  assetClasses: Schema.Array(Schema.Literal("fiat", "security", "crypto")),
  credentialFields: Schema.Array(
    Schema.Struct({
      key: Schema.NonEmptyTrimmedString,
      label: Schema.NonEmptyTrimmedString,
      kind: Schema.Literal("text", "password", "select"),
      required: Schema.Boolean,
      options: Schema.optional(
        Schema.Array(
          Schema.Struct({
            value: Schema.NonEmptyTrimmedString,
            label: Schema.NonEmptyTrimmedString,
          }),
        ),
      ),
      helpText: Schema.optional(Schema.NonEmptyTrimmedString),
    }),
  ),
});
export type ConnectorCapability = typeof ConnectorCapability.Type;

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

/** Credentials are stored in the connector configuration for future resyncs. */
export const ConnectCustodianInput = Schema.Struct({
  name: Schema.NonEmptyTrimmedString,
  connectorId: Schema.NonEmptyTrimmedString,
  credentials: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});
export type ConnectCustodianInput = typeof ConnectCustodianInput.Type;

export const UpdateCustodianInput = Schema.Struct({
  name: Schema.NonEmptyTrimmedString,
  credentials: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});
export type UpdateCustodianInput = typeof UpdateCustodianInput.Type;

export const CreateAccountInput = Schema.Struct({
  custodianId: Schema.String,
  name: Schema.NonEmptyTrimmedString,
  accountKind: Schema.optionalWith(AccountKind, { default: () => "other" as const }),
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

export const ExistingOrNewCustodian = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("existing"),
    id: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("new"),
    name: Schema.NonEmptyTrimmedString,
  }),
);
export type ExistingOrNewCustodian = typeof ExistingOrNewCustodian.Type;

export const ExistingOrNewAccount = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("existing"),
    id: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("new"),
    name: Schema.NonEmptyTrimmedString,
    baseCurrencyAssetId: Schema.optional(Schema.String),
  }),
);
export type ExistingOrNewAccount = typeof ExistingOrNewAccount.Type;

export const ProviderAssetInput = Schema.Struct({
  assetClass: Schema.Literal("security", "crypto"),
  name: Schema.NonEmptyTrimmedString,
  symbol: Schema.NonEmptyTrimmedString,
  identifiers: Schema.Array(IdentifierInput),
});
export type ProviderAssetInput = typeof ProviderAssetInput.Type;

export const AddManualHoldingInput = Schema.Struct({
  asset: ProviderAssetInput,
  custodian: ExistingOrNewCustodian,
  account: ExistingOrNewAccount,
  quantity: Schema.Number,
});
export type AddManualHoldingInput = typeof AddManualHoldingInput.Type;

export const AddCashAccountInput = Schema.Struct({
  accountKind: Schema.Literal("current", "savings"),
  custodian: ExistingOrNewCustodian,
  accountName: Schema.NonEmptyTrimmedString,
  currencyAssetId: Schema.String,
  balance: Schema.Number,
});
export type AddCashAccountInput = typeof AddCashAccountInput.Type;

export const AddOtherAssetInput = Schema.Struct({
  name: Schema.NonEmptyTrimmedString,
  value: Schema.Number,
  currencyAssetId: Schema.String,
});
export type AddOtherAssetInput = typeof AddOtherAssetInput.Type;

export const AddAssetsResult = Schema.Struct({
  accountId: Schema.String,
  custodianId: Schema.String,
  accountName: Schema.String,
  positionOutcome: Schema.Literal("created", "updated"),
});
export type AddAssetsResult = typeof AddAssetsResult.Type;

export const LookupManualHoldingParams = Schema.Struct({
  accountId: Schema.String,
  identifierType: Schema.String,
  identifierValue: Schema.String,
});

export const ManualHoldingLookup = Schema.Struct({
  assetId: Schema.NullOr(Schema.String),
  quantity: Schema.NullOr(Schema.Number),
});
export type ManualHoldingLookup = typeof ManualHoldingLookup.Type;

export const DashboardAccountRow = Schema.Struct({
  accountId: Schema.String,
  accountName: Schema.String,
  custodianId: Schema.String,
  custodianName: Schema.String,
  accountKind: AccountKind,
  source: Schema.Literal("manual", "connected"),
  connectorId: Schema.NullOr(Schema.String),
  connectorName: Schema.NullOr(Schema.String),
  baseCurrencyIso: Schema.String,
  positionCount: Schema.Number,
  total: Schema.Number,
  totalIncomplete: Schema.Boolean,
  hasStalePrices: Schema.Boolean,
  presentationRole: Schema.NullOr(PresentationRole),
});
export type DashboardAccountRow = typeof DashboardAccountRow.Type;

export const Dashboard = Schema.Struct({
  accounts: Schema.Array(DashboardAccountRow),
});
export type Dashboard = typeof Dashboard.Type;

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
