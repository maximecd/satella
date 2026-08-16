import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Operations from "./AssetSql.js";
import { AssetService } from "./AssetService.js";
import { makeWithVaultSql } from "../with-vault-sql.js";

export const make = Effect.gen(function* () {
  const withSql = yield* makeWithVaultSql;
  return AssetService.of({
    get: Effect.fn("AssetService.get")((id: string) => withSql(Operations.getAsset(id))),
    list: Effect.fn("AssetService.list")(() => withSql(Operations.listAssets())),
    create: Effect.fn("AssetService.create")((input) => withSql(Operations.createAsset(input))),
    updateCustom: Effect.fn("AssetService.updateCustom")((id, input) =>
      withSql(Operations.updateCustomAsset(id, input)),
    ),
    maintain: Effect.fn("AssetService.maintain")((id, input) =>
      withSql(Operations.maintainAsset(id, input)),
    ),
    setManualPrice: Effect.fn("AssetService.setManualPrice")((id, input) =>
      withSql(Operations.setManualPrice(id, input)),
    ),
    delete: Effect.fn("AssetService.delete")((id: string) => withSql(Operations.deleteAsset(id))),
  });
});

export const layer = Layer.effect(AssetService, make);
