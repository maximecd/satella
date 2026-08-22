import { Button, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import type { VaultStatus } from "@optimus/engine/api";

import { engineApi } from "../api";
import { FormError } from "../components";
import { vaultStatusQuery } from "../queries";
import { GateLayout } from "./gate-layout";
import { PinField, type PinFieldHandle } from "./pin-field";

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The Screen lock could not be dismissed.";

export function ScreenLockScreen({
  status,
}: {
  readonly status: Extract<VaultStatus, { state: "open" }>;
}) {
  const queryClient = useQueryClient();
  const [pin, setPin] = useState("");
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
  const logOut = useMutation({
    mutationFn: engineApi.closeVault,
    onSuccess: (next) => queryClient.setQueryData(vaultStatusQuery.queryKey, next),
    onError: (cause) => {
      setError(errorMessage(cause));
      void queryClient.invalidateQueries({ queryKey: vaultStatusQuery.queryKey });
    },
  });
  return (
    <GateLayout
      title="Optimus is locked"
      description="Screen lock hides the interface. Background Refresh may continue. This is not the same as closing the Vault."
    >
      <FormError message={error} />
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
      {status.pinEntryDisabled ? (
        <Text color="fg.muted" fontSize="sm">
          Too many incorrect PIN attempts. Use your Vault password to unlock Optimus again.
        </Text>
      ) : null}
      <Button
        variant="ghost"
        onClick={() => logOut.mutate()}
        disabled={logOut.isPending}
        loading={logOut.isPending}
      >
        Use Vault password instead
      </Button>
    </GateLayout>
  );
}
