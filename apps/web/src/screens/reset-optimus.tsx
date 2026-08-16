import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { engineApi } from "../api";
import { FormError } from "../components";
import { vaultStatusQuery } from "../queries";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

export function ResetOptimusControl() {
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reset = useMutation({
    mutationFn: engineApi.resetVault,
    onSuccess: async (status) => {
      queryClient.setQueryData(vaultStatusQuery.queryKey, status);
      await queryClient.invalidateQueries();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  return (
    <Stack gap={4}>
      <Heading level={2}>Reset Optimus</Heading>
      <Text as="p">
        This permanently deletes the Vault, portfolio, Connection credentials, encrypted backups,
        and Vault metadata. You will return to first-run onboarding. This cannot be undone.
      </Text>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setError(null);
          reset.mutate(confirmation);
        }}
      >
        <Stack gap={3}>
          <FormError message={error} />
          <TextInput
            label='Type "Reset Optimus" to confirm'
            value={confirmation}
            onChange={setConfirmation}
            htmlName="reset-confirmation"
            width="100%"
          />
          <Button
            label="Reset Optimus"
            variant="destructive"
            type="submit"
            isDisabled={reset.isPending}
          />
        </Stack>
      </form>
    </Stack>
  );
}
