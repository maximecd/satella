import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpServerRequest } from "effect/unstable/http";
import { HttpServerResponse } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";

import { FinanceApiError } from "../finance/contracts.js";
import { VaultStateError } from "../vault/errors.js";
import { VaultService } from "../vault/Vault.js";

const financeBlockedPath = (path: string) =>
  path.startsWith("/api/") && path !== "/api/hello" && !path.startsWith("/api/vault");

export const VaultFinanceAccess = HttpRouter.middleware(
  (httpApp) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      let path = request.url;
      try {
        path = new URL(request.url, "http://optimus.local").pathname;
      } catch {
        path = request.url.split("?", 1)[0] ?? request.url;
      }
      if (!financeBlockedPath(path)) {
        return yield* httpApp;
      }
      const vault = yield* VaultService;
      yield* vault.assertRendererFinanceAccess();
      const sql = yield* vault.currentSql();
      return yield* httpApp.pipe(Effect.provideService(SqlClient.SqlClient, sql));
    }).pipe(
      Effect.catchTag("VaultStateError", (error: VaultStateError) =>
        HttpServerResponse.json(
          new FinanceApiError({
            code: error.reason === "screen-locked" ? "screen_locked" : "vault_closed",
            message: error.message,
          }),
          { status: 403 },
        ),
      ),
    ),
  { global: true },
);
