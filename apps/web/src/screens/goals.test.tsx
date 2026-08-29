import { screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Goal } from "@satella-app/engine/api";

import {
  account,
  renderRoute,
  resetFinanceMocks,
  seedPortfolioEngine,
  settings,
} from "../finance.route-harness.test-utils";

const usdAsset = {
  id: "fiat:USD",
  assetCategory: "cash" as const,
  name: "US dollar",
  symbol: "USD",
  identifiers: [],
  price: null,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

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

const livret = {
  ...account,
  name: "Livret A",
  accountType: "savings" as const,
  total: "8000",
  totalIncomplete: false,
};

const carGoal: Goal = {
  id: "goal-car",
  name: "Buy a car",
  amount: "15000",
  currencyAssetId: "fiat:EUR",
  currencyIso: "EUR",
  targetDate: "2026-09-01",
  currentAmount: "8000",
  contributingAccounts: [{ id: livret.id, name: "Livret A" }],
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

describe("goals screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the empty state before any Goal exists", async () => {
    renderRoute("/goals");
    expect(await screen.findByRole("heading", { name: "Goals" })).toBeInTheDocument();
    expect(screen.getByText("No goals yet")).toBeInTheDocument();
  });

  it("lists Goals as cards with progress, date, and contributing Accounts", async () => {
    seedPortfolioEngine({ accounts: [livret], goals: [carGoal] });
    renderRoute("/goals");
    expect(await screen.findByRole("heading", { name: "Buy a car" })).toBeInTheDocument();
    expect(screen.getByText("In 17 days")).toBeInTheDocument();
    expect(screen.getByText(/8[.,]000[.,]00.*15[.,]000[.,]00/)).toBeInTheDocument();
    expect(screen.getByText("Livret A")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Buy a car/ })).toHaveAttribute(
      "href",
      "/goals/goal-car/edit",
    );
  });

  it("shows surplus current / target when the bar is full", async () => {
    seedPortfolioEngine({
      accounts: [{ ...livret, total: "20000" }],
      goals: [{ ...carGoal, currentAmount: "20000" }],
    });
    renderRoute("/goals");
    expect(await screen.findByText(/20[.,]000[.,]00.*15[.,]000[.,]00/)).toBeInTheDocument();
  });

  it("creates a Goal through the form with Reporting currency as the default", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({ settings, assets: [usdAsset, eurAsset], accounts: [livret] });
    renderRoute("/goals/new");
    expect(await screen.findByLabelText("Currency")).toHaveValue("fiat:USD");
    await user.type(screen.getByLabelText("Name"), "Emergency fund");
    await user.type(screen.getByLabelText("Target amount"), "10000");
    await user.selectOptions(screen.getByLabelText("Currency"), "fiat:EUR");
    fireEvent.change(screen.getByLabelText("Target date"), { target: { value: "2026-09-30" } });
    await user.click(screen.getByRole("checkbox", { name: "Livret A" }));
    await user.click(screen.getByRole("button", { name: "Add goal" }));
    expect(await screen.findByText("Emergency fund")).toBeInTheDocument();
    expect(screen.getByText("In 46 days")).toBeInTheDocument();
    expect(screen.getByText("Livret A")).toBeInTheDocument();
  });

  it("disables Accounts that already contribute to another Goal", async () => {
    seedPortfolioEngine({
      settings,
      assets: [usdAsset, eurAsset],
      accounts: [livret],
      goals: [carGoal],
    });
    renderRoute("/goals/new");
    expect(await screen.findByRole("checkbox", { name: "Livret A (Buy a car)" })).toBeDisabled();
  });

  it("edits a Goal target amount", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({
      assets: [usdAsset, eurAsset],
      accounts: [livret],
      goals: [carGoal],
    });
    renderRoute("/goals/goal-car/edit");
    expect(await screen.findByLabelText("Target amount")).toHaveValue("15000");
    await user.clear(screen.getByLabelText("Target amount"));
    await user.type(screen.getByLabelText("Target amount"), "18000");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Buy a car")).toBeInTheDocument();
    expect(screen.getByText(/8[.,]000[.,]00.*18[.,]000[.,]00/)).toBeInTheDocument();
  });

  it("deletes a Goal from the edit screen", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({ accounts: [livret], goals: [carGoal] });
    renderRoute("/goals/goal-car/edit");
    await user.click(await screen.findByRole("button", { name: "Delete goal" }));
    await user.click(await screen.findByRole("button", { name: "Delete permanently" }));
    expect(await screen.findByText("No goals yet")).toBeInTheDocument();
  });
});
