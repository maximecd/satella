import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as HttpApiClient from "@effect/platform/HttpApiClient";
import type {
  AssetSearchResult,
  ConnectCustodianInput,
  CreateAccountInput,
  CreateAssetInput,
  CreateCustodianInput,
  CreatePositionInput,
  SetManualPriceInput,
  UpdateAccountInput,
  UpdateCustomAssetInput,
} from "@optimus/engine/api";
import { EngineApi } from "@optimus/engine/api";
import * as Effect from "effect/Effect";

const engineUrl = import.meta.env["VITE_ENGINE_URL"] ?? "http://127.0.0.1:3001";

const clientEffect = HttpApiClient.make(EngineApi, { baseUrl: engineUrl });
type EngineClient = Effect.Effect.Success<typeof clientEffect>;

const request = <A, E>(operation: (client: EngineClient) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    clientEffect.pipe(Effect.flatMap(operation), Effect.provide(FetchHttpClient.layer)),
  );

export const getHello = () => request((client) => client.system.hello({}));

export const engineApi = {
  connectorCapabilities: () => request((client) => client.finance.connectorCapabilities({})),
  listCustodians: () => request((client) => client.finance.listCustodians({})),
  getCustodian: (id: string) => request((client) => client.finance.getCustodian({ path: { id } })),
  createCustodian: (payload: CreateCustodianInput) =>
    request((client) => client.finance.createCustodian({ payload })),
  connectCustodian: (payload: ConnectCustodianInput) =>
    request((client) => client.finance.connectCustodian({ payload })),
  resyncCustodian: (id: string) =>
    request((client) => client.finance.resyncCustodian({ path: { id } })),
  updateCustodian: (id: string, name: string) =>
    request((client) => client.finance.updateCustodian({ path: { id }, payload: { name } })),
  deleteCustodian: (id: string) =>
    request((client) => client.finance.deleteCustodian({ path: { id } })),
  getAccount: (id: string) => request((client) => client.finance.getAccount({ path: { id } })),
  createAccount: (payload: CreateAccountInput) =>
    request((client) => client.finance.createAccount({ payload })),
  updateAccount: (id: string, payload: UpdateAccountInput) =>
    request((client) => client.finance.updateAccount({ path: { id }, payload })),
  deleteAccount: (id: string) =>
    request((client) => client.finance.deleteAccount({ path: { id } })),
  listAssets: () => request((client) => client.finance.listAssets({})),
  getAsset: (id: string) => request((client) => client.finance.getAsset({ path: { id } })),
  createAsset: (payload: CreateAssetInput) =>
    request((client) => client.finance.createAsset({ payload })),
  updateAsset: (id: string, payload: UpdateCustomAssetInput) =>
    request((client) => client.finance.updateAsset({ path: { id }, payload })),
  setManualPrice: (id: string, payload: SetManualPriceInput) =>
    request((client) => client.finance.setManualPrice({ path: { id }, payload })),
  deleteAsset: (id: string) => request((client) => client.finance.deleteAsset({ path: { id } })),
  getPositionAccount: (id: string) =>
    request((client) => client.finance.getPositionAccount({ path: { id } })),
  createPosition: (payload: CreatePositionInput) =>
    request((client) => client.finance.createPosition({ payload })),
  updatePosition: (id: string, quantity: number) =>
    request((client) => client.finance.updatePosition({ path: { id }, payload: { quantity } })),
  deletePosition: (id: string) =>
    request((client) => client.finance.deletePosition({ path: { id } })),
  portfolioHistory: () => request((client) => client.finance.portfolioHistory({})),
  refreshPrices: () => request((client) => client.finance.refreshPrices({})),
  captureSnapshot: () => request((client) => client.finance.captureSnapshot({})),
  searchAssets: (query: string, assetClass: AssetSearchResult["assetClass"]) =>
    request((client) => client.finance.searchAssets({ urlParams: { query, assetClass } })),
};
