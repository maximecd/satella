import { Button, Card, Heading, Separator, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { engineApi } from "../api";
import { FormError, PageHeader } from "../components";
import { errorDetail } from "../components/ui/copy-error";
import { notify } from "../components/ui/toaster";
import { saveVaultExport } from "../runtime";
import { vaultStatusQuery } from "../queries";
import { SelectField } from "../select-field";
import { PinField } from "./pin-field";
import { ResetSatellaControl } from "./reset-satella";
import { SecretField } from "./secret-field";
import { SettingsMcpCard } from "./settings-mcp";

export function SettingsSecurityScreen() {
  const { t } = useTranslation();
  const statusQuery = useQuery(vaultStatusQuery);
  const queryClient = useQueryClient();
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pinPassword, setPinPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const errorMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : t("errors.requestFailed");
  const changePassword = useMutation({
    mutationFn: engineApi.changeVaultPassword,
    onSuccess: () => {
      setPasswordError(null);
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      notify.success(t("security.settings.passwordSection.changedToast"));
    },
    onError: (cause) => setPasswordError(errorMessage(cause)),
  });
  const changePin = useMutation({
    mutationFn: engineApi.changeScreenLockPin,
    onSuccess: () => {
      setPinError(null);
      setPinPassword("");
      setPin("");
      setConfirmPin("");
      notify.success(t("security.settings.pinSection.changedToast"));
    },
    onError: (cause) => setPinError(errorMessage(cause)),
  });
  const lockNow = useMutation({
    mutationFn: engineApi.lockScreen,
    onSuccess: (status) => queryClient.setQueryData(vaultStatusQuery.queryKey, status),
  });
  const timeout = useMutation({
    mutationFn: engineApi.setScreenLockTimeout,
    onSuccess: (status) => {
      queryClient.setQueryData(vaultStatusQuery.queryKey, status);
      notify.success(t("security.settings.timeoutSection.savedToast"));
    },
  });
  const [exportPassword, setExportPassword] = useState("");
  const exportVault = useMutation({
    mutationFn: async (password: string) => {
      const exported = await engineApi.exportVaultDownload(password);
      saveVaultExport(exported.fileName, exported.contentsBase64);
      return exported.fileName;
    },
    onSuccess: () => {
      setExportPassword("");
      notify.success("Vault exported.");
    },
    onError: (cause) =>
      notify.error(
        "Export failed.",
        cause instanceof Error ? cause.message : "The Vault could not be exported.",
        false,
        errorDetail(cause),
      ),
  });
  const status = statusQuery.data;
  const timeoutMinutes = status?.state === "open" ? String(status.screenLockTimeoutMinutes) : "15";
  const pinMismatch = confirmPin.length > 0 && pin !== confirmPin;
  return (
    <>
      <PageHeader title={t("security.settings.title")} />
      <Stack gap="6">
        <Card.Root>
          <Card.Body>
            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                if (nextPassword !== confirmPassword) {
                  setPasswordError(t("security.settings.passwordSection.mismatchError"));
                  return;
                }
                changePassword.mutate({ currentPassword, nextPassword });
              }}
            >
              <Stack gap="4">
                <Heading as="h2" size="md">
                  {t("security.settings.passwordSection.heading")}
                </Heading>
                <Text color="fg.muted" as="p">
                  {t("security.settings.passwordSection.description")}
                </Text>
                <FormError message={passwordError} />
                <SecretField
                  label={t("security.settings.passwordSection.currentLabel")}
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  htmlName="current-vault-password"
                  autoComplete="current-password"
                />
                <SecretField
                  label={t("security.settings.passwordSection.newLabel")}
                  value={nextPassword}
                  onChange={setNextPassword}
                  htmlName="new-vault-password"
                  autoComplete="new-password"
                />
                <SecretField
                  label={t("security.settings.passwordSection.confirmLabel")}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  htmlName="confirm-vault-password"
                  autoComplete="new-password"
                />
                <Button type="submit" colorPalette="blue">
                  {t("security.settings.passwordSection.submit")}
                </Button>
              </Stack>
            </form>
          </Card.Body>
        </Card.Root>
        <Card.Root>
          <Card.Body>
            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                if (pin !== confirmPin) {
                  setPinError(t("security.settings.pinSection.mismatchError"));
                  return;
                }
                changePin.mutate({ password: pinPassword, pin });
              }}
            >
              <Stack gap="4">
                <Heading as="h2" size="md">
                  {t("security.settings.pinSection.heading")}
                </Heading>
                <FormError message={pinError} />
                <SecretField
                  label={t("security.settings.pinSection.vaultPasswordLabel")}
                  value={pinPassword}
                  onChange={setPinPassword}
                  htmlName="pin-vault-password"
                  autoComplete="current-password"
                />
                <PinField
                  label={t("security.settings.pinSection.newPinLabel")}
                  value={pin}
                  onChange={setPin}
                  htmlName="new-pin"
                />
                <PinField
                  label={t("security.settings.pinSection.confirmPinLabel")}
                  value={confirmPin}
                  onChange={setConfirmPin}
                  htmlName="confirm-pin"
                  invalid={pinMismatch}
                  errorText={
                    pinMismatch ? t("security.settings.pinSection.pinsDoNotMatchError") : undefined
                  }
                />
                <Button type="submit" colorPalette="blue">
                  {t("security.settings.pinSection.submit")}
                </Button>
              </Stack>
            </form>
          </Card.Body>
        </Card.Root>
        <Card.Root>
          <Card.Body>
            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                exportVault.mutate(exportPassword);
              }}
            >
              <Stack gap="4">
                <Heading as="h2" size="md">
                  Export Vault
                </Heading>
                <Text color="fg.muted" as="p">
                  Save one encrypted .satella-vault recovery file containing the whole Vault,
                  including connector credentials and Screen-lock settings. The file is protected by
                  your current Vault password.
                </Text>
                <SecretField
                  label="Vault password for export"
                  value={exportPassword}
                  onChange={setExportPassword}
                  htmlName="export-vault-password"
                  autoComplete="current-password"
                />
                <Button
                  type="submit"
                  colorPalette="blue"
                  disabled={exportPassword.length === 0 || exportVault.isPending}
                  loading={exportVault.isPending}
                >
                  Export Vault
                </Button>
              </Stack>
            </form>
          </Card.Body>
        </Card.Root>
        <SettingsMcpCard />
        <Card.Root>
          <Card.Body>
            <SelectField
              label={t("security.settings.timeoutSection.label")}
              helperText={t("security.settings.timeoutSection.helperText")}
              options={[5, 15, 30, 60].map((minutes) => ({
                value: String(minutes),
                label: t("security.settings.timeoutSection.minutes", { count: minutes }),
              }))}
              value={timeoutMinutes}
              onChange={(value) => {
                // SAFETY: SelectField only supplies one of the four literal timeout option values above.
                timeout.mutate(Number(value) as 5 | 15 | 30 | 60);
              }}
            />
          </Card.Body>
        </Card.Root>
        <Button onClick={() => lockNow.mutate()}>{t("security.settings.lockNow")}</Button>
        <Text color="fg.muted" as="p">
          {t("security.settings.privacyNote")}
        </Text>
        <Text color="fg.muted" as="p">
          {t("security.settings.licenseNote")}
        </Text>
        <Separator />
        <ResetSatellaControl />
      </Stack>
    </>
  );
}
