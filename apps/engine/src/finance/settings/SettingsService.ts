import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { FinanceApiError, Settings, UpdateSettingsInput } from "../contracts.js";

export class SettingsService extends Context.Service<
  SettingsService,
  {
    readonly get: () => Effect.Effect<Settings, FinanceApiError>;
    readonly update: (input: UpdateSettingsInput) => Effect.Effect<Settings, FinanceApiError>;
  }
>()("@satella-app/engine/finance/SettingsService") {}
