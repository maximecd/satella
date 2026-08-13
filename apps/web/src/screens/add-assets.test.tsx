import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { engineApi } from "../api";
import { renderRoute, resetFinanceMocks } from "../finance.route-harness.test-utils";

vi.mock("../api", async () => import("../engine-api.test-utils"));

describe("add assets screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
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
    const name = await screen.findByLabelText("Asset name");
    expect(screen.queryByText("Asset name is required.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add asset" }));
    expect(screen.getByText("Asset name is required.")).toBeInTheDocument();
    await user.type(name, " Watch ");
    await user.tab();
    expect(name).toHaveValue("Watch");
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
    expect(await screen.findByLabelText("Choose a platform or wallet")).toBeInTheDocument();
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
});
