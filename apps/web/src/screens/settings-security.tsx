import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Selector } from "@astryxdesign/core/Selector";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { engineApi } from "../api";
import { FormError, PageHeader } from "../components";
import { vaultStatusQuery } from "../queries";
import { ResetOptimusControl } from "./reset-optimus";
import { SecretField } from "./secret-field";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";

export function SettingsSecurityScreen() {
  const statusQuery = useQuery(vaultStatusQuery);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pinPassword, setPinPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const changePassword = useMutation({
    mutationFn: engineApi.changeVaultPassword,
    onSuccess: () => {
      setPasswordError(null);
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      toast({ body: "Vault password changed." });
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
      toast({ body: "Screen-lock PIN changed." });
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
      toast({ body: "Screen-lock timeout saved." });
    },
  });
  const status = statusQuery.data;
  const timeoutMinutes =
    status?.state === "open" ? String(status.screenLockTimeoutMinutes) : "15";
  return (
    <>
      <PageHeader title="Security" />
      <Stack gap={6}>
        <Card padding={4}>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (nextPassword !== confirmPassword) {
                setPasswordError("Vault password and confirmation do not match.");
                return;
              }
              changePassword.mutate({ currentPassword, nextPassword });
            }}
          >
            <Stack gap={4}>
              <Text type="supporting" as="p">
                Changing the Vault password rewraps the encryption key. Encrypted backups stay usable.
              </Text>
              <FormError message={passwordError} />
              <SecretField
                label="Current Vault password"
                value={currentPassword}
                onChange={setCurrentPassword}
                htmlName="current-vault-password"
                autoComplete="current-password"
              />
              <SecretField
                label="New Vault password"
                value={nextPassword}
                onChange={setNextPassword}
                htmlName="new-vault-password"
                autoComplete="new-password"
              />
              <SecretField
                label="Confirm new Vault password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                htmlName="confirm-vault-password"
                autoComplete="new-password"
              />
              <Button label="Change Vault password" type="submit" />
            </Stack>
          </form>
        </Card>
        <Card padding={4}>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (pin !== confirmPin) {
                setPinError("Screen-lock PIN and confirmation do not match.");
                return;
              }
              changePin.mutate({ password: pinPassword, pin });
            }}
          >
            <Stack gap={4}>
              <FormError message={pinError} />
              <SecretField
                label="Vault password"
                value={pinPassword}
                onChange={setPinPassword}
                htmlName="pin-vault-password"
                autoComplete="current-password"
              />
              <SecretField
                label="New Screen-lock PIN"
                value={pin}
                onChange={setPin}
                htmlName="new-pin"
                autoComplete="off"
              />
              <SecretField
                label="Confirm Screen-lock PIN"
                value={confirmPin}
                onChange={setConfirmPin}
                htmlName="confirm-pin"
                autoComplete="off"
              />
              <Button label="Change Screen-lock PIN" type="submit" />
            </Stack>
          </form>
        </Card>
        <Card padding={4}>
          <Selector
            label="Screen-lock timeout"
            description="Lock hides the interface after inactivity. There is no Never option."
            options={[
              { value: "5", label: "5 minutes" },
              { value: "15", label: "15 minutes" },
              { value: "30", label: "30 minutes" },
              { value: "60", label: "60 minutes" },
            ]}
            value={timeoutMinutes}
            onChange={(value) => timeout.mutate(Number(value) as 5 | 15 | 30 | 60)}
            width="100%"
          />
        </Card>
        <Button label="Lock now" onClick={() => lockNow.mutate()} />
        <Text type="supporting" as="p">
          Screen lock is interface privacy, not Vault encryption. Encryption protects copied files
          while the Vault is closed.
        </Text>
        <Text type="supporting" as="p">
          SQLCipher Community Edition is included under the BSD-3-Clause license. Notices ship with
          this application.
        </Text>
        <Divider />
        <ResetOptimusControl />
      </Stack>
    </>
  );
}
