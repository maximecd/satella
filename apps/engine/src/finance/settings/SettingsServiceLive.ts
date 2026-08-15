import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqlClient } from "effect/unstable/sql";
import * as Operations from "./SettingsSql.js";
import { SettingsService } from "./SettingsService.js";

const provideSql = <A, E>(
  sql: SqlClient.SqlClient,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
) => effect.pipe(Effect.provideService(SqlClient.SqlClient, sql));

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return SettingsService.of({
    get: Effect.fn("SettingsService.get")(() => provideSql(sql, Operations.getSettings())),
    update: Effect.fn("SettingsService.update")((input) =>
      provideSql(sql, Operations.updateSettings(input)),
    ),
  });
});

export const layer = Layer.effect(SettingsService, make);
