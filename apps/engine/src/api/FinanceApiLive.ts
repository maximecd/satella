import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { EngineApi } from "./Api.js";
import { VaultApiLive } from "./VaultApiLive.js";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { AccountService } from "../finance/accounts/AccountService.js";
import { AddAssetsService } from "../finance/add-assets/AddAssetsService.js";
import { AssetService } from "../finance/assets/AssetService.js";
import { ConnectorCatalog } from "../finance/connectors/ConnectorCatalog.js";
import { ConnectionService } from "../finance/connections/ConnectionService.js";
import { MarketDataService } from "../finance/market-data/MarketDataService.js";
import { PortfolioService } from "../finance/portfolio/PortfolioService.js";
import { PositionService } from "../finance/positions/PositionService.js";
import { SettingsService } from "../finance/settings/SettingsService.js";

export const SystemApiLive = HttpApiBuilder.group(EngineApi, "system", (handlers) =>
  handlers.handle("hello", () => Effect.succeed({ message: "Hello world" })),
);

export const FinanceApiLive = HttpApiBuilder.group(EngineApi, "finance", (handlers) =>
  handlers
    .handle("connectorCapabilities", () =>
      Effect.gen(function* () {
        const catalog = yield* ConnectorCatalog;
        return catalog.capabilities();
      }),
    )
    .handle("getDashboard", () =>
      Effect.gen(function* () {
        return yield* (yield* PortfolioService).dashboard();
      }),
    )
    .handle("listManualAccounts", () =>
      Effect.gen(function* () {
        return yield* (yield* AddAssetsService).listManualAccounts();
      }),
    )
    .handle("lookupManualHolding", ({ query }) =>
      Effect.gen(function* () {
        return yield* (yield* AddAssetsService).lookupManualHolding(
          query.accountId,
          query.identifierType,
          query.identifierValue,
        );
      }),
    )
    .handle("addManualHolding", ({ payload }) =>
      Effect.gen(function* () {
        return yield* (yield* AddAssetsService).addManualHolding(payload);
      }),
    )
    .handle("addCashAccount", ({ payload }) =>
      Effect.gen(function* () {
        return yield* (yield* AddAssetsService).addCashAccount(payload);
      }),
    )
    .handle("addOtherAsset", ({ payload }) =>
      Effect.gen(function* () {
        return yield* (yield* AddAssetsService).addOtherAsset(payload);
      }),
    )
    .handle("listConnections", () =>
      Effect.gen(function* () {
        return yield* (yield* ConnectionService).list();
      }),
    )
    .handle("getConnection", ({ params }) =>
      Effect.gen(function* () {
        return yield* (yield* ConnectionService).get(params.id);
      }),
    )
    .handle("connectConnection", ({ payload }) =>
      Effect.gen(function* () {
        return yield* (yield* ConnectionService).connect(payload);
      }),
    )
    .handle("refreshConnection", ({ params }) =>
      Effect.gen(function* () {
        return yield* (yield* ConnectionService).refresh(params.id);
      }),
    )
    .handle("updateConnection", ({ params, payload }) =>
      Effect.gen(function* () {
        return yield* (yield* ConnectionService).update(params.id, payload);
      }),
    )
    .handle("deleteConnection", ({ params }) =>
      Effect.gen(function* () {
        return yield* (yield* ConnectionService).delete(params.id);
      }),
    )
    .handle("getAccount", ({ params }) =>
      Effect.gen(function* () {
        return yield* (yield* AccountService).get(params.id);
      }),
    )
    .handle("createAccount", ({ payload }) =>
      Effect.gen(function* () {
        return yield* (yield* AccountService).create(payload);
      }),
    )
    .handle("updateAccount", ({ params, payload }) =>
      Effect.gen(function* () {
        return yield* (yield* AccountService).update(params.id, payload);
      }),
    )
    .handle("deleteAccount", ({ params }) =>
      Effect.gen(function* () {
        return yield* (yield* AccountService).delete(params.id);
      }),
    )
    .handle("searchAssets", ({ query }) =>
      Effect.gen(function* () {
        return yield* (yield* MarketDataService).search(query.query, query.assetCategory);
      }),
    )
    .handle("listAssets", () =>
      Effect.gen(function* () {
        return yield* (yield* AssetService).list();
      }),
    )
    .handle("getAsset", ({ params }) =>
      Effect.gen(function* () {
        return yield* (yield* AssetService).get(params.id);
      }),
    )
    .handle("createAsset", ({ payload }) =>
      Effect.gen(function* () {
        return yield* (yield* AssetService).create(payload);
      }),
    )
    .handle("updateAsset", ({ params, payload }) =>
      Effect.gen(function* () {
        return yield* (yield* AssetService).maintain(params.id, payload);
      }),
    )
    .handle("setManualPrice", ({ params, payload }) =>
      Effect.gen(function* () {
        return yield* (yield* AssetService).setManualPrice(params.id, payload);
      }),
    )
    .handle("deleteAsset", ({ params }) =>
      Effect.gen(function* () {
        return yield* (yield* AssetService).delete(params.id);
      }),
    )
    .handle("getPositionEdit", ({ params }) =>
      Effect.gen(function* () {
        return yield* (yield* PositionService).getEdit(params.id);
      }),
    )
    .handle("createPosition", ({ payload }) =>
      Effect.gen(function* () {
        return yield* (yield* PositionService).create(payload);
      }),
    )
    .handle("updatePosition", ({ params, payload }) =>
      Effect.gen(function* () {
        return yield* (yield* PositionService).update(params.id, payload.quantity);
      }),
    )
    .handle("deletePosition", ({ params }) =>
      Effect.gen(function* () {
        return yield* (yield* PositionService).delete(params.id);
      }),
    )
    .handle("portfolioHistory", () =>
      Effect.gen(function* () {
        return yield* (yield* PortfolioService).history();
      }),
    )
    .handle("refreshPrices", () =>
      Effect.gen(function* () {
        return yield* (yield* MarketDataService).refresh({ requireFresh: true });
      }),
    )
    .handle("captureSnapshot", () =>
      Effect.gen(function* () {
        return yield* (yield* PortfolioService).captureSnapshot();
      }),
    )
    .handle("getSettings", () =>
      Effect.gen(function* () {
        return yield* (yield* SettingsService).get();
      }),
    )
    .handle("updateSettings", ({ payload }) =>
      Effect.gen(function* () {
        return yield* (yield* SettingsService).update(payload);
      }),
    ),
);

export const EngineApiLive = HttpApiBuilder.layer(EngineApi).pipe(
  Layer.provide(SystemApiLive),
  Layer.provide(VaultApiLive),
  Layer.provide(FinanceApiLive),
);
