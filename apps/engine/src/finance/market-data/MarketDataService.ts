import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { AssetSearchResult, FinanceApiError, PriceRefreshResult } from "../contracts.js";
import * as MarketData from "../market-data.js";
import { SqlClient } from "effect/unstable/sql";
export class MarketDataService extends Context.Service<
  MarketDataService,
  {
    readonly search: (
      query: string,
      assetCategory: AssetSearchResult["assetCategory"],
    ) => Effect.Effect<ReadonlyArray<AssetSearchResult>, FinanceApiError>;
    readonly refresh: (options?: {
      readonly requireFresh?: boolean;
    }) => Effect.Effect<PriceRefreshResult, FinanceApiError>;
  }
>()("@optimus/engine/finance/MarketDataService") {}

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return MarketDataService.of({
    search: Effect.fn("MarketDataService.search")((query, assetCategory) =>
      MarketData.searchAssets(query, assetCategory).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
      ),
    ),
    refresh: Effect.fn("MarketDataService.refresh")((options) =>
      MarketData.refreshPrices({ requireFresh: true, ...options }).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
      ),
    ),
  });
});

export const layer = Layer.effect(MarketDataService, make);
