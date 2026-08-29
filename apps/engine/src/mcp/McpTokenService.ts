import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { FinanceApiError } from "../finance/contracts.js";
import type { VaultStateError } from "../vault/errors.js";
import type { VaultUnlockError } from "../vault/envelope.js";

export class McpTokenService extends Context.Service<
  McpTokenService,
  {
    readonly configured: () => Effect.Effect<boolean, FinanceApiError>;
    readonly issue: (
      password: string,
    ) => Effect.Effect<string, FinanceApiError | VaultStateError | VaultUnlockError>;
    readonly authenticate: (token: string) => Effect.Effect<boolean, FinanceApiError>;
  }
>()("@satella-app/engine/mcp/McpTokenService") {}
