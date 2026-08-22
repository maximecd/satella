import * as Effect from "effect/Effect";
import { SqlClient } from "effect/unstable/sql";

import type { FinanceApiError } from "../contracts.js";
import { refreshPrices, type MarketDataRegistry } from "../market-data.js";
import { captureSnapshot } from "../portfolio/PortfolioSql.js";
import { db } from "../internal/sql.js";

type CycleEffect<A> = Effect.Effect<A, FinanceApiError, SqlClient.SqlClient>;

/** Every synced custodian, oldest first — the order a refresh cycle walks them in. */
export const listSyncedCustodianIds = (): CycleEffect<ReadonlyArray<string>> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* db(
      sql<{ readonly id: string }>`SELECT id FROM custodians
        WHERE connector_id IS NOT NULL ORDER BY created_at, id`,
    ).pipe(Effect.map((rows) => rows.map(({ id }) => id)));
  });

/**
 * Closes a refresh cycle: one price refresh across all assets followed by a
 * snapshot, so portfolio value history stays current even without synced
 * custodians.
 */
export const captureCycleTail = (
  options: { readonly registry?: MarketDataRegistry } = {},
): CycleEffect<FinanceApiError | null> =>
  Effect.gen(function* () {
    const priceOptions: Parameters<typeof refreshPrices>[0] = {
      requireFresh: true,
      includeAllCashFx: true,
    };
    if (options.registry !== undefined) Object.assign(priceOptions, { registry: options.registry });
    yield* refreshPrices(priceOptions).pipe(Effect.ignore);
    return yield* captureSnapshot({ refresh: false }).pipe(
      Effect.map(() => null),
      Effect.catch((error) => Effect.succeed(error)),
    );
  });
