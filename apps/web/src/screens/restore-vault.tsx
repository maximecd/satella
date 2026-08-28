import { Button, Checkbox, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { engineApi } from "../api";
import { FormError } from "../components";
import { Field } from "../components/ui/field";
import { notify } from "../components/ui/toaster";
import { clearVaultDerivedCaches } from "../runtime";
import { vaultStatusQuery } from "../queries";
import { SecretField } from "./secret-field";

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result === null || result instanceof ArrayBuffer) {
        reject(new Error("The selected Vault export could not be read."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("The selected Vault export could not be read."));
    reader.readAsDataURL(file);
  });

export function RestoreVaultControl({
  requiresConfirmation,
}: {
  readonly requiresConfirmation: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [sourceFile, setSourceFile] = useState<File | null>(null);
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
    mutationFn: async (input: { file: File; password: string }) => {
      const contentsBase64 = await readFileAsBase64(input.file);
      return engineApi.restoreVaultUpload(contentsBase64, input.password);
    },
    onSuccess: async () => {
      await clearVaultDerivedCaches();
      setPassword("");
      setConfirmed(false);
      setSourceFile(null);
      setError(null);
      notify.success(t("security.restore.successToast"));
      await queryClient.invalidateQueries({ queryKey: vaultStatusQuery.queryKey });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const onPickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    setError(null);
    setSourceFile(file);
  };

  if (sourceFile === null) {
    return (
      <Field label={t("security.restore.chooseExport")}>
        <Input type="file" accept=".satella-vault,application/octet-stream" onChange={onPickFile} />
      </Field>
    );
  }

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        restore.mutate({ file: sourceFile, password });
      }}
    >
      <Stack gap="4">
        <Heading as="h2" size="md">
          {t("security.restore.title")}
        </Heading>
        <Text color="fg.muted" as="p">
          {t("security.restore.description")}
        </Text>
        <Text as="p">{sourceFile.name}</Text>
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
            setSourceFile(null);
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
