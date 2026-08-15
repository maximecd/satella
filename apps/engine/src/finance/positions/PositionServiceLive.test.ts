import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

import { engineTestLayer } from "../../database/database.test-utils.js";
import { describe, expect, it } from "@effect/vitest";
import * as Finance from "../finance.test-utils.js";

describe("positions", () => {
  it.effect("enforces finite unique positions and keeps zero quantities", () =>
    Effect.gen(function* () {
      const account = yield* Finance.createAccount({
        name: "Default",
      });
      const custom = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Collectible",
        identifiers: [],
      });
      const withPosition = yield* Finance.createPosition({
        accountId: account.id,
        assetId: custom.id,
        quantity: -2,
      });
      const position = withPosition.positions[0]!;
      const zeroed = yield* Finance.updatePosition(position.id, 0);
      const invalidMessage = yield* Finance.createPosition({
        accountId: account.id,
        assetId: "fiat:USD",
        quantity: Number.POSITIVE_INFINITY,
      }).pipe(
        Effect.flip,
        Effect.map((error) => error.message),
      );
      expect(zeroed.positions[0]?.quantity).toBe(0);
      expect(invalidMessage).toContain("Quantity must be finite");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("values native prices in the account valuation currency through USD cross-rates", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const timestamp = new Date().toISOString();
      yield* sql`INSERT INTO asset_prices
          (asset_id, price, currency_asset_id, source, observed_at, updated_at)
          VALUES ('fiat:EUR', 1.25, 'fiat:USD', 'test', ${timestamp}, ${timestamp})`;
      const asset = yield* Finance.createAsset({
        assetCategory: "other",
        name: "USD investment",
        identifiers: [],
      });
      yield* Finance.setManualPrice(asset.id, {
        price: 10,
        currencyAssetId: "fiat:USD",
      });
      const account = yield* Finance.createAccount({
        name: "EUR portfolio",
        baseCurrencyAssetId: "fiat:EUR",
      });
      yield* Finance.createPosition({ accountId: account.id, assetId: asset.id, quantity: 2 });
      const valued = yield* Finance.getAccount(account.id);
      expect(valued.baseCurrencyIso).toBe("EUR");
      expect(valued.positions[0]?.price).toEqual(
        expect.objectContaining({ price: 10, currencyIso: "USD" }),
      );
      expect(valued.positions[0]?.reportingValue).toBeCloseTo(16);
      expect(valued.total).toBeCloseTo(16);
      expect(valued.totalIncomplete).toBe(false);
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
