import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { engineApi } from "../api";
import { renderRoute, resetFinanceMocks } from "../finance.route-harness.test-utils";

const sideNav = () => screen.getByRole("navigation", { name: "Side navigation" });

describe("application shell", () => {
  beforeEach(() => {
    resetFinanceMocks();
    window.localStorage.clear();
  });

  it("shows Optimus, Dashboard, and Settings without Workspace grouping", async () => {
    renderRoute("/");
    expect(await screen.findByText("Optimus")).toBeInTheDocument();
    expect(within(sideNav()).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(within(sideNav()).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("Finance workspace")).not.toBeInTheDocument();
    expect(
      within(sideNav()).queryByRole("button", { name: /toggle color mode/i }),
    ).not.toBeInTheDocument();
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
    expect(await screen.findByRole("heading", { name: "Optimus is locked" })).toBeInTheDocument();
  });

  it("keeps Settings selected on nested Custodian routes", async () => {
    renderRoute("/settings/custodians");
    expect(await screen.findByRole("heading", { name: "Custodians" })).toBeInTheDocument();
    expect(within(sideNav()).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("registers Custodian routes and does not register Connection routes", () => {
    const routeFiles = Object.keys(import.meta.glob("../routes/*.{ts,tsx}"));
    expect(routeFiles.some((file) => /custodian/i.test(file))).toBe(true);
    expect(routeFiles.some((file) => file.includes("assets.index"))).toBe(false);
    expect(routeFiles.some((file) => file.includes("settings.connections"))).toBe(false);
    expect(routeFiles.some((file) => file.includes("assets.$assetId.edit"))).toBe(true);
  });
});
