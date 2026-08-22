import { Button, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import type { VaultStatus } from "@optimus/engine/api";

import { engineApi } from "../api";
import { FormError } from "../components";
import { vaultStatusQuery } from "../queries";
import { GateLayout } from "./gate-layout";
import { PinField, type PinFieldHandle } from "./pin-field";
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
  const pinFieldRef = useRef<PinFieldHandle>(null);
  const unlockPin = useMutation({
    mutationFn: engineApi.unlockScreen,
    onSuccess: (next) => queryClient.setQueryData(vaultStatusQuery.queryKey, next),
    onError: (cause) => {
      setError(errorMessage(cause));
      setPin("");
      pinFieldRef.current?.focus();
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
    <GateLayout
      title="Optimus is locked"
      description="Screen lock hides the interface. Background Refresh may continue. This is not the same as closing the Vault."
    >
      <FormError message={error} />
      {pinDisabled ? (
        <>
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
          {status.pinEntryDisabled ? (
            <Text color="fg.muted" fontSize="sm">
              Too many incorrect PIN attempts. Enter your Vault password to dismiss the Screen lock.
            </Text>
          ) : (
            <Button
              variant="ghost"
              alignSelf="flex-start"
              onClick={() => {
                setUsePassword(false);
                setError(null);
              }}
            >
              Use Screen-lock PIN instead
            </Button>
          )}
        </>
      ) : (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            unlockPin.mutate(pin);
          }}
        >
          <Stack gap="4">
            <PinField
              ref={pinFieldRef}
              label="Screen-lock PIN"
              value={pin}
              onChange={setPin}
              htmlName="screen-lock-pin"
              autoFocus
            />
            <Button type="submit" colorPalette="blue">
              Unlock
            </Button>
          </Stack>
        </form>
      )}
      {!pinDisabled ? (
        <Button
          variant="ghost"
          alignSelf="flex-start"
          onClick={() => {
            setUsePassword(true);
            setError(null);
          }}
        >
          Use Vault password instead
        </Button>
      ) : null}
    </GateLayout>
  );
}
