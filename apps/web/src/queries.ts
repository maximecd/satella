import { queryOptions } from "@tanstack/react-query";

import { engineApi } from "./api";

export const queryKeys = {
  dashboard: ["dashboard"] as const,
  connections: {
    all: ["connections"] as const,
    detail: (id: string) => ["connections", id] as const,
  },
  connectors: { capabilities: ["connectors", "capabilities"] as const },
  accounts: {
    all: ["accounts"] as const,
    manual: ["accounts", "manual"] as const,
    detail: (id: string) => ["accounts", id] as const,
  },
  positions: { account: (id: string) => ["positions", id, "account"] as const },
  assets: {
    all: ["assets"] as const,
    detail: (id: string) => ["assets", id] as const,
    search: (query: string, assetCategory: "stocks_etfs" | "crypto") =>
      ["assets", "search", assetCategory, query] as const,
    holding: (accountId: string, identifierType: string, identifierValue: string) =>
      ["assets", "holding", accountId, identifierType, identifierValue] as const,
  },
  settings: ["settings"] as const,
  history: ["history"] as const,
};

export const dashboardQuery = queryOptions({
  queryKey: queryKeys.dashboard,
  queryFn: engineApi.getDashboard,
  staleTime: 15_000,
  retry: 1,
});

export const connectionsQuery = queryOptions({
  queryKey: queryKeys.connections.all,
  queryFn: engineApi.listConnections,
  staleTime: 15_000,
  retry: 1,
});

export const connectionQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.connections.detail(id),
    queryFn: () => engineApi.getConnection(id),
    staleTime: 15_000,
    retry: 1,
  });

export const manualAccountsQuery = queryOptions({
  queryKey: queryKeys.accounts.manual,
  queryFn: engineApi.listManualAccounts,
  staleTime: 15_000,
  retry: 1,
});

export const connectorCapabilitiesQuery = queryOptions({
  queryKey: queryKeys.connectors.capabilities,
  queryFn: engineApi.connectorCapabilities,
  staleTime: Number.POSITIVE_INFINITY,
  retry: 1,
});

export const accountQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.accounts.detail(id),
    queryFn: () => engineApi.getAccount(id),
    staleTime: 15_000,
    retry: 1,
  });

export const positionAccountQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.positions.account(id),
    queryFn: () => engineApi.getPositionAccount(id),
    staleTime: 15_000,
    retry: 1,
  });

export const assetsQuery = queryOptions({
  queryKey: queryKeys.assets.all,
  queryFn: engineApi.listAssets,
  staleTime: 15_000,
  retry: 1,
});

export const assetQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.assets.detail(id),
    queryFn: () => engineApi.getAsset(id),
    staleTime: 15_000,
    retry: 1,
  });

export const manualHoldingQuery = (
  accountId: string,
  identifierType: string,
  identifierValue: string,
) =>
  queryOptions({
    queryKey: queryKeys.assets.holding(accountId, identifierType, identifierValue),
    queryFn: () => engineApi.lookupManualHolding(accountId, identifierType, identifierValue),
    enabled: accountId.length > 0 && identifierType.length > 0 && identifierValue.length > 0,
    staleTime: 15_000,
    retry: 1,
  });

export const assetSearchQuery = (query: string, assetCategory: "stocks_etfs" | "crypto") =>
  queryOptions({
    queryKey: queryKeys.assets.search(query, assetCategory),
    queryFn: () => engineApi.searchAssets(query, assetCategory),
    enabled: query.length >= 2,
    staleTime: 60_000,
    retry: 0,
  });

export const settingsQuery = queryOptions({
  queryKey: queryKeys.settings,
  queryFn: engineApi.getSettings,
  staleTime: 15_000,
  retry: 1,
});
