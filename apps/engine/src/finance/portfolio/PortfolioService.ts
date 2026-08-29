import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type {
  DashboardCustodianGroup,
  Dashboard,
  FinanceApiError,
  PortfolioHistoryPoint,
  SnapshotResult,
} from "../contracts.js";
import type { CaptureSnapshotOptions } from "./PortfolioSql.js";

export class PortfolioService extends Context.Service<
  PortfolioService,
  {
    readonly captureSnapshot: (
      options?: CaptureSnapshotOptions,
    ) => Effect.Effect<SnapshotResult, FinanceApiError>;
    readonly history: () => Effect.Effect<ReadonlyArray<PortfolioHistoryPoint>, FinanceApiError>;
    readonly dashboard: () => Effect.Effect<Dashboard, FinanceApiError>;
    readonly accountGroups: () => Effect.Effect<
      ReadonlyArray<DashboardCustodianGroup>,
      FinanceApiError
    >;
  }
>()("@satella-app/engine/finance/PortfolioService") {}
