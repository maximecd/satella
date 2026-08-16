import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { MIN_VAULT_PASSWORD_LENGTH } from "@optimus/engine/api";
import { engineApi } from "../api";
import { FormError } from "../components";
import { vaultStatusQuery } from "../queries";
import { passwordGuidance, SecretField } from "./secret-field";
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
      <Stack gap={6} padding={8} maxWidth={640}>
        <Heading level={1}>Welcome to Optimus</Heading>
        <Text as="p">
          Optimus keeps your portfolio, Connections, and credentials in one local Vault on this
          computer. Financial data stays local except when Optimus talks directly to Connectors and
          market-data sources you configure.
        </Text>
        <Text as="p">
          Encryption protects copied files while the Vault is closed. It does not protect an open
          Vault from malware, administrators, or memory inspection.
        </Text>
        <Button label="Continue" onClick={() => setStep("password")} />
      </Stack>
    );
  }

  if (step === "password") {
    const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
    return (
      <Stack gap={6} padding={8} maxWidth={640}>
        <Heading level={1}>Create a Vault password</Heading>
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
          <Stack gap={4}>
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
            <Button label="Continue" type="submit" />
          </Stack>
        </form>
      </Stack>
    );
  }

  if (step === "pin") {
    const mismatch = confirmPin.length > 0 && pin !== confirmPin;
    return (
      <Stack gap={6} padding={8} maxWidth={640}>
        <Heading level={1}>Create a Screen-lock PIN</Heading>
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
          <Stack gap={4}>
            <FormError message={error} />
            <SecretField
              label="Screen-lock PIN"
              value={pin}
              onChange={setPin}
              htmlName="screen-lock-pin"
              autoComplete="off"
            />
            <SecretField
              label="Confirm Screen-lock PIN"
              value={confirmPin}
              onChange={setConfirmPin}
              htmlName="screen-lock-pin-confirm"
              autoComplete="off"
              {...(mismatch
                ? { status: { type: "error" as const, message: "PINs do not match." } }
                : {})}
            />
            <Button label="Create Vault" type="submit" isDisabled={create.isPending} />
          </Stack>
        </form>
      </Stack>
    );
  }

  return (
    <Stack gap={6} padding={8} maxWidth={640}>
      <Heading level={1}>Add your first asset</Heading>
      <Text as="p">You can start with the same Add assets flow you will use later, or skip.</Text>
      <Stack direction="horizontal" gap={3}>
        <Button
          label="Add your first asset"
          onClick={() => {
            addAssets.open();
          }}
        />
        <Button
          label="Go to dashboard"
          variant="secondary"
          onClick={() => {
            clearFirstAssetPending();
            void queryClient.invalidateQueries({ queryKey: vaultStatusQuery.queryKey });
          }}
        />
      </Stack>
    </Stack>
  );
}
