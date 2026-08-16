import { HttpApi } from "effect/unstable/httpapi";
import { HttpApiEndpoint } from "effect/unstable/httpapi";
import { HttpApiGroup } from "effect/unstable/httpapi";
import { HttpApiSchema } from "effect/unstable/httpapi";
import * as Schema from "effect/Schema";

export * from "../finance/contracts.js";
export * from "../vault/contracts.js";
import {
  ChangeScreenLockPinInput,
  ChangeVaultPasswordInput,
  InitializeVaultInput,
  ResetVaultInput,
  ScreenLockTimeoutInput,
  UnlockScreenInput,
  UnlockVaultInput,
  VaultApiError,
  VaultStatus,
} from "../vault/contracts.js";
import {
  Account,
  AddAssetsResult,
  AddCashAccountInput,
  AddManualHoldingInput,
  AddOtherAssetInput,
  Asset,
  AssetSearchResult,
  ConnectorCapabilities,
  ConnectConnectionInput,
  CreateAccountInput,
  CreateAssetInput,
  CreatePositionInput,
  Connection,
  Dashboard,
  FinanceApiError,
  LookupManualHoldingParams,
  MaintainAssetInput,
  ManualHoldingLookup,
  PriceRefreshResult,
  PortfolioHistoryPoint,
  PositionEdit,
  SetManualPriceInput,
  ConnectionRefreshResult,
  SearchAssetsParams,
  Settings,
  SnapshotResult,
  UpdateAccountInput,
  UpdateConnectionInput,
  UpdatePositionInput,
  UpdateSettingsInput,
} from "../finance/contracts.js";

export const HelloResponse = Schema.Struct({
  message: Schema.String,
});

const EntityIdParams = { id: Schema.String };
const created = <S extends Schema.Top>(schema: S) => schema.pipe(HttpApiSchema.status(201));

const SystemApi = HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("hello", "/api/hello", { success: HelloResponse }),
);

export const FinanceApi = HttpApiGroup.make("finance")
  .add(
    HttpApiEndpoint.get("connectorCapabilities", "/api/connectors/capabilities", {
      success: ConnectorCapabilities,
    }),
  )
  .add(
    HttpApiEndpoint.get("getDashboard", "/api/dashboard", {
      success: Dashboard,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.get("listManualAccounts", "/api/manual-accounts", {
      success: Schema.Array(Account),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.get("lookupManualHolding", "/api/manual-holdings/lookup", {
      query: LookupManualHoldingParams,
      success: ManualHoldingLookup,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("addManualHolding", "/api/add-assets/holding", {
      payload: AddManualHoldingInput,
      success: created(AddAssetsResult),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("addCashAccount", "/api/add-assets/cash", {
      payload: AddCashAccountInput,
      success: created(AddAssetsResult),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("addOtherAsset", "/api/add-assets/other", {
      payload: AddOtherAssetInput,
      success: created(AddAssetsResult),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.get("listConnections", "/api/connections", {
      success: Schema.Array(Connection),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.get("getConnection", "/api/connections/:id", {
      params: EntityIdParams,
      success: Connection,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("connectConnection", "/api/connections", {
      payload: ConnectConnectionInput,
      success: created(Connection),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("refreshConnection", "/api/connections/:id/refresh", {
      params: EntityIdParams,
      success: ConnectionRefreshResult,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updateConnection", "/api/connections/:id", {
      params: EntityIdParams,
      payload: UpdateConnectionInput,
      success: Connection,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.delete("deleteConnection", "/api/connections/:id", {
      params: EntityIdParams,
      success: Schema.Void,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.get("getAccount", "/api/accounts/:id", {
      params: EntityIdParams,
      success: Account,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("createAccount", "/api/accounts", {
      payload: CreateAccountInput,
      success: created(Account),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updateAccount", "/api/accounts/:id", {
      params: EntityIdParams,
      payload: UpdateAccountInput,
      success: Account,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.delete("deleteAccount", "/api/accounts/:id", {
      params: EntityIdParams,
      success: Schema.Void,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.get("searchAssets", "/api/assets/search", {
      query: SearchAssetsParams,
      success: Schema.Array(AssetSearchResult),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.get("listAssets", "/api/assets", {
      success: Schema.Array(Asset),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.get("getAsset", "/api/assets/:id", {
      params: EntityIdParams,
      success: Asset,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("createAsset", "/api/assets", {
      payload: CreateAssetInput,
      success: created(Asset),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updateAsset", "/api/assets/:id", {
      params: EntityIdParams,
      payload: MaintainAssetInput,
      success: Asset,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("setManualPrice", "/api/assets/:id/price", {
      params: EntityIdParams,
      payload: SetManualPriceInput,
      success: Asset,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.delete("deleteAsset", "/api/assets/:id", {
      params: EntityIdParams,
      success: Schema.Void,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.get("getPositionEdit", "/api/positions/:id", {
      params: EntityIdParams,
      success: PositionEdit,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("createPosition", "/api/positions", {
      payload: CreatePositionInput,
      success: created(Account),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updatePosition", "/api/positions/:id", {
      params: EntityIdParams,
      payload: UpdatePositionInput,
      success: Account,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.delete("deletePosition", "/api/positions/:id", {
      params: EntityIdParams,
      success: Schema.Void,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.get("portfolioHistory", "/api/history", {
      success: Schema.Array(PortfolioHistoryPoint),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("refreshPrices", "/api/prices/refresh", {
      success: PriceRefreshResult,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("captureSnapshot", "/api/snapshots", {
      success: created(SnapshotResult),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.get("getSettings", "/api/settings", {
      success: Settings,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updateSettings", "/api/settings", {
      payload: UpdateSettingsInput,
      success: Settings,
      error: FinanceApiError,
    }),
  );

export const VaultApi = HttpApiGroup.make("vault")
  .add(HttpApiEndpoint.get("status", "/api/vault/status", { success: VaultStatus }))
  .add(
    HttpApiEndpoint.post("initialize", "/api/vault/initialize", {
      payload: InitializeVaultInput,
      success: VaultStatus,
      error: VaultApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("unlock", "/api/vault/unlock", {
      payload: UnlockVaultInput,
      success: VaultStatus,
      error: VaultApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("close", "/api/vault/close", {
      success: VaultStatus,
      error: VaultApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("lockScreen", "/api/vault/lock", {
      success: VaultStatus,
      error: VaultApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("unlockScreen", "/api/vault/unlock-screen", {
      payload: UnlockScreenInput,
      success: VaultStatus,
      error: VaultApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("unlockScreenWithPassword", "/api/vault/unlock-screen-with-password", {
      payload: UnlockVaultInput,
      success: VaultStatus,
      error: VaultApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("changePassword", "/api/vault/password", {
      payload: ChangeVaultPasswordInput,
      success: Schema.Void,
      error: VaultApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("changePin", "/api/vault/pin", {
      payload: ChangeScreenLockPinInput,
      success: Schema.Void,
      error: VaultApiError,
    }),
  )
  .add(
    HttpApiEndpoint.patch("setScreenLockTimeout", "/api/vault/screen-lock-timeout", {
      payload: ScreenLockTimeoutInput,
      success: VaultStatus,
      error: VaultApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("reset", "/api/vault/reset", {
      payload: ResetVaultInput,
      success: VaultStatus,
      error: VaultApiError,
    }),
  );

export const EngineApi = HttpApi.make("engine").add(SystemApi).add(VaultApi).add(FinanceApi);
