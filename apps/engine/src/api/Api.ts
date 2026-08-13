import { HttpApi } from "effect/unstable/httpapi";
import { HttpApiEndpoint } from "effect/unstable/httpapi";
import { HttpApiGroup } from "effect/unstable/httpapi";
import { HttpApiSchema } from "effect/unstable/httpapi";
import * as Schema from "effect/Schema";

export * from "../finance/contracts.js";
import {
  Account,
  AddAssetsResult,
  AddCashAccountInput,
  AddManualHoldingInput,
  AddOtherAssetInput,
  Asset,
  AssetSearchResult,
  ConnectorCapabilities,
  ConnectCustodianInput,
  CreateAccountInput,
  CreateAssetInput,
  CreateCustodianInput,
  CreatePositionInput,
  Custodian,
  Dashboard,
  FinanceApiError,
  LookupManualHoldingParams,
  ManualHoldingLookup,
  PriceRefreshResult,
  PortfolioHistoryPoint,
  SetManualPriceInput,
  SearchAssetsParams,
  SnapshotResult,
  UpdateAccountInput,
  UpdateCustodianInput,
  UpdateCustomAssetInput,
  UpdatePositionInput,
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
    HttpApiEndpoint.get("listManualCustodians", "/api/manual-custodians", {
      success: Schema.Array(Custodian),
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
    HttpApiEndpoint.get("listCustodians", "/api/custodians", {
      success: Schema.Array(Custodian),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.get("getCustodian", "/api/custodians/:id", {
      params: EntityIdParams,
      success: Custodian,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("createCustodian", "/api/custodians", {
      payload: CreateCustodianInput,
      success: created(Custodian),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("connectCustodian", "/api/custodians/connect", {
      payload: ConnectCustodianInput,
      success: created(Custodian),
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.post("resyncCustodian", "/api/custodians/:id/sync", {
      params: EntityIdParams,
      success: Custodian,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updateCustodian", "/api/custodians/:id", {
      params: EntityIdParams,
      payload: UpdateCustodianInput,
      success: Custodian,
      error: FinanceApiError,
    }),
  )
  .add(
    HttpApiEndpoint.delete("deleteCustodian", "/api/custodians/:id", {
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
      payload: UpdateCustomAssetInput,
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
    HttpApiEndpoint.get("getPositionAccount", "/api/positions/:id", {
      params: EntityIdParams,
      success: Account,
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
  );

export const EngineApi = HttpApi.make("engine").add(SystemApi).add(FinanceApi);
