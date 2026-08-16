import * as Effect from "effect/Effect";
import { SqlClient } from "effect/unstable/sql";

export const FIXTURE_QUOTE_TIME = "2026-01-01T00:00:00Z";

export const FIXTURE_PRICE_HISTORY = [
  { capturedAt: "2025-08-15T00:00:00.000Z", aapl: "168", msft: "380", voo: "470", eur: "1.08" },
  { capturedAt: "2025-11-15T00:00:00.000Z", aapl: "175", msft: "395", voo: "485", eur: "1.07" },
  { capturedAt: "2026-01-15T00:00:00.000Z", aapl: "182", msft: "410", voo: "500", eur: "1.09" },
  { capturedAt: "2026-03-15T00:00:00.000Z", aapl: "178", msft: "405", voo: "495", eur: "1.08" },
  { capturedAt: "2026-05-15T00:00:00.000Z", aapl: "188", msft: "425", voo: "520", eur: "1.09" },
  { capturedAt: "2026-06-15T00:00:00.000Z", aapl: "192", msft: "435", voo: "530", eur: "1.1" },
  { capturedAt: "2026-07-15T00:00:00.000Z", aapl: "194", msft: "440", voo: "535", eur: "1.11" },
  { capturedAt: "2026-07-22T00:00:00.000Z", aapl: "196", msft: "442", voo: "540", eur: "1.1" },
  { capturedAt: "2026-08-01T00:00:00.000Z", aapl: "198", msft: "445", voo: "545", eur: "1.1" },
  { capturedAt: "2026-08-08T00:00:00.000Z", aapl: "199", msft: "448", voo: "548", eur: "1.09" },
  { capturedAt: "2026-08-12T00:00:00.000Z", aapl: "200", msft: "449", voo: "549", eur: "1.1" },
  { capturedAt: "2026-08-14T00:00:00.000Z", aapl: "200", msft: "450", voo: "550", eur: "1.1" },
] as const;

const FIXTURE_SNAPSHOT_POSITIONS = [
  ["seed:position:demo-brokerage:usd", "12500"],
  ["seed:position:demo-brokerage:aapl", "12.5"],
  ["seed:position:demo-brokerage:msft", "4"],
  ["seed:position:demo-brokerage:voo", "7.25"],
  ["seed:position:demo-euro-cash:eur", "8000"],
] as const;

const timestamp = () => new Date().toISOString();

const upsertAsset = (
  sql: SqlClient.SqlClient,
  id: string,
  name: string,
  symbol: string,
  createdAt: string,
) =>
  sql`INSERT INTO assets (id, asset_category, name, symbol, created_at, updated_at)
    VALUES (${id}, 'stocks_etfs', ${name}, ${symbol}, ${createdAt}, ${createdAt})
    ON CONFLICT(id) DO UPDATE SET
      asset_category = excluded.asset_category,
      name = excluded.name,
      symbol = excluded.symbol,
      updated_at = excluded.updated_at`;

const upsertIdentifier = (
  sql: SqlClient.SqlClient,
  id: string,
  assetId: string,
  type: string,
  value: string,
) =>
  sql`INSERT INTO asset_identifiers (id, asset_id, identifier_type, identifier_value)
    VALUES (${id}, ${assetId}, ${type}, ${value})
    ON CONFLICT(id) DO UPDATE SET
      asset_id = excluded.asset_id,
      identifier_type = excluded.identifier_type,
      identifier_value = excluded.identifier_value`;

const upsertPrice = (
  sql: SqlClient.SqlClient,
  assetId: string,
  price: string,
  currencyAssetId: string,
) =>
  sql`INSERT INTO asset_prices
      (asset_id, price, currency_asset_id, source, observed_at, updated_at)
    VALUES (${assetId}, ${price}, ${currencyAssetId}, 'manual', ${FIXTURE_QUOTE_TIME}, ${FIXTURE_QUOTE_TIME})
    ON CONFLICT(asset_id) DO UPDATE SET
      price = excluded.price,
      currency_asset_id = excluded.currency_asset_id,
      source = excluded.source,
      observed_at = excluded.observed_at,
      updated_at = excluded.updated_at`;

const upsertAccount = (
  sql: SqlClient.SqlClient,
  id: string,
  name: string,
  baseCurrencyAssetId: string,
  createdAt: string,
) =>
  sql`INSERT INTO accounts
      (id, connection_id, name, base_currency_asset_id, connector_account_id, created_at, updated_at)
    VALUES (${id}, NULL, ${name}, ${baseCurrencyAssetId}, NULL, ${createdAt}, ${createdAt})
    ON CONFLICT(id) DO UPDATE SET
      connection_id = NULL,
      name = excluded.name,
      base_currency_asset_id = excluded.base_currency_asset_id,
      connector_account_id = NULL,
      updated_at = excluded.updated_at`;

const upsertPosition = (
  sql: SqlClient.SqlClient,
  id: string,
  accountId: string,
  assetId: string,
  quantity: string,
  createdAt: string,
) =>
  sql`INSERT INTO positions (id, account_id, asset_id, quantity, created_at, updated_at)
    VALUES (${id}, ${accountId}, ${assetId}, ${quantity}, ${createdAt}, ${createdAt})
    ON CONFLICT(id) DO UPDATE SET
      account_id = excluded.account_id,
      asset_id = excluded.asset_id,
      quantity = excluded.quantity,
      updated_at = excluded.updated_at`;

const insertPriceSnapshot = (
  sql: SqlClient.SqlClient,
  snapshotId: string,
  assetId: string,
  price: string,
  observedAt: string,
) =>
  sql`INSERT INTO asset_price_snapshots
      (snapshot_id, asset_id, price, currency_asset_id, source, observed_at)
    VALUES (${snapshotId}, ${assetId}, ${price}, 'fiat:USD', 'manual', ${observedAt})`;

const insertHistorySnapshot = (
  sql: SqlClient.SqlClient,
  quote: (typeof FIXTURE_PRICE_HISTORY)[number],
) =>
  Effect.gen(function* () {
    const id = `seed:snapshot:${quote.capturedAt.slice(0, 10)}`;
    yield* sql`INSERT INTO snapshots (id, captured_at) VALUES (${id}, ${quote.capturedAt})`;
    for (const [positionId, quantity] of FIXTURE_SNAPSHOT_POSITIONS) {
      yield* sql`INSERT INTO position_snapshots (snapshot_id, position_id, quantity)
        VALUES (${id}, ${positionId}, ${quantity})`;
    }
    yield* insertPriceSnapshot(sql, id, "seed:asset:aapl", quote.aapl, quote.capturedAt);
    yield* insertPriceSnapshot(sql, id, "seed:asset:msft", quote.msft, quote.capturedAt);
    yield* insertPriceSnapshot(sql, id, "seed:asset:voo", quote.voo, quote.capturedAt);
    yield* insertPriceSnapshot(sql, id, "fiat:EUR", quote.eur, quote.capturedAt);
  });

export const seedDevelopmentFixture = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const createdAt = timestamp();
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* upsertAsset(sql, "seed:asset:aapl", "Apple", "AAPL", createdAt);
      yield* upsertAsset(sql, "seed:asset:msft", "Microsoft", "MSFT", createdAt);
      yield* upsertAsset(sql, "seed:asset:voo", "Vanguard S&P 500 ETF", "VOO", createdAt);

      yield* upsertIdentifier(
        sql,
        "seed:identifier:aapl:isin",
        "seed:asset:aapl",
        "isin",
        "US0378331005",
      );
      yield* upsertIdentifier(
        sql,
        "seed:identifier:aapl:yahoo_symbol",
        "seed:asset:aapl",
        "yahoo_symbol",
        "AAPL",
      );
      yield* upsertIdentifier(
        sql,
        "seed:identifier:msft:isin",
        "seed:asset:msft",
        "isin",
        "US5949181045",
      );
      yield* upsertIdentifier(
        sql,
        "seed:identifier:msft:yahoo_symbol",
        "seed:asset:msft",
        "yahoo_symbol",
        "MSFT",
      );
      yield* upsertIdentifier(
        sql,
        "seed:identifier:voo:isin",
        "seed:asset:voo",
        "isin",
        "US9229083632",
      );
      yield* upsertIdentifier(
        sql,
        "seed:identifier:voo:yahoo_symbol",
        "seed:asset:voo",
        "yahoo_symbol",
        "VOO",
      );

      yield* upsertPrice(sql, "seed:asset:aapl", "200", "fiat:USD");
      yield* upsertPrice(sql, "seed:asset:msft", "450", "fiat:USD");
      yield* upsertPrice(sql, "seed:asset:voo", "550", "fiat:USD");
      yield* upsertPrice(sql, "fiat:EUR", "1.1", "fiat:USD");

      yield* upsertAccount(
        sql,
        "seed:account:demo-brokerage",
        "Demo Brokerage",
        "fiat:USD",
        createdAt,
      );
      yield* upsertAccount(
        sql,
        "seed:account:demo-euro-cash",
        "Demo Euro Cash",
        "fiat:EUR",
        createdAt,
      );

      yield* upsertPosition(
        sql,
        "seed:position:demo-brokerage:usd",
        "seed:account:demo-brokerage",
        "fiat:USD",
        "12500",
        createdAt,
      );
      yield* upsertPosition(
        sql,
        "seed:position:demo-brokerage:aapl",
        "seed:account:demo-brokerage",
        "seed:asset:aapl",
        "12.5",
        createdAt,
      );
      yield* upsertPosition(
        sql,
        "seed:position:demo-brokerage:msft",
        "seed:account:demo-brokerage",
        "seed:asset:msft",
        "4",
        createdAt,
      );
      yield* upsertPosition(
        sql,
        "seed:position:demo-brokerage:voo",
        "seed:account:demo-brokerage",
        "seed:asset:voo",
        "7.25",
        createdAt,
      );
      yield* upsertPosition(
        sql,
        "seed:position:demo-euro-cash:eur",
        "seed:account:demo-euro-cash",
        "fiat:EUR",
        "8000",
        createdAt,
      );

      yield* sql`DELETE FROM snapshots WHERE id LIKE 'seed:snapshot:%'`;
      for (const quote of FIXTURE_PRICE_HISTORY) {
        yield* insertHistorySnapshot(sql, quote);
      }
    }),
  );
});
