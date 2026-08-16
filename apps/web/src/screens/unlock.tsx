import { Button, Heading, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { engineApi } from "../api";
import { FormError } from "../components";
import { vaultStatusQuery } from "../queries";
import { SecretField } from "./secret-field";
import { ResetOptimusControl } from "./reset-optimus";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The Vault could not be unlocked.";

export function UnlockScreen() {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const unlock = useMutation({
    mutationFn: engineApi.unlockVault,
    onSuccess: (status) => {
      queryClient.setQueryData(vaultStatusQuery.queryKey, status);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  return (
    <Stack gap="6" p={{ base: 6, md: 8 }} maxW="xl" mx="auto">
      <Heading as="h1" size="xl">
        Unlock your Vault
      </Heading>
      <Text as="p">
        Enter your Vault password. Optimus cannot recover it. An incorrect password is
        indistinguishable from damaged Vault data.
      </Text>
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
            label="Vault password"
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
            Unlock Vault
          </Button>
        </Stack>
      </form>
      <ResetOptimusControl />
    </Stack>
  );
}
