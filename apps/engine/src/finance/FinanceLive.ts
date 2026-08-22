import * as Layer from "effect/Layer";

import { layer as AccountLive } from "./accounts/AccountServiceLive.js";
import { layer as AddAssetsLive } from "./add-assets/AddAssetsServiceLive.js";
import { layer as AssetLive } from "./assets/AssetServiceLive.js";
import { layer as ConnectorCatalogLive } from "./connectors/ConnectorCatalog.js";
import { layer as ConnectorSyncLive } from "./connectors/ConnectorSync.js";
import { layer as CustodianLive } from "./custodians/CustodianServiceLive.js";
import { layer as SettingsLive } from "./settings/SettingsServiceLive.js";
import { layer as MarketDataLive } from "./market-data/MarketDataService.js";
import { layer as PortfolioLive } from "./portfolio/PortfolioServiceLive.js";
import { layer as PositionLive } from "./positions/PositionServiceLive.js";
import { layer as RefreshQueueLive } from "./refresh/RefreshQueue.js";

export const FinanceLive = Layer.mergeAll(
  AssetLive,
  CustodianLive,
  AccountLive,
  PositionLive,
  PortfolioLive,
  SettingsLive,
  AddAssetsLive,
  ConnectorCatalogLive,
  ConnectorSyncLive,
  MarketDataLive,
).pipe(Layer.provideMerge(RefreshQueueLive));
