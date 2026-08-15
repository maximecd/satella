import { LayerProvider } from "@astryxdesign/core/Layer";
import { Theme } from "@astryxdesign/core/theme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { Account, Connection, Settings } from "@optimus/engine/api";
import { vi } from "vite-plus/test";

import { engineApi } from "./api";
import { routeTree } from "./routeTree.gen";
import { stoneTheme } from "./themes/stone/stoneTheme";

export const account: Account = {
  id: "account-1",
  connectionId: null,
  connectionName: null,
  name: "Portfolio",
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
      assetCategory: "other",
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
      assetCategory: "other",
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

export const syncedConnection: Connection = {
  id: "custodian-1",
  name: "OKX",
  connectorId: "okx",
  accounts: [
    {
      id: "connected-account",
      name: "Trading",
      baseCurrencyIso: "USD",
      connectorAccountId: "trading",
      positionCount: 1,
    },
  ],
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

export const connectedAccount: Account = {
  ...account,
  id: "connected-account",
  connectionId: "custodian-1",
  connectionName: "OKX",
  name: "Trading",
  totalIncomplete: false,
  positions: [
    {
      ...account.positions[0]!,
      id: "connected-position",
      accountId: "connected-account",
      assetName: "Bitcoin",
      assetSymbol: "BTC",
      assetCategory: "crypto",
      quantity: 1,
      price: {
        price: 100,
        currencyAssetId: "fiat:USD",
        currencyIso: "USD",
        source: "coingecko",
        observedAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z",
        isStale: false,
      },
      reportingValue: 100,
    },
  ],
  total: 100,
};

export const settings: Settings = {
  reportingCurrencyAssetId: "fiat:USD",
  reportingCurrencyIso: "USD",
  currencies: [
    { assetId: "fiat:EUR", iso: "EUR", name: "Euro" },
    { assetId: "fiat:USD", iso: "USD", name: "US dollar" },
  ],
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
  vi.mocked(engineApi.listConnections).mockResolvedValue([]);
  vi.mocked(engineApi.listManualAccounts).mockResolvedValue([]);
  vi.mocked(engineApi.getDashboard).mockResolvedValue({ accounts: [] });
  vi.mocked(engineApi.listAssets).mockResolvedValue([]);
  vi.mocked(engineApi.getAccount).mockResolvedValue(account);
  vi.mocked(engineApi.getPositionAccount).mockResolvedValue(account);
  vi.mocked(engineApi.updatePosition).mockResolvedValue(account);
  vi.mocked(engineApi.getSettings).mockResolvedValue(settings);
  vi.mocked(engineApi.updateSettings).mockResolvedValue(settings);
  vi.mocked(engineApi.refreshConnection).mockResolvedValue({
    connection: syncedConnection,
    failures: [],
  });
  vi.mocked(engineApi.getConnection).mockResolvedValue(syncedConnection);
};
