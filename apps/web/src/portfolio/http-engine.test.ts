import { FinanceApiError } from "@optimus/engine/api";
import * as Schema from "effect/Schema";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createHttpPortfolioEngine } from "./http-engine";

const dashboard = {
  reportingCurrency: { assetId: "fiat:USD", iso: "USD" },
  portfolioValue: 0,
  totalIncomplete: false,
  unpricedAssetCount: 0,
  negativeHoldingCount: 0,
  hasMeaningfulAssets: false,
  accounts: [],
  assetAllocation: [],
  categoryAllocation: [],
  history: [],
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("http portfolio engine", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads Dashboard from the engine HTTP API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(dashboard)));
    const engine = createHttpPortfolioEngine("http://127.0.0.1:3001");
    await expect(engine.getDashboard()).resolves.toMatchObject({
      reportingCurrency: { iso: "USD" },
    });
  });

  it("converts engine failures into PortfolioFailure", async () => {
    const encoded = Schema.encodeUnknownSync(FinanceApiError)(
      new FinanceApiError({ code: "database", message: "Vault unavailable" }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => jsonResponse(encoded, 400)),
    );
    const engine = createHttpPortfolioEngine("http://127.0.0.1:3001");
    await expect(engine.getSettings()).rejects.toMatchObject({
      name: "PortfolioFailure",
      code: "database",
      message: "Vault unavailable",
    });
  });

  it("converts transport failures into unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const engine = createHttpPortfolioEngine("http://127.0.0.1:3001");
    await expect(engine.updateSettings({ reportingCurrencyAssetId: "fiat:EUR" })).rejects.toEqual(
      expect.objectContaining({
        name: "PortfolioFailure",
        code: "unavailable",
      }),
    );
  });

  it("honors cancellation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_input: RequestInfo, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("This operation was aborted", "AbortError"));
          });
        });
      }),
    );
    const engine = createHttpPortfolioEngine("http://127.0.0.1:3001");
    const controller = new AbortController();
    const pending = engine.getDashboard(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
