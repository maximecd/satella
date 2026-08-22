import * as Effect from "effect/Effect";

import { SqlClient } from "effect/unstable/sql";
import { SUPPORTED_REPORTING_CURRENCIES } from "../config.js";
import type { Settings, UpdateSettingsInput } from "../contracts.js";
import {
  db,
  failure,
  firstOrNotFound,
  isSupportedReportingCurrency,
  reportingCurrency,
  type FinanceEffect,
} from "../internal/sql.js";

export const listSupportedCurrencies = (): FinanceEffect<Settings["currencies"]> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(sql<{
      readonly asset_id: string;
      readonly iso: string;
      readonly name: string;
    }>`SELECT a.id AS asset_id, ai.identifier_value AS iso, a.name
      FROM assets a
      JOIN asset_identifiers ai ON ai.asset_id = a.id AND ai.identifier_type = 'iso_currency'
      WHERE a.asset_category = 'cash' AND ai.identifier_value IN ${sql.in([
        ...SUPPORTED_REPORTING_CURRENCIES,
      ])}
      ORDER BY ai.identifier_value`);
    return rows.map((row) => ({ assetId: row.asset_id, iso: row.iso, name: row.name }));
  });

export const getSettings = (): FinanceEffect<Settings> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* db(sql<{ readonly app_language: string }>`
      SELECT app_language FROM app_settings WHERE id = 1`);
    const language = yield* firstOrNotFound(rows, "App settings");
    if (language.app_language !== "en" && language.app_language !== "fr") {
      return yield* Effect.fail(failure("validation", "Unsupported App language"));
    }
    const selected = yield* reportingCurrency;
    const currencies = yield* listSupportedCurrencies();
    return { reportingCurrency: selected, currencies, language: language.app_language };
  });

export const updateSettings = (input: UpdateSettingsInput): FinanceEffect<Settings> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    if (input.reportingCurrencyAssetId !== undefined) {
      const rows = yield* db(sql<{
        readonly asset_category: string;
        readonly iso: string | null;
      }>`SELECT a.asset_category, ai.identifier_value AS iso
        FROM assets a
        LEFT JOIN asset_identifiers ai ON ai.asset_id = a.id AND ai.identifier_type = 'iso_currency'
        WHERE a.id = ${input.reportingCurrencyAssetId}`);
      const asset = yield* firstOrNotFound(rows, "Currency asset");
      if (
        asset.asset_category !== "cash" ||
        asset.iso === null ||
        !isSupportedReportingCurrency(asset.iso)
      ) {
        return yield* Effect.fail(
          failure("validation", "Reporting currency must be a supported cash currency"),
        );
      }
      yield* db(
        sql`UPDATE app_settings SET reporting_currency_asset_id = ${input.reportingCurrencyAssetId}
          WHERE id = 1`,
      );
    }
    if (input.language !== undefined) {
      yield* db(sql`UPDATE app_settings SET app_language = ${input.language} WHERE id = 1`);
    }
    return yield* getSettings();
  });
