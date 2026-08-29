import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Operations from "./GoalSql.js";
import { GoalService } from "./GoalService.js";
import { makeWithVaultSql } from "../with-vault-sql.js";

export const make = Effect.gen(function* () {
  const withSql = yield* makeWithVaultSql;
  return GoalService.of({
    list: Effect.fn("GoalService.list")(() => withSql(Operations.listGoals())),
    get: Effect.fn("GoalService.get")((id: string) => withSql(Operations.getGoal(id))),
    create: Effect.fn("GoalService.create")((input) => withSql(Operations.createGoal(input))),
    update: Effect.fn("GoalService.update")((id, input) =>
      withSql(Operations.updateGoal(id, input)),
    ),
    delete: Effect.fn("GoalService.delete")((id: string) => withSql(Operations.deleteGoal(id))),
  });
});

export const layer = Layer.effect(GoalService, make);
