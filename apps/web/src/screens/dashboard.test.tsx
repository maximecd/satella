import { screen } from "@testing-library/react";
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
    expect(screen.queryByRole("heading", { name: "Total assets" })).not.toBeInTheDocument();
  });

  it("shows Total assets, allocation, and 1M history from first to last daily point", async () => {
    const dashboard = populatedDashboardFor(new Date("2026-08-15T12:00:00.000Z"));
    seedPortfolioEngine({ dashboard });
    renderRoute("/");

    expect(await screen.findByRole("heading", { name: "Total assets" })).toBeInTheDocument();
    expect(screen.getByText(/(\$1[.,]100[.,]00|1[.,]100[.,]00 \$)/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "1M" })).toBeChecked();
    expect(screen.getByText(/(\+\$90[.,]00|\+90[.,]00 \$) \(\+8[.,]91%\)/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Total assets history" })).toBeInTheDocument();
    expect(screen.getByText("Incomplete valuation")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Assets" }));
    const apple = await screen.findByRole("img", {
      name: /Apple \(AAPL\), (\$800[.,]00|800[.,]00 \$), 80%/,
    });
    apple.focus();
    expect(apple).toHaveFocus();
    expect(screen.getByText("1 unpriced asset excluded from allocation.")).toBeInTheDocument();
    expect(screen.getByText("Negative holdings are excluded from allocation.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "IBKR" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "BNP Paribas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Demo bank" })).not.toBeInTheDocument();
  });

  it("hides the gross/net toggle while there are no debts", async () => {
    seedPortfolioEngine({ dashboard: populatedDashboardFor() });
    renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Total assets" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Net worth" })).not.toBeInTheDocument();
  });

  it("toggles the headline, subline, chart, and change figure between gross and net", async () => {
    const user = userEvent.setup();
    const dashboard = populatedDashboardFor(new Date("2026-08-15T12:00:00.000Z"));
    seedPortfolioEngine({
      dashboard: {
        ...dashboard,
        totalDebt: "100",
        netWorth: "1000",
        history: dashboard.history.map((point) =>
          point.snapshotId === "s2" ? { ...point, totalDebt: "100" } : point,
        ),
      },
    });
    renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Total assets" })).toBeInTheDocument();
    expect(screen.queryByText(/Debts: \$100[.,]00/)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Total assets history" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Net worth" }));
    expect(screen.getByRole("heading", { name: "Net worth" })).toBeInTheDocument();
    expect(screen.getByText(/Debts: \$100[.,]00/)).toBeInTheDocument();
    expect(screen.getByText(/\$1[.,]000[.,]00/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Net worth history" })).toBeInTheDocument();
    expect(screen.getByText(/(-\$10[.,]00|-10[.,]00 \$) \(-0[.,]99%\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Total assets" }));
    expect(screen.getByRole("heading", { name: "Total assets" })).toBeInTheDocument();
    expect(screen.queryByText(/Debts: \$100[.,]00/)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Total assets history" })).toBeInTheDocument();
  });

  it("keeps the allocation unchanged while switching between gross and net", async () => {
    const user = userEvent.setup();
    const dashboard = populatedDashboardFor();
    seedPortfolioEngine({
      dashboard: {
        ...dashboard,
        totalDebt: "100",
        netWorth: "1000",
        history: dashboard.history.map((point) =>
          point.snapshotId === "s2" ? { ...point, totalDebt: "100" } : point,
        ),
      },
    });
    renderRoute("/");
    const gross = await screen.findByRole("img", {
      name: /Stocks & ETFs, (\$800[.,]00|800[.,]00 \$), 80%/,
    });
    expect(gross).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Net worth" }));
    expect(
      screen.getByRole("img", { name: /Stocks & ETFs, (\$800[.,]00|800[.,]00 \$), 80%/ }),
    ).toBeInTheDocument();
  });

  it("selects every Total assets range and reports sparse history honestly", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({ dashboard: populatedDashboardFor() });
    renderRoute("/");
    expect(await screen.findByText(/\+\$90[.,]00|\+90[.,]00 \$/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "7D" }));
    expect(screen.getByText("Not enough history")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "3M" }));
    expect(screen.getByText(/\+\$90[.,]00|\+90[.,]00 \$/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "YTD" }));
    expect(screen.getByText(/\+\$90[.,]00|\+90[.,]00 \$/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "1Y" }));
    expect(screen.getByText(/\+\$90[.,]00|\+90[.,]00 \$/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "All" }));
    expect(screen.getByText(/\+\$90[.,]00|\+90[.,]00 \$/)).toBeInTheDocument();
  });

  it("defaults allocation to Categories and toggles between Categories and Assets", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({ dashboard: populatedDashboardFor() });
    renderRoute("/");
    expect(
      await screen.findByRole("img", { name: /Stocks & ETFs, (\$800[.,]00|800[.,]00 \$), 80%/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Assets" }));
    expect(
      screen.getByRole("img", { name: /Apple \(AAPL\), (\$800[.,]00|800[.,]00 \$), 80%/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Stocks & ETFs/ })).not.toBeInTheDocument();
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
    await user.click(await screen.findByRole("radio", { name: "Assets" }));
    const apple = await screen.findByRole("img", {
      name: /Apple \(AAPL\), (\$800[.,]25|800[.,]25 \$), 80%/,
    });
    await user.hover(apple);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Apple • 80%");
    expect(tooltip).toHaveTextContent(/(\$800[.,]25|800[.,]25 \$)/);
    expect(apple).toHaveTextContent(/(\$800|800 \$)/);
    expect(apple).not.toHaveTextContent(/800[.,]\d/);
  });
});
