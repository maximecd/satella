import { queryOptions } from "@tanstack/react-query";

import { engineApi } from "./api";

export const queryKeys = {
  custodians: {
    all: ["custodians"] as const,
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
  },
};

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

export const assetSearchQuery = (query: string, assetClass: "security" | "crypto") =>
  queryOptions({
    queryKey: queryKeys.assets.search(query, assetClass),
    queryFn: () => engineApi.searchAssets(query, assetClass),
    enabled: query.length >= 2,
    staleTime: 60_000,
    retry: 0,
  });
