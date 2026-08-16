import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { AssetSearchResult, FinanceApiError, PriceRefreshResult } from "../contracts.js";
import * as MarketData from "../market-data.js";
import { makeWithVaultSql } from "../with-vault-sql.js";
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
  const withSql = yield* makeWithVaultSql;
  return MarketDataService.of({
    search: Effect.fn("MarketDataService.search")((query, assetCategory) =>
      withSql(MarketData.searchAssets(query, assetCategory)),
    ),
    refresh: Effect.fn("MarketDataService.refresh")((options) =>
      withSql(MarketData.refreshPrices({ requireFresh: true, ...options })),
    ),
  });
});

export const layer = Layer.effect(MarketDataService, make);
