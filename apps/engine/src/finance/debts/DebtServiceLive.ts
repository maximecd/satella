import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Operations from "./DebtSql.js";
import { DebtService } from "./DebtService.js";
import { makeWithVaultSql } from "../with-vault-sql.js";

export const make = Effect.gen(function* () {
  const withSql = yield* makeWithVaultSql;
  return DebtService.of({
    list: Effect.fn("DebtService.list")(() => withSql(Operations.listDebts())),
    get: Effect.fn("DebtService.get")((id: string) => withSql(Operations.getDebt(id))),
    create: Effect.fn("DebtService.create")((input) => withSql(Operations.createDebt(input))),
    update: Effect.fn("DebtService.update")((id, input) =>
      withSql(Operations.updateDebt(id, input)),
    ),
    delete: Effect.fn("DebtService.delete")((id: string) => withSql(Operations.deleteDebt(id))),
  });
});

export const layer = Layer.effect(DebtService, make);
