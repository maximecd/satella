import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  populatedDashboardFor,
  renderRoute,
  resetFinanceMocks,
  seedPortfolioEngine,
} from "../finance.route-harness.test-utils";

describe("dashboard screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the focused Add assets state when no Account holds meaningful Assets", async () => {
    renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add assets" }).length).toBeGreaterThan(0);
    expect(screen.getByText("No assets yet")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Portfolio value" })).not.toBeInTheDocument();
  });

  it("shows Portfolio value, allocation, sorted Accounts, and 1M history from first to last daily point", async () => {
    const dashboard = populatedDashboardFor(new Date("2026-08-15T12:00:00.000Z"));
    seedPortfolioEngine({ dashboard });
    renderRoute("/");

    expect(await screen.findByRole("heading", { name: "Portfolio value" })).toBeInTheDocument();
    expect(screen.getByText(/1[.,]100[.,]00 USD/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "1M" })).toBeChecked();
    expect(screen.getByText(/\+90[.,]00 USD \(\+8[.,]91%\)/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Portfolio value history" })).toBeInTheDocument();
    expect(screen.getByText("Incomplete valuation")).toBeInTheDocument();
    const apple = await screen.findByRole("img", {
      name: /Apple \(AAPL\), 800[.,]00 USD, 80%/,
    });
    apple.focus();
    expect(apple).toHaveFocus();
    expect(screen.getByText("1 unpriced asset excluded from allocation.")).toBeInTheDocument();
    expect(screen.getByText("Negative holdings are excluded from allocation.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accounts" })).toBeInTheDocument();

    const accounts = screen.getByRole("list");
    const rows = within(accounts).getAllByRole("link");
    expect(rows[0]).toHaveAccessibleName(/Brokerage/);
    expect(rows[0]).toHaveAttribute("href", "/accounts/brokerage");
    expect(rows[1]).toHaveAccessibleName(/Livret A/);
    expect(within(accounts).getByText(/800[.,]00 USD/)).toBeInTheDocument();
    expect(within(accounts).getByText(/300[.,]00 USD/)).toBeInTheDocument();
    expect(screen.queryByText("Manual")).not.toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });

  it("selects every Portfolio value range and reports sparse history honestly", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({ dashboard: populatedDashboardFor() });
    renderRoute("/");
    expect(await screen.findByText(/\+90[.,]00 USD/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "7D" }));
    expect(screen.getByText("Not enough history")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "3M" }));
    expect(screen.getByText(/\+90[.,]00 USD/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "YTD" }));
    expect(screen.getByText(/\+90[.,]00 USD/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "1Y" }));
    expect(screen.getByText(/\+90[.,]00 USD/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "All" }));
    expect(screen.getByText(/\+90[.,]00 USD/)).toBeInTheDocument();
  });

  it("toggles allocation between Assets and Asset categories", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({ dashboard: populatedDashboardFor() });
    renderRoute("/");
    expect(
      await screen.findByRole("img", { name: /Apple \(AAPL\), 800[.,]00 USD, 80%/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Categories" }));
    expect(
      screen.getByRole("img", { name: /Stocks & ETFs, 800[.,]00 USD, 80%/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Apple \(AAPL\)/ })).not.toBeInTheDocument();
  });

  it("shows an allocation tooltip near the hovered cell", async () => {
    const user = userEvent.setup();
    const dashboard = populatedDashboardFor();
    seedPortfolioEngine({
      dashboard: {
        ...dashboard,
        assetAllocation: dashboard.assetAllocation.map((cell) =>
          cell.key === "apple" ? { ...cell, value: "800.25" } : cell,
        ),
      },
    });
    renderRoute("/");
    const apple = await screen.findByRole("img", {
      name: /Apple \(AAPL\), 800[.,]25 USD, 80%/,
    });
    await user.hover(apple);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Apple • 80%");
    expect(tooltip).toHaveTextContent(/800[.,]25 USD/);
    expect(apple).toHaveTextContent(/800 USD/);
    expect(apple).not.toHaveTextContent(/800[.,]\d/);
  });
});
