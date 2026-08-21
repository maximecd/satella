import { Button, Card, Heading, Separator, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { engineApi } from "../api";
import { FormError, PageHeader } from "../components";
import { notify } from "../components/ui/toaster";
import { vaultStatusQuery } from "../queries";
import { SelectField } from "../select-field";
import { PinField } from "./pin-field";
import { ResetOptimusControl } from "./reset-optimus";
import { SecretField } from "./secret-field";

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The request failed.";

export function SettingsSecurityScreen() {
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
  const changePassword = useMutation({
    mutationFn: engineApi.changeVaultPassword,
    onSuccess: () => {
      setPasswordError(null);
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      notify.success("Vault password changed.");
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
      notify.success("Screen-lock PIN changed.");
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
      notify.success("Screen-lock timeout saved.");
    },
  });
  const status = statusQuery.data;
  const timeoutMinutes = status?.state === "open" ? String(status.screenLockTimeoutMinutes) : "15";
  const pinMismatch = confirmPin.length > 0 && pin !== confirmPin;
  return (
    <>
      <PageHeader title="Security" />
      <Stack gap="6">
        <Card.Root>
          <Card.Body>
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
              <Stack gap="4">
                <Heading as="h2" size="md">
                  Vault password
                </Heading>
                <Text color="fg.muted" as="p">
                  Changing the Vault password rewraps the encryption key. Encrypted backups stay
                  usable.
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
                <Button type="submit" colorPalette="blue">
                  Change Vault password
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
                  setPinError("Screen-lock PIN and confirmation do not match.");
                  return;
                }
                changePin.mutate({ password: pinPassword, pin });
              }}
            >
              <Stack gap="4">
                <Heading as="h2" size="md">
                  Screen-lock PIN
                </Heading>
                <FormError message={pinError} />
                <SecretField
                  label="Vault password"
                  value={pinPassword}
                  onChange={setPinPassword}
                  htmlName="pin-vault-password"
                  autoComplete="current-password"
                />
                <PinField
                  label="New Screen-lock PIN"
                  value={pin}
                  onChange={setPin}
                  htmlName="new-pin"
                />
                <PinField
                  label="Confirm Screen-lock PIN"
                  value={confirmPin}
                  onChange={setConfirmPin}
                  htmlName="confirm-pin"
                  invalid={pinMismatch}
                  errorText={pinMismatch ? "PINs do not match." : undefined}
                />
                <Button type="submit" colorPalette="blue">
                  Change Screen-lock PIN
                </Button>
              </Stack>
            </form>
          </Card.Body>
        </Card.Root>
        <Card.Root>
          <Card.Body>
            <SelectField
              label="Screen-lock timeout"
              helperText="Lock hides the interface after inactivity. There is no Never option."
              options={[
                { value: "5", label: "5 minutes" },
                { value: "15", label: "15 minutes" },
                { value: "30", label: "30 minutes" },
                { value: "60", label: "60 minutes" },
              ]}
              value={timeoutMinutes}
              onChange={(value) => {
                // SAFETY: SelectField only supplies one of the four literal timeout option values above.
                timeout.mutate(Number(value) as 5 | 15 | 30 | 60);
              }}
            />
          </Card.Body>
        </Card.Root>
        <Button onClick={() => lockNow.mutate()}>Lock now</Button>
        <Text color="fg.muted" as="p">
          Screen lock is interface privacy, not Vault encryption. Encryption protects copied files
          while the Vault is closed.
        </Text>
        <Text color="fg.muted" as="p">
          SQLCipher Community Edition is included under the BSD-3-Clause license. Notices ship with
          this application.
        </Text>
        <Separator />
        <ResetOptimusControl />
      </Stack>
    </>
  );
}
