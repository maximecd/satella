import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

export const AssetClass = Schema.Literals(["fiat", "security", "crypto", "custom"]);
export type AssetClass = typeof AssetClass.Type;

export const AccountKind = Schema.Literals(["current", "savings", "securities", "crypto", "other"]);
export type AccountKind = typeof AccountKind.Type;

export const PresentationRole = Schema.Literal("direct_ownership");
export type PresentationRole = typeof PresentationRole.Type;

export const ManagementMode = Schema.Literals(["manual", "synced"]);
export type ManagementMode = typeof ManagementMode.Type;

export const IdentifierInput = Schema.Struct({
  type: Schema.Trim.check(Schema.isNonEmpty()),
  value: Schema.Trim.check(Schema.isNonEmpty()),
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
  assetClasses: Schema.Array(Schema.Literals(["fiat", "security", "crypto"])),
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

export const CreateCustodianInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  managementMode: ManagementMode.pipe(
    Schema.optional,
    Schema.withDecodingDefaultType(Effect.succeed("manual" as const)),
  ),
  connectorId: Schema.optional(Schema.Trim.check(Schema.isNonEmpty())),
  connectorConfig: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});
export type CreateCustodianInput = typeof CreateCustodianInput.Type;

/** Credentials are stored in the connector configuration for future resyncs. */
export const ConnectCustodianInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  connectorId: Schema.Trim.check(Schema.isNonEmpty()),
  credentials: Schema.Record(Schema.String, Schema.Unknown),
});
export type ConnectCustodianInput = typeof ConnectCustodianInput.Type;

export const UpdateCustodianInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  credentials: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});
export type UpdateCustodianInput = typeof UpdateCustodianInput.Type;

export const CreateAccountInput = Schema.Struct({
  custodianId: Schema.String,
  name: Schema.Trim.check(Schema.isNonEmpty()),
  accountKind: AccountKind.pipe(
    Schema.optional,
    Schema.withDecodingDefaultType(Effect.succeed("other" as const)),
  ),
  baseCurrencyAssetId: Schema.optional(Schema.String),
});
export type CreateAccountInput = typeof CreateAccountInput.Type;

export const UpdateAccountInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  baseCurrencyAssetId: Schema.String,
});
export type UpdateAccountInput = typeof UpdateAccountInput.Type;

export const CreateAssetInput = Schema.Struct({
  assetClass: AssetClass,
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
export const NumberFromNonEmptyString = Schema.String.check(Schema.isNonEmpty()).pipe(
  Schema.decodeTo(Schema.Finite, SchemaTransformation.numberFromString),
);
export const PositionQuantityFormInput = Schema.Struct({ quantity: NumberFromNonEmptyString });
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

export const PriceRefreshResult = Schema.Struct({
  refreshedAssetIds: Schema.Array(Schema.String),
  failures: Schema.Array(
    Schema.Struct({
      assetId: Schema.String,
      provider: Schema.Literals(["yahoo-finance", "coingecko"]),
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

export const ExistingOrNewCustodian = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("existing"),
    id: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("new"),
    name: Schema.Trim.check(Schema.isNonEmpty()),
  }),
]);
export type ExistingOrNewCustodian = typeof ExistingOrNewCustodian.Type;

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
  assetClass: Schema.Literals(["security", "crypto"]),
  name: Schema.Trim.check(Schema.isNonEmpty()),
  symbol: Schema.Trim.check(Schema.isNonEmpty()),
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
  accountKind: Schema.Literals(["current", "savings"]),
  custodian: ExistingOrNewCustodian,
  accountName: Schema.Trim.check(Schema.isNonEmpty()),
  currencyAssetId: Schema.String,
  balance: Schema.Number,
});
export type AddCashAccountInput = typeof AddCashAccountInput.Type;

export const AddOtherAssetInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  value: Schema.Number,
  currencyAssetId: Schema.String,
});
export type AddOtherAssetInput = typeof AddOtherAssetInput.Type;

export const AddAssetsResult = Schema.Struct({
  accountId: Schema.String,
  custodianId: Schema.String,
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
  quantity: Schema.NullOr(Schema.Number),
});
export type ManualHoldingLookup = typeof ManualHoldingLookup.Type;

export const DashboardAccountRow = Schema.Struct({
  accountId: Schema.String,
  accountName: Schema.String,
  custodianId: Schema.String,
  custodianName: Schema.String,
  accountKind: AccountKind,
  source: Schema.Literals(["manual", "connected"]),
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
  assetClass: Schema.Literals(["security", "crypto"]),
});

export const AssetSearchResult = Schema.Struct({
  provider: Schema.Literals(["yahoo-finance", "coingecko"]),
  assetClass: Schema.Literals(["security", "crypto"]),
  name: Schema.String,
  symbol: Schema.String,
  identifiers: Schema.Array(IdentifierInput),
});
export type AssetSearchResult = typeof AssetSearchResult.Type;
