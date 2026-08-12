import { LayerProvider } from "@astryxdesign/core/Layer";
import { Theme } from "@astryxdesign/core/theme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account, Custodian } from "@optimus/engine/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { engineApi } from "./api";
import { routeTree } from "./routeTree.gen";
import { stoneTheme } from "./themes/stone/stoneTheme";

vi.mock("./api", () => ({
  engineApi: {
    connectorCapabilities: vi.fn(),
    connectCustodian: vi.fn(),
    resyncCustodian: vi.fn(),
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

const syncedCustodian: Custodian = {
  id: "custodian-1",
  name: "OKX",
  managementMode: "synced",
  connectorId: "okx",
  accounts: [],
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
    <Theme theme={stoneTheme}>
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

  it("waits until submit to show friendly errors and trims text fields on blur", async () => {
    const user = userEvent.setup();
    renderRoute("/custodians/new/manual");
    const input = await screen.findByLabelText("Name");

    expect(screen.queryByText("Name is required.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Expected a non empty string/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create custodian" }));
    expect(screen.getByText("Name is required.")).toBeInTheDocument();

    await user.type(input, " Broker ");
    await user.tab();
    expect(input).toHaveValue("Broker");
    expect(input).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(/leading or trailing whitespace/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cannot start or end with spaces/)).not.toBeInTheDocument();
  });

  it("renders connector setup fields from connector metadata", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.connectorCapabilities).mockResolvedValueOnce({
      connectors: [
        {
          id: "okx",
          name: "OKX",
          icon: "data:image/svg+xml;base64,PHN2Zy8+",
          instructions:
            "# Connect OKX\n\nCreate a read-only API key.\n\n## Checklist\n\n| Field | Required |\n| --- | --- |\n| API key | Yes |",
          credentialFields: [
            { key: "apiKey", label: "API key", kind: "text", required: true },
            { key: "secretKey", label: "Secret key", kind: "password", required: true },
            {
              key: "region",
              label: "Region",
              kind: "select",
              required: true,
              options: [{ value: "global", label: "Global" }],
            },
          ],
        },
      ],
    });

    renderRoute("/custodians/new/connector");
    expect(await screen.findByRole("heading", { name: "Connect a service" })).toBeInTheDocument();
    const search = screen.getByLabelText("Search connectors");
    await user.type(search, "missing");
    expect(screen.getByText("No connectors found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect OKX" })).not.toBeInTheDocument();
    await user.clear(search);
    await user.click(screen.getByRole("button", { name: "Connect OKX" }));

    expect(await screen.findByRole("heading", { name: "Connect OKX" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connect a service" })).toBeInTheDocument();
    const instructionsToggle = screen.getByRole("button", { name: "Setup instructions" });
    expect(instructionsToggle).toHaveAttribute("aria-expanded", "false");
    await user.click(instructionsToggle);
    expect(instructionsToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "Checklist" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "API key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose another connector" })).toBeInTheDocument();
    expect(screen.getByText("Create a read-only API key.")).toBeInTheDocument();
    expect(screen.getByText("Custodian name")).toBeInTheDocument();
    expect(screen.getAllByText("API key").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Secret key").length).toBeGreaterThan(0);
    expect(screen.getByText("Region")).toBeInTheDocument();
    expect(screen.queryByText("Environment")).not.toBeInTheDocument();

    const secret = screen.getByLabelText(/Secret key/, { selector: "input" });
    expect(secret).toHaveAttribute("type", "password");
    expect(screen.queryByRole("button", { name: /Secret key/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Connect and import" }));
    expect(screen.getByText("API key is required.")).toBeInTheDocument();
    expect(screen.getByText("Secret key is required.")).toBeInTheDocument();
    expect(secret).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Could not save")).not.toBeInTheDocument();
  });

  it("edits connector credentials while leaving unchanged secrets blank", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.getCustodian).mockResolvedValue(syncedCustodian);
    vi.mocked(engineApi.connectorCapabilities).mockResolvedValue({
      connectors: [
        {
          id: "okx",
          name: "OKX",
          credentialFields: [
            { key: "apiKey", label: "API key", kind: "text", required: true },
            { key: "secretKey", label: "Secret key", kind: "password", required: true },
            {
              key: "region",
              label: "Region",
              kind: "select",
              required: true,
              options: [{ value: "global", label: "Global" }],
            },
          ],
        },
      ],
    });
    vi.mocked(engineApi.updateCustodian).mockResolvedValue(syncedCustodian);

    renderRoute("/custodians/custodian-1/edit");
    expect(await screen.findByRole("heading", { name: "Edit OKX" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Secret key/, { selector: "input" })).toHaveValue("");
    await user.type(screen.getByLabelText("API key"), "replacement-key");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(engineApi.updateCustodian).toHaveBeenCalledWith("custodian-1", {
        name: "OKX",
        credentials: { apiKey: "replacement-key" },
      }),
    );
  });

  it("resyncs a connector-managed custodian from its detail page", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.getCustodian).mockResolvedValue(syncedCustodian);
    vi.mocked(engineApi.resyncCustodian).mockResolvedValue(syncedCustodian);

    renderRoute("/custodians/custodian-1");
    await user.click(await screen.findByRole("button", { name: "Resync" }));

    expect(engineApi.resyncCustodian).toHaveBeenCalledWith("custodian-1");
  });

  it("shows incomplete, zero, and unpriced account states", async () => {
    renderRoute("/accounts/account-1");
    expect(await screen.findByRole("heading", { name: "Portfolio" })).toBeInTheDocument();
    expect(screen.getByText("Total is incomplete")).toBeInTheDocument();
    expect(screen.getByText("Zero positions (1)")).toBeInTheDocument();
    expect(screen.getByText("Unpriced positions (1)")).toBeInTheDocument();
  });

  it("shows the account hierarchy as navigable breadcrumbs", async () => {
    renderRoute("/accounts/account-1");

    const breadcrumbs = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumbs).getByRole("link", { name: "Custodians" })).toHaveAttribute(
      "href",
      "/custodians",
    );
    expect(within(breadcrumbs).getByRole("link", { name: "Broker" })).toHaveAttribute(
      "href",
      "/custodians/custodian-1",
    );
    expect(within(breadcrumbs).getByText("Portfolio")).toHaveAttribute("aria-current", "page");
  });

  it("shows native market prices and values in the account valuation currency", async () => {
    vi.mocked(engineApi.getAccount).mockResolvedValueOnce({
      ...account,
      total: 68,
      totalIncomplete: false,
      positions: [
        {
          ...account.positions[0]!,
          assetName: "EUR ETF",
          quantity: 2,
          price: {
            price: 34,
            currencyAssetId: "fiat:EUR",
            currencyIso: "EUR",
            source: "yahoo-finance",
            observedAt: "2026-08-11T00:00:00.000Z",
            updatedAt: "2026-08-11T00:00:00.000Z",
            isStale: true,
          },
          reportingValue: 68,
        },
      ],
    });

    renderRoute("/accounts/account-1");
    expect(await screen.findByText("Valuation currency USD", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Market price" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Value (USD)" })).toBeInTheDocument();
    expect(screen.getByText("34 EUR")).toBeInTheDocument();
    expect(screen.getByText(/Delayed · Yahoo Finance/)).toBeInTheDocument();
    expect(screen.getAllByText(/68[.,]00 USD/)).toHaveLength(2);
    expect(screen.queryByText("Some prices are stale")).not.toBeInTheDocument();
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

  it("shows a required message for an empty numeric field after submit", async () => {
    const user = userEvent.setup();
    renderRoute("/positions/active-position/edit");
    const input = await screen.findByLabelText("Quantity");
    await user.clear(input);

    expect(screen.queryByText("Quantity is required.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save quantity" }));
    expect(screen.getByText("Quantity is required.")).toBeInTheDocument();
    expect(screen.queryByText(/Unable to decode/)).not.toBeInTheDocument();
  });
});
