import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  renderRoute,
  resetFinanceMocks,
  seedPortfolioEngine,
  syncedCustodian,
} from "../finance.route-harness.test-utils";

const okxCapabilities = {
  connectors: [
    {
      id: "okx",
      name: "OKX",
      assetCategories: ["crypto" as const],
      credentialFields: [
        { key: "apiKey", label: "API key", kind: "text" as const, required: true },
        { key: "secretKey", label: "Secret key", kind: "password" as const, required: true },
        {
          key: "region",
          label: "Region",
          kind: "select" as const,
          required: true,
          options: [{ value: "global", label: "Global" }],
        },
      ],
    },
  ],
};

describe("custodians screens", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("shows an empty Custodians list that points to Add assets", async () => {
    renderRoute("/settings/custodians");
    expect(await screen.findByRole("heading", { name: "Custodians" })).toBeInTheDocument();
    expect(screen.getByText("No custodians")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add assets" }).length).toBeGreaterThan(0);
  });

  it("lists a Custodian with account count, Refresh, and Edit", async () => {
    seedPortfolioEngine({ custodians: [syncedCustodian] });
    renderRoute("/settings/custodians");
    expect(await screen.findByText("OKX")).toBeInTheDocument();
    expect(screen.getByText("1 account")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/settings/custodians/custodian-1/edit",
    );
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    expect(screen.queryByText("Resync")).not.toBeInTheDocument();
  });

  it("refreshes the Custodian from the list row", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({ custodians: [syncedCustodian] });
    renderRoute("/settings/custodians");
    await user.click(await screen.findByRole("button", { name: "Refresh" }));
    expect((await screen.findAllByText("Custodian refreshed.")).length).toBeGreaterThan(0);
  });

  it("refreshes the Custodian from the detail title", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({ custodians: [syncedCustodian] });
    renderRoute("/settings/custodians/custodian-1");
    expect(await screen.findByRole("heading", { name: "OKX" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect((await screen.findAllByText("Custodian refreshed.")).length).toBeGreaterThan(0);
  });

  it("edits Custodian credentials while leaving unchanged secrets blank", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({
      custodians: [syncedCustodian],
      capabilities: okxCapabilities,
    });

    renderRoute("/settings/custodians/custodian-1/edit");
    expect(await screen.findByRole("heading", { name: "Edit OKX" })).toBeInTheDocument();
    expect(
      screen.getByText(/Prefer read-only credentials with no trading or withdrawal capability/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Secret key/, { selector: "input" })).toHaveValue("");
    await user.type(screen.getByLabelText("API key"), "replacement-key");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect((await screen.findAllByText("Custodian updated.")).length).toBeGreaterThan(0);
    expect(await screen.findByRole("heading", { name: "OKX" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Edit OKX" })).not.toBeInTheDocument();
  });

  it("requires confirmation before deleting a Custodian", async () => {
    const user = userEvent.setup();
    seedPortfolioEngine({
      custodians: [syncedCustodian],
      capabilities: {
        connectors: [
          {
            id: "okx",
            name: "OKX",
            assetCategories: ["crypto"],
            credentialFields: [{ key: "apiKey", label: "API key", kind: "text", required: true }],
          },
        ],
      },
    });

    renderRoute("/settings/custodians/custodian-1/edit");
    await user.click(await screen.findByRole("button", { name: "Delete custodian" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(await screen.findByRole("heading", { name: "Custodians" })).toBeInTheDocument();
    expect(screen.getByText("No custodians")).toBeInTheDocument();
  });
});
