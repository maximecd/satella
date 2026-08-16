import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";

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
  });

  it("keeps Settings selected on nested Connection routes", async () => {
    renderRoute("/settings/connections");
    expect(await screen.findByRole("heading", { name: "Connections" })).toBeInTheDocument();
    expect(within(sideNav()).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("persists sidebar collapse locally", async () => {
    const user = userEvent.setup();
    renderRoute("/");
    await user.click(await screen.findByRole("button", { name: /collapse sidebar/i }));
    expect(window.localStorage.getItem("optimus.sidebar.collapsed")).toBe("true");
    expect(within(sideNav()).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-label",
      "Dashboard",
    );
  });

  it("does not register obsolete Custodian or asset catalog routes", () => {
    const routeFiles = Object.keys(import.meta.glob("../routes/*.{ts,tsx}"));
    expect(routeFiles.some((file) => /custodian/i.test(file))).toBe(false);
    expect(routeFiles.some((file) => file.includes("assets.index"))).toBe(false);
    expect(routeFiles.some((file) => file.includes("settings.connections"))).toBe(true);
    expect(routeFiles.some((file) => file.includes("assets.$assetId.edit"))).toBe(true);
  });
});
