import * as HttpApi from "@effect/platform/HttpApi";
import * as HttpApiEndpoint from "@effect/platform/HttpApiEndpoint";
import * as HttpApiGroup from "@effect/platform/HttpApiGroup";
import * as HttpApiSchema from "@effect/platform/HttpApiSchema";
import * as Schema from "effect/Schema";

export * from "./finance/contracts.js";
import {
  Account,
  Asset,
  AssetSearchResult,
  ConnectorCapabilities,
  ConnectCustodianInput,
  CreateAccountInput,
  CreateAssetInput,
  CreateCustodianInput,
  CreatePositionInput,
  Custodian,
  FinanceApiError,
  PriceRefreshResult,
  PortfolioHistoryPoint,
  SetManualPriceInput,
  SearchAssetsParams,
  SnapshotResult,
  UpdateAccountInput,
  UpdateCustodianInput,
  UpdateCustomAssetInput,
  UpdatePositionInput,
} from "./finance/contracts.js";

export const HelloResponse = Schema.Struct({
  message: Schema.String,
});

const EntityIdParam = HttpApiSchema.param("id", Schema.String);

const SystemApi = HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("hello")`/api/hello`.addSuccess(HelloResponse),
);

export const FinanceApi = HttpApiGroup.make("finance")
  .add(
    HttpApiEndpoint.get("connectorCapabilities")`/api/connectors/capabilities`.addSuccess(
      ConnectorCapabilities,
    ),
  )
  .add(
    HttpApiEndpoint.get("listCustodians")`/api/custodians`
      .addSuccess(Schema.Array(Custodian))
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.get("getCustodian")`/api/custodians/${EntityIdParam}`
      .addSuccess(Custodian)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.post("createCustodian")`/api/custodians`
      .setPayload(CreateCustodianInput)
      .addSuccess(Custodian, { status: 201 })
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.post("connectCustodian")`/api/custodians/connect`
      .setPayload(ConnectCustodianInput)
      .addSuccess(Custodian, { status: 201 })
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.post("resyncCustodian")`/api/custodians/${EntityIdParam}/sync`
      .addSuccess(Custodian)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.patch("updateCustodian")`/api/custodians/${EntityIdParam}`
      .setPayload(UpdateCustodianInput)
      .addSuccess(Custodian)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.del("deleteCustodian")`/api/custodians/${EntityIdParam}`
      .addSuccess(Schema.Void)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.get("getAccount")`/api/accounts/${EntityIdParam}`
      .addSuccess(Account)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.post("createAccount")`/api/accounts`
      .setPayload(CreateAccountInput)
      .addSuccess(Account, { status: 201 })
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.patch("updateAccount")`/api/accounts/${EntityIdParam}`
      .setPayload(UpdateAccountInput)
      .addSuccess(Account)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.del("deleteAccount")`/api/accounts/${EntityIdParam}`
      .addSuccess(Schema.Void)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.get("searchAssets")`/api/assets/search`
      .setUrlParams(SearchAssetsParams)
      .addSuccess(Schema.Array(AssetSearchResult))
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.get("listAssets")`/api/assets`
      .addSuccess(Schema.Array(Asset))
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.get("getAsset")`/api/assets/${EntityIdParam}`
      .addSuccess(Asset)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.post("createAsset")`/api/assets`
      .setPayload(CreateAssetInput)
      .addSuccess(Asset, { status: 201 })
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.patch("updateAsset")`/api/assets/${EntityIdParam}`
      .setPayload(UpdateCustomAssetInput)
      .addSuccess(Asset)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.post("setManualPrice")`/api/assets/${EntityIdParam}/price`
      .setPayload(SetManualPriceInput)
      .addSuccess(Asset)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.del("deleteAsset")`/api/assets/${EntityIdParam}`
      .addSuccess(Schema.Void)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.get("getPositionAccount")`/api/positions/${EntityIdParam}`
      .addSuccess(Account)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.post("createPosition")`/api/positions`
      .setPayload(CreatePositionInput)
      .addSuccess(Account, { status: 201 })
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.patch("updatePosition")`/api/positions/${EntityIdParam}`
      .setPayload(UpdatePositionInput)
      .addSuccess(Account)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.del("deletePosition")`/api/positions/${EntityIdParam}`
      .addSuccess(Schema.Void)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.get("portfolioHistory")`/api/history`
      .addSuccess(Schema.Array(PortfolioHistoryPoint))
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.post("refreshPrices")`/api/prices/refresh`
      .addSuccess(PriceRefreshResult)
      .addError(FinanceApiError),
  )
  .add(
    HttpApiEndpoint.post("captureSnapshot")`/api/snapshots`
      .addSuccess(SnapshotResult, { status: 201 })
      .addError(FinanceApiError),
  );

export const EngineApi = HttpApi.make("engine").add(SystemApi).add(FinanceApi);
