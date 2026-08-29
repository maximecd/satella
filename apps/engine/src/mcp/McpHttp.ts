import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpServerRequest } from "effect/unstable/http";
import { HttpServerResponse } from "effect/unstable/http";

import { AccountService } from "../finance/accounts/AccountService.js";
import { FinanceApiError } from "../finance/contracts.js";
import { DebtService } from "../finance/debts/DebtService.js";
import { GoalService } from "../finance/goals/GoalService.js";
import { PortfolioService } from "../finance/portfolio/PortfolioService.js";
import { VaultStateError } from "../vault/errors.js";
import { VaultService } from "../vault/Vault.js";
import { handleJsonRpcMessage, JsonRpcRequest } from "./jsonrpc.js";
import { McpTokenService } from "./McpTokenService.js";
import { toMcpPortfolio } from "./portfolio.js";

const mcpPath = (url: string) => {
  try {
    return new URL(url, "http://satella.local").pathname;
  } catch {
    return url.split("?", 1)[0] ?? url;
  }
};

const bearerToken = (header: string | undefined): string | undefined => {
  if (header === undefined) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1];
};

const unauthorized = () =>
  HttpServerResponse.json(
    { error: "unauthorized", message: "MCP token required." },
    { status: 401, headers: { "www-authenticate": 'Bearer realm="Satella MCP"' } },
  );

const vaultClosed = (message: string) =>
  HttpServerResponse.json({ error: "vault_closed", message }, { status: 403 });

const parseError = HttpServerResponse.json(
  { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
  { status: 400 },
);

export const McpHttp = HttpRouter.middleware(
  (httpApp) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (mcpPath(request.url) !== "/mcp") return yield* httpApp;
      if (request.method === "GET" || request.method === "HEAD") {
        return HttpServerResponse.empty({ status: 405, headers: { allow: "POST, DELETE" } });
      }
      if (request.method === "DELETE") {
        return HttpServerResponse.empty({ status: 200 });
      }
      if (request.method !== "POST") {
        return HttpServerResponse.empty({ status: 405, headers: { allow: "POST, DELETE" } });
      }

      const vault = yield* VaultService;
      yield* vault.assertOpenVault();

      const token = bearerToken(request.headers["authorization"]);
      if (token === undefined) return yield* unauthorized();
      const allowed = yield* (yield* McpTokenService).authenticate(token);
      if (!allowed) return yield* unauthorized();

      const payload = yield* HttpServerRequest.schemaBodyJson(JsonRpcRequest);
      const portfolio = yield* PortfolioService;
      const accounts = yield* AccountService;
      const debts = yield* DebtService;
      const goals = yield* GoalService;
      const loadPortfolio = Effect.gen(function* () {
        const dashboard = yield* portfolio.dashboard();
        const groups = yield* portfolio.accountGroups();
        const loaded = yield* Effect.forEach(groups, (group) =>
          Effect.forEach(group.accounts, (row) =>
            accounts.get(row.accountId).pipe(
              Effect.map((account) => ({
                account,
                synced: group.connectorId !== null,
              })),
            ),
          ),
        );
        const debtList = yield* debts.list();
        const goalList = yield* goals.list();
        return toMcpPortfolio(dashboard, loaded.flat(), debtList, goalList);
      });
      const outcome = yield* handleJsonRpcMessage(payload, loadPortfolio);
      if (outcome.kind === "empty") return HttpServerResponse.empty({ status: 202 });
      return yield* HttpServerResponse.json(outcome.body);
    }).pipe(
      Effect.catchTags({
        VaultStateError: (error: VaultStateError) =>
          vaultClosed(
            error.reason === "closed" || error.reason === "absent"
              ? "Unlock the Vault to use Satella MCP."
              : error.message,
          ),
        FinanceApiError: (error: FinanceApiError) =>
          error.code === "vault_closed"
            ? vaultClosed("Unlock the Vault to use Satella MCP.")
            : HttpServerResponse.json(
                { jsonrpc: "2.0", id: null, error: { code: -32603, message: error.message } },
                { status: 500 },
              ),
        HttpServerError: () => parseError,
        SchemaError: () => parseError,
      }),
    ),
  { global: true },
);
