import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  renderRoute,
  resetFinanceMocks,
  seedPortfolioEngine,
  connectedPositionEdit,
} from "../finance.route-harness.test-utils";

describe("positions screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("renders the focused Position-edit model without an Account-shaped payload", async () => {
    renderRoute("/positions/active-position/edit");
    expect(await screen.findByRole("heading", { name: "Edit Unpriced asset" })).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity")).toHaveValue("2");
    expect(screen.getByRole("link", { name: "Portfolio" })).toHaveAttribute(
      "href",
      "/accounts/account-1",
    );
  });

  it("uses Connection breadcrumbs from the focused read model", async () => {
    seedPortfolioEngine({ positionEdits: [connectedPositionEdit] });
    renderRoute("/positions/connected-position/edit");
    expect(await screen.findByRole("heading", { name: "Edit Bitcoin" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OKX" })).toHaveAttribute(
      "href",
      "/settings/connections/custodian-1",
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
    await user.click(screen.getByRole("button", { name: "Save quantity" }));
    expect(await screen.findByRole("heading", { name: "Portfolio" })).toBeInTheDocument();
    expect(screen.getByText("1.5")).toBeInTheDocument();
  });

  it("shows a required message for an empty numeric field after submit", async () => {
    const user = userEvent.setup();
    renderRoute("/positions/active-position/edit");
    const input = await screen.findByLabelText("Quantity");
    await user.clear(input);

    expect(screen.queryByText("Quantity is required.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save quantity" }));
    expect(screen.getAllByText("Quantity is required.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Unable to decode/)).not.toBeInTheDocument();
  });
});
