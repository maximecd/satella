import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { FinanceApiError, SyncLogPage } from "../contracts.js";
import { makeWithVaultSql } from "../with-vault-sql.js";
import * as Operations from "./SyncLogSql.js";

export class SyncLogService extends Context.Service<
  SyncLogService,
  {
    readonly list: (
      input?: Operations.ListSyncLogInput,
    ) => Effect.Effect<SyncLogPage, FinanceApiError>;
    readonly record: (input: Operations.RecordSyncLogInput) => Effect.Effect<void, FinanceApiError>;
  }
>()("@satella-app/engine/finance/SyncLogService") {}

export const make = Effect.gen(function* () {
  const withSql = yield* makeWithVaultSql;
  return SyncLogService.of({
    list: Effect.fn("SyncLogService.list")((input?: Operations.ListSyncLogInput) =>
      withSql(Operations.listSyncLog(input)),
    ),
    record: Effect.fn("SyncLogService.record")((input: Operations.RecordSyncLogInput) =>
      withSql(Operations.recordSyncLog(input)),
    ),
  });
});

export const layer = Layer.effect(SyncLogService, make);
