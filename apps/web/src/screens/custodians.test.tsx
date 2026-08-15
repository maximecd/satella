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

describe("custodians screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("loads the custodian route through Query and renders its empty state", async () => {
    renderRoute("/custodians");
    expect(await screen.findByRole("heading", { name: "Custodians" })).toBeInTheDocument();
    expect(screen.getByText("No custodians yet")).toBeInTheDocument();
    expect(engineApi.listConnections).toHaveBeenCalledOnce();
  });

  it("edits connector credentials while leaving unchanged secrets blank", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.getConnection).mockResolvedValue(syncedConnection);
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

    renderRoute("/custodians/custodian-1/edit");
    expect(await screen.findByRole("heading", { name: "Edit OKX" })).toBeInTheDocument();
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

  it("resyncs a connector-managed custodian from its detail page", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.getConnection).mockResolvedValue(syncedConnection);
    vi.mocked(engineApi.refreshConnection).mockResolvedValue(syncedConnection);

    renderRoute("/custodians/custodian-1");
    await user.click(await screen.findByRole("button", { name: "Resync" }));

    expect(engineApi.refreshConnection).toHaveBeenCalledWith("custodian-1");
  });
});
