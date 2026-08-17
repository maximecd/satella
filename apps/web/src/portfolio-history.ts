import type { PortfolioHistoryPoint } from "@optimus/engine/api";

import {
  compareDecimal,
  divideDecimal,
  multiplyDecimal,
  subtractDecimal,
} from "./financial-number";

export const PORTFOLIO_VALUE_RANGES = ["7D", "1M", "3M", "YTD", "1Y", "All"] as const;
export type PortfolioValueRange = (typeof PORTFOLIO_VALUE_RANGES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

export const latestObservationPerDay = (
  points: ReadonlyArray<PortfolioHistoryPoint>,
): ReadonlyArray<PortfolioHistoryPoint> => {
  const byDay = new Map<string, PortfolioHistoryPoint>();
  for (const point of points) {
    const day = point.capturedAt.slice(0, 10);
    const current = byDay.get(day);
    if (current === undefined || current.capturedAt <= point.capturedAt) {
      byDay.set(day, point);
    }
  }
  return [...byDay.values()].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
};

const rangeStart = (range: PortfolioValueRange, now: Date): number | null => {
  if (range === "All") return null;
  if (range === "YTD") return Date.UTC(now.getUTCFullYear(), 0, 1);
  const days = range === "7D" ? 7 : range === "1M" ? 30 : range === "3M" ? 90 : 365;
  return now.getTime() - days * DAY_MS;
};

export const observationsInRange = (
  points: ReadonlyArray<PortfolioHistoryPoint>,
  range: PortfolioValueRange,
  now = new Date(),
): ReadonlyArray<PortfolioHistoryPoint> => {
  const daily = latestObservationPerDay(points);
  const start = rangeStart(range, now);
  return start === null ? daily : daily.filter((point) => Date.parse(point.capturedAt) >= start);
};

export const periodChange = (points: ReadonlyArray<PortfolioHistoryPoint>) => {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined || points.length < 2) return null;
  const absolute = subtractDecimal(last.total, first.total);
  return {
    absolute,
    percent:
      compareDecimal(first.total, "0") === 0
        ? null
        : multiplyDecimal(divideDecimal(absolute, first.total), "100"),
  };
};
