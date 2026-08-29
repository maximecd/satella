import { describe, expect, it } from "vite-plus/test";

import { FinanceApi } from "./Api.js";

describe("finance API routes", () => {
  it.each([
    ["getCustodian", "/api/custodians/:id"],
    ["refreshCustodian", "/api/custodians/:id/refresh"],
    ["updateCustodian", "/api/custodians/:id"],
    ["deleteCustodian", "/api/custodians/:id"],
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
    ["getDebt", "/api/debts/:id"],
    ["updateDebt", "/api/debts/:id"],
    ["deleteDebt", "/api/debts/:id"],
    ["getGoal", "/api/goals/:id"],
    ["updateGoal", "/api/goals/:id"],
    ["deleteGoal", "/api/goals/:id"],
  ] as const)("declares %s with a dynamic id segment", (name, path) => {
    expect(FinanceApi.endpoints[name].path).toBe(path);
  });

  it.each([
    ["getDashboard", "/api/dashboard"],
    ["getSettings", "/api/settings"],
    ["updateSettings", "/api/settings"],
    ["listManualAccounts", "/api/manual-accounts"],
    ["listManualCustodians", "/api/manual-custodians"],
    ["lookupManualHolding", "/api/manual-holdings/lookup"],
    ["addManualHolding", "/api/add-assets/holding"],
    ["addCashAccount", "/api/add-assets/cash"],
    ["addOtherAsset", "/api/add-assets/other"],
    ["listCustodians", "/api/custodians"],
    ["listSyncLog", "/api/sync-log"],
    ["createCustodian", "/api/custodians"],
    ["connectCustodian", "/api/custodians/connect"],
    ["listAccountGroups", "/api/account-groups"],
    ["listDebts", "/api/debts"],
    ["createDebt", "/api/debts"],
    ["listGoals", "/api/goals"],
    ["createGoal", "/api/goals"],
  ] as const)("declares %s at %s", (name, path) => {
    expect(FinanceApi.endpoints[name].path).toBe(path);
  });
});
