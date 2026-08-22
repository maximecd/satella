import { Button, Checkbox, Heading, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { engineApi } from "../api";
import { FormError } from "../components";
import { notify } from "../components/ui/toaster";
import { clearVaultDerivedCaches, chooseVaultImportSource } from "../runtime";
import { vaultStatusQuery } from "../queries";
import { SecretField } from "./secret-field";

const errorMessage = (cause: unknown) => {
  const message = cause instanceof Error ? cause.message : undefined;
  if (message !== undefined && message.includes("could not be unlocked")) {
    return "The Vault password is incorrect.";
  }
  return message ?? "The Vault could not be restored.";
};

export function RestoreVaultControl({
  requiresConfirmation,
}: {
  readonly requiresConfirmation: boolean;
}) {
  const queryClient = useQueryClient();
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restore = useMutation({
    mutationFn: (input: { sourcePath: string; password: string }) =>
      engineApi.restoreVault(input.sourcePath, input.password),
    onSuccess: async () => {
      await clearVaultDerivedCaches();
      setPassword("");
      setConfirmed(false);
      setSourcePath(null);
      setError(null);
      notify.success("Vault restored. Unlock with the restored Vault's password.");
      await queryClient.invalidateQueries({ queryKey: vaultStatusQuery.queryKey });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  if (sourcePath === null) {
    return (
      <Button
        variant="outline"
        onClick={() => {
          setError(null);
          void chooseVaultImportSource().then((choice) => {
            if (choice.kind === "path") setSourcePath(choice.path);
          });
        }}
      >
        Restore Vault
      </Button>
    );
  }

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        restore.mutate({ sourcePath, password });
      }}
    >
      <Stack gap="4">
        <Heading as="h2" size="md">
          Restore Vault
        </Heading>
        <Text color="fg.muted" as="p">
          Restoring replaces this device's Vault with the contents of the selected export after
          validation succeeds.
        </Text>
        <FormError message={error} />
        <SecretField
          label="Exported Vault's password"
          value={password}
          onChange={setPassword}
          htmlName="restore-vault-password"
          autoComplete="current-password"
        />
        {requiresConfirmation ? (
          <Checkbox.Root
            checked={confirmed}
            onCheckedChange={(details) => setConfirmed(details.checked === true)}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>Replace my current Vault and its data</Checkbox.Label>
          </Checkbox.Root>
        ) : null}
        <Button
          type="submit"
          colorPalette="blue"
          disabled={requiresConfirmation && !confirmed}
          loading={restore.isPending}
        >
          Restore Vault
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setSourcePath(null);
            setPassword("");
            setError(null);
          }}
        >
          Cancel
        </Button>
      </Stack>
    </form>
  );
}
