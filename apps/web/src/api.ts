import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import type {
  AddCashAccountInput,
  AddManualHoldingInput,
  AddOtherAssetInput,
  AssetSearchResult,
  ConnectConnectionInput,
  CreateAccountInput,
  CreateAssetInput,
  CreatePositionInput,
  SetManualPriceInput,
  UpdateAccountInput,
  UpdateConnectionInput,
  UpdateCustomAssetInput,
  UpdateSettingsInput,
} from "@optimus/engine/api";
import { EngineApi } from "@optimus/engine/api";
import * as Effect from "effect/Effect";

const engineUrl = import.meta.env["VITE_ENGINE_URL"] ?? "http://127.0.0.1:3001";

const clientEffect = HttpApiClient.make(EngineApi, { baseUrl: engineUrl });
type EngineClient = Effect.Success<typeof clientEffect>;

const request = <A, E>(operation: (client: EngineClient) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    clientEffect.pipe(Effect.flatMap(operation), Effect.provide(FetchHttpClient.layer)),
  );

export const getHello = () => request((client) => client.system.hello({}));

export const engineApi = {
  connectorCapabilities: () => request((client) => client.finance.connectorCapabilities({})),
  getDashboard: () => request((client) => client.finance.getDashboard({})),
  getSettings: () => request((client) => client.finance.getSettings({})),
  updateSettings: (payload: UpdateSettingsInput) =>
    request((client) => client.finance.updateSettings({ payload })),
  listManualAccounts: () => request((client) => client.finance.listManualAccounts({})),
  lookupManualHolding: (accountId: string, identifierType: string, identifierValue: string) =>
    request((client) =>
      client.finance.lookupManualHolding({
        query: { accountId, identifierType, identifierValue },
      }),
    ),
  addManualHolding: (payload: AddManualHoldingInput) =>
    request((client) => client.finance.addManualHolding({ payload })),
  addCashAccount: (payload: AddCashAccountInput) =>
    request((client) => client.finance.addCashAccount({ payload })),
  addOtherAsset: (payload: AddOtherAssetInput) =>
    request((client) => client.finance.addOtherAsset({ payload })),
  listConnections: () => request((client) => client.finance.listConnections({})),
  getConnection: (id: string) =>
    request((client) => client.finance.getConnection({ params: { id } })),
  connectConnection: (payload: ConnectConnectionInput) =>
    request((client) => client.finance.connectConnection({ payload })),
  refreshConnection: (id: string) =>
    request((client) => client.finance.refreshConnection({ params: { id } })),
  updateConnection: (id: string, payload: UpdateConnectionInput) =>
    request((client) => client.finance.updateConnection({ params: { id }, payload })),
  deleteConnection: (id: string) =>
    request((client) => client.finance.deleteConnection({ params: { id } })),
  getAccount: (id: string) => request((client) => client.finance.getAccount({ params: { id } })),
  createAccount: (payload: CreateAccountInput) =>
    request((client) => client.finance.createAccount({ payload })),
  updateAccount: (id: string, payload: UpdateAccountInput) =>
    request((client) => client.finance.updateAccount({ params: { id }, payload })),
  deleteAccount: (id: string) =>
    request((client) => client.finance.deleteAccount({ params: { id } })),
  listAssets: () => request((client) => client.finance.listAssets({})),
  getAsset: (id: string) => request((client) => client.finance.getAsset({ params: { id } })),
  createAsset: (payload: CreateAssetInput) =>
    request((client) => client.finance.createAsset({ payload })),
  updateAsset: (id: string, payload: UpdateCustomAssetInput) =>
    request((client) => client.finance.updateAsset({ params: { id }, payload })),
  setManualPrice: (id: string, payload: SetManualPriceInput) =>
    request((client) => client.finance.setManualPrice({ params: { id }, payload })),
  deleteAsset: (id: string) => request((client) => client.finance.deleteAsset({ params: { id } })),
  getPositionAccount: (id: string) =>
    request((client) => client.finance.getPositionAccount({ params: { id } })),
  createPosition: (payload: CreatePositionInput) =>
    request((client) => client.finance.createPosition({ payload })),
  updatePosition: (id: string, quantity: number) =>
    request((client) => client.finance.updatePosition({ params: { id }, payload: { quantity } })),
  deletePosition: (id: string) =>
    request((client) => client.finance.deletePosition({ params: { id } })),
  portfolioHistory: () => request((client) => client.finance.portfolioHistory({})),
  refreshPrices: () => request((client) => client.finance.refreshPrices({})),
  captureSnapshot: () => request((client) => client.finance.captureSnapshot({})),
  searchAssets: (query: string, assetCategory: AssetSearchResult["assetCategory"]) =>
    request((client) => client.finance.searchAssets({ query: { query, assetCategory } })),
};
