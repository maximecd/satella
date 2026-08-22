import { screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { engineApi } from "../api";
import { renderRoute, resetFinanceMocks } from "../finance.route-harness.test-utils";
import { chooseVaultImportSource } from "../runtime";
import { changeAppLanguage, i18n } from "../i18n";

vi.mock("../api", async () => import("../engine-api.test-utils"));
vi.mock("../runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../runtime")>()),
  chooseVaultImportSource: vi.fn(),
}));

const L = (en: string, fr: string) => (i18n.language === "fr" ? fr : en);

const typePin = async (user: UserEvent, label: string, pin: string) => {
  for (const [index, digit] of [...pin].entries()) {
    await user.type(screen.getByLabelText(`${label} digit ${index + 1}`), digit);
  }
};

describe("onboarding and Vault start", () => {
  beforeEach(() => {
    resetFinanceMocks();
    window.sessionStorage.clear();
    changeAppLanguage("en");
  });

  const createVault = async (user: ReturnType<typeof userEvent.setup>) => {
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
    expect(
      await screen.findByRole("heading", {
        name: L("Welcome to Satella", "Bienvenue dans Satella"),
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: L("Create a new Vault", "Créer un nouveau coffre") }),
    );
    const password = await screen.findByLabelText(L("Vault password", "Mot de passe du coffre"));
    await user.type(password, "correct horse");
    await user.type(
      screen.getByLabelText(L("Confirm Vault password", "Confirmer le mot de passe du coffre")),
      "correct horse",
    );
    await user.click(screen.getByRole("button", { name: L("Continue", "Continuer") }));
    await screen.findByLabelText(L("Screen-lock PIN", "Code de verrouillage") + " digit 1");
    await typePin(user, L("Screen-lock PIN", "Code de verrouillage"), "2468");
    await user.click(screen.getByRole("button", { name: L("Continue", "Continuer") }));
    await screen.findByLabelText(
      L("Confirm Screen-lock PIN", "Confirmer le code de verrouillage") + " digit 1",
    );
    await typePin(user, L("Confirm Screen-lock PIN", "Confirmer le code de verrouillage"), "2468");
    await user.click(screen.getByRole("button", { name: L("Create Vault", "Créer le coffre") }));
    await waitFor(() =>
      expect(engineApi.initializeVault).toHaveBeenCalledWith({
        password: "correct horse",
        pin: "2468",
      }),
    );
  };

  it("walks through welcome, Vault password, PIN, preferences, and first-asset invitation", async () => {
    const user = userEvent.setup();
    await createVault(user);
    expect(
      await screen.findByRole("heading", { name: "Language and currency" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Language")).toBeInTheDocument();
    expect(screen.getByLabelText("Reporting currency")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep suggested" }));
    expect(
      await screen.findByRole("heading", { name: "Add your first asset" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add your first asset" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to dashboard" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to dashboard" }));
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("applies the chosen App language and Reporting currency to the rest of the app", async () => {
    const user = userEvent.setup();
    await createVault(user);
    expect(
      await screen.findByRole("heading", { name: "Language and currency" }),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Language"), "fr");
    await user.selectOptions(screen.getByLabelText("Devise de référence"), "fiat:EUR");
    await user.click(screen.getByRole("button", { name: "Enregistrer et continuer" }));
    expect(
      await screen.findByRole("heading", { name: "Ajoutez votre premier actif" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aller au tableau de bord" }));
    await user.click(await screen.findByRole("link", { name: /Settings|Réglages/ }));
    expect(await screen.findByLabelText("Langue")).toHaveDisplayValue(/Français/);
    expect(screen.getByLabelText("Devise de référence")).toHaveDisplayValue(/€|EUR/);
  });

  it("keeps the detected App language when Vault settings load on the preferences step", async () => {
    const user = userEvent.setup();
    changeAppLanguage("fr");
    await createVault(user);
    expect(await screen.findByRole("heading", { name: "Langue et devise" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Devise de référence")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Langue et devise" })).toBeInTheDocument();
    expect(screen.getByLabelText("Langue")).toHaveDisplayValue(/Français/);
    expect(document.documentElement.lang).toBe("fr");
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
    expect(screen.getByRole("heading", { name: "Reset Satella" })).toBeInTheDocument();
  });

  it("offers Restore Vault from Welcome and from Unlock", async () => {
    vi.mocked(engineApi.vaultStatus).mockResolvedValue({ state: "absent" });
    renderRoute("/");
    expect(await screen.findByRole("button", { name: "Restore Vault" })).toBeInTheDocument();

    vi.mocked(engineApi.vaultStatus).mockResolvedValue({ state: "locked" });
    renderRoute("/");
    expect(await screen.findByRole("button", { name: "Restore Vault" })).toBeInTheDocument();
  });

  it("restores from Unlock only after replacement confirmation and returns to unlock", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.vaultStatus).mockResolvedValue({ state: "locked" });
    vi.mocked(engineApi.restoreVault).mockResolvedValue({ state: "locked" });
    vi.mocked(chooseVaultImportSource).mockResolvedValue({
      kind: "path",
      path: "/Backups/vault.satella-vault",
    });
    renderRoute("/");

    await user.click(await screen.findByRole("button", { name: "Restore Vault" }));
    const password = await screen.findByLabelText("Exported Vault's password");
    await user.type(password, "export-password");
    const submit = screen.getByRole("button", { name: "Restore Vault" });
    expect(submit).toBeDisabled();

    await user.click(screen.getByLabelText("Replace my current Vault and its data"));
    await user.click(submit);
    await waitFor(() =>
      expect(engineApi.restoreVault).toHaveBeenCalledWith(
        "/Backups/vault.satella-vault",
        "export-password",
      ),
    );
    expect(await screen.findByRole("heading", { name: "Unlock your Vault" })).toBeInTheDocument();
  });

  it("reports a failed restore validation without changing the screen state", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.vaultStatus).mockResolvedValue({ state: "absent" });
    vi.mocked(engineApi.restoreVault).mockRejectedValue(
      new Error("This file is not a valid Satella Vault export."),
    );
    vi.mocked(chooseVaultImportSource).mockResolvedValue({
      kind: "path",
      path: "/Backups/broken.satella-vault",
    });
    renderRoute("/");

    await user.click(await screen.findByRole("button", { name: "Restore Vault" }));
    await user.type(await screen.findByLabelText("Exported Vault's password"), "whatever");
    await user.click(screen.getByRole("button", { name: "Restore Vault" }));
    expect(await screen.findByText(/not a valid Satella Vault export/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Welcome to Satella" })).toBeInTheDocument();
  });
});

describe("Screen lock", () => {
  beforeEach(() => {
    resetFinanceMocks();
  });

  it("logs out to the Vault-password screen via the fallback button", async () => {
    const user = userEvent.setup();
    vi.mocked(engineApi.vaultStatus).mockResolvedValue({
      state: "open",
      screenLock: true,
      pinAttemptsRemaining: 3,
      pinEntryDisabled: false,
      screenLockTimeoutMinutes: 15,
    });
    vi.mocked(engineApi.closeVault).mockResolvedValue({ state: "locked" });
    renderRoute("/");
    expect(await screen.findByRole("heading", { name: "Satella is locked" })).toBeInTheDocument();
    expect(screen.getByText(/Background Refresh may continue/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use Vault password instead" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use Vault password instead" }));
    expect(await screen.findByRole("heading", { name: "Unlock your Vault" })).toBeInTheDocument();
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
