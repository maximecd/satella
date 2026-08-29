import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  account,
  renderRoute,
  resetFinanceMocks,
  seedPortfolioEngine,
} from "../finance.route-harness.test-utils";

describe("accounts screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("shows custodian-grouped account cards with links into account detail", async () => {
    renderRoute("/accounts");
    expect(await screen.findByRole("heading", { name: "Demo bank" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "OKX" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Portfolio/ })).toHaveAttribute(
      "href",
      "/accounts/account-1",
    );
    expect(screen.getByRole("link", { name: /Trading/ })).toHaveAttribute(
      "href",
      "/accounts/connected-account",
    );
  });

  it("labels the default manual group Other holdings", async () => {
    seedPortfolioEngine({
      accounts: [
        {
          ...account,
          id: "watch",
          custodianId: "custodian:manual",
          custodianName: "Manual custodian",
          isDefaultCustodian: true,
        },
      ],
    });
    renderRoute("/accounts");
    expect(await screen.findByRole("heading", { name: "Other holdings" })).toBeInTheDocument();
    expect(screen.queryByText("Manual custodian")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Other holdings/ })).toHaveAttribute(
      "href",
      "/accounts/watch",
    );
  });
});
