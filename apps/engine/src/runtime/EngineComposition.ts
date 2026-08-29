import * as Layer from "effect/Layer";

import { FinanceLive } from "../finance/FinanceLive.js";
import { layer as AutoRefreshLive } from "../finance/refresh/AutoRefresh.js";
import { layer as McpTokenLive } from "../mcp/McpTokenServiceLive.js";
import { layer as ManagedRuntimeLive } from "./ManagedRuntime.js";
import { layer as VaultEventsLive } from "../vault/VaultEvents.js";
import { VaultLive } from "../vault/VaultLive.js";
import { DatabaseConfigLive, type DatabaseConfig } from "../database/index.js";

/**
 * The production-shaped finance runtime. The Vault and Auto-refresh scheduler
 * receive the same VaultEvents layer, and the managed adapter is mandatory.
 */
export const makeEngineServicesLive = (
  databaseConfig: Layer.Layer<DatabaseConfig, unknown, never> = DatabaseConfigLive,
) =>
  AutoRefreshLive().pipe(
    Layer.provideMerge(FinanceLive),
    Layer.provideMerge(McpTokenLive),
    Layer.provideMerge(VaultLive.pipe(Layer.provide(databaseConfig))),
    Layer.provideMerge(VaultEventsLive),
    Layer.provideMerge(ManagedRuntimeLive()),
  );

export const EngineServicesLive = makeEngineServicesLive();
