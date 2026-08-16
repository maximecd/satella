import { screen, within } from "@testing-library/react";
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
    expect(
      within(sideNav()).queryByRole("button", { name: /toggle color mode/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps Settings selected on nested Connection routes", async () => {
    renderRoute("/settings/connections");
    expect(await screen.findByRole("heading", { name: "Connections" })).toBeInTheDocument();
    expect(within(sideNav()).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
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
