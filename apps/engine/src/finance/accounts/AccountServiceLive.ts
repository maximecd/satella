import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Operations from "./AccountSql.js";
import { AccountService } from "./AccountService.js";
import { makeWithVaultSql } from "../with-vault-sql.js";

export const make = Effect.gen(function* () {
  const withSql = yield* makeWithVaultSql;
  return AccountService.of({
    get: Effect.fn("AccountService.get")((id: string) => withSql(Operations.getAccount(id))),
    create: Effect.fn("AccountService.create")((input) => withSql(Operations.createAccount(input))),
    update: Effect.fn("AccountService.update")((id, input) =>
      withSql(Operations.updateAccount(id, input)),
    ),
    delete: Effect.fn("AccountService.delete")((id: string) =>
      withSql(Operations.deleteAccount(id)),
    ),
  });
});

export const layer = Layer.effect(AccountService, make);
