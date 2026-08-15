import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { engineApi } from "../api";
import { account, renderRoute, resetFinanceMocks } from "../finance.route-harness.test-utils";

vi.mock("../api", async () => import("../engine-api.test-utils"));

describe("accounts screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
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
    expect(within(breadcrumbs).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/",
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
});
