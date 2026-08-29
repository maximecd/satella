import { screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  renderRoute,
  resetFinanceMocks,
  seedPortfolioEngine,
  settings,
  taxDebt,
} from "../finance.route-harness.test-utils";

const eurAsset = {
  id: "fiat:EUR",
  assetCategory: "cash" as const,
  name: "Euro",
  symbol: "EUR",
  identifiers: [],
  price: null,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

const dueTaxDebt = { ...taxDebt, dueDate: "2026-09-01" };

describe("debts screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the empty state before any debt exists", async () => {
    renderRoute("/debts");
    expect(await screen.findByRole("heading", { name: "Debts" })).toBeInTheDocument();
    expect(screen.getByText("No debts yet")).toBeInTheDocument();
  });

  it("lists debts with kind, amount, and due date in days", async () => {
    seedPortfolioEngine({ debts: [dueTaxDebt] });
    renderRoute("/debts");
    expect(await screen.findByText("Tax bill")).toBeInTheDocument();
    expect(screen.getByText(/Tax · In 17 days/)).toBeInTheDocument();
    expect(screen.getByText(/4[.,]000[.,]00/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tax bill/ })).toHaveAttribute(
      "href",
      "/debts/debt-tax/edit",
    );
  });

  it("creates a debt through the form", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({ settings, assets: [eurAsset] });
    renderRoute("/debts/new");
    await user.type(await screen.findByLabelText("Name"), "Consumer loan");
    await user.selectOptions(screen.getByLabelText("Kind"), "loan");
    await user.type(screen.getByLabelText("Outstanding amount"), "1500.50");
    await user.selectOptions(screen.getByLabelText("Currency"), "fiat:EUR");
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-09-30" } });
    await user.click(screen.getByRole("button", { name: "Add debt" }));
    expect(await screen.findByText("Consumer loan")).toBeInTheDocument();
    expect(screen.getByText(/Loan · In 46 days/)).toBeInTheDocument();
    expect(screen.getByText(/1[.,]500[.,]50/)).toBeInTheDocument();
  });

  it("edits a debt outstanding amount", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({ debts: [dueTaxDebt] });
    renderRoute("/debts/debt-tax/edit");
    expect(await screen.findByLabelText("Outstanding amount")).toHaveValue("4000");
    await user.clear(screen.getByLabelText("Outstanding amount"));
    await user.type(screen.getByLabelText("Outstanding amount"), "2500");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Tax bill")).toBeInTheDocument();
    expect(screen.getByText(/2[.,]500[.,]00/)).toBeInTheDocument();
  });

  it("deletes a debt from the edit screen", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({ debts: [dueTaxDebt] });
    renderRoute("/debts/debt-tax/edit");
    await user.click(await screen.findByRole("button", { name: "Delete debt" }));
    await user.click(await screen.findByRole("button", { name: "Delete permanently" }));
    expect(await screen.findByText("No debts yet")).toBeInTheDocument();
  });
});
