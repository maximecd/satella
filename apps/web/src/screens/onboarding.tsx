import { Button, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { MIN_VAULT_PASSWORD_LENGTH } from "@optimus/engine/api";
import { engineApi } from "../api";
import { FormError } from "../components";
import { vaultStatusQuery } from "../queries";
import { passwordGuidance, SecretField } from "./secret-field";
import { PinField } from "./pin-field";
import { GateLayout } from "./gate-layout";
import { useAddAssets } from "./add-assets";
import { clearFirstAssetPending, markFirstAssetPending } from "./vault-gate";

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The request failed.";

type Step = "welcome" | "password" | "pin" | "pin-confirm" | "first-asset";

export function OnboardingScreen() {
  const queryClient = useQueryClient();
  const addAssets = useAddAssets();
  const [step, setStep] = useState<Step>("welcome");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: engineApi.initializeVault,
    onSuccess: async (status) => {
      markFirstAssetPending();
      queryClient.setQueryData(vaultStatusQuery.queryKey, status);
      setStep("first-asset");
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  if (step === "welcome") {
    return (
      <GateLayout title="Welcome to Optimus">
        <Stack gap="4">
          <Text as="p">
            Optimus keeps your portfolio, custodians, and credentials in one local Vault on this
            computer. Financial data stays local except when Optimus talks directly to Connectors
            and market-data sources you configure.
          </Text>
          <Text as="p">
            Encryption protects copied files while the Vault is closed. It does not protect an open
            Vault from malware, administrators, or memory inspection.
          </Text>
        </Stack>
        <Button colorPalette="blue" onClick={() => setStep("password")}>
          Continue
        </Button>
      </GateLayout>
    );
  }

  if (step === "password") {
    const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
    return (
      <GateLayout title="Create a Vault password" description={passwordGuidance(password)}>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (password.length < MIN_VAULT_PASSWORD_LENGTH) {
              setError(`Vault password must be at least ${MIN_VAULT_PASSWORD_LENGTH} characters.`);
              return;
            }
            if (password !== confirmPassword) {
              setError("Vault password and confirmation do not match.");
              return;
            }
            setError(null);
            setStep("pin");
          }}
        >
          <Stack gap="4">
            <FormError message={error} />
            <SecretField
              label="Vault password"
              value={password}
              onChange={setPassword}
              htmlName="vault-password"
              autoComplete="new-password"
            />
            <SecretField
              label="Confirm Vault password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              htmlName="vault-password-confirm"
              autoComplete="new-password"
              {...(mismatch
                ? { status: { type: "error" as const, message: "Passwords do not match." } }
                : {})}
            />
            <Button type="submit" colorPalette="blue">
              Continue
            </Button>
          </Stack>
        </form>
      </GateLayout>
    );
  }

  if (step === "pin") {
    return (
      <GateLayout
        title="Create a Screen-lock PIN"
        description="Lock hides the interface behind this four-digit PIN while the Vault stays open. Background Refresh may continue. Lock is not Vault encryption."
      >
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!/^\d{4}$/.test(pin)) {
              setError("Screen-lock PIN must be exactly four digits.");
              return;
            }
            setError(null);
            setStep("pin-confirm");
          }}
        >
          <Stack gap="4">
            <FormError message={error} />
            <PinField
              label="Screen-lock PIN"
              value={pin}
              onChange={setPin}
              htmlName="screen-lock-pin"
              autoFocus
            />
            <Button type="submit" colorPalette="blue">
              Continue
            </Button>
          </Stack>
        </form>
      </GateLayout>
    );
  }

  if (step === "pin-confirm") {
    return (
      <GateLayout title="Confirm your Screen-lock PIN" description="Re-enter the same four digits.">
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (pin !== confirmPin) {
              setError("Screen-lock PINs do not match. Start again.");
              setConfirmPin("");
              setStep("pin");
              return;
            }
            setError(null);
            create.mutate({ password, pin });
          }}
        >
          <Stack gap="4">
            <FormError message={error} />
            <PinField
              label="Confirm Screen-lock PIN"
              value={confirmPin}
              onChange={setConfirmPin}
              htmlName="screen-lock-pin-confirm"
              autoFocus
            />
            <Button
              type="submit"
              colorPalette="blue"
              disabled={create.isPending}
              loading={create.isPending}
            >
              Create Vault
            </Button>
          </Stack>
        </form>
      </GateLayout>
    );
  }

  return (
    <GateLayout
      title="Add your first asset"
      description="You can start with the same Add assets flow you will use later, or skip."
    >
      <Stack direction="row" gap="3">
        <Button
          colorPalette="blue"
          onClick={() => {
            addAssets.open();
          }}
        >
          Add your first asset
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            clearFirstAssetPending();
            void queryClient.invalidateQueries({ queryKey: vaultStatusQuery.queryKey });
          }}
        >
          Go to dashboard
        </Button>
      </Stack>
    </GateLayout>
  );
}
