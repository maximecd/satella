import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { engineApi } from "../api";
import {
  populatedDashboardFor,
  renderRoute,
  resetFinanceMocks,
  settings,
} from "../finance.route-harness.test-utils";

vi.mock("../api", async () => import("../engine-api.test-utils"));

describe("settings screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("shows Reporting currency and a Connections row without diagnostic sections", async () => {
    renderRoute("/settings");
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Reporting currency")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Connections/ })).toHaveAttribute(
      "href",
      "/settings/connections",
    );
    expect(screen.getByRole("link", { name: /Security/ })).toHaveAttribute(
      "href",
      "/settings/security",
    );
    expect(screen.queryByText("Institutions & wallets")).not.toBeInTheDocument();
    expect(screen.queryByText("Advanced data")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Custodians/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("saves Reporting currency immediately", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.updateSettings).mockResolvedValue({
      ...settings,
      reportingCurrency: { assetId: "fiat:EUR", iso: "EUR" },
    });
    renderRoute("/settings");
    await user.click(await screen.findByLabelText("Reporting currency"));
    await user.click(await screen.findByRole("option", { name: /EUR/ }));
    await waitFor(() =>
      expect(engineApi.updateSettings).toHaveBeenCalledWith({
        reportingCurrencyAssetId: "fiat:EUR",
      }),
    );
  });

  it("saves Reporting currency immediately and updates Dashboard values", async () => {
    const user = userEvent.setup();
    const usd = populatedDashboardFor(new Date("2026-08-15T12:00:00.000Z"));
    const eur = {
      ...usd,
      reportingCurrency: { assetId: "fiat:EUR", iso: "EUR" },
      portfolioValue: 1000,
    };
    let reporting = settings;
    vi.mocked(engineApi.getDashboard).mockImplementation(async () =>
      reporting.reportingCurrency.iso === "EUR" ? eur : usd,
    );
    vi.mocked(engineApi.getSettings).mockImplementation(async () => reporting);
    vi.mocked(engineApi.updateSettings).mockImplementation(async (payload) => {
      reporting = {
        ...settings,
        reportingCurrency: { assetId: payload.reportingCurrencyAssetId, iso: "EUR" },
      };
      return reporting;
    });
    renderRoute("/");
    expect(await screen.findByText(/1[.,]100[.,]00 USD/)).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Settings" }));
    const selector = await screen.findByLabelText("Reporting currency");
    await user.click(selector);
    await user.click(await screen.findByRole("option", { name: /EUR/ }));
    await waitFor(() =>
      expect(engineApi.updateSettings).toHaveBeenCalledWith({
        reportingCurrencyAssetId: "fiat:EUR",
      }),
    );
    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    expect(await screen.findByText(/1[.,]000[.,]00 EUR/)).toBeInTheDocument();
  });
});
