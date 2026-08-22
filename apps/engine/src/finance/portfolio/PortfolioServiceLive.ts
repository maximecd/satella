import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Operations from "./PortfolioSql.js";
import { PortfolioService } from "./PortfolioService.js";
import { makeWithVaultSql } from "../with-vault-sql.js";

export const make = Effect.gen(function* () {
  const withSql = yield* makeWithVaultSql;
  return PortfolioService.of({
    captureSnapshot: Effect.fn("PortfolioService.captureSnapshot")((options) =>
      withSql(Operations.captureSnapshot(options)),
    ),
    history: Effect.fn("PortfolioService.history")(() => withSql(Operations.getPortfolioHistory())),
    dashboard: Effect.fn("PortfolioService.dashboard")(() => withSql(Operations.getDashboard())),
  });
});

export const layer = Layer.effect(PortfolioService, make);
