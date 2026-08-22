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

describe("onboarding and Vault start", () => {
  beforeEach(() => {
    resetFinanceMocks();
    window.sessionStorage.clear();
  });

  it("walks through welcome, Vault password, PIN, and first-asset invitation", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.vaultStatus).mockResolvedValue({ state: "absent" });
    vi.mocked(engineApi.initializeVault).mockImplementation(async () => {
      const status = {
        state: "open" as const,
        screenLock: false,
        pinAttemptsRemaining: 3,
        pinEntryDisabled: false,
        screenLockTimeoutMinutes: 15 as const,
      };
      vi.mocked(engineApi.vaultStatus).mockResolvedValue(status);
      return status;
    });
    renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Welcome to Optimus" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const password = await screen.findByLabelText("Vault password");
    await user.click(screen.getAllByRole("button", { name: "Show" })[0]!);
    await user.type(password, "correct horse");
    await user.type(screen.getByLabelText("Confirm Vault password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByLabelText("Screen-lock PIN digit 1");
    await typePin(user, "Screen-lock PIN", "2468");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByLabelText("Confirm Screen-lock PIN digit 1");
    await typePin(user, "Confirm Screen-lock PIN", "2468");
    await user.click(screen.getByRole("button", { name: "Create Vault" }));
    await waitFor(() =>
      expect(engineApi.initializeVault).toHaveBeenCalledWith({
        password: "correct horse",
        pin: "2468",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Add your first asset" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add your first asset" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to dashboard" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to dashboard" }));
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("shows a generic unlock failure on the Vault password screen", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.vaultStatus).mockResolvedValue({ state: "locked" });
    vi.mocked(engineApi.unlockVault).mockRejectedValue(
      new Error("The Vault could not be unlocked."),
    );
    renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Unlock your Vault" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Vault password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Unlock Vault" }));
    expect(await screen.findByText("The Vault could not be unlocked.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reset Optimus" })).toBeInTheDocument();
  });
});

describe("Screen lock", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("hides financial screens and keeps Vault-password fallback visible", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.vaultStatus).mockResolvedValue({
      state: "open",
      screenLock: true,
      pinAttemptsRemaining: 3,
      pinEntryDisabled: false,
      screenLockTimeoutMinutes: 15,
    });
    renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Optimus is locked" })).toBeInTheDocument();
    expect(screen.getByText(/Background Refresh may continue/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use Vault password instead" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use Vault password instead" }));
    expect(await screen.findByLabelText("Vault password")).toBeInTheDocument();
  });

  it("keeps financial screens hidden after three incorrect PIN attempts", async () => {
    const user = userEvent.setup();
    let remaining = 3;
    vi.mocked(engineApi.vaultStatus).mockImplementation(async () => ({
      state: "open",
      screenLock: true,
      pinAttemptsRemaining: remaining,
      pinEntryDisabled: remaining === 0,
      screenLockTimeoutMinutes: 15,
    }));
    vi.mocked(engineApi.unlockScreen).mockImplementation(async () => {
      remaining -= 1;
      if (remaining === 0) {
        throw new Error("Enter the Vault password to dismiss the Screen lock.");
      }
      throw new Error("The Screen-lock PIN is incorrect.");
    });
    renderRoute("/");
    await screen.findByLabelText("Screen-lock PIN digit 1");
    await typePin(user, "Screen-lock PIN", "0000");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    await typePin(user, "Screen-lock PIN", "0000");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    await typePin(user, "Screen-lock PIN", "0000");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText(/Enter the Vault password/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
  });
});
