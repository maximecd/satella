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
    getDashboard: vi.fn(),
    listManualCustodians: vi.fn(),
    lookupManualHolding: vi.fn(),
    addManualHolding: vi.fn(),
    addCashAccount: vi.fn(),
    addOtherAsset: vi.fn(),
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

const syncedCustodian: Custodian = {
  id: "custodian-1",
  name: "OKX",
  managementMode: "synced",
  presentationRole: null,
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
    vi.mocked(engineApi.listManualCustodians).mockResolvedValue([]);
    vi.mocked(engineApi.getDashboard).mockResolvedValue({ accounts: [] });
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

  it("renders the dashboard instead of redirecting away from /", async () => {
    renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add assets" }).length).toBeGreaterThan(0);
    expect(screen.getByText("No assets yet")).toBeInTheDocument();
    expect(engineApi.getDashboard).toHaveBeenCalled();
  });

  it("opens the add assets modal with a searchable category list", async () => {
    const user = userEvent.setup();
    renderRoute("/");
    await user.click((await screen.findAllByRole("button", { name: "Add assets" }))[0]!);
    expect(await screen.findByRole("heading", { name: "Add assets" })).toBeInTheDocument();
    expect(screen.queryByText("What do you want to add?")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Form progress" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    const search = screen.getByLabelText("Search categories");
    await user.type(search, "crypto");
    expect(screen.getByText("Crypto")).toBeInTheDocument();
    expect(screen.queryByText("Current accounts")).not.toBeInTheDocument();
  });

  it("skips connectors for other assets and validates the form after submit", async () => {
    const user = userEvent.setup();
    renderRoute("/");
    await user.click((await screen.findAllByRole("button", { name: "Add assets" }))[0]!);
    await user.click(await screen.findByRole("button", { name: /Other assets/ }));
    expect(await screen.findByRole("progressbar", { name: "Form progress" })).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    expect(screen.getByRole("progressbar", { name: "Form progress" })).toHaveAttribute(
      "aria-valuemax",
      "2",
    );
    const name = await screen.findByLabelText("Asset name");
    expect(screen.queryByText("Asset name is required.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add asset" }));
    expect(screen.getByText("Asset name is required.")).toBeInTheDocument();
    await user.type(name, " Watch ");
    await user.tab();
    expect(name).toHaveValue("Watch");
  });

  it("renders connector setup fields from connector metadata", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.connectorCapabilities).mockResolvedValue({
      connectors: [
        {
          id: "okx",
          name: "OKX",
          icon: "data:image/svg+xml;base64,PHN2Zy8+",
          instructions:
            "# Connect OKX\n\nCreate a read-only API key.\n\n## Checklist\n\n| Field | Required |\n| --- | --- |\n| API key | Yes |",
          assetClasses: ["crypto"],
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

    renderRoute("/");
    await user.click((await screen.findAllByRole("button", { name: "Add assets" }))[0]!);
    await user.click(await screen.findByRole("button", { name: /Crypto/ }));
    expect(await screen.findByRole("progressbar", { name: "Form progress" })).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    expect(screen.getByRole("progressbar", { name: "Form progress" })).toHaveAttribute(
      "aria-valuemax",
      "3",
    );
    const search = await screen.findByLabelText("Search connectors");
    await user.type(search, "missing");
    expect(screen.getByText("No connectors found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect OKX" })).not.toBeInTheDocument();
    await user.clear(search);
    await user.click(screen.getByRole("button", { name: "Connect OKX" }));

    expect(await screen.findByRole("heading", { name: "Add assets" })).toBeInTheDocument();
    const instructionsToggle = screen.getByRole("button", { name: "Setup instructions" });
    expect(instructionsToggle).toHaveAttribute("aria-expanded", "false");
    await user.click(instructionsToggle);
    expect(instructionsToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "Checklist" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "API key" })).toBeInTheDocument();
    expect(screen.getByText("Create a read-only API key.")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
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
          assetClasses: ["crypto"],
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

  it("keeps Settings as the path to raw custodians", async () => {
    renderRoute("/settings");
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Custodians/ })).toHaveAttribute("href", "/custodians");
    expect(screen.getByRole("link", { name: /^Assets/ })).toHaveAttribute("href", "/assets");
  });

  it("collects a manual crypto holding on one form", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.listAssets).mockResolvedValue([
      {
        id: "fiat:USD",
        assetClass: "fiat",
        name: "US Dollar",
        symbol: "USD",
        identifiers: [],
        price: null,
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z",
      },
    ]);
    vi.mocked(engineApi.searchAssets).mockResolvedValue([
      {
        provider: "coingecko",
        assetClass: "crypto",
        name: "Bitcoin",
        symbol: "BTC",
        identifiers: [{ type: "coingecko", value: "bitcoin" }],
      },
    ]);
    vi.mocked(engineApi.addManualHolding).mockResolvedValue({
      accountId: "account-2",
      custodianId: "custodian-2",
      accountName: "Spot",
      positionOutcome: "created",
    });

    renderRoute("/");
    await user.click((await screen.findAllByRole("button", { name: "Add assets" }))[0]!);
    await user.click(await screen.findByRole("button", { name: /Crypto/ }));

    expect(await screen.findByRole("progressbar", { name: "Form progress" })).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    expect(screen.getByRole("progressbar", { name: "Form progress" })).toHaveAttribute(
      "aria-valuemax",
      "2",
    );
    expect(screen.queryByText("What do you want to add?")).not.toBeInTheDocument();
    expect(screen.queryByText("Find crypto")).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Choose a platform or wallet")).toBeInTheDocument();
    expect(screen.getByLabelText("Choose an account")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Asset"), "bitcoin");
    await user.click(await screen.findByRole("button", { name: /Bitcoin · BTC/ }));
    await user.type(screen.getByLabelText("Choose a platform or wallet"), "Coinbase");
    await user.type(screen.getByLabelText("Choose an account"), "Spot");
    await user.type(screen.getByLabelText("Quantity"), "1.5");
    await user.click(screen.getByRole("button", { name: "Add quantity" }));

    await waitFor(() =>
      expect(engineApi.addManualHolding).toHaveBeenCalledWith({
        asset: {
          assetClass: "crypto",
          name: "Bitcoin",
          symbol: "BTC",
          identifiers: [{ type: "coingecko", value: "bitcoin" }],
        },
        custodian: { type: "new", name: "Coinbase" },
        account: { type: "new", name: "Spot", baseCurrencyAssetId: "fiat:USD" },
        quantity: 1.5,
      }),
    );
  });

  it("collects a cash account on one form", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.listAssets).mockResolvedValue([
      {
        id: "fiat:USD",
        assetClass: "fiat",
        name: "US Dollar",
        symbol: "USD",
        identifiers: [],
        price: null,
        createdAt: "2026-08-11T00:00:00.000Z",
        updatedAt: "2026-08-11T00:00:00.000Z",
      },
    ]);
    vi.mocked(engineApi.addCashAccount).mockResolvedValue({
      accountId: "account-3",
      custodianId: "custodian-3",
      accountName: "Checking",
      positionOutcome: "created",
    });

    renderRoute("/");
    await user.click((await screen.findAllByRole("button", { name: "Add assets" }))[0]!);
    await user.click(await screen.findByRole("button", { name: /Current accounts/ }));

    expect(await screen.findByLabelText("Choose a bank")).toBeInTheDocument();
    expect(screen.getByLabelText("Account name")).toBeInTheDocument();
    expect(screen.getByLabelText("Balance")).toBeInTheDocument();
    expect(screen.queryByText("New account")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Choose a bank"), "Chase");
    await user.type(screen.getByLabelText("Account name"), "Checking");
    await user.type(screen.getByLabelText("Balance"), "2500");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(engineApi.addCashAccount).toHaveBeenCalledWith({
        accountKind: "current",
        custodian: { type: "new", name: "Chase" },
        accountName: "Checking",
        currencyAssetId: "fiat:USD",
        balance: 2500,
      }),
    );
  });
});
