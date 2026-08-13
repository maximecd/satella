import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderRoute, resetFinanceMocks } from "../finance.route-harness.test-utils";

vi.mock("../api", async () => import("../engine-api.test-utils"));

describe("settings screen", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("keeps Settings as the path to raw custodians", async () => {
    renderRoute("/settings");
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Custodians/ })).toHaveAttribute("href", "/custodians");
    expect(screen.getByRole("link", { name: /^Assets/ })).toHaveAttribute("href", "/assets");
  });
});
