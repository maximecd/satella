import { screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { engineApi } from "../api";
import { renderRoute, resetFinanceMocks } from "../finance.route-harness.test-utils";
import { chooseVaultExportDestination } from "../runtime";

vi.mock("../api", async () => import("../engine-api.test-utils"));
vi.mock("../runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../runtime")>()),
  chooseVaultExportDestination: vi.fn(),
}));

const mockExportDestination = (path: string | null) =>
  vi
    .mocked(chooseVaultExportDestination)
    .mockResolvedValue(path === null ? { kind: "cancelled" } : { kind: "path", path });

const typePin = async (user: UserEvent, label: string, pin: string) => {
  for (const [index, digit] of [...pin].entries()) {
    await user.type(screen.getByLabelText(`${label} digit ${index + 1}`), digit);
  }
};

describe("Settings → Security", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("shows Vault password, PIN, timeout, Lock now, and Reset Satella", async () => {
    renderRoute("/settings/security");
    expect(await screen.findByRole("heading", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current Vault password")).toBeInTheDocument();
    expect(screen.getByLabelText("New Screen-lock PIN digit 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Screen-lock timeout")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock now" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reset Satella" })).toBeInTheDocument();
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
    expect(await screen.findByRole("heading", { name: "Satella is locked" })).toBeInTheDocument();
  });

  it("exports the Vault after the user confirms the password and picks a destination", async () => {
    const user = userEvent.setup();
    mockExportDestination("/Users/maintainer/Backups/vault.satella-vault");
    vi.mocked(engineApi.exportVault).mockResolvedValue({
      state: "open",
      screenLock: false,
      pinAttemptsRemaining: 3,
      pinEntryDisabled: false,
      screenLockTimeoutMinutes: 15,
    });
    renderRoute("/settings/security");
    await user.type(
      await screen.findByLabelText("Vault password for export"),
      "correct-horse-battery",
    );
    await user.click(screen.getByRole("button", { name: "Export Vault" }));
    await waitFor(() =>
      expect(engineApi.exportVault).toHaveBeenCalledWith(
        "correct-horse-battery",
        "/Users/maintainer/Backups/vault.satella-vault",
      ),
    );
  });

  it("does not call the engine when the save dialog is cancelled", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.exportVault).mockClear();
    mockExportDestination(null);
    renderRoute("/settings/security");
    await user.type(
      await screen.findByLabelText("Vault password for export"),
      "correct-horse-battery",
    );
    await user.click(screen.getByRole("button", { name: "Export Vault" }));
    await waitFor(() => expect(chooseVaultExportDestination).toHaveBeenCalled());
    expect(engineApi.exportVault).not.toHaveBeenCalled();
  });

  it("reports a failed export without clearing the password field", async () => {
    const user = userEvent.setup();
    mockExportDestination("/Users/maintainer/Backups/vault.satella-vault");
    vi.mocked(engineApi.exportVault).mockRejectedValue(
      new Error("The Vault password is incorrect."),
    );
    renderRoute("/settings/security");
    await user.type(await screen.findByLabelText("Vault password for export"), "wrong-password-x");
    await user.click(screen.getByRole("button", { name: "Export Vault" }));
    expect(await screen.findByText("Export failed.")).toBeInTheDocument();
    expect(screen.getByLabelText("Vault password for export")).toHaveValue("wrong-password-x");
  });
});
