import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { PortfolioHistoryPoint } from "@satella-app/engine/api";

import { observationsInRange } from "./portfolio-history";

const point = (localIso: string, total: string): PortfolioHistoryPoint => ({
  snapshotId: `snapshot:${localIso}`,
  capturedAt: new Date(localIso).toISOString(),
  total,
  totalIncomplete: false,
  categories: { stocks_etfs: total, crypto: "0", cash: "0", other: "0" },
});

describe("observationsInRange", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-08-15T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const history = [
    point("2026-08-14T09:00:00", "100"),
    point("2026-08-14T11:00:00", "110"),
    point("2026-08-15T09:00:00", "120"),
    point("2026-08-15T09:30:00", "125"),
    point("2026-08-15T10:15:00", "130"),
  ];

  it("keeps the latest observation per hour over the last day", () => {
    expect(observationsInRange(history, "1D").map((p) => p.capturedAt)).toEqual([
      new Date("2026-08-15T09:30:00").toISOString(),
      new Date("2026-08-15T10:15:00").toISOString(),
    ]);
  });

  it("keeps the latest observation per day for longer ranges", () => {
    expect(observationsInRange(history, "7D").map((p) => p.capturedAt)).toEqual([
      new Date("2026-08-14T11:00:00").toISOString(),
      new Date("2026-08-15T10:15:00").toISOString(),
    ]);
  });
});
