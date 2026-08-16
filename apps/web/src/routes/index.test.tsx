import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { renderRoute, resetFinanceMocks } from "../finance.route-harness.test-utils";

describe("index route", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("renders the dashboard at / without redirecting", async () => {
    renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });
});
