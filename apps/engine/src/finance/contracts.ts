import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { DecimalInput, DecimalString } from "./financial-number.js";

export const AssetCategory = Schema.Literals(["stocks_etfs", "crypto", "cash", "other"]);
export type AssetCategory = typeof AssetCategory.Type;

export const ASSET_CATEGORY_LABELS = {
  stocks_etfs: "Stocks & ETFs",
  crypto: "Crypto",
  cash: "Cash",
  other: "Other assets",
} satisfies Record<AssetCategory, string>;

export const SearchableAssetCategory = Schema.Literals(["stocks_etfs", "crypto"]);
export type SearchableAssetCategory = typeof SearchableAssetCategory.Type;

export const AccountType = Schema.Literals([
  "checking",
  "savings",
  "brokerage",
  "crypto_wallet",
  "other",
]);
export type AccountType = typeof AccountType.Type;

export const CashAccountType = Schema.Literals(["checking", "savings"]);
export type CashAccountType = typeof CashAccountType.Type;

export const HoldingAccountType = Schema.Literals(["brokerage", "crypto_wallet"]);
export type HoldingAccountType = typeof HoldingAccountType.Type;

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
});
export type Price = typeof Price.Type;

export const AverageUnitPurchasePrice = Schema.Struct({
  price: DecimalString,
  currencyAssetId: Schema.String,
  currencyIso: Schema.String,
  source: Schema.Literals(["manual", "synced"]),
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
  custodianId: Schema.String,
  custodianName: Schema.String,
  isDefaultCustodian: Schema.Boolean,
  accountType: AccountType,
  name: Schema.String,
  baseCurrencyAssetId: Schema.String,
  baseCurrencyIso: Schema.String,
  connectorAccountId: Schema.NullOr(Schema.String),
  positions: Schema.Array(Position),
  total: DecimalString,
  unrealizedPnl: DecimalString,
  unrealizedPnlPercent: Schema.NullOr(DecimalString),
  totalIncomplete: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type Account = typeof Account.Type;

export const AccountSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  accountType: AccountType,
  baseCurrencyIso: Schema.String,
  connectorAccountId: Schema.NullOr(Schema.String),
  positionCount: Schema.Number,
});
export type AccountSummary = typeof AccountSummary.Type;

export const Custodian = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  connectorId: Schema.NullOr(Schema.String),
  isDefault: Schema.Boolean,
  accounts: Schema.Array(AccountSummary),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  syncState: Schema.optional(Schema.Literals(["ready", "reauthentication_required"])),
  lastRefreshAttemptAt: Schema.optional(Schema.NullOr(Schema.String)),
});
export type Custodian = typeof Custodian.Type;

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
  autoRefreshIntervalMs: Schema.optional(Schema.Number),
  authenticationMode: Schema.optional(Schema.Literals(["immediate", "interactive"])),
});
export type ConnectorCapability = typeof ConnectorCapability.Type;

export const ConnectorCapabilities = Schema.Struct({
  connectors: Schema.Array(ConnectorCapability),
});

export const EntityIdPath = Schema.Struct({ id: Schema.String });

/** Credentials are stored in the connector configuration for later refreshes. */
export const ConnectorCredentials = Schema.Record(Schema.String, Schema.String);
export type ConnectorCredentials = typeof ConnectorCredentials.Type;

export const ConnectorAuthenticationChallenge = Schema.Struct({
  kind: Schema.Literal("confirmation_code"),
  prompt: Schema.String,
  length: Schema.Literal(4),
  expiresAt: Schema.String,
});
export type ConnectorAuthenticationChallenge = typeof ConnectorAuthenticationChallenge.Type;

/** Public input for the two-step connector authentication flow. */
export const StartConnectorAuthenticationInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  connectorId: Schema.Trim.check(Schema.isNonEmpty()),
  credentials: ConnectorCredentials,
  custodianId: Schema.optional(Schema.String),
});
export type StartConnectorAuthenticationInput = typeof StartConnectorAuthenticationInput.Type;

export const SubmitConnectorAuthenticationInput = Schema.Struct({
  code: Schema.String,
});
export type SubmitConnectorAuthenticationInput = typeof SubmitConnectorAuthenticationInput.Type;

export const ConnectorAuthenticationAttempt = Schema.Struct({
  attemptId: Schema.String,
  challenge: ConnectorAuthenticationChallenge,
});
export type ConnectorAuthenticationAttempt = typeof ConnectorAuthenticationAttempt.Type;

export const ConnectCustodianInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  connectorId: Schema.Trim.check(Schema.isNonEmpty()),
  credentials: ConnectorCredentials,
});
export type ConnectCustodianInput = typeof ConnectCustodianInput.Type;

export const CreateCustodianInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
});
export type CreateCustodianInput = typeof CreateCustodianInput.Type;

export const UpdateCustodianInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  credentials: Schema.optional(ConnectorCredentials),
});
export type UpdateCustodianInput = typeof UpdateCustodianInput.Type;

export const CreateAccountInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  custodianId: Schema.String,
  accountType: AccountType,
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
  custodianId: Schema.String,
  custodianName: Schema.String,
  isDefaultCustodian: Schema.Boolean,
  accountType: AccountType,
  connectorAccountId: Schema.NullOr(Schema.String),
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

export const CustodianRefreshResult = Schema.Struct({
  custodian: Custodian,
  failures: Schema.Array(PriceRefreshFailure),
});
export type CustodianRefreshResult = typeof CustodianRefreshResult.Type;

export const PortfolioHistoryPoint = Schema.Struct({
  snapshotId: Schema.String,
  capturedAt: Schema.String,
  total: DecimalString,
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

export const ExistingOrNewHoldingAccount = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("existing"),
    id: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("new"),
    name: Schema.Trim.check(Schema.isNonEmpty()),
    accountType: HoldingAccountType,
    baseCurrencyAssetId: Schema.optional(Schema.String),
  }),
]);
export type ExistingOrNewHoldingAccount = typeof ExistingOrNewHoldingAccount.Type;

export const ProviderAssetInput = Schema.Struct({
  assetCategory: SearchableAssetCategory,
  name: Schema.Trim.check(Schema.isNonEmpty()),
  symbol: Schema.Trim.check(Schema.isNonEmpty()),
  identifiers: Schema.Array(IdentifierInput),
});
export type ProviderAssetInput = typeof ProviderAssetInput.Type;

export const AddManualHoldingInput = Schema.Struct({
  asset: ProviderAssetInput,
  custodian: ExistingOrNewCustodian,
  account: ExistingOrNewHoldingAccount,
  quantity: DecimalInput,
  averageUnitPurchasePrice: Schema.optional(AverageUnitPurchasePriceInput),
});
export type AddManualHoldingInput = typeof AddManualHoldingInput.Type;

export const AddCashAccountInput = Schema.Struct({
  accountType: CashAccountType,
  custodian: ExistingOrNewCustodian,
  name: Schema.Trim.check(Schema.isNonEmpty()),
  currencyAssetId: Schema.String,
  balance: DecimalInput,
});
export type AddCashAccountInput = typeof AddCashAccountInput.Type;

export const AddOtherAssetInput = Schema.Struct({
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
  accountType: AccountType,
  positionCount: Schema.Number,
  total: DecimalString,
  unrealizedPnl: DecimalString,
  unrealizedPnlPercent: Schema.NullOr(DecimalString),
  totalIncomplete: Schema.Boolean,
});
export type DashboardAccountRow = typeof DashboardAccountRow.Type;

export const DashboardCustodianGroup = Schema.Struct({
  custodianId: Schema.String,
  name: Schema.String,
  isDefault: Schema.Boolean,
  connectorId: Schema.NullOr(Schema.String),
  accounts: Schema.Array(DashboardAccountRow),
});
export type DashboardCustodianGroup = typeof DashboardCustodianGroup.Type;

export const ReportingCurrency = Schema.Struct({
  assetId: Schema.String,
  iso: Schema.String,
});
export type ReportingCurrency = typeof ReportingCurrency.Type;

export const AppLanguage = Schema.Literals(["en", "fr"]);
export type AppLanguage = typeof AppLanguage.Type;

export const AllocationCell = Schema.Struct({
  key: Schema.String,
  name: Schema.String,
  symbol: Schema.NullOr(Schema.String),
  assetCategory: Schema.optional(AssetCategory),
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
  custodians: Schema.Array(DashboardCustodianGroup),
  custodianAllocation: Schema.Array(AllocationCell),
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

export const EvmRpcUrls = Schema.Struct({
  ethereum: Schema.String,
  base: Schema.String,
  arbitrum: Schema.String,
  optimism: Schema.String,
});
export type EvmRpcUrls = typeof EvmRpcUrls.Type;

export const EvmRpcSettings = Schema.Union([
  Schema.Struct({ mode: Schema.Literal("public") }),
  Schema.Struct({ mode: Schema.Literal("custom"), urls: EvmRpcUrls }),
]);
export type EvmRpcSettings = typeof EvmRpcSettings.Type;

export const Settings = Schema.Struct({
  reportingCurrency: ReportingCurrency,
  currencies: Schema.Array(SettingsCurrency),
  language: AppLanguage,
  evmRpc: EvmRpcSettings,
});
export type Settings = typeof Settings.Type;

export const UpdateSettingsInput = Schema.Struct({
  reportingCurrencyAssetId: Schema.optional(Schema.String),
  language: Schema.optional(AppLanguage),
  evmRpc: Schema.optional(EvmRpcSettings),
});
export type UpdateSettingsInput = typeof UpdateSettingsInput.Type;

export const SyncLogSubjectKind = Schema.Literals(["asset", "custodian"]);
export type SyncLogSubjectKind = typeof SyncLogSubjectKind.Type;

export const SyncLogAction = Schema.Literals(["price_check", "refresh"]);
export type SyncLogAction = typeof SyncLogAction.Type;

export const SyncLogOutcome = Schema.Literals(["success", "failure"]);
export type SyncLogOutcome = typeof SyncLogOutcome.Type;

export const SyncLogEntry = Schema.Struct({
  id: Schema.String,
  completedAt: Schema.String,
  subjectKind: SyncLogSubjectKind,
  subjectName: Schema.String,
  action: SyncLogAction,
  outcome: SyncLogOutcome,
  failureReason: Schema.NullOr(Schema.String),
});
export type SyncLogEntry = typeof SyncLogEntry.Type;

export const SyncLogParams = Schema.Struct({
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.String),
});

export const SyncLogPage = Schema.Struct({
  entries: Schema.Array(SyncLogEntry),
  nextCursor: Schema.NullOr(Schema.String),
});
export type SyncLogPage = typeof SyncLogPage.Type;

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
