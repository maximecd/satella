import { LayerProvider } from "@astryxdesign/core/Layer";
import { Theme } from "@astryxdesign/core/theme";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { getHello } from "./api";
import { App } from "./App";
import { stoneTheme } from "./themes/stone/stoneTheme";

vi.mock("./api", () => ({
  getHello: vi.fn(),
}));

function renderApp() {
  return render(
    <Theme theme={stoneTheme}>
      <LayerProvider>
        <App />
      </LayerProvider>
    </Theme>,
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.mocked(getHello).mockReset();
  });

  it("renders the landing view", () => {
    renderApp();

    expect(screen.getByRole("heading", { name: "Hello world" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get started" })).toBeInTheDocument();
  });

  it("requests a greeting when the user gets started", async () => {
    vi.mocked(getHello).mockResolvedValue({ message: "Hello from the engine" });
    const user = userEvent.setup();

    renderApp();
    await user.click(screen.getByRole("button", { name: "Get started" }));

    expect(getHello).toHaveBeenCalledTimes(1);
  });
});
