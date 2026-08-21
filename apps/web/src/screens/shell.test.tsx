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

  it("shows Optimus, Dashboard, and Settings in the sidebar", async () => {
    renderRoute("/");
    expect(await screen.findByText("Optimus")).toBeInTheDocument();
    expect(within(sideNav()).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
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

  it("registers Custodian routes", () => {
    const routeFiles = Object.keys(import.meta.glob("../routes/*.{ts,tsx}"));
    expect(routeFiles.some((file) => /custodian/i.test(file))).toBe(true);
  });
});
