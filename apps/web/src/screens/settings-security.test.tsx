import { screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { engineApi } from "../api";
import { renderRoute, resetFinanceMocks } from "../finance.route-harness.test-utils";

vi.mock("../api", async () => import("../engine-api.test-utils"));

const typePin = async (user: UserEvent, label: string, pin: string) => {
  for (const [index, digit] of [...pin].entries()) {
    await user.type(screen.getByLabelText(`${label} digit ${index + 1}`), digit);
  }
};

describe("Settings → Security", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("shows Vault password, PIN, timeout, Lock now, and Reset Optimus", async () => {
    renderRoute("/settings/security");
    expect(await screen.findByRole("heading", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current Vault password")).toBeInTheDocument();
    expect(screen.getByLabelText("New Screen-lock PIN digit 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Screen-lock timeout")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock now" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reset Optimus" })).toBeInTheDocument();
  });

  it("requires the current Vault password to change the PIN", async () => {
    const user = userEvent.setup();
    renderRoute("/settings/security");
    await user.type(await screen.findByLabelText("Vault password"), "correct-horse-battery");
    await typePin(user, "New Screen-lock PIN", "1357");
    await typePin(user, "Confirm Screen-lock PIN", "1357");
    await user.click(screen.getByRole("button", { name: "Change Screen-lock PIN" }));
    await waitFor(() =>
      expect(engineApi.changeScreenLockPin).toHaveBeenCalledWith({
        password: "correct-horse-battery",
        pin: "1357",
      }),
    );
  });

  it("locks immediately from Settings → Security", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.lockScreen).mockResolvedValue({
      state: "open",
      screenLock: true,
      pinAttemptsRemaining: 3,
      pinEntryDisabled: false,
      screenLockTimeoutMinutes: 15,
    });
    renderRoute("/settings/security");
    await user.click(await screen.findByRole("button", { name: "Lock now" }));
    expect(await screen.findByRole("heading", { name: "Optimus is locked" })).toBeInTheDocument();
  });
});
