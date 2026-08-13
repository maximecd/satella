import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqlClient } from "effect/unstable/sql";
import * as Operations from "./PortfolioSql.js";
import { PortfolioService } from "./PortfolioService.js";

const provideSql = <A, E>(
  sql: SqlClient.SqlClient,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
) => effect.pipe(Effect.provideService(SqlClient.SqlClient, sql));

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return PortfolioService.of({
    captureSnapshot: Effect.fn("PortfolioService.captureSnapshot")((options) =>
      provideSql(sql, Operations.captureSnapshot(options)),
    ),
    captureSnapshotIfDue: Effect.fn("PortfolioService.captureSnapshotIfDue")((options) =>
      provideSql(sql, Operations.captureSnapshotIfDue(options)),
    ),
    history: Effect.fn("PortfolioService.history")(() =>
      provideSql(sql, Operations.getPortfolioHistory()),
    ),
    dashboard: Effect.fn("PortfolioService.dashboard")(() =>
      provideSql(sql, Operations.getDashboard()),
    ),
  });
});

export const layer = Layer.effect(PortfolioService, make);
