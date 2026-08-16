import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { VaultStatus } from "@optimus/engine/api";

import { engineApi } from "../api";
import { FormError } from "../components";
import { vaultStatusQuery } from "../queries";
import { SecretField } from "./secret-field";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The Screen lock could not be dismissed.";

export function ScreenLockScreen({ status }: { readonly status: Extract<VaultStatus, { state: "open" }> }) {
  const queryClient = useQueryClient();
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(status.pinEntryDisabled);
  const [error, setError] = useState<string | null>(null);
  const unlockPin = useMutation({
    mutationFn: engineApi.unlockScreen,
    onSuccess: (next) => queryClient.setQueryData(vaultStatusQuery.queryKey, next),
    onError: (cause) => {
      setError(errorMessage(cause));
      void queryClient.invalidateQueries({ queryKey: vaultStatusQuery.queryKey });
    },
  });
  const unlockPassword = useMutation({
    mutationFn: engineApi.unlockScreenWithPassword,
    onSuccess: (next) => queryClient.setQueryData(vaultStatusQuery.queryKey, next),
    onError: (cause) => {
      setError(errorMessage(cause));
      void queryClient.invalidateQueries({ queryKey: vaultStatusQuery.queryKey });
    },
  });
  const pinDisabled = status.pinEntryDisabled || usePassword;
  return (
    <Stack gap={6} padding={8} maxWidth={640}>
      <Heading level={1}>Optimus is locked</Heading>
      <Text as="p">
        Screen lock hides the interface. Background Refresh may continue. This is not the same as
        closing the Vault.
      </Text>
      <FormError message={error} />
      {pinDisabled ? (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            unlockPassword.mutate(password);
          }}
        >
          <Stack gap={4}>
            <SecretField
              label="Vault password"
              value={password}
              onChange={setPassword}
              htmlName="vault-password"
              autoComplete="current-password"
            />
            <Button label="Unlock with Vault password" type="submit" />
          </Stack>
        </form>
      ) : (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            unlockPin.mutate(pin);
          }}
        >
          <Stack gap={4}>
            <SecretField
              label="Screen-lock PIN"
              value={pin}
              onChange={setPin}
              htmlName="screen-lock-pin"
              autoComplete="off"
            />
            <Button label="Unlock" type="submit" />
          </Stack>
        </form>
      )}
      <Button
        label="Use Vault password instead"
        variant="ghost"
        onClick={() => {
          setUsePassword(true);
          setError(null);
        }}
      />
    </Stack>
  );
}
