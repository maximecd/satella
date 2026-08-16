import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { engineApi } from "../api";
import {
  renderRoute,
  resetFinanceMocks,
  syncedConnection,
} from "../finance.route-harness.test-utils";

vi.mock("../api", async () => import("../engine-api.test-utils"));

describe("connections screens", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("shows an empty Connections list that points to Add assets", async () => {
    renderRoute("/settings/connections");
    expect(await screen.findByRole("heading", { name: "Connections" })).toBeInTheDocument();
    expect(screen.getByText("No connections")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add assets" }).length).toBeGreaterThan(0);
  });

  it("lists a Connection with account count, Refresh, and Edit", async () => {
    vi.mocked(engineApi.listConnections).mockResolvedValue([syncedConnection]);
    renderRoute("/settings/connections");
    expect(await screen.findByText("OKX")).toBeInTheDocument();
    expect(screen.getByText("1 account")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/settings/connections/custodian-1/edit",
    );
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    expect(screen.queryByText("Resync")).not.toBeInTheDocument();
  });

  it("refreshes the Connection from the list row", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.listConnections).mockResolvedValue([syncedConnection]);
    renderRoute("/settings/connections");
    await user.click(await screen.findByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(engineApi.refreshConnection).toHaveBeenCalledWith("custodian-1"));
  });

  it("refreshes the Connection from the detail title", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.getConnection).mockResolvedValue(syncedConnection);
    renderRoute("/settings/connections/custodian-1");
    expect(await screen.findByRole("heading", { name: "OKX" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(engineApi.refreshConnection).toHaveBeenCalledWith("custodian-1"));
  });

  it("edits Connection credentials while leaving unchanged secrets blank", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.connectorCapabilities).mockResolvedValue({
      connectors: [
        {
          id: "okx",
          name: "OKX",
          assetCategories: ["crypto"],
          credentialFields: [
            { key: "apiKey", label: "API key", kind: "text", required: true },
            { key: "secretKey", label: "Secret key", kind: "password", required: true },
            {
              key: "region",
              label: "Region",
              kind: "select",
              required: true,
              options: [{ value: "global", label: "Global" }],
            },
          ],
        },
      ],
    });
    vi.mocked(engineApi.updateConnection).mockResolvedValue(syncedConnection);

    renderRoute("/settings/connections/custodian-1/edit");
    expect(await screen.findByRole("heading", { name: "Edit OKX" })).toBeInTheDocument();
    expect(
      screen.getByText(/Prefer read-only credentials with no trading or withdrawal capability/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Secret key/, { selector: "input" })).toHaveValue("");
    await user.type(screen.getByLabelText("API key"), "replacement-key");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(engineApi.updateConnection).toHaveBeenCalledWith("custodian-1", {
        name: "OKX",
        credentials: { apiKey: "replacement-key" },
      }),
    );
  });

  it("requires confirmation before deleting a Connection", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.connectorCapabilities).mockResolvedValue({
      connectors: [
        {
          id: "okx",
          name: "OKX",
          assetCategories: ["crypto"],
          credentialFields: [{ key: "apiKey", label: "API key", kind: "text", required: true }],
        },
      ],
    });
    vi.mocked(engineApi.deleteConnection).mockResolvedValue(undefined);

    renderRoute("/settings/connections/custodian-1/edit");
    await user.click(await screen.findByRole("button", { name: "Delete connection" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(engineApi.deleteConnection).toHaveBeenCalledWith("custodian-1"));
  });
});
