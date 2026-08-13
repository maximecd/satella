import * as Effect from "effect/Effect";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import * as Finance from "../finance.test-utils.js";

describe("portfolio snapshots", () => {
  it.effect("captures current quantities and selected prices atomically", () =>
    Effect.gen(function* () {
      const custodian = yield* Finance.createCustodian({
        name: "Snapshot",
        managementMode: "manual",
      });
      const account = yield* Finance.createAccount({
        custodianId: custodian.id,
        name: "Default",
      });
      const asset = yield* Finance.createAsset({
        assetClass: "custom",
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
});
