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
        quantity: "-2",
      });
      const position = withPosition.positions[0]!;
      const zeroed = yield* Finance.updatePosition(position.id, "0");
      const invalidMessage = yield* Finance.createPosition({
        accountId: account.id,
        assetId: "fiat:USD",
        quantity: "Infinity",
      }).pipe(
        Effect.flip,
        Effect.map((error) => error.message),
      );
      expect(zeroed.positions[0]?.quantity).toBe("0");
      expect(invalidMessage).toContain("Quantity must be a finite decimal");
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("values native prices in the account valuation currency through USD cross-rates", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const timestamp = new Date().toISOString();
      yield* sql`INSERT INTO asset_prices
          (asset_id, price, currency_asset_id, source, observed_at, updated_at)
          VALUES ('fiat:EUR', '1.25', 'fiat:USD', 'test', ${timestamp}, ${timestamp})`;
      const asset = yield* Finance.createAsset({
        assetCategory: "other",
        name: "USD investment",
        identifiers: [],
      });
      yield* Finance.setManualPrice(asset.id, {
        price: "10",
        currencyAssetId: "fiat:USD",
      });
      const account = yield* Finance.createAccount({
        name: "EUR portfolio",
        baseCurrencyAssetId: "fiat:EUR",
      });
      yield* Finance.createPosition({ accountId: account.id, assetId: asset.id, quantity: "2" });
      const valued = yield* Finance.getAccount(account.id);
      expect(valued.baseCurrencyIso).toBe("EUR");
      expect(valued.positions[0]?.price).toEqual(
        expect.objectContaining({ price: "10", currencyIso: "USD" }),
      );
      expect(valued.positions[0]?.reportingValue).toBe("16");
      expect(valued.total).toBe("16");
      expect(valued.totalIncomplete).toBe(false);
    }).pipe(Effect.provide(engineTestLayer())),
  );

  it.effect("returns a focused edit model for manual and connected accounts", () =>
    Effect.gen(function* () {
      const manual = yield* Finance.createAccount({ name: "Brokerage" });
      const collectible = yield* Finance.createAsset({
        assetCategory: "other",
        name: "Collectible",
        identifiers: [],
      });
      const withPosition = yield* Finance.createPosition({
        accountId: manual.id,
        assetId: collectible.id,
        quantity: "3",
      });
      const manualPosition = withPosition.positions[0]!;
      const manualEdit = yield* Finance.getPositionEdit(manualPosition.id);

      const sql = yield* SqlClient.SqlClient;
      const timestamp = new Date().toISOString();
      yield* Finance.seedSyncedCustodian({
        id: "synced",
        name: "OKX",
        connectorId: "okx",
        accounts: [
          {
            id: "synced-account",
            name: "Trading",
            connectorAccountId: "trading",
            accountType: "crypto_wallet",
          },
        ],
      });
      yield* sql`INSERT INTO positions (id, account_id, asset_id, quantity, created_at, updated_at)
        VALUES ('synced-position', 'synced-account', ${collectible.id}, 1, ${timestamp}, ${timestamp})`;
      const connectedEdit = yield* Finance.getPositionEdit("synced-position");
      const missing = yield* Finance.getPositionEdit("missing-position").pipe(Effect.flip);

      expect(manualEdit.position.id).toBe(manualPosition.id);
      expect(manualEdit.position.assetName).toBe("Collectible");
      expect(manualEdit.position.quantity).toBe("3");
      expect(manualEdit.account).toEqual({
        id: manual.id,
        name: "Brokerage",
        custodianId: manual.custodianId,
        custodianName: manual.custodianName,
        isDefaultCustodian: false,
        accountType: "brokerage",
        connectorAccountId: null,
        baseCurrencyAssetId: "fiat:USD",
        baseCurrencyIso: "USD",
      });
      expect(connectedEdit.position.id).toBe("synced-position");
      expect(connectedEdit.account).toEqual({
        id: "synced-account",
        name: "Trading",
        custodianId: "synced",
        custodianName: "OKX",
        isDefaultCustodian: false,
        accountType: "crypto_wallet",
        connectorAccountId: "trading",
        baseCurrencyAssetId: "fiat:USD",
        baseCurrencyIso: "USD",
      });
      expect(missing.code).toBe("not_found");
      expect(missing.message).toContain("Position was not found");
    }).pipe(Effect.provide(engineTestLayer())),
  );
});
