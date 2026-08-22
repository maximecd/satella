import { Button, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { engineApi } from "../api";
import { FormError } from "../components";
import { Field } from "../components/ui/field";
import { vaultStatusQuery } from "../queries";
import { clearVaultDerivedCaches } from "../runtime";

export function ResetSatellaControl() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : t("errors.requestFailed");
  const reset = useMutation({
    mutationFn: engineApi.resetVault,
    onSuccess: async (status) => {
      await clearVaultDerivedCaches();
      queryClient.clear();
      queryClient.setQueryData(vaultStatusQuery.queryKey, status);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  return (
    <Stack gap="4">
      <Heading as="h2" size="lg">
        {t("security.reset.title")}
      </Heading>
      <Text as="p">{t("security.reset.warning")}</Text>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setError(null);
          reset.mutate(confirmation);
        }}
      >
        <Stack gap="3">
          <FormError message={error} />
          <Field label={t("security.reset.confirmLabel")}>
            <Input
              name="reset-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </Field>
          <Button
            type="submit"
            colorPalette="red"
            disabled={reset.isPending}
            loading={reset.isPending}
          >
            {t("security.reset.submit")}
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
