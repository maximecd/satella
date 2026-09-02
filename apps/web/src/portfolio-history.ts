import type { PortfolioHistoryPoint } from "@satella-app/engine/api";

import {
  compareDecimal,
  divideDecimal,
  multiplyDecimal,
  subtractDecimal,
} from "./financial-number";

export const PORTFOLIO_VALUE_RANGES = ["1D", "7D", "1M", "3M", "YTD", "1Y", "All"] as const;
export type PortfolioValueRange = (typeof PORTFOLIO_VALUE_RANGES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

const localCalendarDay = (capturedAt: string) => {
  const date = new Date(capturedAt);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, "0")))
    .join("-");
};

export const latestObservationPerDay = (
  points: ReadonlyArray<PortfolioHistoryPoint>,
): ReadonlyArray<PortfolioHistoryPoint> => {
  const byDay = new Map<string, PortfolioHistoryPoint>();
  for (const point of points) {
    const day = localCalendarDay(point.capturedAt);
    const current = byDay.get(day);
    if (current === undefined || current.capturedAt <= point.capturedAt) {
      byDay.set(day, point);
    }
  }
  return [...byDay.values()].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
};

export const latestObservationPerHour = (
  points: ReadonlyArray<PortfolioHistoryPoint>,
): ReadonlyArray<PortfolioHistoryPoint> => {
  const byHour = new Map<string, PortfolioHistoryPoint>();
  for (const point of points) {
    const hour = `${localCalendarDay(point.capturedAt)}T${new Date(point.capturedAt)
      .getHours()
      .toString()
      .padStart(2, "0")}`;
    const current = byHour.get(hour);
    if (current === undefined || current.capturedAt <= point.capturedAt) {
      byHour.set(hour, point);
    }
  }
  return [...byHour.values()].sort((left, right) =>
    left.capturedAt.localeCompare(right.capturedAt),
  );
};

/** The 1D range keeps hourly resolution; longer ranges still collapse to one point per day. */
export const isHourlyRange = (range: PortfolioValueRange): boolean => range === "1D";

const rangeStart = (range: PortfolioValueRange, now: Date): number | null => {
  if (range === "All") return null;
  if (range === "YTD") return Date.UTC(now.getUTCFullYear(), 0, 1);
  const days =
    range === "1D" ? 1 : range === "7D" ? 7 : range === "1M" ? 30 : range === "3M" ? 90 : 365;
  return now.getTime() - days * DAY_MS;
};

export const observationsInRange = (
  points: ReadonlyArray<PortfolioHistoryPoint>,
  range: PortfolioValueRange,
  now = new Date(),
): ReadonlyArray<PortfolioHistoryPoint> => {
  const downsampled = isHourlyRange(range)
    ? latestObservationPerHour(points)
    : latestObservationPerDay(points);
  const start = rangeStart(range, now);
  return start === null
    ? downsampled
    : downsampled.filter((point) => Date.parse(point.capturedAt) >= start);
};

export const periodChange = (points: ReadonlyArray<{ readonly total: string }>) => {
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
