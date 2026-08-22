import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset } from "@satella-app/engine/api";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  failPortfolioEngine,
  renderRoute,
  resetFinanceMocks,
  seedPortfolioEngine,
} from "../finance.route-harness.test-utils";
import { PortfolioFailure } from "../portfolio";

const usd: Asset = {
  id: "fiat:USD",
  assetCategory: "cash",
  name: "US dollar",
  symbol: "USD",
  identifiers: [],
  price: null,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

const collectible = (overrides: Partial<Asset> = {}): Asset => ({
  id: "asset-1",
  assetCategory: "other",
  name: "Private company",
  symbol: null,
  identifiers: [],
  price: null,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
  ...overrides,
});

describe("asset screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("saves name, symbol, and manual price as one task and shows the updated Asset", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({ assets: [usd, collectible()] });
    renderRoute("/assets/asset-1/edit");
    expect(
      await screen.findByRole("heading", { name: "Edit Private company" }),
    ).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Studio");
    await user.type(screen.getByLabelText(/Symbol/i), "STUDIO");
    await user.type(screen.getByLabelText(/Manual price/i), "25");
    await user.click(screen.getByRole("button", { name: "Save asset" }));
    expect(await screen.findByRole("heading", { name: "Edit Studio" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Studio");
    expect(screen.getByLabelText(/Symbol/i)).toHaveValue("STUDIO");
    expect(screen.getByLabelText(/Manual price/i)).toHaveValue("25");
  });

  it("keeps the accessible failure message when maintenance fails", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({ assets: [usd, collectible()] });
    failPortfolioEngine(new PortfolioFailure("validation", "Asset name is required"), [
      "updateAsset",
    ]);
    renderRoute("/assets/asset-1/edit");
    await user.click(await screen.findByRole("button", { name: "Save asset" }));
    expect(await screen.findByText("Asset name is required")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit Private company" })).toBeInTheDocument();
  });
});
