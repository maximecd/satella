import { Button, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { engineApi } from "../api";
import { FormError } from "../components";
import { Field } from "../components/ui/field";
import { vaultStatusQuery } from "../queries";
import { clearVaultDerivedCaches } from "../runtime";

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The request failed.";

export function ResetSatellaControl() {
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
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
        Reset Satella
      </Heading>
      <Text as="p">
        This permanently deletes the Vault, portfolio, custodian credentials, encrypted backups, and
        Vault metadata. You will return to first-run onboarding. This cannot be undone.
      </Text>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setError(null);
          reset.mutate(confirmation);
        }}
      >
        <Stack gap="3">
          <FormError message={error} />
          <Field label='Type "Reset Satella" to confirm'>
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
            Reset Satella
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
