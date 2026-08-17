import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Account,
  AddAssetsResult,
  AddCashAccountInput,
  AddManualHoldingInput,
  AddOtherAssetInput,
  Asset,
  ConnectConnectionInput,
  Connection,
  ConnectionRefreshResult,
  MaintainAssetInput,
  Settings,
  UpdateAccountInput,
  UpdateConnectionInput,
  UpdatePositionInput,
  UpdateSettingsInput,
} from "@optimus/engine/api";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { PortfolioEngine, SearchableAssetCategory } from "./engine";
import type { PortfolioFailure } from "./failure";

const dashboardQueryKey = ["dashboard"] as const;
const settingsQueryKey = ["settings"] as const;
const connectionsQueryKey = ["connections"] as const;
const connectionQueryKey = (id: string) => ["connections", id] as const;
const capabilitiesQueryKey = ["connectors", "capabilities"] as const;
const accountsQueryKey = ["accounts"] as const;
const manualAccountsQueryKey = ["accounts", "manual"] as const;
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

export const useUpdateAccount = (id: string) => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<Account, PortfolioFailure, UpdateAccountInput>({
    mutationFn: (input) => engine.updateAccount(id, input),
    onSuccess: async (account) => {
      queryClient.setQueryData(accountQueryKey(id), account);
      await invalidate(queryClient, [
        dashboardQueryKey,
        connectionsQueryKey,
        manualAccountsQueryKey,
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
      await invalidate(queryClient, [dashboardQueryKey, accountsQueryKey, connectionsQueryKey]);
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

export const useConnections = () => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: connectionsQueryKey,
    queryFn: ({ signal }) => engine.listConnections(signal),
    staleTime: 15_000,
    retry: 1,
  });
};

export const useConnection = (id: string) => {
  const engine = usePortfolioEngine();
  return useQuery({
    queryKey: connectionQueryKey(id),
    queryFn: ({ signal }) => engine.getConnection(id, signal),
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

export const useUpdateConnection = (id: string) => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<Connection, PortfolioFailure, UpdateConnectionInput>({
    mutationFn: (input) => engine.updateConnection(id, input),
    onSuccess: async (connection) => {
      queryClient.setQueryData(connectionQueryKey(id), connection);
      await invalidate(queryClient, [connectionsQueryKey, dashboardQueryKey, accountsQueryKey]);
    },
  });
};

export const useDeleteConnection = (id: string) => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<void, PortfolioFailure, void>({
    mutationFn: () => engine.deleteConnection(id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: connectionQueryKey(id) });
      await invalidate(queryClient, [
        connectionsQueryKey,
        dashboardQueryKey,
        accountsQueryKey,
        assetsQueryKey,
      ]);
    },
  });
};

export const useRefreshConnection = () => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<ConnectionRefreshResult, PortfolioFailure, string>({
    mutationFn: (connectionId) => engine.refreshConnection(connectionId),
    onSuccess: async (result) => {
      queryClient.setQueryData(connectionQueryKey(result.connection.id), result.connection);
      await invalidate(queryClient, [
        dashboardQueryKey,
        connectionsQueryKey,
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

export const useConnectConnection = () => {
  const engine = usePortfolioEngine();
  const queryClient = useQueryClient();
  return useMutation<Connection, PortfolioFailure, ConnectConnectionInput>({
    mutationFn: (input) => engine.connectConnection(input),
    onSuccess: async () => {
      await invalidate(queryClient, [
        dashboardQueryKey,
        connectionsQueryKey,
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
      await invalidate(queryClient, [dashboardQueryKey, accountsQueryKey, assetsQueryKey]);
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
