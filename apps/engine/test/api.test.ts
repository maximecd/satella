import { describe, expect, it } from "vitest";

import { FinanceApi } from "@engine/api";

describe("finance API routes", () => {
  it.each([
    ["getCustodian", "/api/custodians/:id"],
    ["resyncCustodian", "/api/custodians/:id/sync"],
    ["updateCustodian", "/api/custodians/:id"],
    ["deleteCustodian", "/api/custodians/:id"],
    ["getAccount", "/api/accounts/:id"],
    ["updateAccount", "/api/accounts/:id"],
    ["deleteAccount", "/api/accounts/:id"],
    ["getAsset", "/api/assets/:id"],
    ["updateAsset", "/api/assets/:id"],
    ["setManualPrice", "/api/assets/:id/price"],
    ["deleteAsset", "/api/assets/:id"],
    ["getPositionAccount", "/api/positions/:id"],
    ["updatePosition", "/api/positions/:id"],
    ["deletePosition", "/api/positions/:id"],
  ] as const)("declares %s with a dynamic id segment", (name, path) => {
    expect(FinanceApi.endpoints[name].path).toBe(path);
  });
});
