import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  connectedAccount,
  renderRoute,
  resetFinanceMocks,
  seedPortfolioEngine,
  syncedConnection,
} from "../finance.route-harness.test-utils";

describe("accounts screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("shows incomplete, zero, and unpriced account states without routine metadata", async () => {
    renderRoute("/accounts/account-1");
    expect(await screen.findByRole("heading", { name: "Portfolio" })).toBeInTheDocument();
    expect(screen.getByText("Total is incomplete")).toBeInTheDocument();
    expect(screen.getByText("Zero positions (1)")).toBeInTheDocument();
    expect(screen.getByText("Unpriced positions (1)")).toBeInTheDocument();
    expect(screen.queryByText("Manual")).not.toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    expect(screen.queryByText("Connector-managed account")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
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

  it("shows native market prices without source or quote-time labels", async () => {
    seedPortfolioEngine({
      accounts: [
        {
          ...connectedAccount,
          id: "account-1",
          connectionId: null,
          connectionName: null,
          name: "Portfolio",
          total: 68,
          totalIncomplete: false,
          positions: [
            {
              ...connectedAccount.positions[0]!,
              accountId: "account-1",
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
        },
      ],
    });

    renderRoute("/accounts/account-1");
    expect(await screen.findByText("Valuation currency USD", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Market price" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Value (USD)" })).toBeInTheDocument();
    expect(screen.getByText("34 EUR")).toBeInTheDocument();
    expect(screen.queryByText(/Delayed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Yahoo Finance/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/68[.,]00 USD/)).toHaveLength(2);
  });

  it("refreshes the owning Connection from a connected Account", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({ connections: [syncedConnection] });
    renderRoute("/accounts/connected-account");
    await user.click(await screen.findByRole("button", { name: "Refresh" }));
    expect((await screen.findAllByText("Connection refreshed.")).length).toBeGreaterThan(0);
  });
});
