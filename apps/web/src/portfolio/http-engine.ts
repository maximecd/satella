import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import {
  EngineApi,
  type AddCashAccountInput,
  type AddManualHoldingInput,
  type AddOtherAssetInput,
  type ConnectCustodianInput,
  type MaintainAssetInput,
  type CreateDebtInput,
  type CreateGoalInput,
  type UpdateDebtInput,
  type UpdateGoalInput,
  type UpdateAccountInput,
  type UpdateCustodianInput,
  type UpdatePositionInput,
  type UpdateSettingsInput,
} from "@satella-app/engine/api";
import * as Effect from "effect/Effect";

import type { PortfolioEngine, SearchableAssetCategory } from "./engine";
import {
  abortError,
  isAbortLike,
  PortfolioFailure,
  toPortfolioFailure,
  tryFinanceApiError,
} from "./failure";
import { engineFetch } from "../engine-fetch";
import { engineUrl } from "../runtime";

const fetchEngine = (async (input, init) => {
  const response = await engineFetch(input, init);
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
    listAccountGroups: (signal) => run((client) => client.finance.listAccountGroups({}), signal),
    getSettings: (signal) => run((client) => client.finance.getSettings({}), signal),
    listSyncLog: (cursor, signal) =>
      run(
        (client) =>
          client.finance.listSyncLog({
            query: cursor === undefined ? {} : { cursor },
          }),
        signal,
      ),
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
    updatePosition: (id, payload: UpdatePositionInput, signal) =>
      run((client) => client.finance.updatePosition({ params: { id }, payload }), signal),
    deletePosition: (id, signal) =>
      run((client) => client.finance.deletePosition({ params: { id } }), signal),
    listCustodians: (signal) => run((client) => client.finance.listCustodians({}), signal),
    getCustodian: (id, signal) =>
      run((client) => client.finance.getCustodian({ params: { id } }), signal),
    updateCustodian: (id, payload: UpdateCustodianInput, signal) =>
      run((client) => client.finance.updateCustodian({ params: { id }, payload }), signal),
    deleteCustodian: (id, signal) =>
      run((client) => client.finance.deleteCustodian({ params: { id } }), signal),
    refreshCustodian: (id, signal) =>
      run((client) => client.finance.refreshCustodian({ params: { id } }), signal),
    connectorCapabilities: (signal) =>
      run((client) => client.finance.connectorCapabilities({}), signal),
    listManualAccounts: (signal) => run((client) => client.finance.listManualAccounts({}), signal),
    listManualCustodians: (signal) =>
      run((client) => client.finance.listManualCustodians({}), signal),
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
    connectCustodian: (payload: ConnectCustodianInput, signal) =>
      run((client) => client.finance.connectCustodian({ payload }), signal),
    addManualHolding: (payload: AddManualHoldingInput, signal) =>
      run((client) => client.finance.addManualHolding({ payload }), signal),
    addCashAccount: (payload: AddCashAccountInput, signal) =>
      run((client) => client.finance.addCashAccount({ payload }), signal),
    addOtherAsset: (payload: AddOtherAssetInput, signal) =>
      run((client) => client.finance.addOtherAsset({ payload }), signal),
    listDebts: (signal) => run((client) => client.finance.listDebts({}), signal),
    getDebt: (id, signal) => run((client) => client.finance.getDebt({ params: { id } }), signal),
    createDebt: (payload: CreateDebtInput, signal) =>
      run((client) => client.finance.createDebt({ payload }), signal),
    updateDebt: (id, payload: UpdateDebtInput, signal) =>
      run((client) => client.finance.updateDebt({ params: { id }, payload }), signal),
    deleteDebt: (id, signal) =>
      run((client) => client.finance.deleteDebt({ params: { id } }), signal),
    listGoals: (signal) => run((client) => client.finance.listGoals({}), signal),
    getGoal: (id, signal) => run((client) => client.finance.getGoal({ params: { id } }), signal),
    createGoal: (payload: CreateGoalInput, signal) =>
      run((client) => client.finance.createGoal({ payload }), signal),
    updateGoal: (id, payload: UpdateGoalInput, signal) =>
      run((client) => client.finance.updateGoal({ params: { id }, payload }), signal),
    deleteGoal: (id, signal) =>
      run((client) => client.finance.deleteGoal({ params: { id } }), signal),
  };
};
