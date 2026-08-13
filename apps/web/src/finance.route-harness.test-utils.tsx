import { LayerProvider } from "@astryxdesign/core/Layer";
import { Theme } from "@astryxdesign/core/theme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { Account, Custodian } from "@optimus/engine/api";
import { vi } from "vite-plus/test";

import { engineApi } from "./api";
import { routeTree } from "./routeTree.gen";
import { stoneTheme } from "./themes/stone/stoneTheme";

export const account: Account = {
  id: "account-1",
  custodianId: "custodian-1",
  custodianName: "Broker",
  managementMode: "manual",
  presentationRole: null,
  name: "Portfolio",
  accountKind: "securities",
  baseCurrencyAssetId: "fiat:USD",
  baseCurrencyIso: "USD",
  connectorAccountId: null,
  positions: [
    {
      id: "active-position",
      accountId: "account-1",
      assetId: "asset-1",
      assetName: "Unpriced asset",
      assetSymbol: null,
      assetClass: "custom",
      quantity: 2,
      price: null,
      reportingValue: null,
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
    },
    {
      id: "zero-position",
      accountId: "account-1",
      assetId: "asset-2",
      assetName: "Closed asset",
      assetSymbol: "CLOSED",
      assetClass: "custom",
      quantity: 0,
      price: null,
      reportingValue: null,
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
    },
  ],
  total: 0,
  totalIncomplete: true,
  hasStalePrices: false,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

export const syncedCustodian: Custodian = {
  id: "custodian-1",
  name: "OKX",
  managementMode: "synced",
  presentationRole: null,
  connectorId: "okx",
  accounts: [],
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

export const renderRoute = (path: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient },
  });
  return render(
    <Theme theme={stoneTheme}>
      <LayerProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </LayerProvider>
    </Theme>,
  );
};

export const resetFinanceMocks = () => {
  vi.mocked(engineApi.connectorCapabilities).mockResolvedValue({ connectors: [] });
  vi.mocked(engineApi.listCustodians).mockResolvedValue([]);
  vi.mocked(engineApi.listManualCustodians).mockResolvedValue([]);
  vi.mocked(engineApi.getDashboard).mockResolvedValue({ accounts: [] });
  vi.mocked(engineApi.listAssets).mockResolvedValue([]);
  vi.mocked(engineApi.getAccount).mockResolvedValue(account);
  vi.mocked(engineApi.getPositionAccount).mockResolvedValue(account);
  vi.mocked(engineApi.updatePosition).mockResolvedValue(account);
};
