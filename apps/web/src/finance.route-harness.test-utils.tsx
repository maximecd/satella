import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type {
  Account,
  Custodian,
  Dashboard,
  PositionEdit,
  Settings,
} from "@satella-app/engine/api";
import { vi } from "vite-plus/test";

import { engineApi } from "./api";
import { Provider } from "./components/ui/provider";
import { AppLanguageSync } from "./i18n/AppLanguageSync";
import "./i18n/index.js";

import {
  createMemoryPortfolioEngine,
  PortfolioEngineProvider,
  type MemoryPortfolioSeed,
  type PortfolioEngineOperation,
} from "./portfolio";
import { PortfolioFailure } from "./portfolio/failure";
import { routeTree } from "./routeTree.gen";

export const account: Account = {
  id: "account-1",
  custodianId: "custodian-bank",
  custodianName: "Demo bank",
  isDefaultCustodian: false,
  accountType: "brokerage",
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
      quantity: "2",
      price: null,
      reportingValue: null,
      averageUnitPurchasePrice: null,
      acquisitionCost: null,
      unrealizedPnl: null,
      unrealizedPnlPercent: null,
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
      quantity: "0",
      price: null,
      reportingValue: null,
      averageUnitPurchasePrice: null,
      acquisitionCost: null,
      unrealizedPnl: null,
      unrealizedPnlPercent: null,
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
    },
  ],
  total: "0",
  unrealizedPnl: "0",
  unrealizedPnlPercent: null,
  totalIncomplete: true,
  hasStalePrices: false,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

export const emptyDashboard: Dashboard = {
  reportingCurrency: { assetId: "fiat:USD", iso: "USD" },
  portfolioValue: "0",
  unrealizedPnl: "0",
  unrealizedPnlPercent: null,
  totalIncomplete: false,
  unpricedAssetCount: 0,
  negativeHoldingCount: 0,
  hasMeaningfulAssets: false,
  custodians: [],
  custodianAllocation: [],
  assetAllocation: [],
  categoryAllocation: [],
  history: [],
};

export const settings: Settings = {
  reportingCurrency: { assetId: "fiat:USD", iso: "USD" },
  currencies: [
    { assetId: "fiat:EUR", iso: "EUR", name: "Euro" },
    { assetId: "fiat:USD", iso: "USD", name: "US dollar" },
  ],
  language: "en",
};

export const populatedDashboardFor = (now = new Date()): Dashboard => {
  const utcDay = (daysAgo: number, hours = 0) => {
    const day = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysAgo,
      hours,
    );
    return new Date(day).toISOString();
  };
  return {
    reportingCurrency: { assetId: "fiat:USD", iso: "USD" },
    portfolioValue: "1100",
    unrealizedPnl: "50",
    unrealizedPnlPercent: "0.1",
    totalIncomplete: true,
    unpricedAssetCount: 1,
    negativeHoldingCount: 1,
    hasMeaningfulAssets: true,
    custodians: [
      {
        custodianId: "ibkr",
        name: "IBKR",
        isDefault: false,
        connectorId: "ibkr",
        accounts: [
          {
            accountId: "brokerage",
            accountName: "Brokerage",
            accountType: "brokerage",
            positionCount: 2,
            total: "800",
            unrealizedPnl: "50",
            unrealizedPnlPercent: "0.1",
            totalIncomplete: false,
          },
        ],
      },
      {
        custodianId: "bnp",
        name: "BNP Paribas",
        isDefault: false,
        connectorId: null,
        accounts: [
          {
            accountId: "livret",
            accountName: "Livret A",
            accountType: "savings",
            positionCount: 1,
            total: "300",
            unrealizedPnl: "0",
            unrealizedPnlPercent: null,
            totalIncomplete: true,
          },
        ],
      },
    ],
    custodianAllocation: [
      {
        key: "ibkr",
        name: "IBKR",
        symbol: null,
        value: "800",
        percent: "80",
      },
      {
        key: "bnp",
        name: "BNP Paribas",
        symbol: null,
        value: "200",
        percent: "20",
      },
    ],
    assetAllocation: [
      {
        key: "apple",
        name: "Apple",
        symbol: "AAPL",
        assetCategory: "stocks_etfs",
        value: "800",
        percent: "80",
      },
      {
        key: "euro",
        name: "Euro",
        symbol: "EUR",
        assetCategory: "cash",
        value: "200",
        percent: "20",
      },
    ],
    categoryAllocation: [
      {
        key: "stocks_etfs",
        name: "Stocks & ETFs",
        symbol: null,
        assetCategory: "stocks_etfs",
        value: "800",
        percent: "80",
      },
      {
        key: "cash",
        name: "Cash",
        symbol: null,
        assetCategory: "cash",
        value: "200",
        percent: "20",
      },
    ],
    history: [
      {
        snapshotId: "s1",
        capturedAt: utcDay(20),
        total: "1000",
        totalIncomplete: false,
      },
      {
        snapshotId: "s1b",
        capturedAt: utcDay(20, 18),
        total: "1010",
        totalIncomplete: false,
      },
      {
        snapshotId: "s2",
        capturedAt: utcDay(5),
        total: "1100",
        totalIncomplete: false,
      },
    ],
  };
};

export const populatedDashboard = populatedDashboardFor();

export const syncedCustodian: Custodian = {
  id: "custodian-1",
  name: "OKX",
  connectorId: "okx",
  isDefault: false,
  accounts: [
    {
      id: "connected-account",
      name: "Trading",
      accountType: "crypto_wallet",
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
  custodianId: "custodian-1",
  custodianName: "OKX",
  isDefaultCustodian: false,
  accountType: "crypto_wallet",
  name: "Trading",
  connectorAccountId: "trading",
  totalIncomplete: false,
  positions: [
    {
      ...account.positions[0]!,
      id: "connected-position",
      accountId: "connected-account",
      assetName: "Bitcoin",
      assetSymbol: "BTC",
      assetCategory: "crypto",
      quantity: "1",
      price: {
        price: "100",
        currencyAssetId: "fiat:USD",
        currencyIso: "USD",
        source: "coingecko",
        observedAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z",
        isStale: false,
      },
      reportingValue: "100",
      averageUnitPurchasePrice: null,
      acquisitionCost: null,
      unrealizedPnl: null,
      unrealizedPnlPercent: null,
    },
  ],
  total: "100",
  unrealizedPnl: "0",
  unrealizedPnlPercent: null,
};

export const positionEdit: PositionEdit = {
  position: account.positions[0]!,
  account: {
    id: account.id,
    name: account.name,
    custodianId: account.custodianId,
    custodianName: account.custodianName,
    isDefaultCustodian: account.isDefaultCustodian,
    accountType: account.accountType,
    connectorAccountId: account.connectorAccountId,
    baseCurrencyAssetId: account.baseCurrencyAssetId,
    baseCurrencyIso: account.baseCurrencyIso,
  },
};

export const connectedPositionEdit: PositionEdit = {
  position: connectedAccount.positions[0]!,
  account: {
    id: connectedAccount.id,
    name: connectedAccount.name,
    custodianId: connectedAccount.custodianId,
    custodianName: connectedAccount.custodianName,
    isDefaultCustodian: connectedAccount.isDefaultCustodian,
    accountType: connectedAccount.accountType,
    connectorAccountId: connectedAccount.connectorAccountId,
    baseCurrencyAssetId: connectedAccount.baseCurrencyAssetId,
    baseCurrencyIso: connectedAccount.baseCurrencyIso,
  },
};

export const defaultPortfolioSeed = (): MemoryPortfolioSeed => ({
  dashboard: emptyDashboard,
  settings,
  accounts: [account, connectedAccount],
  positionEdits: [positionEdit, connectedPositionEdit],
});

let sessionSeed: MemoryPortfolioSeed = defaultPortfolioSeed();
let sessionFailure: {
  readonly error: PortfolioFailure | null;
  readonly operations?: ReadonlyArray<PortfolioEngineOperation>;
} | null = null;

export const seedPortfolioEngine = (seed: MemoryPortfolioSeed) => {
  sessionSeed = { ...sessionSeed, ...seed };
};

export const failPortfolioEngine = (
  error: PortfolioFailure | null,
  operations?: ReadonlyArray<PortfolioEngineOperation>,
) => {
  sessionFailure = operations === undefined ? { error } : { error, operations };
};

export const renderRoute = (path: string) => {
  const engine = createMemoryPortfolioEngine(sessionSeed);
  if (sessionFailure !== null) {
    engine.fail(sessionFailure.error, sessionFailure.operations);
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient },
  });
  return render(
    <Provider>
      <QueryClientProvider client={queryClient}>
        <PortfolioEngineProvider engine={engine}>
          <AppLanguageSync />
          <RouterProvider router={router} />
        </PortfolioEngineProvider>
      </QueryClientProvider>
    </Provider>,
  );
};

const openVaultStatus = {
  state: "open" as const,
  screenLock: false,
  pinAttemptsRemaining: 3,
  pinEntryDisabled: false,
  screenLockTimeoutMinutes: 15 as const,
};

export const resetFinanceMocks = () => {
  sessionSeed = defaultPortfolioSeed();
  sessionFailure = null;
  if (vi.isMockFunction(engineApi.vaultStatus)) {
    engineApi.vaultStatus.mockResolvedValue(openVaultStatus);
  } else {
    vi.spyOn(engineApi, "vaultStatus").mockResolvedValue(openVaultStatus);
  }
};
