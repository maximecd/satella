import { Button, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { VaultStatus } from "@satella-app/engine/api";

import { engineApi } from "../api";
import { FormError } from "../components";
import { vaultStatusQuery } from "../queries";
import { GateLayout } from "./gate-layout";
import { PinField, type PinFieldHandle } from "./pin-field";

export function ScreenLockScreen({
  status,
}: {
  readonly status: Extract<VaultStatus, { state: "open" }>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pinFieldRef = useRef<PinFieldHandle>(null);
  const requestFailed = t("security.screenLock.requestFailed");
  const errorMessage = (cause: unknown) => (cause instanceof Error ? cause.message : requestFailed);
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
    <GateLayout title={t("security.screenLock.title")} description={t("security.screenLock.intro")}>
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
            label={t("security.screenLock.pinLabel")}
            value={pin}
            onChange={setPin}
            htmlName="screen-lock-pin"
            autoFocus
          />
          <Button type="submit" colorPalette="blue">
            {t("security.screenLock.unlock")}
          </Button>
        </Stack>
      </form>
      {status.pinEntryDisabled ? (
        <Text color="fg.muted" fontSize="sm">
          {t("security.screenLock.pinDisabledNote")}
        </Text>
      ) : null}
      <Button
        variant="ghost"
        onClick={() => logOut.mutate()}
        disabled={logOut.isPending}
        loading={logOut.isPending}
      >
        {t("security.screenLock.usePasswordInstead")}
      </Button>
    </GateLayout>
  );
}
