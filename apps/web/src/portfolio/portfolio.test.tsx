import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vite-plus/test";

import { FinanceApiError } from "@optimus/engine/api";
import { populatedDashboardFor, settings } from "../finance.route-harness.test-utils";
import {
  createMemoryPortfolioEngine,
  PortfolioEngineProvider,
  useDashboard,
  useSaveReportingCurrency,
  useSettings,
} from "./index";
import { PortfolioFailure, toPortfolioFailure } from "./failure";

const usd = populatedDashboardFor(new Date("2026-08-15T12:00:00.000Z"));
const eur = {
  ...usd,
  reportingCurrency: { assetId: "fiat:EUR", iso: "EUR" },
  portfolioValue: "1000",
};

const wrapperFor = (engine: ReturnType<typeof createMemoryPortfolioEngine>) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <PortfolioEngineProvider engine={engine}>{children}</PortfolioEngineProvider>
      </QueryClientProvider>
    );
  };
};

describe("portfolio data module", () => {
  it("saves Reporting currency and keeps Settings and Dashboard reads coherent", async () => {
    const engine = createMemoryPortfolioEngine({
      dashboard: usd,
      settings,
      projectDashboard: (_dashboard, nextSettings) =>
        nextSettings.reportingCurrency.iso === "EUR" ? eur : usd,
    });
    const { result } = renderHook(
      () => ({
        dashboard: useDashboard(),
        settings: useSettings(),
        save: useSaveReportingCurrency(),
      }),
      { wrapper: wrapperFor(engine) },
    );
    await waitFor(() => expect(result.current.dashboard.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.settings.isSuccess).toBe(true));
    expect(result.current.dashboard.data?.reportingCurrency.iso).toBe("USD");
    await result.current.save.mutateAsync({ reportingCurrencyAssetId: "fiat:EUR" });
    await waitFor(() => expect(result.current.settings.data?.reportingCurrency.iso).toBe("EUR"));
    await waitFor(() => expect(result.current.dashboard.data?.portfolioValue).toBe("1000"));
    expect(result.current.dashboard.data?.reportingCurrency.iso).toBe("EUR");
  });

  it("surfaces module failures without exposing transport details", async () => {
    const engine = createMemoryPortfolioEngine({ dashboard: usd, settings });
    engine.fail(new PortfolioFailure("validation", "Unknown reporting currency"));
    const { result } = renderHook(() => useSettings(), { wrapper: wrapperFor(engine) });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 4000 });
    expect(result.current.error).toBeInstanceOf(PortfolioFailure);
    expect(result.current.error?.message).toBe("Unknown reporting currency");
  });
});

describe("portfolio failure normalization", () => {
  it("maps engine finance failures into the frontend failure model", () => {
    const failure = toPortfolioFailure(
      new FinanceApiError({ code: "not_found", message: "Position was not found" }),
    );
    expect(failure).toBeInstanceOf(PortfolioFailure);
    expect(failure.code).toBe("not_found");
    expect(failure.message).toBe("Position was not found");
  });

  it("maps transport failures as unavailable", () => {
    const failure = toPortfolioFailure(new Error("fetch failed"));
    expect(failure.code).toBe("unavailable");
    expect(failure.message).toBe("fetch failed");
  });
});
