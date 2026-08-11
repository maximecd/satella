import { LayerProvider } from "@astryxdesign/core/Layer";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account } from "@optimus/engine/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { engineApi } from "./api";
import { routeTree } from "./routeTree.gen";

vi.mock("./api", () => ({
  engineApi: {
    connectorCapabilities: vi.fn(),
    listCustodians: vi.fn(),
    getCustodian: vi.fn(),
    createCustodian: vi.fn(),
    updateCustodian: vi.fn(),
    deleteCustodian: vi.fn(),
    getAccount: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    listAssets: vi.fn(),
    getAsset: vi.fn(),
    createAsset: vi.fn(),
    updateAsset: vi.fn(),
    setManualPrice: vi.fn(),
    deleteAsset: vi.fn(),
    getPositionAccount: vi.fn(),
    createPosition: vi.fn(),
    updatePosition: vi.fn(),
    deletePosition: vi.fn(),
    refreshPrices: vi.fn(),
    captureSnapshot: vi.fn(),
    portfolioHistory: vi.fn(),
    searchAssets: vi.fn(),
  },
}));

const account: Account = {
  id: "account-1",
  custodianId: "custodian-1",
  custodianName: "Broker",
  managementMode: "manual",
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

const renderRoute = (path: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient },
  });
  return render(
    <Theme theme={neutralTheme}>
      <LayerProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </LayerProvider>
    </Theme>,
  );
};

describe("finance routes", () => {
  beforeEach(() => {
    vi.mocked(engineApi.connectorCapabilities).mockResolvedValue({ connectors: [] });
    vi.mocked(engineApi.listCustodians).mockResolvedValue([]);
    vi.mocked(engineApi.listAssets).mockResolvedValue([]);
    vi.mocked(engineApi.getAccount).mockResolvedValue(account);
    vi.mocked(engineApi.getPositionAccount).mockResolvedValue(account);
    vi.mocked(engineApi.updatePosition).mockResolvedValue(account);
  });

  it("loads the custodian route through Query and renders its empty state", async () => {
    renderRoute("/custodians");
    expect(await screen.findByRole("heading", { name: "Custodians" })).toBeInTheDocument();
    expect(screen.getByText("No custodians yet")).toBeInTheDocument();
    expect(engineApi.listCustodians).toHaveBeenCalledOnce();
  });

  it("keeps synced setup hidden when the connector registry is empty", async () => {
    renderRoute("/custodians/new");
    expect(await screen.findByRole("heading", { name: "Add custodian" })).toBeInTheDocument();
    expect(screen.queryByText("Sync now")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Connector")).not.toBeInTheDocument();
  });

  it("shows incomplete, zero, and unpriced account states", async () => {
    renderRoute("/accounts/account-1");
    expect(await screen.findByRole("heading", { name: "Portfolio" })).toBeInTheDocument();
    expect(screen.getByText("Total is incomplete")).toBeInTheDocument();
    expect(screen.getByText("Zero positions (1)")).toBeInTheDocument();
    expect(screen.getByText("Unpriced positions (1)")).toBeInTheDocument();
  });

  it("decodes a transformed quantity string before calling the mutation", async () => {
    const user = userEvent.setup();
    renderRoute("/positions/active-position/edit");
    const input = await screen.findByLabelText("Quantity");
    await user.clear(input);
    await user.type(input, "1.5");
    await user.click(screen.getByRole("button", { name: "Save quantity" }));
    expect(engineApi.updatePosition).toHaveBeenCalledWith("active-position", 1.5);
  });
});
