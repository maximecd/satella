import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqlClient } from "effect/unstable/sql";
import * as Operations from "./AssetSql.js";
import { AssetService } from "./AssetService.js";

const provideSql = <A, E>(
  sql: SqlClient.SqlClient,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
) => effect.pipe(Effect.provideService(SqlClient.SqlClient, sql));

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return AssetService.of({
    get: Effect.fn("AssetService.get")((id: string) => provideSql(sql, Operations.getAsset(id))),
    list: Effect.fn("AssetService.list")(() => provideSql(sql, Operations.listAssets())),
    create: Effect.fn("AssetService.create")((input) =>
      provideSql(sql, Operations.createAsset(input)),
    ),
    updateCustom: Effect.fn("AssetService.updateCustom")((id, input) =>
      provideSql(sql, Operations.updateCustomAsset(id, input)),
    ),
    setManualPrice: Effect.fn("AssetService.setManualPrice")((id, input) =>
      provideSql(sql, Operations.setManualPrice(id, input)),
    ),
    delete: Effect.fn("AssetService.delete")((id: string) =>
      provideSql(sql, Operations.deleteAsset(id)),
    ),
  });
});

export const layer = Layer.effect(AssetService, make);
