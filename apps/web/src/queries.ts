import { queryOptions } from "@tanstack/react-query";

import { engineApi } from "./api";

export const queryKeys = {
  dashboard: ["dashboard"] as const,
  custodians: {
    all: ["custodians"] as const,
    manual: ["custodians", "manual"] as const,
    detail: (id: string) => ["custodians", id] as const,
  },
  connectors: { capabilities: ["connectors", "capabilities"] as const },
  accounts: {
    all: ["accounts"] as const,
    detail: (id: string) => ["accounts", id] as const,
  },
  positions: { account: (id: string) => ["positions", id, "account"] as const },
  assets: {
    all: ["assets"] as const,
    detail: (id: string) => ["assets", id] as const,
    search: (query: string, assetClass: "security" | "crypto") =>
      ["assets", "search", assetClass, query] as const,
    holding: (accountId: string, identifierType: string, identifierValue: string) =>
      ["assets", "holding", accountId, identifierType, identifierValue] as const,
  },
};

export const dashboardQuery = queryOptions({
  queryKey: queryKeys.dashboard,
  queryFn: engineApi.getDashboard,
  staleTime: 15_000,
  retry: 1,
});

export const custodiansQuery = queryOptions({
  queryKey: queryKeys.custodians.all,
  queryFn: engineApi.listCustodians,
  staleTime: 15_000,
  retry: 1,
});

export const custodianQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.custodians.detail(id),
    queryFn: () => engineApi.getCustodian(id),
    staleTime: 15_000,
    retry: 1,
  });

export const manualCustodiansQuery = queryOptions({
  queryKey: queryKeys.custodians.manual,
  queryFn: engineApi.listManualCustodians,
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

export const assetSearchQuery = (query: string, assetClass: "security" | "crypto") =>
  queryOptions({
    queryKey: queryKeys.assets.search(query, assetClass),
    queryFn: () => engineApi.searchAssets(query, assetClass),
    enabled: query.length >= 2,
    staleTime: 60_000,
    retry: 0,
  });
