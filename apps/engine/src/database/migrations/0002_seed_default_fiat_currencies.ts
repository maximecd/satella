import * as SqlClient from "@effect/sql/SqlClient";
import * as Effect from "effect/Effect";

const currencies = [
  ["USD", "US dollar"],
  ["EUR", "Euro"],
  ["JPY", "Japanese yen"],
  ["GBP", "Pound sterling"],
  ["AUD", "Australian dollar"],
  ["CAD", "Canadian dollar"],
  ["CHF", "Swiss franc"],
  ["CNH", "Chinese renminbi"],
  ["HKD", "Hong Kong dollar"],
  ["NZD", "New Zealand dollar"],
] as const;

export const seedDefaultFiatCurrencies = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const timestamp = "1970-01-01T00:00:00.000Z";

  for (const [iso, name] of currencies) {
    const assetId = `fiat:${iso}`;
    yield* sql`INSERT INTO assets (id, asset_class, name, symbol, created_at, updated_at)
      VALUES (${assetId}, 'fiat', ${name}, ${iso}, ${timestamp}, ${timestamp})
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, symbol = excluded.symbol`;
    yield* sql`INSERT INTO asset_identifiers (id, asset_id, identifier_type, identifier_value)
      VALUES (${`identifier:iso:${iso}`}, ${assetId}, 'iso_currency', ${iso})
      ON CONFLICT(identifier_type, identifier_value) DO NOTHING`;
  }
});
