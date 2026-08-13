import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { engineApi } from "../api";
import { renderRoute, resetFinanceMocks } from "../finance.route-harness.test-utils";

vi.mock("../api", async () => import("../engine-api.test-utils"));

describe("dashboard screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("renders the dashboard instead of redirecting away from /", async () => {
    renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add assets" }).length).toBeGreaterThan(0);
    expect(screen.getByText("No assets yet")).toBeInTheDocument();
    expect(engineApi.getDashboard).toHaveBeenCalled();
  });
});
