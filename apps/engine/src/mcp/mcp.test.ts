import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { startEngine } from "../database/development-database.test-utils.js";
import { GET_PORTFOLIO_TOOL_NAME, type JsonRpcRequest } from "./jsonrpc.js";

const waitForEngineHello = async (port: number) => {
  const url = `http://127.0.0.1:${port}/api/hello`;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Engine is still binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Engine HTTP was not ready");
};

const PASSWORD = "correct-horse-battery";
const PIN = "2468";

const json = async (port: number, path: string, init: RequestInit = {}) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text.length === 0 ? undefined : JSON.parse(text),
  };
};

const mcp = (port: number, token: string | undefined, message: JsonRpcRequest) =>
  json(port, "/mcp", {
    method: "POST",
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    body: JSON.stringify(message),
  });

describe("Satella MCP HTTP", () => {
  const directories: string[] = [];
  const engines: Array<Awaited<ReturnType<typeof startEngine>>> = [];

  afterEach(async () => {
    await Promise.all(engines.splice(0).map((engine) => engine.stop()));
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  const start = async () => {
    const directory = await mkdtemp(join(tmpdir(), "satella-mcp-"));
    directories.push(directory);
    const engine = await startEngine({
      cwd: process.cwd(),
      env: { SATELLA_DATA_DIR: directory },
    });
    engines.push(engine);
    await waitForEngineHello(engine.port);
    return engine;
  };

  it("reads the Vault through get_portfolio with a Settings-issued token, including during Screen lock", async () => {
    const engine = await start();
    const { port } = engine;
    expect(
      (await mcp(port, "stl_nope", { jsonrpc: "2.0", id: 1, method: "tools/list" })).status,
    ).toBe(403);

    await json(port, "/api/vault/initialize", {
      method: "POST",
      body: JSON.stringify({ password: PASSWORD, pin: PIN }),
    });
    await json(port, "/api/add-assets/other", {
      method: "POST",
      body: JSON.stringify({
        name: "Painting",
        value: "1000",
        currencyAssetId: "fiat:USD",
      }),
    });
    await json(port, "/api/goals", {
      method: "POST",
      body: JSON.stringify({
        name: "Buy a car",
        amount: "15000",
        currencyAssetId: "fiat:USD",
        targetDate: null,
        accountIds: ["account:manual"],
      }),
    });

    expect((await json(port, "/api/dashboard")).status).toBe(200);
    expect(
      (await mcp(port, undefined, { jsonrpc: "2.0", id: 1, method: "tools/list" })).status,
    ).toBe(401);
    expect(
      (await mcp(port, "stl_nope", { jsonrpc: "2.0", id: 1, method: "tools/list" })).status,
    ).toBe(401);

    const issued = await json(port, "/api/vault/mcp-token", {
      method: "POST",
      body: JSON.stringify({ password: "wrong-password" }),
    });
    expect(issued.status).toBeGreaterThanOrEqual(400);

    const created = await json(port, "/api/vault/mcp-token", {
      method: "POST",
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(created.status).toBeLessThan(300);
    expect(created.body.token).toMatch(/^stl_/);
    expect(created.body.url).toBe(`http://127.0.0.1:${port}/mcp`);
    expect(created.body.authorizationHeader).toBe(`Authorization: Bearer ${created.body.token}`);

    const status = await json(port, "/api/vault/mcp-token");
    expect(status.body).toEqual({ configured: true, url: `http://127.0.0.1:${port}/mcp` });

    const listed = await mcp(port, created.body.token, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect(listed.status).toBe(200);
    expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      GET_PORTFOLIO_TOOL_NAME,
    ]);

    const portfolio = await mcp(port, created.body.token, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: GET_PORTFOLIO_TOOL_NAME, arguments: {} },
    });
    expect(portfolio.status).toBe(200);
    expect(portfolio.body.result.structuredContent.reportingCurrency.iso).toBe("USD");
    expect(portfolio.body.result.structuredContent.accounts.length).toBeGreaterThan(0);
    expect(portfolio.body.result.structuredContent.goals).toEqual([
      expect.objectContaining({
        name: "Buy a car",
        amount: "15000",
        currentAmount: "1000",
        contributingAccounts: [expect.objectContaining({ id: "account:manual" })],
      }),
    ]);
    expect(JSON.stringify(portfolio.body.result.structuredContent)).not.toContain("yahoo");
    expect(portfolio.body.result.structuredContent.history).toBeUndefined();

    await json(port, "/api/vault/lock", { method: "POST" });
    expect((await json(port, "/api/dashboard")).status).toBe(403);
    const lockedRead = await mcp(port, created.body.token, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: GET_PORTFOLIO_TOOL_NAME, arguments: {} },
    });
    expect(lockedRead.status).toBe(200);
    expect(lockedRead.body.result.structuredContent.totalAssets).toBe(
      portfolio.body.result.structuredContent.totalAssets,
    );

    const rotated = await json(port, "/api/vault/mcp-token", {
      method: "POST",
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(
      (await mcp(port, created.body.token, { jsonrpc: "2.0", id: 4, method: "ping" })).status,
    ).toBe(401);
    expect(
      (await mcp(port, rotated.body.token, { jsonrpc: "2.0", id: 5, method: "ping" })).status,
    ).toBe(200);

    await json(port, "/api/vault/close", { method: "POST" });
    expect(
      (await mcp(port, rotated.body.token, { jsonrpc: "2.0", id: 6, method: "ping" })).status,
    ).toBe(403);
  }, 60_000);
});
