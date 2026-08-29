import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { engineApi } from "../api";
import {
  renderRoute,
  resetFinanceMocks,
  seedPortfolioEngine,
  taxDebt,
} from "../finance.route-harness.test-utils";

const sideNav = () => screen.getByRole("navigation", { name: "Side navigation" });

describe("application shell", () => {
  beforeEach(() => {
    resetFinanceMocks();
    window.localStorage.clear();
  });

  it("shows Satella, Dashboard, Accounts, Debts, and Settings in the sidebar", async () => {
    renderRoute("/");
    expect(await screen.findByText("Satella")).toBeInTheDocument();
    expect(within(sideNav()).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(within(sideNav()).getByRole("link", { name: "Accounts" })).toHaveAttribute(
      "href",
      "/accounts",
    );
    expect(within(sideNav()).getByRole("link", { name: "Debts" })).toHaveAttribute(
      "href",
      "/debts",
    );
    expect(within(sideNav()).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(within(sideNav()).getByRole("button", { name: "Lock" })).toBeInTheDocument();
  });

  it("locks the interface from the sidebar", async () => {
    const user = userEvent.setup();
    vi.spyOn(engineApi, "lockScreen").mockResolvedValue({
      state: "open",
      screenLock: true,
      pinAttemptsRemaining: 3,
      pinEntryDisabled: false,
      screenLockTimeoutMinutes: 15,
    });
    renderRoute("/");
    await user.click(await screen.findByRole("button", { name: "Lock" }));
    expect(await screen.findByRole("heading", { name: "Satella is locked" })).toBeInTheDocument();
  });

  it("keeps Settings selected on nested Custodian routes", async () => {
    renderRoute("/settings/custodians");
    expect(await screen.findByRole("heading", { name: "Custodians" })).toBeInTheDocument();
    expect(within(sideNav()).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps Debts selected on nested Debt routes", async () => {
    seedPortfolioEngine({ debts: [taxDebt] });
    renderRoute("/debts/debt-tax/edit");
    expect(await screen.findByRole("heading", { name: "Edit Tax bill" })).toBeInTheDocument();
    expect(within(sideNav()).getByRole("link", { name: "Debts" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("registers Custodian routes", () => {
    const routeFiles = Object.keys(import.meta.glob("../routes/*.{ts,tsx}"));
    expect(routeFiles.some((file) => /custodian/i.test(file))).toBe(true);
  });
});
