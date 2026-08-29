import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { McpPortfolio } from "./portfolio.js";

export const MCP_PROTOCOL_VERSION = "2025-03-26";

const SUPPORTED_PROTOCOL_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);

export const GET_PORTFOLIO_TOOL_NAME = "get_portfolio";

export const GET_PORTFOLIO_DESCRIPTION = [
  "Return the current Satella Vault in the Reporting currency: Total assets, Total debt, Net worth, Unrealized P&L, allocation by Asset category / Custodian / Asset, every Account with Positions, every Debt, and every Goal.",
  "This is current state, not history. Crypto is the crypto Asset category. Convert against another Asset using the prices in the payload.",
  "Satella MCP is read-only. It does not Refresh custodians or move money.",
].join(" ");

const SERVER_INSTRUCTIONS = GET_PORTFOLIO_DESCRIPTION;

export const JsonRpcId = Schema.Union([Schema.String, Schema.Number, Schema.Null]);
export type JsonRpcId = typeof JsonRpcId.Type;

const JsonRpcParams = Schema.Struct({
  protocolVersion: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  arguments: Schema.optional(Schema.Struct({})),
});

export const JsonRpcRequest = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.optional(JsonRpcId),
  method: Schema.String,
  params: Schema.optional(JsonRpcParams),
});
export type JsonRpcRequest = typeof JsonRpcRequest.Type;

const jsonRpcResult = <T>(id: JsonRpcId | undefined, result: T) => ({
  jsonrpc: "2.0" as const,
  id,
  result,
});

const jsonRpcError = (id: JsonRpcId, code: number, message: string) => ({
  jsonrpc: "2.0" as const,
  id,
  error: { code, message },
});

const negotiatedProtocolVersion = (requested: string | undefined): string =>
  requested !== undefined && SUPPORTED_PROTOCOL_VERSIONS.has(requested)
    ? requested
    : MCP_PROTOCOL_VERSION;

export const toolsListResult = () => ({
  tools: [
    {
      name: GET_PORTFOLIO_TOOL_NAME,
      description: GET_PORTFOLIO_DESCRIPTION,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  ],
});

export const initializeResult = (requestedProtocolVersion: string | undefined) => ({
  protocolVersion: negotiatedProtocolVersion(requestedProtocolVersion),
  capabilities: { tools: { listChanged: false } },
  serverInfo: { name: "satella", version: "0.1.0" },
  instructions: SERVER_INSTRUCTIONS,
});

export const getPortfolioToolResult = (portfolio: McpPortfolio) => ({
  content: [{ type: "text" as const, text: JSON.stringify(portfolio, null, 2) }],
  structuredContent: portfolio,
  isError: false,
});

export const unknownToolResult = (name: string) => ({
  content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
  isError: true,
});

export type JsonRpcOutcome =
  | { readonly kind: "empty" }
  | {
      readonly kind: "body";
      readonly body: ReturnType<typeof jsonRpcResult> | ReturnType<typeof jsonRpcError>;
    };

export const handleJsonRpcMessage = <E, R>(
  request: JsonRpcRequest,
  loadPortfolio: Effect.Effect<McpPortfolio, E, R>,
): Effect.Effect<JsonRpcOutcome, E, R> => {
  const notification = request.id === undefined;
  switch (request.method) {
    case "notifications/initialized":
    case "notifications/cancelled":
      return Effect.succeed({ kind: "empty" });
    case "initialize":
      if (notification) return Effect.succeed({ kind: "empty" });
      return Effect.succeed({
        kind: "body",
        body: jsonRpcResult(request.id, initializeResult(request.params?.protocolVersion)),
      });
    case "ping":
      if (notification) return Effect.succeed({ kind: "empty" });
      return Effect.succeed({ kind: "body", body: jsonRpcResult(request.id, {}) });
    case "tools/list":
      if (notification) return Effect.succeed({ kind: "empty" });
      return Effect.succeed({ kind: "body", body: jsonRpcResult(request.id, toolsListResult()) });
    case "tools/call": {
      if (notification) return Effect.succeed({ kind: "empty" });
      const name = request.params?.name ?? "";
      if (name !== GET_PORTFOLIO_TOOL_NAME) {
        return Effect.succeed({
          kind: "body",
          body: jsonRpcResult(request.id, unknownToolResult(name)),
        });
      }
      return loadPortfolio.pipe(
        Effect.map((portfolio) => ({
          kind: "body" as const,
          body: jsonRpcResult(request.id, getPortfolioToolResult(portfolio)),
        })),
      );
    }
    default:
      if (notification) return Effect.succeed({ kind: "empty" });
      return Effect.succeed({
        kind: "body",
        body: jsonRpcError(request.id ?? null, -32601, `Method not found: ${request.method}`),
      });
  }
};
