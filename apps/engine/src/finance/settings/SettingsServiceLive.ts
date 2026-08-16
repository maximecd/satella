import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Operations from "./SettingsSql.js";
import { SettingsService } from "./SettingsService.js";
import { makeWithVaultSql } from "../with-vault-sql.js";

export const make = Effect.gen(function* () {
  const withSql = yield* makeWithVaultSql;
  return SettingsService.of({
    get: Effect.fn("SettingsService.get")(() => withSql(Operations.getSettings())),
    update: Effect.fn("SettingsService.update")((input) => withSql(Operations.updateSettings(input))),
  });
});

export const layer = Layer.effect(SettingsService, make);
