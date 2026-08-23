import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  connectedAccount,
  renderRoute,
  resetFinanceMocks,
  seedPortfolioEngine,
  connectedPositionEdit,
} from "../finance.route-harness.test-utils";

describe("positions screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("renders the Position editor", async () => {
    renderRoute("/positions/active-position/edit");
    expect(await screen.findByRole("heading", { name: "Edit Unpriced asset" })).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity")).toHaveValue("2");
    expect(screen.queryByText(/Unrealized P&L/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Portfolio" })).toHaveAttribute(
      "href",
      "/accounts/account-1",
    );
  });

  it("uses custodian breadcrumbs from the focused read model", async () => {
    seedPortfolioEngine({ positionEdits: [connectedPositionEdit] });
    renderRoute("/positions/connected-position/edit");
    expect(await screen.findByRole("heading", { name: "Edit Bitcoin" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OKX" })).toHaveAttribute(
      "href",
      "/settings/custodians/custodian-1",
    );
  });

  it("shows the canonical missing-Position failure from the engine", async () => {
    renderRoute("/positions/missing-position/edit");
    expect(
      await screen.findByText("Position was not found", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Quantity")).not.toBeInTheDocument();
  });

  it("saves a transformed quantity and shows it on the owning Account", async () => {
    const user = userEvent.setup();
    renderRoute("/positions/active-position/edit");
    const input = await screen.findByLabelText("Quantity");
    await user.clear(input);
    await user.type(input, "1.5");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("heading", { name: "Portfolio" })).toBeInTheDocument();
    expect(screen.getByText("1.5")).toBeInTheDocument();
  });

  it("shows a required message for an empty numeric field after submit", async () => {
    const user = userEvent.setup();
    renderRoute("/positions/active-position/edit");
    const input = await screen.findByLabelText("Quantity");
    await user.clear(input);

    expect(screen.queryByText("Quantity is required.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getAllByText("Quantity is required.").length).toBeGreaterThan(0);
  });

  it("allows a connected purchase price reset to be replaced manually", async () => {
    const user = userEvent.setup();
    const position = {
      ...connectedAccount.positions[0]!,
      averageUnitPurchasePrice: {
        price: "5",
        currencyAssetId: "fiat:USD",
        currencyIso: "USD",
        source: "synced" as const,
      },
      acquisitionCost: "5",
      unrealizedPnl: "95",
      unrealizedPnlPercent: "19",
    };
    seedPortfolioEngine({
      accounts: [
        {
          ...connectedAccount,
          positions: [position],
          unrealizedPnl: "95",
          unrealizedPnlPercent: "19",
        },
      ],
      positionEdits: [{ ...connectedPositionEdit, position }],
    });

    renderRoute("/positions/connected-position/edit");
    const average = await screen.findByLabelText(/Average unit purchase price/);
    expect(average).toHaveValue("5");
    await user.click(screen.getByRole("button", { name: "Reset purchase price" }));
    expect(average).toHaveValue("");
    await user.type(average, "7");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("heading", { name: "Trading" })).toBeInTheDocument();
  });
});
