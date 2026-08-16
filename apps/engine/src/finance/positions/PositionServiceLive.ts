import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Operations from "./PositionSql.js";
import { PositionService } from "./PositionService.js";
import { makeWithVaultSql } from "../with-vault-sql.js";

export const make = Effect.gen(function* () {
  const withSql = yield* makeWithVaultSql;
  return PositionService.of({
    create: Effect.fn("PositionService.create")((input) => withSql(Operations.createPosition(input))),
    update: Effect.fn("PositionService.update")((id, quantity) =>
      withSql(Operations.updatePosition(id, quantity)),
    ),
    getAccount: Effect.fn("PositionService.getAccount")((id: string) =>
      withSql(Operations.getPositionAccount(id)),
    ),
    delete: Effect.fn("PositionService.delete")((id: string) => withSql(Operations.deletePosition(id))),
  });
});

export const layer = Layer.effect(PositionService, make);
