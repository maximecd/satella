import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { engineApi } from "../api";
import { renderRoute, resetFinanceMocks, settings } from "../finance.route-harness.test-utils";

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
    expect(screen.queryByText("Institutions & wallets")).not.toBeInTheDocument();
    expect(screen.queryByText("Advanced data")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Custodians/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("saves Reporting currency immediately", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.updateSettings).mockResolvedValue({
      ...settings,
      reportingCurrencyAssetId: "fiat:EUR",
      reportingCurrencyIso: "EUR",
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
});
