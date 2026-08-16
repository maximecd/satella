import { describe, expect, it } from "vite-plus/test";

import { populatedDashboardFor, settings } from "../finance.route-harness.test-utils";
import { PortfolioFailure } from "./failure";
import { createMemoryPortfolioEngine } from "./memory-engine";

describe("memory portfolio engine", () => {
  it("updates Settings and Dashboard together when Reporting currency changes", async () => {
    const usd = populatedDashboardFor();
    const eur = {
      ...usd,
      reportingCurrency: { assetId: "fiat:EUR", iso: "EUR" },
      portfolioValue: 1000,
    };
    const engine = createMemoryPortfolioEngine({
      dashboard: usd,
      settings,
      projectDashboard: (_dashboard, nextSettings) =>
        nextSettings.reportingCurrency.iso === "EUR" ? eur : usd,
    });

    const next = await engine.updateSettings({ reportingCurrencyAssetId: "fiat:EUR" });
    expect(next.reportingCurrency).toEqual({ assetId: "fiat:EUR", iso: "EUR" });
    expect(await engine.getSettings()).toEqual(next);
    expect(await engine.getDashboard()).toMatchObject({
      reportingCurrency: { assetId: "fiat:EUR", iso: "EUR" },
      portfolioValue: 1000,
    });
  });

  it("rejects an unknown Reporting currency", async () => {
    const engine = createMemoryPortfolioEngine({ settings });
    await expect(
      engine.updateSettings({ reportingCurrencyAssetId: "fiat:GBP" }),
    ).rejects.toMatchObject({ code: "validation", message: "Unknown reporting currency" });
  });

  it("honors cancellation", async () => {
    const engine = createMemoryPortfolioEngine();
    const signal = AbortSignal.abort();
    await expect(engine.getDashboard(signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("restores the original seed on reset", async () => {
    const engine = createMemoryPortfolioEngine({ settings });
    engine.fail(new PortfolioFailure("database", "Vault unavailable"));
    await engine.updateSettings({ reportingCurrencyAssetId: "fiat:EUR" }).catch(() => undefined);
    engine.reset();
    expect((await engine.getSettings()).reportingCurrency.iso).toBe("USD");
    expect(await engine.getDashboard()).toMatchObject({ reportingCurrency: { iso: "USD" } });
  });

  it("updates Asset list, detail, and Account positions together", async () => {
    const { account } = await import("../finance.route-harness.test-utils");
    const engine = createMemoryPortfolioEngine({
      accounts: [account],
      assets: [
        {
          id: "asset-1",
          assetCategory: "other",
          name: "Unpriced asset",
          symbol: null,
          identifiers: [],
          price: null,
          createdAt: "2026-08-11T00:00:00.000Z",
          updatedAt: "2026-08-11T00:00:00.000Z",
        },
      ],
    });
    const next = await engine.updateAsset("asset-1", {
      name: "Studio",
      symbol: "STUDIO",
      manualPrice: { price: 25, currencyAssetId: "fiat:USD" },
    });
    expect(next.name).toBe("Studio");
    expect((await engine.getAsset("asset-1")).symbol).toBe("STUDIO");
    expect((await engine.listAssets())[0]?.price?.price).toBe(25);
    expect((await engine.getAccount("account-1")).positions[0]?.assetName).toBe("Studio");
  });

  it("updates Position quantity on the owning Account", async () => {
    const { account, positionEdit } = await import("../finance.route-harness.test-utils");
    const engine = createMemoryPortfolioEngine({
      accounts: [account],
      positionEdits: [positionEdit],
    });
    const next = await engine.updatePosition("active-position", 1.5);
    expect(next.positions[0]?.quantity).toBe(1.5);
    expect((await engine.getPositionEdit("active-position")).position.quantity).toBe(1.5);
  });
});
