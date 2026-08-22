import { Button, Stack } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { engineApi } from "../api";
import { FormError } from "../components";
import { vaultStatusQuery } from "../queries";
import { GateLayout } from "./gate-layout";
import { SecretField } from "./secret-field";
import { ResetSatellaControl } from "./reset-satella";
import { RestoreVaultControl } from "./restore-vault";

export function UnlockScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const unlock = useMutation({
    mutationFn: engineApi.unlockVault,
    onSuccess: (status) => {
      queryClient.setQueryData(vaultStatusQuery.queryKey, status);
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : t("security.unlock.requestFailed")),
  });
  return (
    <GateLayout title={t("security.unlock.title")} description={t("security.unlock.intro")}>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setError(null);
          unlock.mutate(password);
        }}
      >
        <Stack gap="4">
          <FormError message={error} />
          <SecretField
            label={t("security.unlock.vaultPasswordLabel")}
            value={password}
            onChange={setPassword}
            htmlName="vault-password"
            autoComplete="current-password"
          />
          <Button
            type="submit"
            colorPalette="blue"
            disabled={unlock.isPending}
            loading={unlock.isPending}
          >
            {t("security.unlock.submit")}
          </Button>
        </Stack>
      </form>
      <RestoreVaultControl requiresConfirmation />
      <ResetSatellaControl />
    </GateLayout>
  );
}
