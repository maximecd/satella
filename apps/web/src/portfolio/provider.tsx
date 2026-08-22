import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Account,
  AddAssetsResult,
  AddCashAccountInput,
  AddManualHoldingInput,
  AddOtherAssetInput,
  Asset,
  ConnectCustodianInput,
  Custodian,
  CustodianRefreshResult,
  MaintainAssetInput,
  Settings,
  UpdateAccountInput,
  UpdateCustodianInput,
  UpdatePositionInput,
  UpdateSettingsInput,
} from "@satella-app/engine/api";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { PortfolioEngine, SearchableAssetCategory } from "./engine";
import type { PortfolioFailure } from "./failure";

const dashboardQueryKey = ["dashboard"] as const;
const settingsQueryKey = ["settings"] as const;
const custodiansQueryKey = ["custodians"] as const;
const custodianQueryKey = (id: string) => ["custodians", id] as const;
const capabilitiesQueryKey = ["connectors", "capabilities"] as const;
const accountsQueryKey = ["accounts"] as const;
const manualAccountsQueryKey = ["accounts", "manual"] as const;
const manualCustodiansQueryKey = ["custodians", "manual"] as const;
const accountQueryKey = (id: string) => ["accounts", id] as const;
const positionEditQueryKey = (id: string) => ["positions", id, "account"] as const;
const assetsQueryKey = ["assets"] as const;
const assetQueryKey = (id: string) => ["assets", id] as const;
const assetSearchQueryKey = (query: string, assetCategory: SearchableAssetCategory) =>
  ["assets", "search", assetCategory, query] as const;
const holdingQueryKey = (accountId: string, identifierType: string, identifierValue: string) =>
  ["assets", "holding", accountId, identifierType, identifierValue] as const;

const PortfolioEngineContext = createContext<PortfolioEngine | null>(null);

export function PortfolioEngineProvider({
  engine,
  children,
}: {
  readonly engine: PortfolioEngine;
  readonly children: ReactNode;
}) {
  return (
    <PortfolioEngineContext.Provider value={engine}>{children}</PortfolioEngineContext.Provider>
  );
}

const usePortfolioEngine = () => {
  const engine = useContext(PortfolioEngineContext);
  if (engine === null) {
    throw new Error("PortfolioEngineProvider is required");
  }
  return engine;
};

const invalidate = (
  queryClient: ReturnType<typeof useQueryClient>,
  keys: ReadonlyArray<readonly unknown[]>,
) => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

export const useDashboard = () => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: dashboardQueryKey,
    queryFn: ({ signal }) => engine.getDashboard(signal),
    staleTime: 15_000,
    retry: 1,
  });
};

export const useSettings = () => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: settingsQueryKey,
    queryFn: ({ signal }) => engine.getSettings(signal),
    staleTime: 15_000,
    retry: 1,
  });
};

export const useSaveReportingCurrency = () => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<Settings, PortfolioFailure, UpdateSettingsInput>({
    mutationFn: (input) => engine.updateSettings(input),
    onSuccess: async (settings) => {
      queryClient.setQueryData(settingsQueryKey, settings);
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKey });
    },
  });
};

export const useAssets = () => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: assetsQueryKey,
    queryFn: ({ signal }) => engine.listAssets(signal),
    staleTime: 15_000,
    retry: 1,
  });
};

export const useAsset = (id: string) => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: assetQueryKey(id),
    queryFn: ({ signal }) => engine.getAsset(id, signal),
    staleTime: 15_000,
    retry: 1,
  });
};

export const useMaintainAsset = (id: string) => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<Asset, PortfolioFailure, MaintainAssetInput>({
    mutationFn: (input) => engine.updateAsset(id, input),
    onSuccess: async (asset) => {
      queryClient.setQueryData(assetQueryKey(id), asset);
      await invalidate(queryClient, [assetsQueryKey, dashboardQueryKey, accountsQueryKey]);
    },
  });
};

export const useDeleteAsset = (id: string) => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<void, PortfolioFailure, void>({
    mutationFn: () => engine.deleteAsset(id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: assetQueryKey(id) });
      await invalidate(queryClient, [assetsQueryKey, dashboardQueryKey, accountsQueryKey]);
    },
  });
};

export const useAccount = (id: string) => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: accountQueryKey(id),
    queryFn: ({ signal }) => engine.getAccount(id, signal),
    staleTime: 15_000,
    retry: 1,
  });
};

export const useManualAccounts = () => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: manualAccountsQueryKey,
    queryFn: ({ signal }) => engine.listManualAccounts(signal),
    staleTime: 15_000,
    retry: 1,
  });
};

export const useManualCustodians = () => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: manualCustodiansQueryKey,
    queryFn: ({ signal }) => engine.listManualCustodians(signal),
    staleTime: 15_000,
    retry: 1,
  });
};

export const useUpdateAccount = (id: string) => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<Account, PortfolioFailure, UpdateAccountInput>({
    mutationFn: (input) => engine.updateAccount(id, input),
    onSuccess: async (account) => {
      queryClient.setQueryData(accountQueryKey(id), account);
      await invalidate(queryClient, [
        dashboardQueryKey,
        custodiansQueryKey,
        manualAccountsQueryKey,
        manualCustodiansQueryKey,
      ]);
    },
  });
};

export const useDeleteAccount = (id: string) => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<void, PortfolioFailure, void>({
    mutationFn: () => engine.deleteAccount(id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: accountQueryKey(id) });
      await invalidate(queryClient, [dashboardQueryKey, accountsQueryKey, custodiansQueryKey]);
    },
  });
};

export const usePositionEdit = (id: string) => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: positionEditQueryKey(id),
    queryFn: ({ signal }) => engine.getPositionEdit(id, signal),
    staleTime: 15_000,
    retry: 1,
  });
};

export const useUpdatePosition = (id: string, accountId: string) => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<Account, PortfolioFailure, UpdatePositionInput>({
    mutationFn: (input) => engine.updatePosition(id, input),
    onSuccess: async (account) => {
      queryClient.setQueryData(accountQueryKey(accountId), account);
      await invalidate(queryClient, [
        positionEditQueryKey(id),
        accountQueryKey(accountId),
        dashboardQueryKey,
      ]);
    },
  });
};

export const useDeletePosition = (id: string, accountId: string) => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<void, PortfolioFailure, void>({
    mutationFn: () => engine.deletePosition(id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: positionEditQueryKey(id) });
      await invalidate(queryClient, [accountQueryKey(accountId), dashboardQueryKey]);
    },
  });
};

export const useCustodians = () => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: custodiansQueryKey,
    queryFn: ({ signal }) => engine.listCustodians(signal),
    staleTime: 15_000,
    retry: 1,
  });
};

export const useCustodian = (id: string) => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: custodianQueryKey(id),
    queryFn: ({ signal }) => engine.getCustodian(id, signal),
    staleTime: 15_000,
    retry: 1,
  });
};

export const useConnectorCapabilities = () => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: capabilitiesQueryKey,
    queryFn: ({ signal }) => engine.connectorCapabilities(signal),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
};

export const useUpdateCustodian = (id: string) => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<Custodian, PortfolioFailure, UpdateCustodianInput>({
    mutationFn: (input) => engine.updateCustodian(id, input),
    onSuccess: async (custodian) => {
      queryClient.setQueryData(custodianQueryKey(id), custodian);
      await invalidate(queryClient, [custodiansQueryKey, dashboardQueryKey, accountsQueryKey]);
    },
  });
};

export const useDeleteCustodian = (id: string) => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<void, PortfolioFailure, void>({
    mutationFn: () => engine.deleteCustodian(id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: custodianQueryKey(id) });
      await invalidate(queryClient, [
        custodiansQueryKey,
        dashboardQueryKey,
        accountsQueryKey,
        assetsQueryKey,
        manualCustodiansQueryKey,
      ]);
    },
  });
};

export const useRefreshCustodian = () => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<CustodianRefreshResult, PortfolioFailure, string>({
    mutationFn: (custodianId) => engine.refreshCustodian(custodianId),
    onSuccess: async (result) => {
      queryClient.setQueryData(custodianQueryKey(result.custodian.id), result.custodian);
      await invalidate(queryClient, [
        dashboardQueryKey,
        custodiansQueryKey,
        accountsQueryKey,
        assetsQueryKey,
      ]);
    },
  });
};

export const useAssetSearch = (query: string, assetCategory: SearchableAssetCategory) => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: assetSearchQueryKey(query, assetCategory),
    queryFn: ({ signal }) => engine.searchAssets(query, assetCategory, signal),
    enabled: query.length >= 2,
    staleTime: 60_000,
    retry: 0,
  });
};

export const useManualHoldingLookup = (
  accountId: string,
  identifierType: string,
  identifierValue: string,
) => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: holdingQueryKey(accountId, identifierType, identifierValue),
    queryFn: ({ signal }) =>
      engine.lookupManualHolding(accountId, identifierType, identifierValue, signal),
    enabled: accountId.length > 0 && identifierType.length > 0 && identifierValue.length > 0,
    staleTime: 15_000,
    retry: 1,
  });
};

export const useConnectCustodian = () => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<Custodian, PortfolioFailure, ConnectCustodianInput>({
    mutationFn: (input) => engine.connectCustodian(input),
    onSuccess: async () => {
      await invalidate(queryClient, [
        dashboardQueryKey,
        custodiansQueryKey,
        accountsQueryKey,
        assetsQueryKey,
      ]);
    },
  });
};

export const useAddManualHolding = () => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<AddAssetsResult, PortfolioFailure, AddManualHoldingInput>({
    mutationFn: (input) => engine.addManualHolding(input),
    onSuccess: async () => {
      await invalidate(queryClient, [
        dashboardQueryKey,
        accountsQueryKey,
        assetsQueryKey,
        manualCustodiansQueryKey,
        manualAccountsQueryKey,
      ]);
    },
  });
};

export const useAddCashAccount = () => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<AddAssetsResult, PortfolioFailure, AddCashAccountInput>({
    mutationFn: (input) => engine.addCashAccount(input),
    onSuccess: async () => {
      await invalidate(queryClient, [
        dashboardQueryKey,
        accountsQueryKey,
        assetsQueryKey,
        settingsQueryKey,
        manualCustodiansQueryKey,
        manualAccountsQueryKey,
      ]);
    },
  });
};

export const useAddOtherAsset = () => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<AddAssetsResult, PortfolioFailure, AddOtherAssetInput>({
    mutationFn: (input) => engine.addOtherAsset(input),
    onSuccess: async () => {
      await invalidate(queryClient, [dashboardQueryKey, accountsQueryKey, assetsQueryKey]);
    },
  });
};
