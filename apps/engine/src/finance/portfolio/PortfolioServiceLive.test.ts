import * as Effect from "effect/Effect";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import * as Finance from "../finance.test-utils.js";

describe("portfolio snapshots", () => {
  it.effect("captures current quantities and selected prices atomically", () =>
    Effect.gen(function* () {
      const account = yield* Finance.createAccount({
        name: "Default",
      });
      const asset = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Art",
        identifiers: [],
      });
      yield* Finance.createPosition({ accountId: account.id, assetId: asset.id, quantity: 1 });
      yield* Finance.setManualPrice(asset.id, { price: 500, currencyAssetId: "fiat:USD" });
      const snapshot = yield* Finance.captureSnapshot();
      const history = yield* Finance.getPortfolioHistory();
      expect(snapshot.positionCount).toBe(1);
      expect(snapshot.priceCount).toBe(1);
      expect(Date.parse(snapshot.capturedAt)).not.toBeNaN();
      expect(history).toEqual([expect.objectContaining({ total: 500, totalIncomplete: false })]);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("does not fabricate another snapshot before the configured daily interval", () =>
    Effect.gen(function* () {
      const first = yield* Finance.captureSnapshotIfDue({
        now: () => new Date("2026-08-11T00:00:00.000Z"),
      });
      const second = yield* Finance.captureSnapshotIfDue({
        now: () => new Date("2026-08-11T01:00:00.000Z"),
      });
      expect(first).not.toBeNull();
      expect(second).toBeNull();
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("upserts one Portfolio snapshot per calendar day", () =>
    Effect.gen(function* () {
      const account = yield* Finance.createAccount({ name: "Default" });
      const asset = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Art",
        identifiers: [],
      });
      yield* Finance.createPosition({ accountId: account.id, assetId: asset.id, quantity: 1 });
      yield* Finance.setManualPrice(asset.id, { price: 500, currencyAssetId: "fiat:USD" });
      yield* Finance.captureSnapshot({
        refresh: false,
        now: () => new Date("2026-08-11T08:00:00.000Z"),
      });
      yield* Finance.setManualPrice(asset.id, { price: 700, currencyAssetId: "fiat:USD" });
      yield* Finance.captureSnapshot({
        refresh: false,
        now: () => new Date("2026-08-11T18:00:00.000Z"),
      });
      yield* Finance.captureSnapshot({
        refresh: false,
        now: () => new Date("2026-08-12T08:00:00.000Z"),
      });
      const history = yield* Finance.getPortfolioHistory();
      expect(
        history.map(({ capturedAt, total }) => ({ day: capturedAt.slice(0, 10), total })),
      ).toEqual([
        { day: "2026-08-11", total: 700 },
        { day: "2026-08-12", total: 700 },
      ]);
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
