import { Button, Checkbox, Heading, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { engineApi } from "../api";
import { FormError } from "../components";
import { notify } from "../components/ui/toaster";
import { clearVaultDerivedCaches, chooseVaultImportSource } from "../runtime";
import { vaultStatusQuery } from "../queries";
import { SecretField } from "./secret-field";

export function RestoreVaultControl({
  requiresConfirmation,
}: {
  readonly requiresConfirmation: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestFailed = t("security.restore.requestFailed");
  const errorMessage = (cause: unknown) => {
    const message = cause instanceof Error ? cause.message : undefined;
    if (message !== undefined && message.includes("could not be unlocked")) {
      return t("security.restore.incorrectPassword");
    }
    return message ?? requestFailed;
  };

  const restore = useMutation({
    mutationFn: (input: { sourcePath: string; password: string }) =>
      engineApi.restoreVault(input.sourcePath, input.password),
    onSuccess: async () => {
      await clearVaultDerivedCaches();
      setPassword("");
      setConfirmed(false);
      setSourcePath(null);
      setError(null);
      notify.success(t("security.restore.successToast"));
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
        {t("security.restore.submit")}
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
          {t("security.restore.title")}
        </Heading>
        <Text color="fg.muted" as="p">
          {t("security.restore.description")}
        </Text>
        <FormError message={error} />
        <SecretField
          label={t("security.restore.passwordLabel")}
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
            <Checkbox.Label>{t("security.restore.confirmLabel")}</Checkbox.Label>
          </Checkbox.Root>
        ) : null}
        <Button
          type="submit"
          colorPalette="blue"
          disabled={requiresConfirmation && !confirmed}
          loading={restore.isPending}
        >
          {t("security.restore.submit")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setSourcePath(null);
            setPassword("");
            setError(null);
          }}
        >
          {t("security.restore.cancel")}
        </Button>
      </Stack>
    </form>
  );
}
