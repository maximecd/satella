import { Button, Heading, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { VaultStatus } from "@optimus/engine/api";

import { engineApi } from "../api";
import { FormError } from "../components";
import { vaultStatusQuery } from "../queries";
import { PinField } from "./pin-field";
import { SecretField } from "./secret-field";

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The Screen lock could not be dismissed.";

export function ScreenLockScreen({
  status,
}: {
  readonly status: Extract<VaultStatus, { state: "open" }>;
}) {
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
    <Stack gap="6" p={{ base: 6, md: 8 }} maxW="xl" mx="auto">
      <Heading as="h1" size="xl">
        Optimus is locked
      </Heading>
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
          <Stack gap="4">
            <SecretField
              label="Vault password"
              value={password}
              onChange={setPassword}
              htmlName="vault-password"
              autoComplete="current-password"
            />
            <Button type="submit" colorPalette="blue">
              Unlock with Vault password
            </Button>
          </Stack>
        </form>
      ) : (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            unlockPin.mutate(pin);
          }}
        >
          <Stack gap="4">
            <PinField
              label="Screen-lock PIN"
              value={pin}
              onChange={setPin}
              htmlName="screen-lock-pin"
            />
            <Button type="submit" colorPalette="blue">
              Unlock
            </Button>
          </Stack>
        </form>
      )}
      <Button
        variant="ghost"
        onClick={() => {
          setUsePassword(true);
          setError(null);
        }}
      >
        Use Vault password instead
      </Button>
    </Stack>
  );
}
