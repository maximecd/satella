import { describe, expect, it } from "vite-plus/test";

import { FinanceApi } from "./Api.js";

describe("finance API routes", () => {
  it.each([
    ["getConnection", "/api/connections/:id"],
    ["refreshConnection", "/api/connections/:id/refresh"],
    ["updateConnection", "/api/connections/:id"],
    ["deleteConnection", "/api/connections/:id"],
    ["getAccount", "/api/accounts/:id"],
    ["updateAccount", "/api/accounts/:id"],
    ["deleteAccount", "/api/accounts/:id"],
    ["getAsset", "/api/assets/:id"],
    ["updateAsset", "/api/assets/:id"],
    ["setManualPrice", "/api/assets/:id/price"],
    ["deleteAsset", "/api/assets/:id"],
    ["getPositionEdit", "/api/positions/:id"],
    ["updatePosition", "/api/positions/:id"],
    ["deletePosition", "/api/positions/:id"],
  ] as const)("declares %s with a dynamic id segment", (name, path) => {
    expect(FinanceApi.endpoints[name].path).toBe(path);
  });

  it.each([
    ["getDashboard", "/api/dashboard"],
    ["getSettings", "/api/settings"],
    ["updateSettings", "/api/settings"],
    ["listManualAccounts", "/api/manual-accounts"],
    ["lookupManualHolding", "/api/manual-holdings/lookup"],
    ["addManualHolding", "/api/add-assets/holding"],
    ["addCashAccount", "/api/add-assets/cash"],
    ["addOtherAsset", "/api/add-assets/other"],
    ["listConnections", "/api/connections"],
    ["connectConnection", "/api/connections"],
  ] as const)("declares %s at %s", (name, path) => {
    expect(FinanceApi.endpoints[name].path).toBe(path);
  });
});
