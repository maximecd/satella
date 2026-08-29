import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { makeWithVaultSql } from "../finance/with-vault-sql.js";
import { VaultService } from "../vault/Vault.js";
import * as Operations from "./McpTokenSql.js";
import { McpTokenService } from "./McpTokenService.js";

export const make = Effect.gen(function* () {
  const withSql = yield* makeWithVaultSql;
  const vault = yield* VaultService;
  return McpTokenService.of({
    configured: Effect.fn("McpTokenService.configured")(() =>
      withSql(Operations.mcpTokenConfigured()),
    ),
    issue: Effect.fn("McpTokenService.issue")((password: string) =>
      vault.verifyPassword(password).pipe(Effect.andThen(withSql(Operations.rotateMcpToken()))),
    ),
    authenticate: Effect.fn("McpTokenService.authenticate")((token: string) =>
      withSql(Operations.verifyMcpToken(token)),
    ),
  });
});

export const layer = Layer.effect(McpTokenService, make);
