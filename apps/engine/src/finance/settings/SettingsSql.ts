import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { SqlClient } from "effect/unstable/sql";
import { SUPPORTED_REPORTING_CURRENCIES } from "../config.js";
import {
  EvmRpcSettings as EvmRpcSettingsSchema,
  type EvmRpcSettings,
  type Settings,
  type UpdateSettingsInput,
} from "../contracts.js";
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
    const rows = yield* db(
      sql<{
        readonly app_language: string;
        readonly evm_rpc_config_json: string;
      }>`SELECT app_language, evm_rpc_config_json FROM app_settings WHERE id = 1`,
    );
    const row = yield* firstOrNotFound(rows, "App settings");
    if (row.app_language !== "en" && row.app_language !== "fr") {
      return yield* Effect.fail(failure("validation", "Unsupported App language"));
    }
    const evmRpc = yield* decodeEvmRpcSettings(row.evm_rpc_config_json);
    const selected = yield* reportingCurrency;
    const currencies = yield* listSupportedCurrencies();
    return { reportingCurrency: selected, currencies, language: row.app_language, evmRpc };
  });

const validRpcUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
};

const validateEvmRpcSettings = (settings: EvmRpcSettings): FinanceEffect<EvmRpcSettings> => {
  if (settings.mode === "public") return Effect.succeed(settings);
  const urls = Object.values(settings.urls);
  return urls.every(validRpcUrl)
    ? Effect.succeed(settings)
    : Effect.fail(failure("validation", "Every custom RPC URL must use HTTP or HTTPS"));
};

const decodeEvmRpcSettings = (value: string): FinanceEffect<EvmRpcSettings> =>
  Effect.try({
    try: () => JSON.parse(value),
    catch: () => failure("database", "Stored EVM RPC settings are invalid"),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(EvmRpcSettingsSchema)),
    Effect.mapError(() => failure("database", "Stored EVM RPC settings are invalid")),
    Effect.flatMap(validateEvmRpcSettings),
    Effect.mapError(() => failure("database", "Stored EVM RPC settings are invalid")),
  );

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
    if (input.evmRpc !== undefined) {
      const evmRpc = yield* validateEvmRpcSettings(input.evmRpc);
      yield* db(
        sql`UPDATE app_settings SET evm_rpc_config_json = ${JSON.stringify(evmRpc)} WHERE id = 1`,
      );
    }
    return yield* getSettings();
  });
