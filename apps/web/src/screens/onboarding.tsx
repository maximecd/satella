import { Button, Heading, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { MIN_VAULT_PASSWORD_LENGTH } from "@optimus/engine/api";
import { engineApi } from "../api";
import { FormError } from "../components";
import { vaultStatusQuery } from "../queries";
import { passwordGuidance, SecretField } from "./secret-field";
import { PinField } from "./pin-field";
import { useAddAssets } from "./add-assets";
import { clearFirstAssetPending, markFirstAssetPending } from "./vault-gate";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

type Step = "welcome" | "password" | "pin" | "first-asset";

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
      <Stack gap="6" p={{ base: 6, md: 8 }} maxW="xl" mx="auto">
        <Heading as="h1" size="xl">
          Welcome to Optimus
        </Heading>
        <Text as="p">
          Optimus keeps your portfolio, Connections, and credentials in one local Vault on this
          computer. Financial data stays local except when Optimus talks directly to Connectors and
          market-data sources you configure.
        </Text>
        <Text as="p">
          Encryption protects copied files while the Vault is closed. It does not protect an open
          Vault from malware, administrators, or memory inspection.
        </Text>
        <Button colorPalette="blue" onClick={() => setStep("password")}>
          Continue
        </Button>
      </Stack>
    );
  }

  if (step === "password") {
    const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
    return (
      <Stack gap="6" p={{ base: 6, md: 8 }} maxW="xl" mx="auto">
        <Heading as="h1" size="xl">
          Create a Vault password
        </Heading>
        <Text as="p">{passwordGuidance(password)}</Text>
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
      </Stack>
    );
  }

  if (step === "pin") {
    const mismatch = confirmPin.length > 0 && pin !== confirmPin;
    return (
      <Stack gap="6" p={{ base: 6, md: 8 }} maxW="xl" mx="auto">
        <Heading as="h1" size="xl">
          Create a Screen-lock PIN
        </Heading>
        <Text as="p">
          Lock hides the interface behind this four-digit PIN while the Vault stays open. Background
          Refresh may continue. Lock is not Vault encryption.
        </Text>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!/^\d{4}$/.test(pin)) {
              setError("Screen-lock PIN must be exactly four digits.");
              return;
            }
            if (pin !== confirmPin) {
              setError("Screen-lock PIN and confirmation do not match.");
              return;
            }
            setError(null);
            create.mutate({ password, pin });
          }}
        >
          <Stack gap="4">
            <FormError message={error} />
            <PinField
              label="Screen-lock PIN"
              value={pin}
              onChange={setPin}
              htmlName="screen-lock-pin"
            />
            <PinField
              label="Confirm Screen-lock PIN"
              value={confirmPin}
              onChange={setConfirmPin}
              htmlName="screen-lock-pin-confirm"
              invalid={mismatch}
              errorText={mismatch ? "PINs do not match." : undefined}
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
      </Stack>
    );
  }

  return (
    <Stack gap="6" p={{ base: 6, md: 8 }} maxW="xl" mx="auto">
      <Heading as="h1" size="xl">
        Add your first asset
      </Heading>
      <Text as="p">You can start with the same Add assets flow you will use later, or skip.</Text>
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
    </Stack>
  );
}
