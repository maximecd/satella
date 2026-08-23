import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  renderRoute,
  resetFinanceMocks,
  seedPortfolioEngine,
} from "../finance.route-harness.test-utils";
import { changeAppLanguage } from "../i18n";

describe("Sync log screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
    changeAppLanguage("en");
  });

  it("shows an empty state when the Vault has no Sync history", async () => {
    renderRoute("/settings/sync-log");
    expect(await screen.findByRole("heading", { name: "No Sync history yet" })).toBeInTheDocument();
  });

  it("shows compact successful and failed entries", async () => {
    seedPortfolioEngine({
      syncLog: [
        {
          id: "asset-entry",
          completedAt: "2026-08-20T12:00:00.000Z",
          subjectKind: "asset",
          subjectName: "Bitcoin",
          action: "price_check",
          outcome: "success",
          failureReason: null,
        },
        {
          id: "custodian-entry",
          completedAt: "2026-08-20T11:00:00.000Z",
          subjectKind: "custodian",
          subjectName: "Demo bank",
          action: "refresh",
          outcome: "failure",
          failureReason: "The Custodian's linked service is unavailable.",
        },
      ],
    });
    renderRoute("/settings/sync-log");
    expect(await screen.findByText("Bitcoin")).toBeInTheDocument();
    expect(screen.getByText("Demo bank")).toBeInTheDocument();
    expect(screen.getByText("Success")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("The Custodian's linked service is unavailable.")).toBeInTheDocument();
  });
});
