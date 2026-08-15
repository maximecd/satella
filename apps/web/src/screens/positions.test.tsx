import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { engineApi } from "../api";
import { renderRoute, resetFinanceMocks } from "../finance.route-harness.test-utils";

vi.mock("../api", async () => import("../engine-api.test-utils"));

describe("positions screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("decodes a transformed quantity string before calling the mutation", async () => {
    const user = userEvent.setup();
    renderRoute("/positions/active-position/edit");
    const input = await screen.findByLabelText("Quantity");
    await user.clear(input);
    await user.type(input, "1.5");
    await user.click(screen.getByRole("button", { name: "Save quantity" }));
    expect(engineApi.updatePosition).toHaveBeenCalledWith("active-position", 1.5);
  });

  it("shows a required message for an empty numeric field after submit", async () => {
    const user = userEvent.setup();
    renderRoute("/positions/active-position/edit");
    const input = await screen.findByLabelText("Quantity");
    await user.clear(input);

    expect(screen.queryByText("Quantity is required.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save quantity" }));
    expect(screen.getAllByText("Quantity is required.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Unable to decode/)).not.toBeInTheDocument();
  });
});
