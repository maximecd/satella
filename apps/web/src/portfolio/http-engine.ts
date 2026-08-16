import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import {
  EngineApi,
  type AddCashAccountInput,
  type AddManualHoldingInput,
  type AddOtherAssetInput,
  type ConnectConnectionInput,
  type MaintainAssetInput,
  type UpdateAccountInput,
  type UpdateConnectionInput,
  type UpdateSettingsInput,
} from "@optimus/engine/api";
import * as Effect from "effect/Effect";

import type { PortfolioEngine, SearchableAssetCategory } from "./engine";
import {
  abortError,
  isAbortLike,
  PortfolioFailure,
  toPortfolioFailure,
  tryFinanceApiError,
} from "./failure";
import { engineUrl } from "../runtime";

const fetchEngine = (async (input, init) => {
  const response = await globalThis.fetch(input, init);
  if (response.ok) return response;
  try {
    const parsed: unknown = JSON.parse(await response.clone().text());
    const failure = tryFinanceApiError(parsed);
    if (failure !== null) throw failure;
  } catch (cause) {
    if (cause instanceof PortfolioFailure) throw cause;
  }
  return response;
}) satisfies typeof fetch;

export const createHttpPortfolioEngine = (baseUrl = engineUrl()): PortfolioEngine => {
  const clientEffect = HttpApiClient.make(EngineApi, { baseUrl });
  type EngineClient = Effect.Success<typeof clientEffect>;
  const run = async <A, E>(
    operation: (client: EngineClient) => Effect.Effect<A, E>,
    signal?: AbortSignal,
  ): Promise<A> => {
    const program = clientEffect.pipe(
      Effect.flatMap(operation),
      Effect.provideService(FetchHttpClient.Fetch, fetchEngine),
      Effect.provide(FetchHttpClient.layer),
    );
    try {
      return await (signal === undefined
        ? Effect.runPromise(program)
        : Effect.runPromise(program, { signal }));
    } catch (cause) {
      if (isAbortLike(cause, signal)) throw abortError(cause);
      throw toPortfolioFailure(cause);
    }
  };

  return {
    getDashboard: (signal) => run((client) => client.finance.getDashboard({}), signal),
    getSettings: (signal) => run((client) => client.finance.getSettings({}), signal),
    updateSettings: (payload: UpdateSettingsInput, signal) =>
      run((client) => client.finance.updateSettings({ payload }), signal),
    listAssets: (signal) => run((client) => client.finance.listAssets({}), signal),
    getAsset: (id, signal) => run((client) => client.finance.getAsset({ params: { id } }), signal),
    updateAsset: (id, payload: MaintainAssetInput, signal) =>
      run((client) => client.finance.updateAsset({ params: { id }, payload }), signal),
    deleteAsset: (id, signal) =>
      run((client) => client.finance.deleteAsset({ params: { id } }), signal),
    getAccount: (id, signal) =>
      run((client) => client.finance.getAccount({ params: { id } }), signal),
    updateAccount: (id, payload: UpdateAccountInput, signal) =>
      run((client) => client.finance.updateAccount({ params: { id }, payload }), signal),
    deleteAccount: (id, signal) =>
      run((client) => client.finance.deleteAccount({ params: { id } }), signal),
    getPositionEdit: (id, signal) =>
      run((client) => client.finance.getPositionEdit({ params: { id } }), signal),
    updatePosition: (id, quantity, signal) =>
      run(
        (client) => client.finance.updatePosition({ params: { id }, payload: { quantity } }),
        signal,
      ),
    deletePosition: (id, signal) =>
      run((client) => client.finance.deletePosition({ params: { id } }), signal),
    listConnections: (signal) => run((client) => client.finance.listConnections({}), signal),
    getConnection: (id, signal) =>
      run((client) => client.finance.getConnection({ params: { id } }), signal),
    updateConnection: (id, payload: UpdateConnectionInput, signal) =>
      run((client) => client.finance.updateConnection({ params: { id }, payload }), signal),
    deleteConnection: (id, signal) =>
      run((client) => client.finance.deleteConnection({ params: { id } }), signal),
    refreshConnection: (id, signal) =>
      run((client) => client.finance.refreshConnection({ params: { id } }), signal),
    connectorCapabilities: (signal) =>
      run((client) => client.finance.connectorCapabilities({}), signal),
    listManualAccounts: (signal) => run((client) => client.finance.listManualAccounts({}), signal),
    lookupManualHolding: (accountId, identifierType, identifierValue, signal) =>
      run(
        (client) =>
          client.finance.lookupManualHolding({
            query: { accountId, identifierType, identifierValue },
          }),
        signal,
      ),
    searchAssets: (query, assetCategory: SearchableAssetCategory, signal) =>
      run((client) => client.finance.searchAssets({ query: { query, assetCategory } }), signal),
    connectConnection: (payload: ConnectConnectionInput, signal) =>
      run((client) => client.finance.connectConnection({ payload }), signal),
    addManualHolding: (payload: AddManualHoldingInput, signal) =>
      run((client) => client.finance.addManualHolding({ payload }), signal),
    addCashAccount: (payload: AddCashAccountInput, signal) =>
      run((client) => client.finance.addCashAccount({ payload }), signal),
    addOtherAsset: (payload: AddOtherAssetInput, signal) =>
      run((client) => client.finance.addOtherAsset({ payload }), signal),
  };
};
