import { SqlClient } from "effect/unstable/sql";
import * as Effect from "effect/Effect";

import type { Settings, UpdateSettingsInput } from "../contracts.js";
import { db, failure, firstOrNotFound, nowIso, type FinanceEffect } from "../internal/sql.js";

interface SettingsRow {
  readonly reporting_currency_asset_id: string;
  readonly reporting_currency_iso: string;
}

interface CurrencyRow {
  readonly asset_id: string;
  readonly iso: string;
  readonly name: string;
}

const listSupportedCurrencies = (): FinanceEffect<Settings["currencies"]> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(sql<CurrencyRow>`
      SELECT a.id AS asset_id, ai.identifier_value AS iso, a.name
      FROM assets a
      JOIN asset_identifiers ai ON ai.asset_id = a.id AND ai.identifier_type = 'iso_currency'
      WHERE a.asset_category = 'cash' AND a.id LIKE 'fiat:%'
      ORDER BY ai.identifier_value`);
    return rows.map(({ asset_id, iso, name }) => ({ assetId: asset_id, iso, name }));
  });

const loadSettings = (): FinanceEffect<Settings> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const row = yield* firstOrNotFound(
      yield* db(sql<SettingsRow>`
        SELECT s.reporting_currency_asset_id,
          COALESCE(ai.identifier_value, a.symbol, a.name) AS reporting_currency_iso
        FROM app_settings s
        JOIN assets a ON a.id = s.reporting_currency_asset_id
        LEFT JOIN asset_identifiers ai ON ai.asset_id = a.id AND ai.identifier_type = 'iso_currency'
        WHERE s.id = 1`),
      "Settings",
    );
    const currencies = yield* listSupportedCurrencies();
    return {
      reportingCurrencyAssetId: row.reporting_currency_asset_id,
      reportingCurrencyIso: row.reporting_currency_iso,
      currencies,
    };
  });

export const getSettings = (): FinanceEffect<Settings> => loadSettings();

export const updateSettings = (input: UpdateSettingsInput): FinanceEffect<Settings> =>
  Effect.gen(function* () {
    const currencies = yield* listSupportedCurrencies();
    const selected = currencies.find(({ assetId }) => assetId === input.reportingCurrencyAssetId);
    if (selected === undefined) {
      return yield* Effect.fail(
        failure("validation", "Reporting currency must be a supported Cash currency"),
      );
    }
    const sql = yield* SqlClient.SqlClient;
    yield* db(
      sql`UPDATE app_settings SET reporting_currency_asset_id = ${input.reportingCurrencyAssetId},
        updated_at = ${nowIso()} WHERE id = 1`,
    );
    return yield* loadSettings();
  });
