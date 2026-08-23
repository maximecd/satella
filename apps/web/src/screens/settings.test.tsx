import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  populatedDashboardFor,
  renderRoute,
  resetFinanceMocks,
  seedPortfolioEngine,
  settings,
} from "../finance.route-harness.test-utils";
import { changeAppLanguage } from "../i18n";

describe("settings screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
    window.localStorage.clear();
    changeAppLanguage("en");
  });

  it("shows Reporting currency and a Custodians row", async () => {
    renderRoute("/settings");
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Reporting currency")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Custodians/ })).toHaveAttribute(
      "href",
      "/settings/custodians",
    );
    expect(screen.getByRole("link", { name: /Security/ })).toHaveAttribute(
      "href",
      "/settings/security",
    );
    expect(screen.getByRole("link", { name: /Sync log/ })).toHaveAttribute(
      "href",
      "/settings/sync-log",
    );
  });

  it("saves Reporting currency immediately", async () => {
    const user = userEvent.setup();
    renderRoute("/settings");
    await user.selectOptions(await screen.findByLabelText("Reporting currency"), "fiat:EUR");
    expect((await screen.findAllByText("Reporting currency saved.")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Reporting currency")).toHaveDisplayValue(/€|EUR/);
  });

  it("saves one custom RPC URL for each supported EVM chain", async () => {
    const user = userEvent.setup();
    renderRoute("/settings");
    await user.selectOptions(await screen.findByLabelText("RPC source"), "custom");
    await user.type(
      await screen.findByLabelText("Ethereum Mainnet RPC URL"),
      "https://eth.example.test",
    );
    await user.type(screen.getByLabelText("Base RPC URL"), "https://base.example.test");
    await user.type(screen.getByLabelText("Arbitrum One RPC URL"), "https://arb.example.test");
    await user.type(screen.getByLabelText("OP Mainnet RPC URL"), "https://op.example.test");
    await user.click(screen.getByRole("button", { name: "Save RPC settings" }));
    expect((await screen.findAllByText("RPC settings saved.")).length).toBeGreaterThan(0);
  });

  it("defaults Language to the detected app language and saves a change immediately", async () => {
    const user = userEvent.setup();
    renderRoute("/settings");
    const selector = await screen.findByLabelText("Language");
    expect(selector).toHaveValue("en");
    expect(document.documentElement.lang).toBe("en");
    await user.selectOptions(selector, "fr");
    expect((await screen.findAllByText("Language saved.")).length).toBeGreaterThan(0);
    await waitFor(() => expect(document.documentElement.lang).toBe("fr"));
    expect(screen.getByLabelText("Langue")).toHaveDisplayValue(/Français/);
    expect(screen.queryByLabelText("Reporting currency")).not.toBeInTheDocument();
  });

  it("saves Reporting currency immediately and updates Dashboard values", async () => {
    const user = userEvent.setup();
    const usd = populatedDashboardFor(new Date("2026-08-15T12:00:00.000Z"));
    const eur = {
      ...usd,
      reportingCurrency: { assetId: "fiat:EUR" as const, iso: "EUR" },
      portfolioValue: "1000",
    };
    seedPortfolioEngine({
      dashboard: usd,
      settings,
      projectDashboard: (_dashboard, nextSettings) =>
        nextSettings.reportingCurrency.iso === "EUR" ? eur : usd,
    });
    renderRoute("/");
    expect(await screen.findByText(/(\$1[.,]100[.,]00|1[.,]100[.,]00 \$)/)).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Settings" }));
    const selector = await screen.findByLabelText("Reporting currency");
    await user.selectOptions(selector, "fiat:EUR");
    await waitFor(() =>
      expect(screen.getByLabelText("Reporting currency")).toHaveDisplayValue(/€|EUR/),
    );
    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    expect(await screen.findByText(/(€1[.,]000[.,]00|1[.,]000[.,]00 €)/)).toBeInTheDocument();
  });

  it("defaults Theme to System and can switch to Light or Dark", async () => {
    const user = userEvent.setup();
    renderRoute("/settings");
    expect(await screen.findByRole("radio", { name: "System" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement).toHaveClass("dark");
    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(document.documentElement).toHaveClass("light");
  });
});
